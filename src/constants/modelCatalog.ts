import type {
  CatalogModel,
  HardwareOverrides,
  HardwareProfile,
  MachineSpecs,
  PerformanceSettings,
  Recommendation,
  TierId,
} from '../types/architecture'

/* ------------------------------------------------------------------ */
/* Ollama models (pulled from http://localhost:11434/api/pull)          */
/* Tags are the exact names published in the Ollama library.           */
/* ------------------------------------------------------------------ */

const OLLAMA_QWEN25VL_7B: CatalogModel = {
  id: 'qwen2.5vl:7b',
  engine: 'ollama',
  label: 'Qwen2.5-VL 7B',
  vision: true,
  approxDownloadGB: 6.0,
  approxRuntimeGB: 8.5,
  notes: 'High-detail vision for shop drawings, renders and site photography.',
}

const OLLAMA_QWEN25VL_3B: CatalogModel = {
  id: 'qwen2.5vl:3b',
  engine: 'ollama',
  label: 'Qwen2.5-VL 3B',
  vision: true,
  approxDownloadGB: 3.2,
  approxRuntimeGB: 4.8,
  notes: 'Balanced vision-language model for mid-range GPUs and 8–16 GB Macs.',
}

const OLLAMA_MOONDREAM: CatalogModel = {
  id: 'moondream:latest',
  engine: 'ollama',
  label: 'Moondream 2',
  vision: true,
  approxDownloadGB: 1.7,
  approxRuntimeGB: 2.6,
  notes: 'Tiny vision model that runs on integrated graphics.',
}

const OLLAMA_LLAMA32_3B: CatalogModel = {
  id: 'llama3.2:3b',
  engine: 'ollama',
  label: 'Llama 3.2 3B Instruct',
  vision: false,
  approxDownloadGB: 2.0,
  approxRuntimeGB: 3.2,
  notes: 'Compact text model that drafts the brief on low-memory machines.',
}

/* ------------------------------------------------------------------ */
/* WebLLM models (streamed into the browser Cache via WebGPU)           */
/* IDs match @mlc-ai/web-llm prebuiltAppConfig. q4f16 variants need the */
/* WebGPU `shader-f16` feature; q4f32 variants are swapped in otherwise.*/
/* ------------------------------------------------------------------ */

const WEBLLM_PHI35_VISION: CatalogModel = {
  id: 'Phi-3.5-vision-instruct-q4f16_1-MLC',
  engine: 'webllm',
  label: 'Phi-3.5 Vision Instruct',
  vision: true,
  approxDownloadGB: 2.4,
  approxRuntimeGB: 4.5,
  notes: 'The browser-native vision-language model in WebLLM.',
}

const WEBLLM_LLAMA31_8B: CatalogModel = {
  id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',
  engine: 'webllm',
  label: 'Llama 3.1 8B Instruct',
  vision: false,
  approxDownloadGB: 4.6,
  approxRuntimeGB: 5.0,
  notes:
    'Drafting model for the high-spec browser engine. Llama-3.2-11B-Vision has no WebLLM build, so browser vision uses Phi-3.5 Vision.',
}

const WEBLLM_LLAMA32_3B: CatalogModel = {
  id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
  engine: 'webllm',
  label: 'Llama 3.2 3B Instruct',
  vision: false,
  approxDownloadGB: 1.8,
  approxRuntimeGB: 2.3,
  notes: 'Low-memory WebGPU drafting model (text only).',
}

export const TEMPERATURE_PRECISION = 0.25

const SETTINGS: Record<TierId, PerformanceSettings> = {
  high: {
    temperature: TEMPERATURE_PRECISION,
    contextWindow: 8192,
    maxTokens: 2048,
    imageResolution: 1344,
    gpuOffloadPercent: 100,
    lowMemoryMode: false,
    highDetailTiling: true,
  },
  balanced: {
    temperature: TEMPERATURE_PRECISION,
    contextWindow: 4096,
    maxTokens: 1536,
    imageResolution: 1024,
    gpuOffloadPercent: 100,
    lowMemoryMode: false,
    highDetailTiling: false,
  },
  lightweight: {
    temperature: TEMPERATURE_PRECISION,
    contextWindow: 2048,
    maxTokens: 1024,
    imageResolution: 768,
    gpuOffloadPercent: 'auto',
    lowMemoryMode: true,
    highDetailTiling: false,
  },
}

export const HARDWARE_PROFILES: Record<TierId, HardwareProfile> = {
  high: {
    id: 'high',
    name: 'High-Spec Tier',
    tagline: 'Full-resolution shop-drawing analysis',
    criteria: '16 GB+ unified-memory Mac or Windows PC with 10 GB+ dedicated VRAM',
    ollama: { vision: OLLAMA_QWEN25VL_7B, text: OLLAMA_QWEN25VL_7B },
    webllm: { vision: WEBLLM_PHI35_VISION, text: WEBLLM_LLAMA31_8B },
    settings: SETTINGS.high,
  },
  balanced: {
    id: 'balanced',
    name: 'Balanced Mid-Range Tier',
    tagline: 'Reliable vision + drafting on everyday workstations',
    criteria: '8–16 GB RAM or 6–8 GB VRAM',
    ollama: { vision: OLLAMA_QWEN25VL_3B, text: OLLAMA_QWEN25VL_3B },
    webllm: { vision: WEBLLM_PHI35_VISION, text: WEBLLM_PHI35_VISION },
    settings: SETTINGS.balanced,
  },
  lightweight: {
    id: 'lightweight',
    name: 'Lightweight / Integrated GPU Tier',
    tagline: 'Low-memory mode for laptops and integrated graphics',
    criteria: 'Under 8 GB RAM or integrated graphics',
    ollama: { vision: OLLAMA_MOONDREAM, text: OLLAMA_LLAMA32_3B },
    webllm: { vision: null, text: WEBLLM_LLAMA32_3B },
    settings: SETTINGS.lightweight,
  },
}

export const TIER_ORDER: TierId[] = ['high', 'balanced', 'lightweight']

export const CLOUD_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (default)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
] as const

export const DEFAULT_CLOUD_MODEL = 'claude-opus-5-5'

/** Minimum unified memory shipped with each Apple Silicon chip family (GB). */
const APPLE_CHIP_MEMORY_FLOOR: Array<[RegExp, number]> = [
  [/M[1-5]\s*Ultra/i, 64],
  [/M4\s*Max/i, 36],
  [/M3\s*Max/i, 36],
  [/M5\s*Max/i, 36],
  [/M[12]\s*Max/i, 32],
  [/M4\s*Pro/i, 24],
  [/M5\s*Pro/i, 24],
  [/M3\s*Pro/i, 18],
  [/M[12]\s*Pro/i, 16],
  [/\bM[45]\b/i, 16],
  [/\bM[123]\b/i, 8],
]

export function appleChipMemoryFloor(model: string | null): number | null {
  if (!model) return null
  for (const [re, gb] of APPLE_CHIP_MEMORY_FLOOR) if (re.test(model)) return gb
  return null
}

/** RAM the recommendation engine should assume, honouring the manual override. */
export function effectiveRamGB(specs: MachineSpecs | null, overrides: HardwareOverrides): number | null {
  if (overrides.ramGB != null) return overrides.ramGB
  if (!specs) return null
  const reported = specs.memory.reportedGB
  const floor = specs.gpu.gpuClass === 'apple-silicon' ? appleChipMemoryFloor(specs.gpu.model) : null
  if (reported == null) return floor
  return floor != null ? Math.max(reported, floor) : reported
}

export function effectiveVramGB(specs: MachineSpecs | null, overrides: HardwareOverrides): number | null {
  if (overrides.vramGB != null) return overrides.vramGB
  if (!specs) return null
  if (specs.gpu.gpuClass === 'apple-silicon') return effectiveRamGB(specs, overrides)
  return specs.gpu.estimatedVramGB
}

/** Swap q4f16 weights for q4f32 when the GPU lacks the `shader-f16` feature. */
export function webllmVariant(modelId: string, precision: Recommendation['webllmPrecision']): string {
  return precision === 'q4f32_1' ? modelId.replace('q4f16_1', 'q4f32_1') : modelId
}

/**
 * Deterministic recommendation engine: identical specs + overrides always yield the same tier.
 */
export function recommendProfile(specs: MachineSpecs | null, overrides: HardwareOverrides): Recommendation {
  const ram = effectiveRamGB(specs, overrides)
  const vram = effectiveVramGB(specs, overrides)
  const gpuClass = specs?.gpu.gpuClass ?? 'unknown'
  const isApple = gpuClass === 'apple-silicon' || specs?.os.isAppleSilicon === true
  // f16 weights need the `shader-f16` feature; only a real adapter can tell us it is missing.
  const precision: Recommendation['webllmPrecision'] = specs?.webgpu.adapterAvailable && !specs.webgpu.shaderF16 ? 'q4f32_1' : 'q4f16_1'
  const reasons: string[] = []
  let tier: TierId

  if (isApple && ram != null && ram >= 16) {
    tier = 'high'
    reasons.push(`Apple Silicon with ${ram} GB unified memory (16 GB+ threshold met).`)
  } else if (!isApple && gpuClass === 'discrete' && vram != null && vram >= 10) {
    tier = 'high'
    reasons.push(`Dedicated GPU with ${vram} GB VRAM (10 GB+ threshold met).`)
  } else if (gpuClass === 'integrated' || gpuClass === 'software') {
    tier = 'lightweight'
    reasons.push(
      gpuClass === 'software'
        ? 'Only a software renderer is available, so the low-memory profile is used.'
        : 'Integrated graphics share system memory, so the low-memory profile is used.',
    )
  } else if (ram != null && ram < 8) {
    tier = 'lightweight'
    reasons.push(`${ram} GB RAM is below the 8 GB balanced threshold.`)
  } else if ((ram != null && ram >= 8) || (vram != null && vram >= 6)) {
    tier = 'balanced'
    if (ram != null && ram >= 8) reasons.push(`${ram} GB RAM sits in the 8–16 GB balanced band.`)
    if (vram != null && vram >= 6) reasons.push(`${vram} GB VRAM sits in the 6–8 GB balanced band.`)
    if (isApple && ram != null && ram < 16) reasons.push('Set the RAM override if this Mac has 16 GB or more.')
  } else {
    tier = 'lightweight'
    reasons.push('Memory could not be confirmed, so the safe low-memory profile is used. Use the overrides to correct it.')
  }

  if (specs?.memory.capped && overrides.ramGB == null) {
    reasons.push('The browser caps reported RAM at 8 GB — use the manual override if this machine has more.')
  }
  if (precision === 'q4f32_1') {
    reasons.push('WebGPU lacks shader-f16, so browser models use q4f32 weights.')
  }

  return { profile: HARDWARE_PROFILES[tier], reasons, effectiveRamGB: ram, effectiveVramGB: vram, webllmPrecision: precision }
}
