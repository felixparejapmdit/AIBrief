import {
  BRIEF_SECTIONS,
  BRIEF_TITLE,
  PREPARED_BY_LINE,
  PREPARED_FOR_LINE,
  briefHeaderBlock,
  sectionHeading,
  type BriefSectionSpec,
  type TableColumns,
} from '../constants/vipSkillPrompt'
import { tableRow } from './text'

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

export interface ParsedSection {
  rawHeading: string
  number: number | null
  title: string
  body: string
}

export interface ParsedBrief {
  preamble: string
  sections: ParsedSection[]
}

const H2 = /^##\s+(?!#)(.*)$/
const H3 = /^###\s+(?!#)(.*)$/

export function stripCodeFences(md: string): string {
  let s = md.replace(/\r\n?/g, '\n').trim()
  const fenced = s.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```\s*$/)
  if (fenced?.[1] != null) s = fenced[1]
  return s.replace(/^```[a-zA-Z]*\s*$/gm, '').trim()
}

export function parseBrief(markdown: string): ParsedBrief {
  const lines = stripCodeFences(markdown).split('\n')
  const preamble: string[] = []
  const sections: ParsedSection[] = []
  let current: { heading: string; lines: string[] } | null = null
  const flush = () => {
    if (!current) return
    const text = current.heading.replace(/\*\*/g, '').trim()
    const m = text.match(/^(\d+)\s*[.):-]?\s*(.*)$/)
    sections.push({
      rawHeading: current.heading,
      number: m?.[1] ? Number(m[1]) : null,
      title: (m ? (m[2] ?? '') : text).trim(),
      body: current.lines.join('\n').trim(),
    })
  }
  for (const line of lines) {
    const h = line.match(H2)
    if (h) {
      flush()
      current = { heading: h[1] ?? '', lines: [] }
    } else if (current) {
      current.lines.push(line)
    } else {
      preamble.push(line)
    }
  }
  flush()
  return { preamble: preamble.join('\n').trim(), sections }
}

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

export interface MdTable {
  start: number
  end: number
  header: string[]
  rows: string[][]
}

const SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

export function splitCells(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  return s.split(/(?<!\\)\|/).map((c) => c.trim())
}

export function findTables(lines: string[]): MdTable[] {
  const tables: MdTable[] = []
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i] ?? ''
    if (line.trim().startsWith('|') && SEPARATOR.test(lines[i + 1] ?? '')) {
      const header = splitCells(line)
      const rows: string[][] = []
      let j = i + 2
      while (j < lines.length && (lines[j] ?? '').trim().startsWith('|')) {
        rows.push(splitCells(lines[j] ?? ''))
        j++
      }
      tables.push({ start: i, end: j - 1, header, rows })
      i = j - 1
    }
  }
  return tables
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function headerMatches(header: string[], cols: TableColumns): boolean {
  return header.length === 3 && header.every((h, i) => h.replace(/\*\*/g, '').trim() === cols[i])
}

export function renderTable(cols: TableColumns, rows: string[][]): string {
  return [`| ${cols.join(' | ')} |`, '|---|---|---|', ...rows.map((r) => tableRow(r))].join('\n')
}

/** Coerce any table found in `body` into the exact 3-column layout; returns null if none is usable. */
function repairTableIn(body: string, cols: TableColumns): { body: string; ok: boolean } {
  const lines = body.split('\n')
  const tables = findTables(lines)
  const table = tables.find((t) => t.header.length >= 2)
  if (!table) return { body, ok: false }
  const headerNorm = cols.map(norm)
  const rows = table.rows
    .filter((r) => r.some((c) => c.length > 0))
    .filter((r) => !r.every((c, i) => norm(c) === headerNorm[i]))
    .map((r): string[] => {
      if (r.length === 3) return r
      if (r.length > 3) return [r[0] ?? '', r[1] ?? '', r.slice(2).join(' — ')]
      if (r.length === 2) return [r[0] ?? '', r[1] ?? '', '—']
      return [r[0] ?? '', '—', '—']
    })
    .map((r) => r.map((c) => c.replace(/\\\|/g, '|')))
  if (rows.length === 0) return { body, ok: false }
  const rebuilt = renderTable(cols, rows).split('\n')
  lines.splice(table.start, table.end - table.start + 1, ...rebuilt)
  return { body: lines.join('\n'), ok: true }
}

/* ------------------------------------------------------------------ */
/* Sub-blocks (### headings)                                           */
/* ------------------------------------------------------------------ */

interface SubBlocks {
  preface: string[]
  blocks: Array<{ title: string; lines: string[] }>
}

function splitSubBlocks(body: string): SubBlocks {
  const out: SubBlocks = { preface: [], blocks: [] }
  for (const line of body.split('\n')) {
    const m = line.match(H3)
    if (m) out.blocks.push({ title: (m[1] ?? '').replace(/\*\*/g, '').trim(), lines: [] })
    else if (out.blocks.length) out.blocks[out.blocks.length - 1]!.lines.push(line)
    else out.preface.push(line)
  }
  return out
}

function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(norm(a).split(' ').filter(Boolean))
  const tb = new Set(norm(b).split(' ').filter(Boolean))
  if (!ta.size || !tb.size) return 0
  let common = 0
  for (const t of ta) if (tb.has(t)) common++
  return common / Math.max(ta.size, tb.size)
}

/* ------------------------------------------------------------------ */
/* Validation (used by the structure audit)                            */
/* ------------------------------------------------------------------ */

const BULLET = /^\s*([-*+]|\d+[.)])\s+\S/m
const BLOCKQUOTE = /^>\s?\S/m

export function validateSectionBody(spec: BriefSectionSpec, body: string): string[] {
  const issues: string[] = []
  const label = `Section ${spec.number}`
  if (!body.trim()) return [`${label} is empty.`]
  if (spec.needsBlockquote && !BLOCKQUOTE.test(body)) issues.push(`${label} must open with a blockquote stating the strategic "why".`)
  const { preface, blocks } = splitSubBlocks(body)
  if (spec.subheadings.length) {
    const titles = blocks.map((b) => b.title)
    if (titles.join('||') !== spec.subheadings.join('||')) {
      issues.push(`${label} must use exactly these subheadings in order: ${spec.subheadings.join(', ')}.`)
    }
    for (const sub of spec.subheadings) {
      const block = blocks.find((b) => b.title === sub)
      if (block && !block.lines.join('\n').trim()) issues.push(`${label} → "${sub}" is empty.`)
    }
  } else if (blocks.length) {
    issues.push(`${label} must not contain extra subheadings.`)
  }
  if (spec.table) {
    const scope = spec.tableUnder ? (blocks.find((b) => b.title === spec.tableUnder)?.lines ?? []) : [...preface, ...blocks.flatMap((b) => b.lines)]
    const tables = findTables(scope)
    const exact = tables.find((t) => headerMatches(t.header, spec.table!))
    if (!exact) issues.push(`${label} table must use the exact columns: ${spec.table.join(' | ')}.`)
    else if (exact.rows.length === 0) issues.push(`${label} table has no rows.`)
    else if (exact.rows.some((r) => r.length !== 3)) issues.push(`${label} table rows must have exactly 3 cells.`)
  }
  if (spec.needsBullets && !spec.table && !BULLET.test(body)) issues.push(`${label} must use bullet points.`)
  if (spec.number === 1) {
    const bullets = body.split('\n').filter((l) => /^\s*[-*+]\s+\S/.test(l)).length
    if (bullets < 3) issues.push('Section 1 needs an easy-to-read bulleted summary (3+ bullets).')
  }
  return issues
}

export function validateStructure(markdown: string): string[] {
  const issues: string[] = []
  const parsed = parseBrief(markdown)
  const pre = parsed.preamble.split('\n').map((l) => l.trim()).filter(Boolean)
  if (pre[0] !== BRIEF_TITLE) issues.push(`Document must start with "${BRIEF_TITLE}".`)
  if (pre[1] !== PREPARED_FOR_LINE) issues.push(`Header must include "${PREPARED_FOR_LINE}".`)
  if (pre[2] !== PREPARED_BY_LINE) issues.push(`Header must include "${PREPARED_BY_LINE}".`)
  if (!/^\*\*Date:\*\* \S.+$/.test(pre[3] ?? '')) issues.push('Header must include "**Date:** [Current Date]".')
  if (pre.length > 4) issues.push('Unexpected content between the header block and Section 1.')
  if (parsed.sections.length !== BRIEF_SECTIONS.length) {
    issues.push(`Expected exactly ${BRIEF_SECTIONS.length} "##" sections, found ${parsed.sections.length}.`)
  }
  BRIEF_SECTIONS.forEach((spec, i) => {
    const s = parsed.sections[i]
    const expected = sectionHeading(spec).slice(3)
    if (!s || s.rawHeading.trim() !== expected) {
      issues.push(`Section ${i + 1} heading must be exactly "${sectionHeading(spec)}".`)
      return
    }
    issues.push(...validateSectionBody(spec, s.body))
  })
  return issues
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

export interface FallbackContent {
  /** Full body for each section number. */
  sections: Record<number, string>
  /** Body for each "### subheading" keyed by section number then subheading. */
  subsections: Record<number, Record<string, string>>
  /** Rendered table for each table section. */
  tables: Record<number, string>
}

export interface NormalizeResult {
  markdown: string
  repairedSections: number[]
}

function matchSection(spec: BriefSectionSpec, sections: ParsedSection[], used: Set<number>): ParsedSection | undefined {
  let best: { s: ParsedSection; idx: number; score: number } | undefined
  sections.forEach((s, idx) => {
    if (used.has(idx)) return
    const titleScore = tokenSimilarity(s.title, spec.title)
    // Prefer a section that actually has content when a heading appears twice.
    const score = (s.number === spec.number ? 1 : 0) + titleScore + (s.body.trim() ? 0.1 : 0)
    if (score >= 0.6 && (!best || score > best.score)) best = { s, idx, score }
  })
  if (best) used.add(best.idx)
  return best?.s
}

/** Remove a heading the model echoed at the top of a section body. */
function dropEchoedHeading(spec: BriefSectionSpec, body: string): string {
  const lines = body.split('\n')
  while (lines.length && !lines[0]!.trim()) lines.shift()
  const first = (lines[0] ?? '').replace(/^#+\s*|\*\*/g, '').trim()
  if (first && tokenSimilarity(first.replace(/^\d+[.)]?\s*/, ''), spec.title) >= 0.8 && first.length < spec.title.length + 12) lines.shift()
  // Stray H1/H2 inside a body become bold lines so the section count stays exact.
  return lines.map((l) => (/^#{1,2}\s+/.test(l) ? `**${l.replace(/^#+\s*/, '').trim()}**` : l)).join('\n').trim()
}

function normalizeSubsections(spec: BriefSectionSpec, body: string, fb: FallbackContent): { body: string; repaired: boolean } {
  const { preface, blocks } = splitSubBlocks(body)
  let repaired = false
  const assigned = new Map<string, string[]>()
  const extra: string[] = []
  for (const block of blocks) {
    const target = spec.subheadings
      .filter((sub) => !assigned.has(sub))
      .map((sub) => ({ sub, score: tokenSimilarity(block.title, sub) }))
      .sort((a, b) => b.score - a.score)[0]
    if (target && target.score >= 0.5) {
      assigned.set(target.sub, block.lines)
      if (block.title !== target.sub) repaired = true
    } else {
      repaired = true
      extra.push(`**${block.title}**`, ...block.lines)
    }
  }
  const out: string[] = []
  const prefaceText = [...preface, ...extra].join('\n').trim()
  // Content outside any subheading is kept with the first subsection so nothing the model wrote is lost.
  spec.subheadings.forEach((sub, i) => {
    let content = (assigned.get(sub) ?? []).join('\n').trim()
    if (i === 0 && prefaceText) content = [prefaceText, content].filter(Boolean).join('\n\n')
    if (spec.table && spec.tableUnder === sub) {
      const fixed = repairTableIn(content, spec.table)
      if (fixed.ok) content = fixed.body
      else {
        content = [content, fb.tables[spec.number] ?? ''].filter(Boolean).join('\n\n')
        repaired = true
      }
    }
    if (!content) {
      content = fb.subsections[spec.number]?.[sub] ?? ''
      repaired = true
    }
    out.push(`### ${sub}`, '', content.trim(), '')
  })
  return { body: out.join('\n').trim(), repaired }
}

export function normalizeSectionBody(spec: BriefSectionSpec, rawBody: string, fb: FallbackContent): { body: string; repaired: boolean } {
  let body = dropEchoedHeading(spec, rawBody)
  if (!body) return { body: fb.sections[spec.number] ?? '', repaired: true }
  let repaired = false

  if (spec.subheadings.length) {
    const r = normalizeSubsections(spec, body, fb)
    body = r.body
    repaired = r.repaired
  } else {
    // Sections without subheadings must not contain ### headings.
    if (H3.test(body) || /^###\s/m.test(body)) {
      body = body.replace(/^###\s+(.*)$/gm, '**$1**')
      repaired = true
    }
    if (spec.table) {
      const original = findTables(body.split('\n'))[0]
      if (!original || !headerMatches(original.header, spec.table)) repaired = true
      const r = repairTableIn(body, spec.table)
      if (r.ok) {
        // Table-only sections: drop any chatter around the table.
        const lines = r.body.split('\n')
        const t = findTables(lines)[0]
        body = t ? lines.slice(t.start, t.end + 1).join('\n') : r.body
        if (t && (t.start > 0 || t.end < lines.length - 1) && lines.some((l, i) => (i < t.start || i > t.end) && l.trim())) repaired = true
      } else {
        body = fb.tables[spec.number] ?? fb.sections[spec.number] ?? body
        repaired = true
      }
    }
  }

  if (validateSectionBody(spec, body).length) {
    // Merge only the missing ingredient from the composer before giving up on the model's text.
    const fbLines = (fb.sections[spec.number] ?? '').split('\n')
    if (spec.needsBlockquote && !BLOCKQUOTE.test(body)) {
      const quote = fbLines.filter((l) => BLOCKQUOTE.test(l)).join('\n')
      if (quote) {
        body = `${quote}\n\n${body}`
        repaired = true
      }
    }
    const bulletCount = body.split('\n').filter((l) => /^\s*[-*+]\s+\S/.test(l)).length
    if (spec.needsBullets && !spec.subheadings.length && !spec.table && bulletCount < (spec.number === 1 ? 3 : 1)) {
      const bullets = fbLines.filter((l) => /^\s*[-*+]\s+\S/.test(l)).join('\n')
      if (bullets) {
        body = `${body}\n\n${bullets}`
        repaired = true
      }
    }
    if (validateSectionBody(spec, body).length) {
      body = fb.sections[spec.number] ?? body
      repaired = true
    }
  }
  return { body: body.trim(), repaired }
}

export function assembleBrief(date: string, bodies: Record<number, string>): string {
  const parts = [briefHeaderBlock(date)]
  for (const spec of BRIEF_SECTIONS) parts.push('', sectionHeading(spec), '', (bodies[spec.number] ?? '').trim())
  return `${parts.join('\n').trim()}\n`
}

/**
 * Force any Markdown (model output or a hand edit) into the exact 9-section layout.
 * Model content is kept wherever it is structurally valid; anything missing or malformed
 * is rebuilt from the deterministic composer so the result always passes the structure audit.
 */
export function normalizeBrief(markdown: string, date: string, fb: FallbackContent): NormalizeResult {
  const parsed = parseBrief(markdown)
  const used = new Set<number>()
  const bodies: Record<number, string> = {}
  const repaired: number[] = []
  for (const spec of BRIEF_SECTIONS) {
    const match = matchSection(spec, parsed.sections, used)
    const r = normalizeSectionBody(spec, match?.body ?? '', fb)
    bodies[spec.number] = r.body
    if (!match || r.repaired) repaired.push(spec.number)
  }
  return { markdown: assembleBrief(date, bodies), repairedSections: repaired }
}

export function extractDate(markdown: string): string | null {
  return markdown.match(/^\*\*Date:\*\*\s*(.+)$/m)?.[1]?.trim() ?? null
}

export function sectionBody(markdown: string, n: number): string {
  return parseBrief(markdown).sections.find((s) => s.number === n)?.body ?? ''
}

export function replaceSectionBody(markdown: string, n: number, body: string): string {
  const parsed = parseBrief(markdown)
  const date = extractDate(markdown) ?? ''
  const bodies: Record<number, string> = {}
  for (const spec of BRIEF_SECTIONS) {
    const s = parsed.sections.find((x) => x.number === spec.number)
    bodies[spec.number] = spec.number === n ? body : (s?.body ?? '')
  }
  return assembleBrief(date, bodies)
}

/** Body of one "### subheading" within a section body. */
export function subsectionBody(body: string, sub: string): string {
  return splitSubBlocks(body).blocks.find((b) => b.title === sub)?.lines.join('\n').trim() ?? ''
}

export function replaceSubsection(body: string, sub: string, content: string): string {
  const { preface, blocks } = splitSubBlocks(body)
  const out = [...preface]
  let found = false
  for (const b of blocks) {
    out.push(`### ${b.title}`)
    if (b.title === sub) {
      out.push('', content.trim(), '')
      found = true
    } else out.push(...b.lines)
  }
  if (!found) out.push(`### ${sub}`, '', content.trim(), '')
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
