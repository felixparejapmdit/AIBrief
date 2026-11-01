import { PILLARS } from '../constants/interviewPillars'
import { PRECEDENTS, formatPrecedentProof, matchPrecedents } from '../constants/precedents'
import { BRIEF_SECTIONS, IMAGE_CATEGORY_LABELS, PREPARED_ON_BEHALF_OF, sectionHeading, sectionTaskPrompt, systemPromptFor } from '../constants/vipSkillPrompt'
import type { EngineSettings, PerformanceSettings } from '../types/architecture'
import { type BriefInputs, composeBrief } from '../utils/briefComposer'
import { assembleBrief, normalizeSectionBody } from '../utils/briefTemplate'
import { sanitizeForbiddenTerms } from '../utils/complianceAuditor'
import { describeBinding, generate } from './aiClient'

export interface DraftProgress {
  section: number
  title: string
  /** Streaming text of the current section. */
  text: string
  status: string
}

export interface DraftResult {
  markdown: string
  repairedSections: number[]
  forbiddenTermsReplaced: number
  generatedBy: string
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const estimateTokens = (s: string) => Math.ceil(s.length / 3.6)

/** Shared project context — identical for every section so local engines can reuse the prompt cache. */
export function projectDataBlock(input: BriefInputs, compact: boolean): string {
  const limit = compact ? 200 : 600
  const lines: string[] = [
    `PROJECT DATA — prepared for The Client by Woodland Construction on behalf of ${PREPARED_ON_BEHALF_OF}`,
    `Date: ${input.date}`,
    `Core objective: ${clip(input.objective || 'Not stated', limit)}`,
    '',
    'INTERVIEW (8 pillars):',
  ]
  for (const pillar of PILLARS) {
    lines.push(`${pillar.index}. ${pillar.title}`)
    for (const q of pillar.questions) {
      const a = input.answers[q.id]?.trim()
      if (a) lines.push(`- ${compact ? q.id : q.prompt}: ${clip(a, limit)}`)
    }
    for (const f of input.followUps.filter((x) => x.pillarTitle === pillar.title && x.answer.trim())) {
      lines.push(`- Follow-up "${clip(f.question, 120)}": ${clip(f.answer, limit)}`)
    }
  }
  const analyzed = input.images.filter((im) => im.analysis)
  if (analyzed.length) {
    lines.push('', 'VISUAL INTAKE:')
    for (const im of analyzed.slice(0, compact ? 2 : 6)) {
      const a = im.analysis!
      lines.push(
        `- ${IMAGE_CATEGORY_LABELS[im.category]} "${im.name}": ${clip(a.summary, compact ? 160 : 320)}` +
          (compact ? '' : ` | Materials: ${clip(a.materialBuildUps.join('; '), 240)} | Constructability: ${clip(a.constructabilityNotes.join('; '), 240)}`),
      )
    }
  }
  const challengeText = `${input.answers['chal-list'] ?? ''} ${input.answers['chal-precedents'] ?? ''}`
  const matched = matchPrecedents(challengeText, compact ? 4 : 6)
  const verified = matched.length >= 3 ? matched : [...matched, ...PRECEDENTS.filter((p) => !matched.includes(p)).slice(0, 4 - matched.length)]
  lines.push('', 'VERIFIED PRECEDENT LIST (cite only these, with Where & When):')
  for (const p of verified) lines.push(`- ${formatPrecedentProof(p).replace(/\*\*/g, '')} Solves: ${p.challenge}.`)
  return lines.join('\n')
}

/**
 * Draft the brief section by section with the active text model.
 * The app writes every "## N. Title" heading itself and the normaliser enforces subheadings and
 * table columns, so the output always matches the mandated 9-section layout exactly.
 * With no model configured, the deterministic composer drafts the brief directly.
 */
export async function draftBrief(params: {
  input: BriefInputs
  settings: PerformanceSettings
  engine: EngineSettings
  signal?: AbortSignal
  onProgress?: (p: DraftProgress) => void
}): Promise<DraftResult> {
  const { input, settings, engine, signal, onProgress } = params
  const composed = composeBrief(input)
  const binding = engine.text ?? engine.vision

  if (!binding) {
    onProgress?.({ section: 9, title: 'Complete', text: '', status: 'Composed from the interview with the deterministic brief composer.' })
    return { markdown: composed.markdown, repairedSections: [], forbiddenTermsReplaced: 0, generatedBy: 'Woodland brief composer (no model configured)' }
  }

  const compact = settings.contextWindow < 4096
  const system = systemPromptFor(settings.contextWindow)
  const shared = projectDataBlock(input, compact)
  const bodies: Record<number, string> = {}
  let replaced = 0

  for (const spec of BRIEF_SECTIONS) {
    if (signal?.aborted) break
    const task = sectionTaskPrompt(spec)
    const user = `${shared}\n\n${task}`
    const promptTokens = estimateTokens(system) + estimateTokens(user) + 48
    const budget = Math.max(256, Math.min(settings.maxTokens, settings.contextWindow - promptTokens))
    let text = ''
    let raf = 0
    const flush = () => {
      raf = 0
      onProgress?.({ section: spec.number, title: spec.title, text, status: `Drafting ${sectionHeading(spec)}` })
    }
    onProgress?.({ section: spec.number, title: spec.title, text: '', status: `Drafting ${sectionHeading(spec)}` })
    const raw = await generate(
      binding,
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      {
        settings,
        engine,
        signal,
        maxTokens: budget,
        onStatus: (status) => onProgress?.({ section: spec.number, title: spec.title, text, status }),
        onToken: (delta) => {
          text += delta
          // Coalesce token updates to one UI update per animation frame.
          if (!raf) raf = requestAnimationFrame(flush)
        },
      },
    )
    if (raf) cancelAnimationFrame(raf)
    const guarded = sanitizeForbiddenTerms(raw, input.replacement)
    replaced += guarded.count
    bodies[spec.number] = guarded.text
    onProgress?.({ section: spec.number, title: spec.title, text: guarded.text, status: `Finished ${sectionHeading(spec)}` })
  }

  // Each body is normalised against its own known section spec (never re-parsed from the assembled
  // document, so a model that echoes its "## N. Title" heading cannot displace its own content).
  const repaired: number[] = []
  const normalizedBodies: Record<number, string> = {}
  for (const spec of BRIEF_SECTIONS) {
    const r = normalizeSectionBody(spec, bodies[spec.number] ?? '', composed)
    normalizedBodies[spec.number] = r.body
    if (r.repaired) repaired.push(spec.number)
  }
  const final = sanitizeForbiddenTerms(assembleBrief(input.date, normalizedBodies), input.replacement)
  replaced += final.count
  return {
    markdown: final.text,
    repairedSections: repaired,
    forbiddenTermsReplaced: replaced,
    generatedBy: describeBinding(binding),
  }
}
