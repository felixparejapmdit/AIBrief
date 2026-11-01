import { describe, expect, it } from 'vitest'
import { VIP_SYSTEM_PROMPT, VIP_SYSTEM_PROMPT_COMPACT, BRIEF_SECTIONS } from '../../src/constants/vipSkillPrompt'
import { composeBrief } from '../../src/utils/briefComposer'
import { findTables, normalizeBrief, normalizeSectionBody, parseBrief, splitCells, validateStructure } from '../../src/utils/briefTemplate'
import {
  applyAllFixes,
  applyComplianceFix,
  auditBrief,
  normalizeClientReferences,
  sanitizeForbiddenTerms,
} from '../../src/utils/complianceAuditor'
import { parseAnalysisJson } from '../../src/services/aiClient'
import { SAMPLE_INPUTS } from './fixtures'

const forbidden = ['ath', 'lete'].join('')

describe('forbidden-term guardrail', () => {
  it('flags and replaces every form with the chosen word, preserving case and number', () => {
    const r = sanitizeForbiddenTerms(`Athletes use the lounge; one ${forbidden}'s locker; ${forbidden.toUpperCase()}S ONLY.`, 'guests')
    expect(r.count).toBe(3)
    expect(r.text).toBe("Guests use the lounge; one guest's locker; GUESTS ONLY.")
    expect(sanitizeForbiddenTerms(`${forbidden}s`, 'patrons').text).toBe('patrons')
    expect(sanitizeForbiddenTerms(`${forbidden}`, 'principals').text).toBe('principal')
  })

  it('does not touch "athletic"', () => {
    expect(sanitizeForbiddenTerms('athletic flooring', 'guests').count).toBe(0)
  })

  it('keeps the system prompts free of the forbidden term', () => {
    expect(VIP_SYSTEM_PROMPT.toLowerCase()).not.toContain(forbidden)
    expect(VIP_SYSTEM_PROMPT_COMPACT.toLowerCase()).not.toContain(forbidden)
    expect(VIP_SYSTEM_PROMPT).toContain('Philippe, Construction Manager at Woodland Construction')
    expect(VIP_SYSTEM_PROMPT).toContain('The Client')
  })
})

describe('client reference guardrail', () => {
  it('normalises VIP aliases to "The Client"', () => {
    const r = normalizeClientReferences("The VIP's suite faces the homeowner terrace for Mr Smith and the client.")
    expect(r.text).toBe("The Client's suite faces The Client terrace for The Client and The Client.")
    expect(r.count).toBe(4)
  })
})

describe('deterministic composer', () => {
  it('produces a brief that passes all 7 compliance checks', () => {
    const md = composeBrief(SAMPLE_INPUTS).markdown
    const report = auditBrief(md)
    const failing = report.checks.filter((c) => !c.passed).map((c) => `${c.id}: ${c.issues.map((i) => i.message).join(' | ')}`)
    expect(failing).toEqual([])
    expect(report.allPassed).toBe(true)
  })

  it('passes with an empty interview too (robust defaults)', () => {
    const md = composeBrief({ ...SAMPLE_INPUTS, objective: '', answers: {} }).markdown
    expect(auditBrief(md).checks.filter((c) => !c.passed)).toEqual([])
  })

  it('uses the exact header block and 9 headings in order', () => {
    const md = composeBrief(SAMPLE_INPUTS).markdown
    const lines = md.split('\n').filter(Boolean)
    expect(lines.slice(0, 4)).toEqual([
      '# ARCHITECTURAL DESIGN BRIEF',
      '**Prepared for:** The Client',
      '**Prepared by:** Woodland Construction',
      '**Date:** November 1, 2026',
    ])
    const headings = md.split('\n').filter((l) => l.startsWith('## '))
    expect(headings).toEqual(BRIEF_SECTIONS.map((s) => `## ${s.number}. ${s.title}`))
  })

  it('writes clean prose from chip answers', () => {
    const md = composeBrief(SAMPLE_INPUTS).markdown
    expect(md).toContain('50+ year design life for the structure')
    expect(md).not.toContain('salt-laden') // "seasonal" must not match "sea"
    expect(md).toContain('| Entertaining pavilion with outdoor kitchen | Per circulation diagram — confirm at concept design | Weather protection')
    expect(md).toContain('**Purpose:** The Client requires a private sanctuary for rest and recovery and a discreet entertaining pavilion for guests.')
    expect(md).not.toMatch(/; (?!When:)[A-Z]/) // chips are never glued together with "; Capital"
    expect(md).not.toContain('for The Client. The project') // no redundant "for The Client" in the vision quote
    expect(md).toMatch(/### Lighting\n\n- Warm 2700K layered lighting\./)
  })

  it('sanitises user answers that contain the forbidden term', () => {
    const md = composeBrief({ ...SAMPLE_INPUTS, answers: { ...SAMPLE_INPUTS.answers, 'vision-purpose': `A pavilion where ${forbidden}s relax` } }).markdown
    expect(md.toLowerCase()).not.toContain(forbidden)
    expect(md).toContain('guests relax')
  })
})

describe('normaliser', () => {
  const composed = composeBrief(SAMPLE_INPUTS)

  it('repairs a drifting model output into the exact layout while keeping valid model text', () => {
    const messy = [
      '```markdown',
      'Here is your brief!',
      '# Architectural Design Brief',
      '## 1) Executive summary',
      '- **Project:** MODEL-WRITTEN summary bullet one.',
      '- Bullet two.',
      '- Bullet three.',
      '## 2. Project Vision and Objectives',
      'No blockquote here, just text.',
      '## 4. Functional Space Program',
      '| Space | Adjacency | Requirements | Extra |',
      '|---|---|---|---|',
      '| Primary suite | Garden | Quiet | Very quiet |',
      '## 5. Aesthetic, Material & Design Principles',
      '### Atmosphere',
      'Calm.',
      '### Random Heading',
      'Stray content.',
      '## 7. Strategic Problem Solving & Proven Precedents',
      'Some chatter.',
      '## 10. Bonus Section',
      'Should be dropped.',
      '```',
    ].join('\n')
    const { markdown, repairedSections } = normalizeBrief(messy, 'November 1, 2026', composed)
    expect(validateStructure(markdown)).toEqual([])
    expect(markdown).toContain('MODEL-WRITTEN summary bullet one')
    expect(markdown).toContain('| Primary suite | Garden | Quiet — Very quiet |')
    expect(markdown).not.toContain('Bonus Section')
    expect(markdown).not.toContain('Here is your brief')
    expect(repairedSections).toEqual(expect.arrayContaining([2, 3, 5, 6, 7, 8, 9]))
    expect(repairedSections).not.toContain(1)
  })

  it('keeps model content when a section echoes its own heading', () => {
    const spec = BRIEF_SECTIONS[0]!
    const r = normalizeSectionBody(spec, '## 1. Executive Summary\n- **Project:** KEEP-ME one.\n- Two.\n- Three.', composed)
    expect(r.body).toContain('KEEP-ME one')
    expect(r.body).not.toContain('## 1.')
    const doubled = normalizeBrief(`## 1. Executive Summary\n\n## 1. Executive Summary\n- KEEP-ME a\n- b\n- c`, 'November 1, 2026', composed)
    expect(doubled.markdown).toContain('KEEP-ME a')
  })

  it('parses tables with escaped pipes', () => {
    expect(splitCells('| a \\| b | c | d |')).toEqual(['a \\| b', 'c', 'd'])
    const t = findTables(['| A | B | C |', '|---|---|---|', '| 1 | 2 | 3 |'])
    expect(t[0]?.rows).toEqual([['1', '2', '3']])
  })
})

describe('audit + auto-fixes', () => {
  const composed = composeBrief(SAMPLE_INPUTS)
  const ctx = { fallback: composed, replacement: 'guests' as const, date: 'November 1, 2026' }

  it('flags every violation and repairs each with its fix', () => {
    let md = composed.markdown
    md = md.replace('**Project:**', `**Project:** The VIP and visiting ${forbidden}s, endorsed by Senator Jones.`)
    md = md.replace(/- \*\*Variety:\*\*.*\n/, '')
    md = md.replace(/Where: Rotterdam, Netherlands; When: 2013\. /, '')
    const report = auditBrief(md)
    const failed = report.checks.filter((c) => !c.passed).map((c) => c.id)
    expect(failed).toEqual(expect.arrayContaining(['client-reference', 'forbidden-athletes', 'political-risk', 'design-principles', 'precedents-where-when']))
    for (const id of failed) md = applyComplianceFix(id, md, ctx)
    const after = auditBrief(md)
    expect(after.checks.filter((c) => !c.passed).map((c) => `${c.id}: ${c.issues.map((i) => i.message).join(' | ')}`)).toEqual([])
  })

  it('applyAllFixes turns arbitrary text into a compliant brief', () => {
    const fixed = applyAllFixes(`# Draft\nThe homeowner wants a gym for ${forbidden}s.`, ctx)
    expect(auditBrief(fixed).allPassed).toBe(true)
  })

  it('exempts the Risk Shield section from political-term flags', () => {
    const shield = parseBrief(composed.markdown).sections[8]!.body
    expect(shield).toContain('Strictly apolitical')
    expect(auditBrief(composed.markdown).checks.find((c) => c.id === 'political-risk')?.passed).toBe(true)
  })
})

describe('vision JSON parsing', () => {
  it('coerces and guards model JSON', () => {
    const parsed = parseAnalysisJson(
      `Sure! {"summary":"Pavilion for ${forbidden}s owned by the VIP","styleAndSpatialFlow":"Open plan. Long views.","materialBuildUps":["Aluminum grid"],"constructabilityNotes":[],"designPrinciples":{"Emphasis":"Tall entry","rhythm":"fins"}}`,
    )
    expect(parsed?.summary).toBe('Pavilion for guests owned by The Client')
    expect(parsed?.styleAndSpatialFlow).toEqual(['Open plan.', 'Long views.'])
    expect(parsed?.designPrinciples.Emphasis).toBe('Tall entry')
    expect(parsed?.designPrinciples.Rhythm).toBe('fins')
    expect(parseAnalysisJson('no json here')).toBeNull()
  })
})
