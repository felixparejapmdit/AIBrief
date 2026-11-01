import { PRECEDENTS, formatPrecedentProof, matchPrecedents } from '../constants/precedents'
import { BRIEF_SECTIONS, PRECEDENT_TABLE } from '../constants/vipSkillPrompt'
import type {
  AthleteReplacement,
  ComplianceCheck,
  ComplianceCheckId,
  ComplianceIssue,
  ComplianceReport,
  DesignPrinciple,
} from '../types/architecture'
import { DESIGN_PRINCIPLES } from '../types/architecture'
import {
  type FallbackContent,
  extractDate,
  findTables,
  headerMatches,
  normalizeBrief,
  parseBrief,
  renderTable,
  replaceSectionBody,
  replaceSubsection,
  sectionBody,
  subsectionBody,
  validateStructure,
} from './briefTemplate'
import { hashString } from './text'

/* ================================================================== */
/* 1. ACTIVE REGEX GUARDRAIL — forbidden term "athletes"               */
/*    Flags every occurrence (singular, plural, possessive, any case)   */
/*    and replaces it with "guests", "patrons" or "principals".         */
/* ================================================================== */

export const FORBIDDEN_TERM_PATTERN = /\b(athlete)(s)?\b/gi

const SINGULAR: Record<AthleteReplacement, string> = { guests: 'guest', patrons: 'patron', principals: 'principal' }

function matchCase(source: string, replacement: string): string {
  if (source === source.toUpperCase()) return replacement.toUpperCase()
  if (source[0] === source[0]?.toUpperCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1)
  return replacement
}

export function findForbiddenTerms(text: string): ComplianceIssue[] {
  const issues: ComplianceIssue[] = []
  for (const m of text.matchAll(FORBIDDEN_TERM_PATTERN)) {
    const at = m.index ?? 0
    issues.push({
      message: `Forbidden term "${m[0]}" found.`,
      excerpt: text.slice(Math.max(0, at - 40), at + m[0].length + 40).replace(/\s+/g, ' ').trim(),
    })
  }
  return issues
}

export function sanitizeForbiddenTerms(text: string, replacement: AthleteReplacement = 'guests'): { text: string; count: number } {
  let count = 0
  const out = text.replace(FORBIDDEN_TERM_PATTERN, (match: string, _stem: string, plural: string | undefined) => {
    count++
    return matchCase(match, plural ? replacement : SINGULAR[replacement])
  })
  return { text: out, count }
}

/* ================================================================== */
/* 2. "The Client" identity guardrail                                  */
/* ================================================================== */

const CLIENT_ALIAS_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(?:the\s+)?VIPs?\b(['’]s)?/gi, label: '"VIP"' },
  { re: /\b(?:the\s+)?home[- ]?owners?\b(['’]s)?/gi, label: '"homeowner"' },
  { re: /\bthe\s+owners?\b(['’]s)?/gi, label: '"the owner"' },
  { re: /\bthe\s+customer\b(['’]s)?/gi, label: '"the customer"' },
  { re: /\b(?:the\s+)?celebrit(?:y|ies)\b(['’]s)?/gi, label: '"celebrity"' },
  { re: /\b(?:Mr|Mrs|Ms|Miss|Mx|Dr|Sir|Dame|Lord|Lady)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b(['’]s)?/g, label: 'a personal name' },
  { re: /\b[Tt]he client\b(['’]s)?/g, label: 'lower-case "the client"' },
]

export function findClientReferenceIssues(text: string): ComplianceIssue[] {
  const issues: ComplianceIssue[] = []
  for (const { re, label } of CLIENT_ALIAS_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const at = m.index ?? 0
      issues.push({
        message: `Refers to the VIP as ${label} — use "The Client".`,
        excerpt: text.slice(Math.max(0, at - 30), at + m[0].length + 30).replace(/\s+/g, ' ').trim(),
      })
    }
  }
  if (!/\bThe Client\b/.test(text)) issues.push({ message: 'The brief never refers to "The Client".' })
  return issues
}

export function normalizeClientReferences(text: string): { text: string; count: number } {
  let count = 0
  let out = text
  for (const { re } of CLIENT_ALIAS_PATTERNS) {
    out = out.replace(re, (_m: string, possessive?: string) => {
      count++
      return `The Client${possessive ? "'s" : ''}`
    })
  }
  return { text: out, count }
}

/* ================================================================== */
/* 3. Political entanglement & sentiment risk                          */
/* ================================================================== */

const RISK_SHIELD = 'Political/Reputational Risk Shield Summary'

const POLITICAL_PATTERNS: RegExp[] = [
  /\bpoliticians?\b/gi,
  /\bpolitical\s+(?:part(?:y|ies)|figures?|affiliations?|donations?|donors?|campaigns?|endorsements?|fundrais\w*|allies|connections?|ties)\b/gi,
  /\b(?:senators?|congress(?:wo)?m[ae]n|congressperson|governors?|mayors?|prime\s+ministers?|cabinet\s+ministers?|members?\s+of\s+parliament)\b/gi,
  /\bgovernment\s+officials?\b/gi,
  /\b(?:elections?|electoral|ballots?|campaign\s+trail|election\s+campaigns?|re-?election)\b/gi,
  /\b(?:lobbying|lobbyists?|partisan|activists?|propaganda|regime|dictator\w*)\b/gi,
  /\b(?:Democrat(?:ic)?\s+Party|Republican\s+Party|Democrats|Republicans|GOP|Labour\s+Party|Conservative\s+Party|Liberal\s+Party|Tory|Tories)\b/g,
  /\b(?:left|right)-wing\b/gi,
]

function stripRiskShield(markdown: string): string {
  const s9 = sectionBody(markdown, 9)
  const shield = subsectionBody(s9, RISK_SHIELD)
  return shield ? markdown.replace(shield, '') : markdown
}

export function findPoliticalIssues(markdown: string): ComplianceIssue[] {
  const issues: ComplianceIssue[] = []
  const scanned = stripRiskShield(markdown)
  for (const re of POLITICAL_PATTERNS) {
    for (const m of scanned.matchAll(re)) {
      const at = m.index ?? 0
      issues.push({
        message: `Possible political entanglement: "${m[0]}".`,
        excerpt: scanned.slice(Math.max(0, at - 40), at + m[0].length + 40).replace(/\s+/g, ' ').trim(),
      })
    }
  }
  const shield = subsectionBody(sectionBody(markdown, 9), RISK_SHIELD)
  const bullets = shield.split('\n').filter((l) => /^\s*[-*+]\s+\S/.test(l))
  if (bullets.length < 2) issues.push({ message: 'Section 9 needs an easy-to-read Political/Reputational Risk Shield bullet summary.' })
  else if (!/reputation|sentiment|perception|publicity|privacy|goodwill|discre/i.test(shield)) {
    issues.push({ message: 'The Risk Shield summary must address social / reputational sentiment risk.' })
  }
  return issues
}

function removePoliticalSentences(markdown: string): string {
  const shield = subsectionBody(sectionBody(markdown, 9), RISK_SHIELD)
  const placeholder = '\u0000SHIELD\u0000'
  let text = shield ? markdown.replace(shield, placeholder) : markdown
  text = text
    .split('\n')
    .map((line) => {
      if (!POLITICAL_PATTERNS.some((re) => new RegExp(re.source, re.flags).test(line))) return line
      if (/^\s*\|/.test(line)) {
        // Table row: neutralise the term in place so the table keeps its shape.
        return POLITICAL_PATTERNS.reduce((l, re) => l.replace(new RegExp(re.source, re.flags), 'stakeholder'), line)
      }
      const prefix = line.match(/^(\s*(?:[-*+]|\d+[.)]|>)\s+)/)?.[1] ?? ''
      const sentences = line.slice(prefix.length).split(/(?<=[.!?])\s+/)
      const kept = sentences.filter((s) => !POLITICAL_PATTERNS.some((re) => new RegExp(re.source, re.flags).test(s)))
      return kept.length ? prefix + kept.join(' ') : ''
    })
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n')
  return shield ? text.replace(placeholder, shield) : text
}

/* ================================================================== */
/* 4/5. 7 Principles & 5 Essential Criteria                            */
/* ================================================================== */

export function missingPrinciples(markdown: string): DesignPrinciple[] {
  return DESIGN_PRINCIPLES.filter((p) => !new RegExp(`\\b${p}\\b`, 'i').test(markdown))
}

export const CRITERIA_PATTERNS: Array<{ name: string; re: RegExp; subsection: string }> = [
  { name: 'Maintainability', re: /\bmaintainab(?:le|ility)\b/i, subsection: 'Maintainability & Durability' },
  { name: 'Durability', re: /\bdurab(?:le|ility)\b/i, subsection: 'Maintainability & Durability' },
  { name: 'Security', re: /\bsecurity\b/i, subsection: 'Security Integration' },
  { name: 'Low-VOC Health Safety', re: /\b(?:low|zero)[- ]?VOCs?\b|volatile organic/i, subsection: 'Health Safety & Wellbeing' },
  { name: 'Aging-in-Place', re: /\bage?ing[- ]in[- ]place\b/i, subsection: 'Aging-in-Place Friendliness' },
]

export function missingCriteria(markdown: string): string[] {
  return CRITERIA_PATTERNS.filter((c) => !c.re.test(markdown)).map((c) => c.name)
}

const CRITERION_STATEMENTS: Record<string, string> = {
  Maintainability: '- **Maintainability:** Every system is specified for safe access, standard replacement parts and a documented maintenance plan handed over to The Client.',
  Durability: '- **Durability:** Materials are selected for documented service lives appropriate to their exposure, with robust detailing at every junction.',
  Security: '- **Security:** Layered, discreet security is integrated into landscape and architecture rather than added as visible hardware.',
  'Low-VOC Health Safety': '- **Low-VOC health safety:** All paints, adhesives, sealants and composite woods are low-VOC or zero-VOC, verified by product data sheets.',
  'Aging-in-Place': '- **Aging-in-place:** Step-free routes, wide doorways and pre-installed blocking let the home adapt as The Client’s needs change.',
}

/* ================================================================== */
/* 6. Precedents with Where & When                                     */
/* ================================================================== */

const YEAR = /\b(1[5-9]\d{2}|20\d{2})\b/
const WHERE = /\bWhere\s*:|\b(?:in|at)\s+[A-Z][a-zA-Z]+|[A-Z][a-zA-Z]+,\s*[A-Z][a-zA-Z]+/

function precedentTable(markdown: string) {
  const lines = sectionBody(markdown, 7).split('\n')
  return findTables(lines).find((t) => headerMatches(t.header, PRECEDENT_TABLE)) ?? null
}

export function findPrecedentIssues(markdown: string): ComplianceIssue[] {
  const table = precedentTable(markdown)
  if (!table) return [{ message: 'Section 7 precedent table with the exact columns was not found.' }]
  if (table.rows.length === 0) return [{ message: 'Section 7 lists no precedents.' }]
  const issues: ComplianceIssue[] = []
  table.rows.forEach((row, i) => {
    const proof = row[2] ?? ''
    const missing = [!WHERE.test(proof) ? 'Where' : null, !YEAR.test(proof) ? 'When' : null].filter(Boolean)
    if (missing.length) {
      issues.push({ message: `Row ${i + 1} ("${(row[0] ?? '').slice(0, 48)}") is missing ${missing.join(' & ')} proof.`, excerpt: proof.slice(0, 120) })
    }
  })
  return issues
}

function fixPrecedents(markdown: string, fb: FallbackContent): string {
  const body = sectionBody(markdown, 7)
  const lines = body.split('\n')
  const table = findTables(lines).find((t) => headerMatches(t.header, PRECEDENT_TABLE))
  if (!table || table.rows.length === 0) return replaceSectionBody(markdown, 7, fb.tables[7] ?? fb.sections[7] ?? '')
  const used = new Set<string>()
  const rows = table.rows.map((row) => {
    const proof = row[2] ?? ''
    if (WHERE.test(proof) && YEAR.test(proof)) return row
    const match =
      matchPrecedents(`${row[0] ?? ''} ${row[1] ?? ''}`, 6).find((p) => !used.has(p.id)) ??
      PRECEDENTS.find((p) => !used.has(p.id) && !body.includes(p.name)) ??
      PRECEDENTS[0]!
    used.add(match.id)
    return [row[0] ?? match.challenge, row[1] && row[1] !== '—' ? row[1] : match.solution, formatPrecedentProof(match)]
  })
  const rebuilt = renderTable(PRECEDENT_TABLE, rows).split('\n')
  lines.splice(table.start, table.end - table.start + 1, ...rebuilt)
  return replaceSectionBody(markdown, 7, lines.join('\n'))
}

/* ================================================================== */
/* Audit                                                               */
/* ================================================================== */

export const CHECK_LABELS: Record<ComplianceCheckId, string> = {
  'client-reference': 'Strictly uses "The Client"',
  'forbidden-athletes': 'Zero usage of forbidden term "athletes"',
  'political-risk': 'Political entanglement & sentiment risk audit passed',
  'design-principles': 'All 7 Principles of Architecture addressed',
  'essential-criteria': 'All 5 Essential Criteria (Maintainability, Durability, Security, Low-VOC, Aging-in-Place) included',
  'precedents-where-when': 'Real-world precedents include Where & When proof',
  structure: 'Exact 9-section Markdown structure verified',
}

export function auditBrief(markdown: string): ComplianceReport {
  const md = markdown ?? ''
  const check = (id: ComplianceCheckId, issues: ComplianceIssue[], autoFixable = true): ComplianceCheck => ({
    id,
    label: CHECK_LABELS[id],
    passed: issues.length === 0,
    issues,
    autoFixable,
  })
  const checks: ComplianceCheck[] = [
    check('client-reference', findClientReferenceIssues(md)),
    check('forbidden-athletes', findForbiddenTerms(md)),
    check('political-risk', findPoliticalIssues(md)),
    check('design-principles', missingPrinciples(md).map((p) => ({ message: `Principle "${p}" is not addressed.` }))),
    check('essential-criteria', missingCriteria(md).map((c) => ({ message: `Essential criterion "${c}" is not addressed.` }))),
    check('precedents-where-when', findPrecedentIssues(md)),
    check('structure', validateStructure(md).map((message) => ({ message }))),
  ]
  const passedCount = checks.filter((c) => c.passed).length
  return { checks, passedCount, total: checks.length, allPassed: passedCount === checks.length, auditedHash: hashString(md) }
}

/* ================================================================== */
/* Auto-fixes                                                          */
/* ================================================================== */

export interface FixContext {
  fallback: FallbackContent
  replacement: AthleteReplacement
  /** Date to use if the document lost its header. */
  date: string
}

export function applyComplianceFix(id: ComplianceCheckId, markdown: string, ctx: FixContext): string {
  const date = extractDate(markdown) ?? ctx.date
  switch (id) {
    case 'forbidden-athletes':
      return sanitizeForbiddenTerms(markdown, ctx.replacement).text
    case 'client-reference':
      return normalizeClientReferences(markdown).text
    case 'structure':
      return normalizeBrief(markdown, date, ctx.fallback).markdown
    case 'political-risk': {
      let md = removePoliticalSentences(markdown)
      const s9 = sectionBody(md, 9)
      const shield = subsectionBody(s9, RISK_SHIELD)
      const bullets = shield.split('\n').filter((l) => /^\s*[-*+]\s+\S/.test(l))
      if (bullets.length < 2 || !/reputation|sentiment|perception|publicity|privacy|goodwill|discre/i.test(shield)) {
        md = replaceSectionBody(md, 9, replaceSubsection(s9, RISK_SHIELD, ctx.fallback.subsections[9]?.[RISK_SHIELD] ?? ''))
      }
      return md
    }
    case 'design-principles': {
      const missing = missingPrinciples(markdown)
      if (!missing.length) return markdown
      const s5 = sectionBody(markdown, 5)
      const sub = '7 Principles Integration'
      const fbLines = (ctx.fallback.subsections[5]?.[sub] ?? '').split('\n')
      const additions = missing.map((p) => fbLines.find((l) => l.includes(`**${p}`)) ?? `- **${p}:** Applied deliberately across the scheme.`)
      const current = subsectionBody(s5, sub)
      return replaceSectionBody(markdown, 5, replaceSubsection(s5, sub, [current, ...additions].filter(Boolean).join('\n')))
    }
    case 'essential-criteria': {
      let md = markdown
      for (const c of CRITERIA_PATTERNS) {
        if (c.re.test(md)) continue
        const s8 = sectionBody(md, 8)
        const current = subsectionBody(s8, c.subsection)
        md = replaceSectionBody(md, 8, replaceSubsection(s8, c.subsection, [current, CRITERION_STATEMENTS[c.name]].filter(Boolean).join('\n')))
      }
      return md
    }
    case 'precedents-where-when':
      return fixPrecedents(markdown, ctx.fallback)
  }
}

/** Repair every failing check, structure first so later fixes operate on a well-formed document. */
export function applyAllFixes(markdown: string, ctx: FixContext): string {
  const order: ComplianceCheckId[] = [
    'structure',
    'forbidden-athletes',
    'client-reference',
    'political-risk',
    'design-principles',
    'essential-criteria',
    'precedents-where-when',
    'structure',
  ]
  let md = markdown
  for (const id of order) {
    const report = auditBrief(md)
    if (!report.checks.find((c) => c.id === id)?.passed) md = applyComplianceFix(id, md, ctx)
  }
  return md
}

/** Number of "##" sections, used for quick UI badges. */
export function countSections(markdown: string): number {
  return parseBrief(markdown).sections.length
}

export const REQUIRED_SECTION_COUNT = BRIEF_SECTIONS.length
