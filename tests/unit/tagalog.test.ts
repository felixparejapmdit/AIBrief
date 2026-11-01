import { describe, expect, it } from 'vitest'
import { ALL_QUESTIONS, PILLARS } from '../../src/constants/interviewPillars'
import { PRECEDENTS } from '../../src/constants/precedents'
import { BRIEF_SECTIONS, VIP_SYSTEM_PROMPT } from '../../src/constants/vipSkillPrompt'
import { TRANSLATOR_SYSTEM_PROMPT } from '../../src/services/translator'
import { composeBrief } from '../../src/utils/briefComposer'
import { auditBrief } from '../../src/utils/complianceAuditor'
import {
  cleanTranslation,
  containsTagalog,
  detectTagalog,
  findTagalogLines,
  phrasebookLookup,
  splitPieces,
  translatePieces,
  translateTagalogLines,
} from '../../src/utils/tagalog'
import { SAMPLE_INPUTS } from './fixtures'

const TAGALOG = [
  'Gusto ko ng pribadong bahay sa burol na may malaking kusina at pavilion para sa mga bisita.',
  'Kailangan ng tatlong kwarto na may sariling banyo ang bawat isa.',
  'Dapat matibay sa bagyo at baha ang bahay.',
  'Hindi namin gusto ang madilim na sala.',
  'Ang bubong ay dapat may solar panels.',
  'Modern minimalist na design, maraming natural light',
  'Mga kapitbahay ay malapit, kaya kailangan ng mataas na bakod.',
  'Wala pa po',
  'Oo',
  'Siguro po',
  'Malaking kusina',
  'Gusto namin ng infinity pool at garden sa likod ng bahay',
]

/** Every English sentence the app itself produces must never be mistaken for Tagalog. */
function appEnglishCorpus(): string[] {
  const out: string[] = []
  for (const q of ALL_QUESTIONS) out.push(q.prompt, q.helper, q.placeholder, ...q.chips)
  for (const p of PILLARS) out.push(p.title, p.description)
  for (const p of PRECEDENTS) out.push(p.name, p.challenge, p.solution, p.where, p.proof)
  for (const s of BRIEF_SECTIONS) out.push(s.title)
  out.push(...Object.values(SAMPLE_INPUTS.answers), SAMPLE_INPUTS.objective)
  out.push(...composeBrief(SAMPLE_INPUTS).markdown.split('\n'))
  out.push(...VIP_SYSTEM_PROMPT.split('\n'))
  out.push(
    'The sala may need more daylight.',
    'Issue the PO for the NG line and steel by May.',
    'Bahay Kubo inspired pavilion with a raised timber floor',
    'We visited Lima, Peru in 2019 for the stone samples.',
    'Ang Lee Studio supplied the lighting.',
    'Kaya Residences used a similar façade grid.',
  )
  return out.filter((s) => s.trim().length > 0)
}

describe('Tagalog detection', () => {
  it.each(TAGALOG)('detects Tagalog / Taglish: %s', (text) => {
    expect(containsTagalog(text)).toBe(true)
  })

  it('never flags the app’s own English (chips, prompts, precedents, composed brief)', () => {
    const flagged = appEnglishCorpus().filter((s) => containsTagalog(s))
    expect(flagged).toEqual([])
  })

  it('ignores acronyms in mixed-case text but still reads all-caps Tagalog', () => {
    expect(detectTagalog('Confirm the PO and NG meter').isTagalog).toBe(false)
    expect(detectTagalog('GUSTO KO NG MALAKING KUSINA').isTagalog).toBe(true)
  })

  it('document mode needs real Tagalog sentences, not a stray word', () => {
    expect(detectTagalog('- **Atmosphere:** A Bahay Kubo inspired pavilion with a cool sala.', 'document').isTagalog).toBe(false)
    expect(detectTagalog('- Gusto ng kliyente ang malaking kusina na bukas sa sala at hardin.', 'document').isTagalog).toBe(true)
  })
})

describe('offline phrasebook', () => {
  it('translates short everyday answers exactly, ignoring politeness markers', () => {
    expect(phrasebookLookup('Oo')).toBe('Yes')
    expect(phrasebookLookup('Wala pa po.')).toBe('None yet')
    expect(phrasebookLookup('hindi ko alam')).toBe('I do not know')
    expect(phrasebookLookup('Gusto ko ng malaking kusina')).toBeNull()
  })
})

describe('piece-wise translation', () => {
  it('keeps English chips byte-for-byte and translates only the Tagalog parts', async () => {
    const calls: string[] = []
    const input = 'Quiet luxury with natural materials; Gusto ko ng malaking kusina na bukas sa sala.'
    const r = await translatePieces(input, async (chunk) => {
      calls.push(chunk)
      return 'I want a large kitchen that opens to the living room.'
    })
    expect(calls).toEqual(['Gusto ko ng malaking kusina na bukas sa sala.'])
    expect(r.text).toBe('Quiet luxury with natural materials; I want a large kitchen that opens to the living room.')
    expect(r.modelPieces).toBe(1)
    expect(r.review).toBe(false)
  })

  it('sends consecutive Tagalog sentences together and keeps line breaks', async () => {
    const calls: string[] = []
    const input = 'Kailangan ng tatlong kwarto. Dapat may sariling banyo ang bawat isa.\nPool deck stays as is.'
    const r = await translatePieces(input, async (chunk) => {
      calls.push(chunk)
      return 'Three bedrooms are needed. Each must have its own bathroom.'
    })
    expect(calls).toHaveLength(1)
    expect(r.text).toBe('Three bedrooms are needed. Each must have its own bathroom.\nPool deck stays as is.')
  })

  it('uses the phrasebook without calling the model, and flags dropped numbers for review', async () => {
    const none = await translatePieces('Wala pa po', async () => {
      throw new Error('should not be called')
    })
    expect(none.text).toBe('None yet')
    expect(none.phrasebookPieces).toBe(1)
    const lost = await translatePieces('Kailangan ng 3 kwarto na may sariling banyo', async () => 'Bedrooms with their own bathrooms are needed')
    expect(lost.review).toBe(true)
  })

  it('cleans the wrappers small models add', () => {
    const src = 'Gusto ko ng malaking kusina.'
    expect(cleanTranslation('Translation: "I want a large kitchen."', src)).toBe('I want a large kitchen.')
    expect(cleanTranslation("Here's the English translation:\nI want a large kitchen.\n\nNote: kusina means kitchen.", src)).toBe('I want a large kitchen.')
    expect(cleanTranslation('```\nI want a large kitchen.\n```', src)).toBe('I want a large kitchen.')
  })

  it('splits on chips, lines and sentences', () => {
    expect(splitPieces('A; B\nC. D').map((p) => p.text)).toEqual(['A', 'B', 'C.', 'D'])
  })
})

describe('brief language check (English only)', () => {
  const brief = composeBrief(SAMPLE_INPUTS).markdown

  it('passes the composed English brief', () => {
    expect(findTagalogLines(brief)).toEqual([])
    expect(auditBrief(brief).checks.find((c) => c.id === 'english-only')?.passed).toBe(true)
  })

  it('flags Tagalog lines and translates them in place, keeping list markers, labels and tables', async () => {
    const md = brief
      .replace('- **Project:**', '- **Project:** Gusto ng kliyente ang malaking kusina na bukas sa sala at hardin.')
      .replace(/(\| Space \/ Zone \| Adjacency \| Key Requirements & Non-Negotiables \|\n\|[-| ]+\|\n)/, '$1| Kusina | Katabi ng sala | Dapat malaki at maliwanag ang kusina para sa pamilya |\n')
    const report = auditBrief(md)
    expect(report.checks.find((c) => c.id === 'english-only')?.passed).toBe(false)
    expect(report.total).toBe(8)
    const fixed = await translateTagalogLines(md, async (t) => (/kusina/i.test(t) && /malaki/i.test(t) ? 'ENGLISH' : t === 'Kusina' ? 'Kitchen' : t === 'Katabi ng sala' ? 'Next to the living room' : t))
    expect(fixed).toContain('- **Project:** ENGLISH')
    expect(fixed).toContain('| Kusina | Next to the living room | ENGLISH |')
    expect(findTagalogLines(fixed)).toEqual([])
  })
})

describe('translator prompt', () => {
  it('stays free of the forbidden term and asks for translation only', () => {
    expect(TRANSLATOR_SYSTEM_PROMPT.toLowerCase()).not.toContain(['ath', 'lete'].join(''))
    expect(TRANSLATOR_SYSTEM_PROMPT).toContain('Output ONLY the English translation')
  })
})
