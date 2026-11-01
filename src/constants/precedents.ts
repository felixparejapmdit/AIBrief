/**
 * Verified real-world precedents used for Evidence-Based Problem Solving.
 * Every entry states explicitly WHERE and WHEN the solution was built/tested,
 * so Section 7 of the brief always carries auditable proof.
 */

export interface Precedent {
  id: string
  name: string
  where: string
  when: string
  /** Lower-case keywords used to match a stated challenge to this precedent. */
  keywords: string[]
  challenge: string
  solution: string
  proof: string
}

export const PRECEDENTS: Precedent[] = [
  {
    id: 'benthemplein',
    name: 'Benthemplein Water Square',
    where: 'Rotterdam, Netherlands',
    when: '2013',
    keywords: ['flood', 'stormwater', 'storm', 'rain', 'drainage', 'water', 'monsoon', 'runoff'],
    challenge: 'Stormwater surges and flood risk on hard landscape',
    solution:
      'Shape terraces and courts as shallow detention basins with concealed overflow to attenuate cloudbursts before release.',
    proof:
      'Sunken plaza basins store roughly 1,700 m³ of stormwater during cloudbursts and release it gradually.',
  },
  {
    id: 'bullitt',
    name: 'Bullitt Center',
    where: 'Seattle, Washington, USA',
    when: '2013',
    keywords: ['voc', 'air', 'health', 'toxic', 'chemical', 'healthy', 'allergy', 'off-gassing', 'material'],
    challenge: 'Indoor air quality and off-gassing from finishes',
    solution:
      'Screen every specified product against a red list of harmful chemicals and require low-VOC data sheets before procurement.',
    proof:
      'Every product was vetted against the Living Building Challenge Red List; certified a Living Building in 2015.',
  },
  {
    id: 'hogeweyk',
    name: 'De Hogeweyk',
    where: 'Weesp, Netherlands',
    when: '2009',
    keywords: ['aging', 'ageing', 'accessib', 'step-free', 'mobility', 'elderly', 'wheelchair', 'lift', 'independence'],
    challenge: 'Supporting independence as mobility and memory needs change',
    solution:
      'Plan step-free, legible routes with familiar domestic cues so occupants move safely and independently.',
    proof:
      'Neighbourhood-scale, step-free layout lets residents move freely and safely; a widely studied supportive-living model.',
  },
  {
    id: 'al-bahar',
    name: 'Al Bahar Towers',
    where: 'Abu Dhabi, United Arab Emirates',
    when: '2012',
    keywords: ['glare', 'solar', 'heat gain', 'sun', 'overheating', 'west', 'shading', 'hot'],
    challenge: 'Glare and solar heat gain on exposed glazing',
    solution:
      'Add an external, sun-tracking shading screen so glazing stays clear while direct radiation is cut.',
    proof:
      'A computer-controlled mashrabiya screen follows the sun and is reported to cut solar gain by around 50%.',
  },
  {
    id: 'fallingwater',
    name: 'Fallingwater',
    where: 'Mill Run, Pennsylvania, USA',
    when: '1936–1939 (cantilevers strengthened 2002)',
    keywords: ['cantilever', 'structural', 'structure', 'slope', 'deflection', 'span', 'hillside', 'overhang'],
    challenge: 'Long cantilevers and structure on a steep or difficult site',
    solution:
      'Design cantilevers with reserve capacity, specify deflection monitoring and allow for post-tensioning access.',
    proof:
      'Post-tensioning of the main cantilevers in 2002 arrested decades of deflection — a lesson in reserve capacity.',
  },
  {
    id: 'kolumba',
    name: 'Kolumba Art Museum',
    where: 'Cologne, Germany',
    when: '2007',
    keywords: ['existing', 'heritage', 'retain', 'slab', 'integration', 'tie in', 'tie-in', 'ruin', 'old', 'renovat'],
    challenge: 'Integrating new construction with existing or heritage fabric',
    solution:
      'Let new work bear independently over retained fabric and express the junction honestly rather than imitate.',
    proof:
      'A perforated brick shell rises directly over Gothic church ruins, protecting them without imitation.',
  },
  {
    id: 'bryant-park',
    name: 'Bryant Park Restoration',
    where: 'New York City, USA',
    when: '1992',
    keywords: ['privacy', 'security', 'neighbour', 'neighbor', 'overlook', 'drone', 'intrusion', 'safety', 'surveillance'],
    challenge: 'Security and privacy without a fortress aesthetic',
    solution:
      'Use layered landscape, clear sightlines and controlled thresholds (CPTED) instead of visible hardening.',
    proof:
      'Opening sightlines and lowering hedges transformed perceived safety — a landmark natural-surveillance (CPTED) case.',
  },
  {
    id: 'eastgate',
    name: 'Eastgate Centre',
    where: 'Harare, Zimbabwe',
    when: '1996',
    keywords: ['cooling', 'ventilation', 'humid', 'passive', 'airflow', 'energy', 'heat'],
    challenge: 'Cooling and ventilation in a hot climate without heavy plant',
    solution:
      'Combine thermal mass with stack-effect ventilation paths so night air purges stored heat.',
    proof:
      'Termite-mound inspired stack ventilation; reported to use roughly 10% of the energy of a comparable cooled building.',
  },
  {
    id: 'millennium-bridge',
    name: 'Millennium Bridge',
    where: 'London, United Kingdom',
    when: '2000 (dampers retrofitted 2002)',
    keywords: ['vibration', 'movement', 'bounce', 'footfall', 'wind', 'sway', 'lightweight'],
    challenge: 'Vibration and movement in lightweight structures',
    solution:
      'Model dynamic response early and allow space for viscous or tuned-mass dampers in long spans.',
    proof:
      'Lateral sway at opening in 2000 was eliminated by retrofitted viscous and tuned-mass dampers in 2002.',
  },
  {
    id: 'mjostarnet',
    name: 'Mjøstårnet',
    where: 'Brumunddal, Norway',
    when: '2019',
    keywords: ['schedule', 'timeline', 'tight', 'fast', 'prefab', 'long-lead', 'timber', 'clt', 'speed', 'carbon'],
    challenge: 'Compressed programme and long-lead structural packages',
    solution:
      'Prefabricate glulam/CLT elements off-site to shorten erection time and reduce weather risk.',
    proof:
      'An 85.4 m glulam and CLT tower demonstrated prefabricated timber structure, fire design and rapid erection.',
  },
  {
    id: 'elbphilharmonie',
    name: 'Elbphilharmonie Grand Hall',
    where: 'Hamburg, Germany',
    when: '2017',
    keywords: ['acoustic', 'noise', 'sound', 'quiet', 'isolation', 'separation'],
    challenge: 'Acoustic separation between noisy and quiet zones',
    solution:
      'Isolate sensitive rooms as box-in-box construction on resilient spring or elastomer bearings.',
    proof:
      'The Grand Hall rests on about 362 steel spring assemblies that decouple it from the surrounding building.',
  },
  {
    id: 'kimbell',
    name: 'Kimbell Art Museum',
    where: 'Fort Worth, Texas, USA',
    when: '1972',
    keywords: ['daylight', 'light', 'lighting', 'skylight', 'natural light'],
    challenge: 'Generous daylight without glare or UV damage',
    solution:
      'Bounce daylight off reflectors and vault soffits so it arrives soft, indirect and glare-free.',
    proof:
      'Cycloid vaults with pierced aluminium reflectors deliver soft, glare-free daylight five decades on.',
  },
  {
    id: 'sydney-opera-house',
    name: 'Sydney Opera House',
    where: 'Sydney, Australia',
    when: '1973',
    keywords: ['maintenance', 'cleaning', 'durable', 'durability', 'longevity', 'weathering', 'cladding', 'facade', 'façade', 'coastal', 'salt'],
    challenge: 'Low-maintenance, long-life exterior cladding in a harsh coastal setting',
    solution:
      'Specify dense, self-cleaning glazed ceramic or similar inert cladding with accessible, replaceable fixings.',
    proof:
      'Over one million self-cleaning glazed tiles have kept the shells bright for five decades with minimal intervention.',
  },
  {
    id: 'darmstadt-passivhaus',
    name: 'Passivhaus Darmstadt-Kranichstein',
    where: 'Darmstadt, Germany',
    when: '1991',
    keywords: ['insulation', 'thermal', 'comfort', 'airtight', 'energy', 'draught', 'draft', 'cold'],
    challenge: 'Year-round thermal comfort with minimal energy use',
    solution:
      'Adopt a continuous, airtight insulated envelope with heat-recovery ventilation.',
    proof:
      'The first Passive House has been monitored for decades, using around 90% less heating energy than typical homes.',
  },
  {
    id: 'serpentine',
    name: 'Serpentine Pavilion programme',
    where: 'London, United Kingdom',
    when: 'Annually since 2000',
    keywords: ['pavilion', 'temporary', 'demountable', 'lightweight', 'event', 'entertaining', 'outdoor'],
    challenge: 'Delivering a high-design pavilion quickly and demountably',
    solution:
      'Use kit-of-parts, dry-jointed structure so the pavilion can be fabricated off-site and erected rapidly.',
    proof:
      'Each annual pavilion is designed, fabricated and erected in roughly six months, proving rapid demountable delivery.',
  },
]

/** Default precedents that collectively cover the 5 Essential Criteria. */
export const DEFAULT_PRECEDENT_IDS = ['sydney-opera-house', 'bullitt', 'bryant-park', 'hogeweyk', 'fallingwater']

export function formatPrecedentProof(p: Precedent): string {
  return `**${p.name}** — Where: ${p.where}; When: ${p.when}. ${p.proof}`
}

/** Score each precedent against free text; returns best matches first. */
export function matchPrecedents(text: string, limit = 5): Precedent[] {
  const haystack = text.toLowerCase()
  const scored = PRECEDENTS.map((p) => ({
    p,
    score: p.keywords.reduce((acc, k) => acc + (haystack.includes(k) ? 1 : 0), 0),
  }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((s) => s.p)
}

export function precedentById(id: string): Precedent | undefined {
  return PRECEDENTS.find((p) => p.id === id)
}
