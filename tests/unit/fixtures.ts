import type { BriefInputs } from '../../src/utils/briefComposer'
import type { MachineSpecs } from '../../src/types/architecture'

export const SAMPLE_INPUTS: BriefInputs = {
  date: 'November 1, 2026',
  objective: 'Design a private hillside residence with an entertaining pavilion for The Client',
  answers: {
    'vision-purpose': 'A private sanctuary for rest and recovery; A discreet entertaining pavilion for guests',
    'vision-success': 'Zero unplanned maintenance call-outs; Privacy never compromised',
    'site-location': 'Sloped hillside lot with valley views; Hot-humid climate with heavy seasonal rain',
    'site-existing': 'Existing pool and deck to be tied in; Mature oak trees with root protection zones',
    'func-spaces': 'Primary suite with dressing room, Guest wing with 3 en-suite bedrooms, Chef’s kitchen with scullery, Gym and recovery spa, Entertaining pavilion with outdoor kitchen',
    'func-adjacency': 'Primary suite separated from the guest wing; Kitchen adjacent to dining and terrace; Service entry separate from guest arrival',
    'aes-style': 'Quiet luxury with natural materials',
    'aes-principles': 'Emphasis: a double-height arrival hall; Rhythm: repeated timber fins along the façade',
    'aes-materials': 'Natural stone, oak and bronze; Warm 2700K layered lighting',
    'con-systems': 'Steel frame with aluminum curtain-wall grid; EPDM membrane roofs on isolation pads; Steel trench covers at threshold drains',
    'con-transitions': 'Flush inside–outside thresholds; Pool edge to terrace drainage',
    'chal-list': 'Privacy from neighbours and drones; Flood and stormwater risk; Glare and solar heat gain',
    'chal-precedents': 'Use proven precedents from the verified library',
    'perf-maint': '50+ year design life for the structure',
    'perf-health': 'Low-VOC, zero-added-formaldehyde finishes throughout; Layered perimeter security integrated into the landscape',
    'perf-aging': 'Step-free ground floor with a future lift shaft',
    'time-schedule': 'Design 6 months, build 18 months',
    'time-constraints': 'Strict NDAs for all trades',
  },
  images: [],
  followUps: [],
  replacement: 'guests',
}

export function specs(partial: {
  os?: Partial<MachineSpecs['os']>
  gpu?: Partial<MachineSpecs['gpu']>
  ram?: number | null
  shaderF16?: boolean
}): MachineSpecs {
  return {
    detectedAt: '2026-11-01T00:00:00.000Z',
    os: { family: 'windows', label: 'Windows 11', version: '15.0.0', arch: 'x86', isAppleSilicon: false, source: 'userAgentData', ...partial.os },
    browser: { name: 'Chrome', version: '142' },
    cpu: { logicalCores: 16 },
    memory: { reportedGB: partial.ram ?? 8, capped: (partial.ram ?? 8) >= 8 },
    gpu: { renderer: null, vendor: 'unknown', gpuClass: 'unknown', model: null, estimatedVramGB: null, vramSource: 'unknown', ...partial.gpu },
    webgpu: {
      supported: true,
      adapterAvailable: true,
      vendor: null,
      architecture: null,
      device: null,
      description: null,
      maxBufferSizeGB: 2,
      maxStorageBufferBindingSizeGB: 2,
      shaderF16: partial.shaderF16 ?? true,
      isFallbackAdapter: false,
      error: null,
    },
    webgl: { renderer: null, vendor: null, version: 'WebGL 2.0' },
    storage: { quotaGB: 100, usageGB: 1, freeGB: 99, persisted: false },
  }
}
