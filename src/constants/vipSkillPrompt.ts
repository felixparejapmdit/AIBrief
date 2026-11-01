import type { ImageCategory } from '../types/architecture'
import { DESIGN_PRINCIPLES } from '../types/architecture'

/* ------------------------------------------------------------------ */
/* The mandated 9-section layout — single source of truth for the       */
/* model prompt, the normaliser and the structure audit.                */
/* ------------------------------------------------------------------ */

export const BRIEF_TITLE = '# ARCHITECTURAL DESIGN BRIEF'
export const PREPARED_FOR_LINE = '**Prepared for:** The Client'
export const PREPARED_BY_LINE = '**Prepared by:** Woodland Construction'
export const PREPARED_ON_BEHALF_OF = 'Philippe, Construction Manager at Woodland Construction'

export type TableColumns = readonly [string, string, string]

export interface BriefSectionSpec {
  number: number
  title: string
  subheadings: readonly string[]
  table: TableColumns | null
  /** Subheading the table belongs under (null = directly in the section). */
  tableUnder: string | null
  needsBullets: boolean
  needsBlockquote: boolean
  instruction: string
}

export const SPACE_TABLE: TableColumns = ['Space / Zone', 'Adjacency', 'Key Requirements & Non-Negotiables']
export const SPEC_TABLE: TableColumns = ['System / Component', 'Specification', 'Function / Note']
export const PRECEDENT_TABLE: TableColumns = [
  'Identified Challenge',
  'Proposed Solution',
  'Real-World Precedent / Proof (Where & When)',
]

export const BRIEF_SECTIONS: readonly BriefSectionSpec[] = [
  {
    number: 1,
    title: 'Executive Summary',
    subheadings: [],
    table: null,
    tableUnder: null,
    needsBullets: true,
    needsBlockquote: false,
    instruction:
      'Write 6 concise bullet points ("- " followed by a bold lead-in such as **Project:**) that summarise the project for a busy executive in plain, easy-to-understand language: purpose, site, programme, design direction, key risks solved, and timeline.',
  },
  {
    number: 2,
    title: 'Project Vision & Objectives',
    subheadings: [],
    table: null,
    tableUnder: null,
    needsBullets: true,
    needsBlockquote: true,
    instruction:
      'Open with a Markdown blockquote ("> ") of 2–3 sentences stating the strategic "why" of the project. Then list 4–5 measurable objectives as bullets.',
  },
  {
    number: 3,
    title: 'Site Analysis & Context',
    subheadings: [],
    table: null,
    tableUnder: null,
    needsBullets: true,
    needsBlockquote: false,
    instruction:
      'Write 5–7 bullets with bold lead-ins covering: Location & Climate, Topography & Orientation, Existing Features to Retain, Access & Privacy, and Visual Intake Observations drawn from the analysed images.',
  },
  {
    number: 4,
    title: 'Functional Space Program',
    subheadings: [],
    table: SPACE_TABLE,
    tableUnder: null,
    needsBullets: false,
    needsBlockquote: false,
    instruction:
      'Output ONLY a Markdown table with exactly this header row: "| Space / Zone | Adjacency | Key Requirements & Non-Negotiables |" followed by the separator row and one row per space (5–9 rows). No text before or after the table.',
  },
  {
    number: 5,
    title: 'Aesthetic, Material & Design Principles',
    subheadings: ['Atmosphere', '7 Principles Integration', 'Material Palette', 'Lighting'],
    table: null,
    tableUnder: null,
    needsBullets: true,
    needsBlockquote: false,
    instruction:
      'Use exactly these level-3 subheadings in this order: "### Atmosphere", "### 7 Principles Integration", "### Material Palette", "### Lighting". Under 7 Principles Integration write one bullet for EACH principle, starting with its bold name: **Emphasis**, **Balance**, **Unity**, **Contrast**, **Rhythm**, **Proportion**, **Variety**.',
  },
  {
    number: 6,
    title: 'Constructability & Material Specifications',
    subheadings: ['Critical Transitions', 'Existing Site Integrations', 'Material Specifications'],
    table: SPEC_TABLE,
    tableUnder: 'Material Specifications',
    needsBullets: true,
    needsBlockquote: false,
    instruction:
      'Use exactly these level-3 subheadings in order: "### Critical Transitions" (bullets on junctions such as aluminum grids, EPDM pads, steel covers, thresholds), "### Existing Site Integrations" (bullets), and "### Material Specifications" containing ONLY a Markdown table with exactly this header row: "| System / Component | Specification | Function / Note |" (5–8 rows).',
  },
  {
    number: 7,
    title: 'Strategic Problem Solving & Proven Precedents',
    subheadings: [],
    table: PRECEDENT_TABLE,
    tableUnder: null,
    needsBullets: false,
    needsBlockquote: false,
    instruction:
      'Output ONLY a Markdown table with exactly this header row: "| Identified Challenge | Proposed Solution | Real-World Precedent / Proof (Where & When) |" and one row per challenge. In the third column name the precedent in bold, then "Where:" with city and country and "When:" with the year, then one sentence of proof. Use only precedents from the verified list provided.',
  },
  {
    number: 8,
    title: 'Performance, Safety & Longevity',
    subheadings: ['Maintainability & Durability', 'Health Safety & Wellbeing', 'Security Integration', 'Aging-in-Place Friendliness'],
    table: null,
    tableUnder: null,
    needsBullets: true,
    needsBlockquote: false,
    instruction:
      'Use exactly these level-3 subheadings in order: "### Maintainability & Durability", "### Health Safety & Wellbeing" (must specify low-VOC materials and indoor air quality), "### Security Integration", "### Aging-in-Place Friendliness". Write 2–4 bullets under each.',
  },
  {
    number: 9,
    title: 'Project Parameters',
    subheadings: ['Timeline', 'Execution Constraints', 'Political/Reputational Risk Shield Summary'],
    table: null,
    tableUnder: null,
    needsBullets: true,
    needsBlockquote: false,
    instruction:
      'Use exactly these level-3 subheadings in order: "### Timeline" (phased milestones as bullets), "### Execution Constraints" (bullets), "### Political/Reputational Risk Shield Summary" (4–5 short, easy-to-read bullets confirming the project stays strictly apolitical and summarising any social or reputational sentiment risks and their mitigations).',
  },
]

export function sectionHeading(spec: BriefSectionSpec): string {
  return `## ${spec.number}. ${spec.title}`
}

export function formatBriefDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(date)
}

export function briefHeaderBlock(date: string): string {
  return [BRIEF_TITLE, '', PREPARED_FOR_LINE, '', PREPARED_BY_LINE, '', `**Date:** ${date}`].join('\n')
}

function tableSkeleton(cols: TableColumns): string {
  return `| ${cols.join(' | ')} |\n|---|---|---|\n| … | … | … |`
}

export function briefTemplateSkeleton(date: string): string {
  const parts = [briefHeaderBlock(date)]
  for (const s of BRIEF_SECTIONS) {
    parts.push('', sectionHeading(s))
    if (s.needsBlockquote) parts.push('> …')
    if (s.subheadings.length) {
      for (const sub of s.subheadings) {
        parts.push(`### ${sub}`)
        parts.push(s.table && s.tableUnder === sub ? tableSkeleton(s.table) : '- …')
      }
    } else if (s.table) {
      parts.push(tableSkeleton(s.table))
    } else {
      parts.push('- …')
    }
  }
  return parts.join('\n')
}

/* ------------------------------------------------------------------ */
/* System prompt — the complete VIP Architectural Design Brief skill.   */
/* It must never contain the forbidden user-group term; the guard below */
/* enforces that at module load.                                        */
/* ------------------------------------------------------------------ */

const CORE_RULES = `CORE RULES — NON-NEGOTIABLE
1. Identity: Refer to the VIP strictly as "The Client" (or "Client"). Never use a name, title, honorific, nickname, "VIP", "owner", "homeowner" or any other personal identifier.
2. Vocabulary: People who use the spaces — including any pavilion — are always "guests", "patrons" or "principals". Never describe them with sporting, competitive or performance-sport terms.
3. Political neutrality: Avoid all political connections and entanglements. Never mention political parties, politicians, government officials, campaigns, elections, endorsements or donations. Summarise any social or reputational sentiment risk as short, easy-to-read bullets.
4. The 5 Essential Criteria are integrated throughout: Maintainability, Durability, Security, Health safety (low-VOC materials and clean indoor air) and Aging-in-place friendliness.
5. The 7 Principles of Architectural Design are each addressed by name: ${DESIGN_PRINCIPLES.join(', ')}.
6. Evidence-Based Problem Solving: every proposed solution is backed by a real-world precedent that states explicitly WHERE (city, country) and WHEN (year) it was built or tested. Never invent precedents — use the verified precedent list supplied.
7. Write clear, confident, executive English that is specific to the project data. Never use placeholders such as [TBD] or "insert here"; where information is missing, state a sensible professional assumption prefixed with "Assumption:".
8. Output Markdown only — no preamble, no closing remarks, no code fences.`

export const VIP_SYSTEM_PROMPT = `You are a senior architectural strategist and technical design lead. You assist ${PREPARED_ON_BEHALF_OF}, in preparing an Architectural Design Brief for a high-profile VIP. Every brief is prepared by Woodland Construction on behalf of Philippe, and is written for The Client.

${CORE_RULES}

MANDATED BRIEF LAYOUT — the final document uses exactly these headers, subheaders and table columns, in this order. Never rename, reorder, add or remove sections or columns:

${briefTemplateSkeleton('[Current Date]')}

You will be asked to write one section at a time. Write only the body of the requested section — the application inserts the "## N. Title" heading itself.`

/** Condensed variant for small context windows (2K-token lightweight tier). */
export const VIP_SYSTEM_PROMPT_COMPACT = `You are a senior architectural strategist assisting ${PREPARED_ON_BEHALF_OF}, writing an Architectural Design Brief for a VIP referred to only as "The Client".
Rules: call the VIP only "The Client"; call space users only guests, patrons or principals (never sporting terms); stay strictly apolitical; integrate Maintainability, Durability, Security, Low-VOC health and Aging-in-place; name all 7 principles (${DESIGN_PRINCIPLES.join(', ')}) when asked; back solutions with verified precedents stating Where and When; no placeholders; Markdown only, no preamble.
Write only the body of the requested section; the app adds the heading.`

const FORBIDDEN_STEM = ['ath', 'lete'].join('')
for (const prompt of [VIP_SYSTEM_PROMPT, VIP_SYSTEM_PROMPT_COMPACT]) {
  if (prompt.toLowerCase().includes(FORBIDDEN_STEM)) {
    throw new Error('System prompt guardrail violated: forbidden user-group term present.')
  }
}

export function systemPromptFor(contextWindow: number): string {
  return contextWindow < 4096 ? VIP_SYSTEM_PROMPT_COMPACT : VIP_SYSTEM_PROMPT
}

/* ------------------------------------------------------------------ */
/* Task prompts                                                        */
/* ------------------------------------------------------------------ */

export function sectionTaskPrompt(spec: BriefSectionSpec): string {
  return `TASK: Write the body of section ${spec.number}. "${spec.title}" for The Client's brief.
${spec.instruction}
Do not repeat the "## ${spec.number}. ${spec.title}" heading. Do not write any other section.`
}

export const IMAGE_CATEGORY_LABELS: Record<ImageCategory, string> = {
  'site-photo': 'Site Photo',
  'sketchup-render': 'SketchUp Render',
  'shop-drawing': 'Technical Shop Drawing',
  'design-peg': 'Design Peg',
}

export const IMAGE_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    styleAndSpatialFlow: { type: 'array', items: { type: 'string' } },
    materialBuildUps: { type: 'array', items: { type: 'string' } },
    constructabilityNotes: { type: 'array', items: { type: 'string' } },
    designPrinciples: {
      type: 'object',
      properties: Object.fromEntries(DESIGN_PRINCIPLES.map((p) => [p, { type: 'string' }])),
      required: [...DESIGN_PRINCIPLES],
      additionalProperties: false,
    },
  },
  required: ['summary', 'styleAndSpatialFlow', 'materialBuildUps', 'constructabilityNotes', 'designPrinciples'],
  additionalProperties: false,
} as const

export const IMAGE_ANALYST_SYSTEM_PROMPT = `You are a senior architectural strategist reviewing visual material for ${PREPARED_ON_BEHALF_OF}. Refer to the VIP only as "The Client". Be precise, technical and concise. Describe only what is visible or can be reasonably inferred; never invent dimensions. Respond with a single JSON object only.`

export function imageAnalysisPrompt(opts: {
  category: ImageCategory
  objective: string
  notes: string
  tiled: boolean
  metadataOnly: string | null
}): string {
  const subject = IMAGE_CATEGORY_LABELS[opts.category]
  const intro = opts.metadataOnly
    ? `No vision model is active, so you cannot see the image. Infer cautiously from this metadata and the notes only:\n${opts.metadataOnly}`
    : opts.tiled
      ? `Image 1 is the full ${subject}; images 2–5 are high-detail quadrants (top-left, top-right, bottom-left, bottom-right) of the same sheet.`
      : `Analyse the attached ${subject}.`
  return `${intro}
Project objective: ${opts.objective || 'Not yet stated.'}
Notes from Philippe: ${opts.notes || 'None.'}

Return JSON with these keys:
- "summary": one sentence describing the image's relevance to the brief.
- "styleAndSpatialFlow": 2–4 observations on architectural style, massing and spatial flow.
- "materialBuildUps": 2–4 observations on material build-ups and structural transitions (e.g. aluminum grids, EPDM pads, steel covers).
- "constructabilityNotes": 2–4 practical constructability notes or risks.
- "designPrinciples": an object with one short observation for each of ${DESIGN_PRINCIPLES.join(', ')}.`
}

export function followUpPrompt(pillarTitle: string, answered: string): string {
  return `We are interviewing Philippe about the pillar "${pillarTitle}" for The Client's brief.
Answers so far:
${answered || '(none yet)'}

Ask ONE concise follow-up question (maximum 30 words) that would most improve this part of the brief. Output only the question.`
}
