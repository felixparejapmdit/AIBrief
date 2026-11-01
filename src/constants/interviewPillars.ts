import type { InterviewQuestion, Pillar, PillarId } from '../types/architecture'

const q = (
  pillar: PillarId,
  id: string,
  prompt: string,
  helper: string,
  placeholder: string,
  chips: string[],
  minLength = 12,
): InterviewQuestion => ({ id, pillar, prompt, helper, placeholder, chips, minLength })

export const PILLARS: Pillar[] = [
  {
    id: 'vision',
    index: 1,
    title: 'Project Vision & Goals',
    description: 'The strategic "why" behind the project and how The Client will judge success.',
    questions: [
      q(
        'vision',
        'vision-purpose',
        'What is the core purpose of this project, and what should The Client feel on arrival?',
        'Capture the emotional brief as well as the functional one.',
        'e.g. A private sanctuary that feels calm, discreet and generous…',
        [
          'A private sanctuary for rest and recovery',
          'A discreet entertaining pavilion for guests',
          'A legacy residence built to last generations',
          'A wellness retreat with spa-grade amenities',
        ],
      ),
      q(
        'vision',
        'vision-success',
        'How will The Client measure success five years after handover?',
        'Measurable outcomes keep the brief honest.',
        'e.g. No unplanned maintenance call-outs; privacy never compromised…',
        [
          'Zero unplanned maintenance call-outs',
          'Privacy never compromised',
          'Spaces still feel current and timeless',
          'Effortless hosting for 20+ guests',
        ],
      ),
    ],
  },
  {
    id: 'site',
    index: 2,
    title: 'Site & Context',
    description: 'Location, climate, topography, orientation and what already exists on site.',
    questions: [
      q(
        'site',
        'site-location',
        'Describe the site: location, climate, topography and orientation.',
        'Include views to capture and exposures to manage.',
        'e.g. Sloped hillside lot facing south-west over the valley…',
        [
          'Sloped hillside lot with valley views',
          'Flat coastal site exposed to salt air',
          'Wooded parcel with mature trees to retain',
          'Urban infill lot with close neighbours',
          'Hot-humid climate with heavy seasonal rain',
        ],
      ),
      q(
        'site',
        'site-existing',
        'Which existing structures, utilities or site features must be retained or integrated?',
        'Think slabs, walls, pools, services, trees and access roads.',
        'e.g. Existing pool and deck to be tied into the new terrace…',
        [
          'Existing concrete slab and footings',
          'Heritage stone wall along the boundary',
          'Existing pool and deck to be tied in',
          'Overhead power lines to relocate',
          'Mature oak trees with root protection zones',
        ],
      ),
    ],
  },
  {
    id: 'functional',
    index: 3,
    title: 'Functional Requirements',
    description: 'Spaces, zones, adjacencies and the non-negotiables of the programme.',
    questions: [
      q(
        'functional',
        'func-spaces',
        'List the key spaces and zones The Client needs.',
        'Separate items with commas or new lines — each becomes a row in the space programme.',
        'e.g. Primary suite, guest wing, chef’s kitchen, gym and recovery spa…',
        [
          'Primary suite with dressing room',
          'Guest wing with 3 en-suite bedrooms',
          'Chef’s kitchen with scullery',
          'Gym and recovery spa',
          'Home office / study',
          'Security control room',
          'Entertaining pavilion with outdoor kitchen',
        ],
      ),
      q(
        'functional',
        'func-adjacency',
        'Which adjacencies and non-negotiables must the plan respect?',
        'Who needs to be near what — and what must never meet.',
        'e.g. Service entry kept separate from the guest arrival court…',
        [
          'Primary suite separated from the guest wing',
          'Kitchen adjacent to dining and terrace',
          'Service entry separate from guest arrival',
          'Gym opens to garden and pool',
          'Step-free route from garage to bedrooms',
        ],
      ),
    ],
  },
  {
    id: 'aesthetic',
    index: 4,
    title: 'Aesthetic Direction & 7 Design Principles',
    description: 'Atmosphere, style, materials, lighting and how the 7 Principles shape the design.',
    questions: [
      q(
        'aesthetic',
        'aes-style',
        'What atmosphere and architectural style should the design convey?',
        'Describe mood, era and references rather than products.',
        'e.g. Quiet luxury with natural materials and deep shade…',
        [
          'Warm minimalism',
          'Contemporary tropical modern',
          'Quiet luxury with natural materials',
          'Mid-century modern with bold horizontals',
          'Biophilic, landscape-first design',
        ],
      ),
      q(
        'aesthetic',
        'aes-principles',
        'Which of the 7 Principles (Emphasis, Balance, Unity, Contrast, Rhythm, Proportion, Variety) should lead, and where?',
        'Pick the principles that matter most — the brief will still address all seven.',
        'e.g. Emphasis on a double-height arrival hall; rhythm of timber fins…',
        [
          'Emphasis: a double-height arrival hall',
          'Rhythm: repeated timber fins along the façade',
          'Contrast: dark stone against pale oak',
          'Balance: asymmetric massing anchored by a stone core',
          'Proportion: human-scaled ceilings in private rooms',
          'Unity: one material palette inside and out',
          'Variety: changing ceiling heights between zones',
        ],
      ),
      q(
        'aesthetic',
        'aes-materials',
        'Which materials, finishes and lighting moods are preferred or ruled out?',
        'Note anything The Client dislikes as clearly as what they love.',
        'e.g. Natural stone, oak and bronze; warm 2700K layered lighting…',
        [
          'Natural stone, oak and bronze',
          'Lime plaster and terracotta',
          'Warm 2700K layered lighting',
          'No high-gloss finishes',
          'Maximise north daylight, control west sun',
        ],
      ),
    ],
  },
  {
    id: 'constructability',
    index: 5,
    title: 'Constructability & Site Integration',
    description: 'Structural systems, build-ups and the critical transitions that make or break quality.',
    questions: [
      q(
        'constructability',
        'con-systems',
        'What structural systems and build-ups are envisaged (e.g. aluminum grids, EPDM pads, steel covers)?',
        'Name systems even if they are provisional — they seed the specification table.',
        'e.g. Steel frame with thermally broken aluminum curtain-wall grid…',
        [
          'Steel frame with aluminum curtain-wall grid',
          'Reinforced concrete podium with timber upper floors',
          'EPDM membrane roofs on isolation pads',
          'Steel trench covers at threshold drains',
          'Mass timber (CLT) floors',
        ],
      ),
      q(
        'constructability',
        'con-transitions',
        'Which critical transitions or interfaces concern you most?',
        'Junctions where trades, materials or old-and-new meet.',
        'e.g. Flush inside–outside thresholds at the terrace doors…',
        [
          'Flush inside–outside thresholds',
          'Roof-to-wall junctions at cantilevers',
          'New-to-existing slab connections',
          'Glazing to stone cladding interface',
          'Pool edge to terrace drainage',
        ],
      ),
    ],
  },
  {
    id: 'challenges',
    index: 6,
    title: 'Challenges & Evidence-Based Problem Solving',
    description: 'Risks to solve, each paired with a real precedent stating where and when it was proven.',
    questions: [
      q(
        'challenges',
        'chal-list',
        'What are the biggest challenges or risks for this project?',
        'Each challenge is matched to a proven precedent (Where & When) in Section 7.',
        'e.g. Privacy from neighbours, flood risk, west-facing glare…',
        [
          'Privacy from neighbours and drones',
          'Flood and stormwater risk',
          'Glare and solar heat gain',
          'Steep slope and long cantilevers',
          'Tight schedule with long-lead items',
          'Acoustic separation between wings',
        ],
      ),
      q(
        'challenges',
        'chal-precedents',
        'Are there buildings The Client admires, or precedents you want referenced (with where & when)?',
        'Leave the library suggestion if you have no preference.',
        'e.g. Bullitt Center, Seattle (2013) for healthy materials…',
        [
          'Use proven precedents from the verified library',
          'Bullitt Center, Seattle (2013) for healthy materials',
          'Benthemplein Water Square, Rotterdam (2013) for stormwater',
          'Kolumba, Cologne (2007) for new-to-existing integration',
        ],
        8,
      ),
    ],
  },
  {
    id: 'performance',
    index: 7,
    title: 'Performance & Wellbeing',
    description: 'Maintainability, Durability, Security, Low-VOC Health and Aging-in-Place.',
    questions: [
      q(
        'performance',
        'perf-maint',
        'Maintainability & Durability: what service life and maintenance regime is expected?',
        'Think repainting cycles, plant access and coastal or climate exposure.',
        'e.g. 50+ year structure; no repainting cycles on the façade…',
        [
          '50+ year design life for the structure',
          'Low-maintenance façade with no repainting cycles',
          'Accessible plant rooms and service voids',
          'Marine-grade fixings near the coast',
        ],
      ),
      q(
        'performance',
        'perf-health',
        'Health safety & Security: any low-VOC, air-quality or security requirements?',
        'Include filtration, finishes and how visible security should be.',
        'e.g. Low-VOC finishes throughout; layered perimeter security…',
        [
          'Low-VOC, zero-added-formaldehyde finishes throughout',
          'MERV-13 filtration with balanced fresh-air ventilation',
          'Layered perimeter security integrated into the landscape',
          'Discreet safe room',
          'Camera coverage without visible clutter',
        ],
      ),
      q(
        'performance',
        'perf-aging',
        'Aging-in-place: how should the home adapt as The Client’s needs change?',
        'Future-proofing is far cheaper when designed in from day one.',
        'e.g. Step-free ground floor with a future lift shaft…',
        [
          'Step-free ground floor with a future lift shaft',
          'Wide 36 in (915 mm) doorways and roll-in showers',
          'Blocking in walls for future grab bars',
          'Primary suite on the entry level',
        ],
      ),
    ],
  },
  {
    id: 'timeline',
    index: 8,
    title: 'Timeline & Parameters',
    description: 'Programme, budget posture, approvals, confidentiality and execution constraints.',
    questions: [
      q(
        'timeline',
        'time-schedule',
        'What are the target timeline, key milestones and budget parameters?',
        'Even rough durations help sequence long-lead procurement.',
        'e.g. Design 6 months, build 18 months, 10% contingency…',
        [
          'Design 6 months, build 18 months',
          'Move-in before the next holiday season',
          'Budget held with a 10% contingency',
          'Phased delivery: pavilion first',
        ],
      ),
      q(
        'timeline',
        'time-constraints',
        'Any execution constraints, approvals or confidentiality requirements?',
        'Access, working hours, design reviews and discretion on site.',
        'e.g. Strict NDAs for all trades; no site photography…',
        [
          'Strict NDAs for all trades',
          'Restricted work hours and quiet periods',
          'Limited laydown space on site',
          'Community design-review board approval',
          'No social media or site photos by trades',
        ],
      ),
    ],
  },
]

export const ALL_QUESTIONS: InterviewQuestion[] = PILLARS.flatMap((p) => p.questions)

export function pillarById(id: PillarId): Pillar {
  const p = PILLARS.find((x) => x.id === id)
  if (!p) throw new Error(`Unknown pillar ${id}`)
  return p
}

/** Questions are asked at most two at a time. */
export function questionPages(pillar: Pillar): InterviewQuestion[][] {
  const pages: InterviewQuestion[][] = []
  for (let i = 0; i < pillar.questions.length; i += 2) pages.push(pillar.questions.slice(i, i + 2))
  return pages
}
