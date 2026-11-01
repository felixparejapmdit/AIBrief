import { DEFAULT_PRECEDENT_IDS, PRECEDENTS, formatPrecedentProof, matchPrecedents, type Precedent } from '../constants/precedents'
import { IMAGE_CATEGORY_LABELS, PRECEDENT_TABLE, SPACE_TABLE, SPEC_TABLE } from '../constants/vipSkillPrompt'
import type { AthleteReplacement, DesignPrinciple, ImageAnalysis, ImageCategory } from '../types/architecture'
import { DESIGN_PRINCIPLES } from '../types/architecture'
import { type FallbackContent, assembleBrief, renderTable } from './briefTemplate'
import { normalizeClientReferences, sanitizeForbiddenTerms } from './complianceAuditor'
import { containsAny, hasWord, joinNatural, lowerFirst, phrase, sentence, splitItems, stripTrailingPunctuation } from './text'

export interface BriefInputs {
  date: string
  objective: string
  /** questionId → answer text */
  answers: Record<string, string>
  images: Array<{ name: string; category: ImageCategory; notes: string; analysis: ImageAnalysis | null }>
  followUps: Array<{ pillarTitle: string; question: string; answer: string }>
  replacement: AthleteReplacement
}

export interface ComposedBrief extends FallbackContent {
  markdown: string
}

/** Every piece of user-supplied text passes through the guardrails before it reaches the brief. */
function clean(text: string, replacement: AthleteReplacement): string {
  const a = sanitizeForbiddenTerms(text ?? '', replacement).text
  return normalizeClientReferences(a).text.replace(/\s+/g, ' ').trim()
}

function bullets(lines: string[]): string {
  return lines.filter(Boolean).map((l) => (l.startsWith('- ') ? l : `- ${l}`)).join('\n')
}

const SPACE_REQUIREMENTS: Array<[string[], string]> = [
  [['pavilion', 'outdoor', 'terrace', 'entertain', 'garden'], 'Weather protection, robust external finishes, integrated drainage and lighting'],
  [['guest'], 'Independent arrival sequence, en-suite privacy, separation from The Client’s private wing'],
  [['suite', 'bedroom', 'dressing'], 'Acoustic privacy (STC 55+ partitions), blackout control, step-free en-suite with roll-in shower provision'],
  [['kitchen', 'scullery', 'pantry'], 'Durable non-porous worktops, dedicated extract, discreet service access'],
  [['gym', 'spa', 'recovery', 'wellness', 'pool', 'sauna'], 'Moisture-resistant low-VOC finishes, slip-resistant floors, fresh-air ventilation'],
  [['office', 'study', 'library'], 'Acoustic separation, structured cabling, controlled daylight and glare'],
  [['security', 'control', 'safe room'], 'Restricted access, backup power, discreet monitoring infrastructure'],
  [['garage', 'parking', 'car'], 'EV charging, step-free covered link to the house'],
  [['living', 'lounge', 'family', 'dining'], 'Generous daylight, layered lighting, robust and easily cleaned finishes'],
  [['staff', 'service', 'laundry', 'plant'], 'Separate service circulation, durable finishes, accessible plant and isolation valves'],
]

const SPEC_ROWS: Array<[string[], [string, string, string]]> = [
  [['aluminum', 'aluminium', 'curtain'], ['Façade grid', 'Thermally broken aluminum curtain-wall grid, anodised or PVDF finish', 'Carries glazing; low-maintenance, corrosion-resistant finish']],
  [['epdm', 'membrane', 'roof'], ['Roof membrane', 'Fully adhered EPDM single-ply membrane on isolation pads under plant', 'Long-life waterproofing; isolates vibration from plant']],
  [['steel cover', 'trench', 'threshold', 'drain'], ['Threshold drainage', 'Stainless or galvanised steel heel-proof trench covers', 'Enables flush inside–outside thresholds with concealed drainage']],
  [['concrete', 'podium', 'slab'], ['Substructure / podium', 'Reinforced concrete with below-grade waterproofing (Type A + B)', 'Durable base, thermal mass, tie-in point for retained slabs']],
  [['timber', 'clt', 'mass timber'], ['Floor plates', 'Cross-laminated timber with acoustic screed topping', 'Prefabricated speed, warmth, stored carbon']],
  [['steel frame', 'steel'], ['Primary structure', 'Structural steel frame with intumescent fire protection', 'Long spans for open social spaces']],
  [['glazing', 'glass', 'window'], ['Glazing', 'Low-e insulated glazing units with warm-edge spacers and solar control', 'Daylight and views with managed heat gain']],
  [['stone', 'cladding'], ['External cladding', 'Natural stone rainscreen on stainless steel brackets', 'Durable, low-maintenance, ventilated façade']],
]

const DEFAULT_SPEC_ROWS: Array<[string, string, string]> = [
  ['Interior finishes', 'Low-VOC / zero-VOC paints, adhesives and sealants verified by product data sheets', 'Health safety and indoor air quality'],
  ['Accessibility provisions', '36 in (915 mm) clear doorways, step-free thresholds, blocking for future grab bars', 'Aging-in-place friendliness'],
  ['Security infrastructure', 'Concealed containment for access control, CCTV and intrusion detection', 'Discreet, layered security'],
]

const PRINCIPLE_DEFAULTS: Record<DesignPrinciple, string> = {
  Emphasis: 'A single focal moment — the arrival sequence — carries the strongest material and spatial gesture.',
  Balance: 'Massing is balanced asymmetrically around a solid core so private and social wings feel equally anchored.',
  Unity: 'One restrained palette of materials and details runs inside and out to unify every zone.',
  Contrast: 'Heavy, textured masonry is set against light timber and glass to sharpen the architecture.',
  Rhythm: 'Repeated structural bays, fins or mullions establish a calm, legible rhythm along the façades.',
  Proportion: 'Ceiling heights and openings are proportioned to human scale in private rooms and lifted in social spaces.',
  Variety: 'Shifts in ceiling height, light and texture between zones keep the experience engaging without clutter.',
}

export const RISK_SHIELD_BULLETS = [
  'Strictly apolitical: no political affiliations, figures or causes are associated with the project or its publicity.',
  'Low-profile narrative: no publicity, signage or social media about the project without The Client’s written approval.',
  'Sentiment watch: a modest, sustainable material story reduces any public perception of excess.',
  'Community goodwill: considerate working hours plus noise, dust and traffic management protect neighbour relations.',
  'Supply-chain integrity: suppliers are vetted for ethical sourcing to avoid reputational exposure.',
]

function siteInsights(site: string): string {
  const notes: string[] = []
  if (/\b(slop(e|ed|ing)|hill\w*|steep)\b/i.test(site)) notes.push('sloping terrain calls for stepped foundations, retaining design and careful drainage')
  if (/\b(flat|level)\b/i.test(site)) notes.push('level ground simplifies foundations, so drainage falls must be designed in deliberately')
  if (/\b(coast\w*|salt|sea|seaside|ocean\w*|beach\w*|marine)\b/i.test(site)) notes.push('salt-laden air demands marine-grade metals and sealed finishes')
  if (/\b(humid\w*|rain\w*|tropical|monsoon\w*)\b/i.test(site)) notes.push('high rainfall requires generous overhangs, robust waterproofing and stormwater attenuation')
  if (/\b(urban|infill|neighbou?rs?)\b/i.test(site)) notes.push('close neighbours require privacy screening and an overlooking analysis')
  if (/\b(trees?|wooded|oaks?|forest\w*)\b/i.test(site)) notes.push('mature trees require root protection zones and arborist supervision')
  if (!notes.length) return 'Assumption: a full topographic and orientation survey will confirm levels, solar path and prevailing winds before schematic design.'
  return notes.map((n) => sentence(n)).join(' ')
}

/** "Entertaining pavilion with outdoor kitchen" → "Entertaining pavilion" (the noun the row is about). */
function headPhrase(space: string): string {
  return space.split(/\s+(?:with|and|for|incl\.?|including)\s+|[(,]/i)[0] ?? space
}

function principleStatements(aesPrinciples: string, images: BriefInputs['images']): Record<DesignPrinciple, string> {
  const out = { ...PRINCIPLE_DEFAULTS }
  const items = splitItems(aesPrinciples)
  for (const p of DESIGN_PRINCIPLES) {
    const stated = items.find((i) => new RegExp(`^${p}\\b`, 'i').test(i))
    if (stated) out[p] = sentence(stated.replace(new RegExp(`^${p}\\s*[:\\-–—]\\s*`, 'i'), ''))
    const observed = images.map((im) => im.analysis?.designPrinciples?.[p]).find((x): x is string => Boolean(x && x.trim()))
    if (observed) out[p] = `${out[p]} Visual intake: ${sentence(observed)}`
  }
  return out
}

function pickPrecedents(challenges: string[], extraText: string): Array<{ challenge: string; precedent: Precedent }> {
  const used = new Set<string>()
  const rows: Array<{ challenge: string; precedent: Precedent }> = []
  for (const c of challenges) {
    const p = matchPrecedents(c, 6).find((x) => !used.has(x.id))
    if (p) {
      used.add(p.id)
      rows.push({ challenge: c, precedent: p })
    }
  }
  // Precedents named explicitly by Philippe.
  for (const p of PRECEDENTS) {
    if (!used.has(p.id) && extraText.toLowerCase().includes(p.name.toLowerCase().split(' ')[0]!.toLowerCase()) && extraText.toLowerCase().includes(p.where.split(',')[0]!.toLowerCase())) {
      used.add(p.id)
      rows.push({ challenge: p.challenge, precedent: p })
    }
  }
  // Unmatched challenges and a minimum of 4 rows covering the essential criteria.
  for (const c of challenges) {
    if (rows.some((r) => r.challenge === c)) continue
    const p = DEFAULT_PRECEDENT_IDS.map((id) => PRECEDENTS.find((x) => x.id === id)!).find((x) => !used.has(x.id))
    if (p) {
      used.add(p.id)
      rows.push({ challenge: c, precedent: p })
    }
  }
  for (const id of DEFAULT_PRECEDENT_IDS) {
    if (rows.length >= 4) break
    const p = PRECEDENTS.find((x) => x.id === id)!
    if (!used.has(p.id)) {
      used.add(p.id)
      rows.push({ challenge: p.challenge, precedent: p })
    }
  }
  return rows
}

/**
 * Deterministically compose a complete, compliant brief from the intake and interview.
 * Used directly when no model is configured, and as the per-section fallback that guarantees
 * the exact 9-section layout when a model drifts.
 */
export function composeBrief(input: BriefInputs): ComposedBrief {
  const r = input.replacement
  const a = (id: string) => clean(input.answers[id] ?? '', r)
  const list = (id: string, commas = false) => splitItems(a(id), { commas })
  const objective = clean(input.objective, r) || 'Deliver an exceptional, discreet residence for The Client'
  const images = input.images.map((im) => ({ ...im, notes: clean(im.notes, r) }))
  const analyzed = images.filter((im) => im.analysis)
  const followUps = input.followUps.filter((f) => f.answer.trim()).map((f) => ({ ...f, answer: clean(f.answer, r) }))
  const followUpFor = (title: string) => followUps.filter((f) => f.pillarTitle === title).map((f) => sentence(f.answer))

  const spaces = list('func-spaces', true)
  const adjacency = list('func-adjacency')
  const challenges = list('chal-list')
  const purpose = a('vision-purpose')
  const success = list('vision-success')
  const site = a('site-location')
  const existing = list('site-existing')
  const style = a('aes-style')
  const materials = list('aes-materials')
  const systems = list('con-systems')
  const transitions = list('con-transitions')
  const schedule = list('time-schedule')
  const constraints = list('time-constraints')
  const perfMaint = list('perf-maint')
  const perfHealth = list('perf-health')
  const perfAging = list('perf-aging')
  const principleText = a('aes-principles')
  const purposePhrase = phrase(purpose)
  const ledPrinciples = DESIGN_PRINCIPLES.filter((p) => new RegExp(`\\b${p}\\b`, 'i').test(principleText))

  /* 1. Executive Summary */
  const s1 = bullets([
    `**Project:** ${sentence(objective)}`,
    `**Purpose:** ${sentence(purpose ? `The Client requires ${lowerFirst(purposePhrase)}` : 'The Client requires a discreet, enduring home of exceptional quality')}`,
    `**Site:** ${sentence(site ? phrase(site) : 'Site particulars to be confirmed by survey')}`,
    `**Programme:** ${sentence(spaces.length ? `${spaces.length} key zones including ${joinNatural(spaces.slice(0, 3).map(lowerFirst))}` : 'Space programme to be confirmed with The Client')}`,
    `**Design direction:** ${sentence(`${style || 'Quiet, timeless architecture'}${ledPrinciples.length ? `, led by ${joinNatural(ledPrinciples)}` : ''} with all 7 Principles integrated`)}`,
    `**Key risks solved:** ${sentence(`${challenges.length ? joinNatural(challenges.map(lowerFirst)) : 'Durability, privacy and long-term adaptability'} — each backed by a proven precedent (Section 7)`)}`,
    `**Timeline:** ${sentence(schedule.length ? schedule.join('; ') : 'Programme to be confirmed at concept sign-off')}`,
    '**Reputation:** Delivered discreetly and strictly apolitically for The Client (Section 9).',
  ])

  /* 2. Vision & Objectives */
  const goal = stripTrailingPunctuation(objective).replace(/\s+for\s+The Client$/i, '')
  const why = `The Client’s goal is to ${lowerFirst(goal)}. ${
    purpose ? sentence(`The project must deliver ${lowerFirst(purposePhrase)}`) : ''
  } ${success.length ? sentence(`Success will be measured by ${joinNatural(success.map(lowerFirst))}`) : 'Success will be measured by longevity, privacy and effortless daily use.'}`
  const s2 = [
    `> ${why.replace(/\s+/g, ' ').trim()}`,
    '',
    bullets([
      purpose ? sentence(`Deliver ${lowerFirst(purposePhrase)}`) : 'Deliver a residence of exceptional, lasting quality.',
      ...success.map((s) => sentence(`Achieve: ${lowerFirst(s)}`)),
      'Integrate the 5 Essential Criteria — Maintainability, Durability, Security, Low-VOC health and Aging-in-Place — from concept onward.',
      'Resolve every identified challenge with a proven, documented precedent.',
      'Protect The Client’s privacy and reputation through a discreet, apolitical delivery.',
      ...followUpFor('Project Vision & Goals'),
    ]),
  ].join('\n')

  /* 3. Site Analysis & Context */
  const access = adjacency.filter((x) => containsAny(x, ['entry', 'arrival', 'service', 'access', 'garage', 'route']))
  const visual = analyzed.slice(0, 4).map((im) => `${IMAGE_CATEGORY_LABELS[im.category]} (${im.name}): ${sentence(im.analysis!.summary)}`)
  const s3 = bullets([
    `**Location & Climate:** ${sentence(site ? phrase(site) : 'Assumption: site location and climate data to be confirmed during the site visit')}`,
    `**Topography & Orientation:** ${siteInsights(site)}`,
    `**Existing Features to Retain:** ${sentence(existing.length ? joinNatural(existing.map(lowerFirst)) : 'No retained features identified; to be confirmed by survey')}`,
    `**Access & Privacy:** ${sentence(access.length ? joinNatural(access.map(lowerFirst)) : 'Separate guest arrival from service access to protect The Client’s privacy')}`,
    `**Visual Intake Observations:** ${visual.length ? visual.join(' ') : 'No visual assets were analysed; observations will follow the site visit.'}`,
    ...followUpFor('Site & Context').map((f) => `**Further context:** ${f}`),
  ])

  /* 4. Functional Space Program */
  const spaceRows = (spaces.length ? spaces : ['Primary suite', 'Guest accommodation', 'Kitchen and dining', 'Living spaces', 'Service and plant']).map((space) => {
    const head = headPhrase(space)
    const words = head.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2)
    const adj = adjacency.find((x) => words.some((w) => hasWord(x, [w])))
    const req =
      SPACE_REQUIREMENTS.find(([keys]) => containsAny(head, keys))?.[1] ??
      SPACE_REQUIREMENTS.find(([keys]) => containsAny(space, keys))?.[1] ??
      'Confirm area, finishes and services during schematic design'
    const aging = perfAging.length && containsAny(space, ['suite', 'bedroom', 'bath']) ? '; aging-in-place ready' : ''
    return [space, adj ? sentence(adj) : 'Per circulation diagram — confirm at concept design', `${req}${aging}`]
  })
  const table4 = renderTable(SPACE_TABLE, spaceRows)

  /* 5. Aesthetic, Material & Design Principles */
  const principles = principleStatements(principleText, images)
  const lightItems = materials.filter((m) => /\b\d{4}\s?K\b|light|\bsun\b|lumin|\blux\b|glare/i.test(m))
  const materialItems = materials.filter((m) => !lightItems.includes(m))
  const imageMaterials = analyzed.flatMap((im) => im.analysis!.materialBuildUps).slice(0, 2)
  const sub5: Record<string, string> = {
    Atmosphere: bullets([
      sentence(`The atmosphere is ${lowerFirst(style ? phrase(style) : 'calm, refined and timeless')}`),
      'Spaces read as a sequence — compressed arrival, generous social rooms, intimate private retreats.',
      ...analyzed.flatMap((im) => im.analysis!.styleAndSpatialFlow).slice(0, 2).map((s) => sentence(`Visual intake: ${s}`)),
      ...followUpFor('Aesthetic Direction & 7 Design Principles'),
    ]),
    '7 Principles Integration': DESIGN_PRINCIPLES.map((p) => `- **${p}:** ${principles[p]}`).join('\n'),
    'Material Palette': bullets([
      ...(materialItems.length ? materialItems.map(sentence) : ['Natural stone, warm timber and bronze-toned metal in a restrained palette.']),
      ...imageMaterials.map((m) => sentence(`Observed build-up: ${m}`)),
      'All interior finishes, adhesives and sealants are low-VOC or zero-VOC.',
    ]),
    Lighting: bullets(
      lightItems.length
        ? [...lightItems.map(sentence), 'Lighting scenes are dimmable and zoned for daily life, hosting and night-time security.']
        : [
            'Layered warm-white lighting (2700K–3000K) with dimmable scenes for daily life and hosting.',
            'Daylight is maximised on protected elevations and controlled with external shading on west faces.',
          ],
    ),
  }
  const s5 = Object.entries(sub5).map(([k, v]) => `### ${k}\n\n${v}`).join('\n\n')

  /* 6. Constructability & Material Specifications */
  const specRows: Array<[string, string, string]> = []
  for (const [keys, row] of SPEC_ROWS) {
    if (systems.some((s) => containsAny(s, keys)) && !specRows.some((r2) => r2[0] === row[0])) specRows.push(row)
  }
  for (const row of DEFAULT_SPEC_ROWS) specRows.push(row)
  if (specRows.length < 5) {
    for (const [, row] of SPEC_ROWS) {
      if (specRows.length >= 6) break
      if (!specRows.some((r2) => r2[0] === row[0])) specRows.splice(specRows.length - DEFAULT_SPEC_ROWS.length, 0, row)
    }
  }
  const table6 = renderTable(SPEC_TABLE, specRows)
  const imageConstruct = analyzed.flatMap((im) => im.analysis!.constructabilityNotes).slice(0, 3)
  const sub6: Record<string, string> = {
    'Critical Transitions': bullets([
      ...(transitions.length ? transitions.map((t) => sentence(`${t} — detailed at 1:5 with mock-ups before installation`)) : ['Inside–outside thresholds, roof-to-wall junctions and new-to-existing connections are detailed at 1:5 and mocked up before installation.']),
      ...imageConstruct.map((c) => sentence(`Visual intake: ${c}`)),
    ]),
    'Existing Site Integrations': bullets([
      ...(existing.length ? existing.map((e) => sentence(`${e} — surveyed, condition-assessed and protected during works`)) : []),
      'All retained elements are surveyed and condition-assessed before design freeze.',
      ...followUpFor('Constructability & Site Integration'),
    ]),
    'Material Specifications': table6,
  }
  const s6 = Object.entries(sub6).map(([k, v]) => `### ${k}\n\n${v}`).join('\n\n')

  /* 7. Strategic Problem Solving & Proven Precedents */
  const precedentRows = pickPrecedents(challenges, a('chal-precedents')).map(({ challenge, precedent }) => [
    sentence(challenge),
    precedent.solution,
    formatPrecedentProof(precedent),
  ])
  const table7 = renderTable(PRECEDENT_TABLE, precedentRows)

  /* 8. Performance, Safety & Longevity */
  const healthItems = perfHealth.filter((x) => containsAny(x, ['voc', 'air', 'filtr', 'ventilat', 'formaldehyde', 'health', 'merv']))
  const securityItems = perfHealth.filter((x) => !healthItems.includes(x))
  const sub8: Record<string, string> = {
    'Maintainability & Durability': bullets([
      ...perfMaint.map(sentence),
      'Maintainability: every system is specified for safe access, standard spare parts and a documented maintenance plan.',
      'Durability: materials are selected for documented service lives appropriate to their exposure.',
    ]),
    'Health Safety & Wellbeing': bullets([
      ...healthItems.map(sentence),
      'All paints, adhesives, sealants and composite woods are low-VOC or zero-VOC, verified by product data sheets.',
      'Indoor air is filtered (MERV-13 minimum) with balanced fresh-air ventilation and humidity control.',
    ]),
    'Security Integration': bullets([
      ...securityItems.map(sentence),
      'Security is layered and integrated into landscape and architecture rather than added as visible hardware.',
      'Security design information is restricted to need-to-know consultants.',
    ]),
    'Aging-in-Place Friendliness': bullets([
      ...perfAging.map(sentence),
      'Aging-in-place: step-free thresholds, 36 in (915 mm) clear doorways and blocking for future grab bars throughout.',
    ]),
  }
  for (const f of followUpFor('Performance & Wellbeing')) sub8['Maintainability & Durability'] += `\n- ${f}`
  const s8 = Object.entries(sub8).map(([k, v]) => `### ${k}\n\n${v}`).join('\n\n')

  /* 9. Project Parameters */
  const sub9: Record<string, string> = {
    Timeline: bullets([
      ...schedule.map(sentence),
      'Phases: concept and brief sign-off → schematic design → design development and long-lead procurement → construction → commissioning and handover.',
    ]),
    'Execution Constraints': bullets([
      ...constraints.map(sentence),
      'Confidentiality: all consultants and trades work under NDA; no site photography on personal devices.',
      ...followUpFor('Timeline & Parameters'),
    ]),
    'Political/Reputational Risk Shield Summary': bullets(RISK_SHIELD_BULLETS),
  }
  const s9 = Object.entries(sub9).map(([k, v]) => `### ${k}\n\n${v}`).join('\n\n')

  const sections: Record<number, string> = { 1: s1, 2: s2, 3: s3, 4: table4, 5: s5, 6: s6, 7: table7, 8: s8, 9: s9 }
  return {
    markdown: assembleBrief(input.date, sections),
    sections,
    subsections: { 5: sub5, 6: sub6, 8: sub8, 9: sub9 },
    tables: { 4: table4, 6: table6, 7: table7 },
  }
}
