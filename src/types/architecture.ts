/**
 * Shared domain types for the VIP Architectural Design Brief Creator.
 * Everything that crosses a module boundary (store, services, components) is typed here.
 */

/* ------------------------------------------------------------------ */
/* Hardware detection                                                  */
/* ------------------------------------------------------------------ */

export type OsFamily = 'macos' | 'windows' | 'linux' | 'chromeos' | 'android' | 'ios' | 'unknown'
export type CpuArch = 'arm' | 'x86' | 'unknown'
export type GpuVendor = 'apple' | 'nvidia' | 'amd' | 'intel' | 'qualcomm' | 'microsoft' | 'unknown'
export type GpuClass = 'apple-silicon' | 'discrete' | 'integrated' | 'software' | 'unknown'
export type VramSource = 'gpu-lookup' | 'unified-memory' | 'shared-memory' | 'unknown'

export interface OsInfo {
  family: OsFamily
  /** Human label, e.g. "Windows 11", "macOS (Apple Silicon)". */
  label: string
  version: string | null
  arch: CpuArch
  /** null when it cannot be determined (e.g. Safari without a GPU hint). */
  isAppleSilicon: boolean | null
  source: 'userAgentData' | 'userAgent'
}

export interface GpuInfo {
  renderer: string | null
  vendor: GpuVendor
  gpuClass: GpuClass
  /** Normalised marketing name, e.g. "Apple M3 Pro", "NVIDIA GeForce RTX 4070". */
  model: string | null
  estimatedVramGB: number | null
  vramSource: VramSource
}

export interface WebGpuInfo {
  supported: boolean
  adapterAvailable: boolean
  vendor: string | null
  architecture: string | null
  device: string | null
  description: string | null
  maxBufferSizeGB: number | null
  maxStorageBufferBindingSizeGB: number | null
  shaderF16: boolean
  isFallbackAdapter: boolean
  error: string | null
}

export interface StorageInfo {
  quotaGB: number | null
  usageGB: number | null
  freeGB: number | null
  persisted: boolean | null
}

export interface MachineSpecs {
  detectedAt: string
  os: OsInfo
  browser: { name: string; version: string }
  cpu: { logicalCores: number | null }
  /** navigator.deviceMemory — browsers cap this (Chrome: 8 GB), hence `capped`. */
  memory: { reportedGB: number | null; capped: boolean }
  gpu: GpuInfo
  webgpu: WebGpuInfo
  webgl: { renderer: string | null; vendor: string | null; version: string | null }
  storage: StorageInfo
}

export interface HardwareOverrides {
  ramGB: number | null
  vramGB: number | null
}

/* ------------------------------------------------------------------ */
/* Model catalog & recommendation                                      */
/* ------------------------------------------------------------------ */

export type TierId = 'high' | 'balanced' | 'lightweight'
export type EngineKind = 'webllm' | 'ollama' | 'cloud'
export type ModelRole = 'vision' | 'text'

export interface PerformanceSettings {
  temperature: number
  contextWindow: number
  maxTokens: number
  /** Long-edge pixel cap applied to every image before inference. */
  imageResolution: number
  /** 100 = offload every layer to the GPU; 'auto' lets the engine decide (low-memory machines). */
  gpuOffloadPercent: number | 'auto'
  lowMemoryMode: boolean
  /** Split technical shop drawings into an overview + 2×2 detail tiles. */
  highDetailTiling: boolean
}

export interface CatalogModel {
  id: string
  engine: Exclude<EngineKind, 'cloud'>
  label: string
  vision: boolean
  approxDownloadGB: number
  /** Approximate resident memory needed while running (weights + KV cache). */
  approxRuntimeGB: number
  notes?: string
}

export interface HardwareProfile {
  id: TierId
  name: string
  tagline: string
  criteria: string
  ollama: { vision: CatalogModel; text: CatalogModel }
  webllm: { vision: CatalogModel | null; text: CatalogModel }
  settings: PerformanceSettings
}

export interface Recommendation {
  profile: HardwareProfile
  reasons: string[]
  effectiveRamGB: number | null
  effectiveVramGB: number | null
  /** Variant suffix actually used for WebLLM weights (f16 needs the shader-f16 feature). */
  webllmPrecision: 'q4f16_1' | 'q4f32_1'
}

export interface ModelBinding {
  engine: EngineKind
  model: string
  vision: boolean
}

export interface EngineSettings {
  ollamaBaseUrl: string
  cloudApiKey: string
  cloudModel: string
  vision: ModelBinding | null
  text: ModelBinding | null
}

/* ------------------------------------------------------------------ */
/* Downloads                                                           */
/* ------------------------------------------------------------------ */

export type DownloadStatus =
  | 'idle'
  | 'preparing'
  | 'downloading'
  | 'paused'
  | 'verifying'
  | 'loading'
  | 'completed'
  | 'cancelled'
  | 'error'

export interface DownloadProgress {
  engine: Exclude<EngineKind, 'cloud'>
  model: string
  status: DownloadStatus
  /** 0..1 */
  fraction: number
  bytesDone: number
  bytesTotal: number
  bytesPerSecond: number
  /** Human readable phase (e.g. "pulling manifest", "Fetching shard 12/56"). */
  detail: string
  error: string | null
}

/* ------------------------------------------------------------------ */
/* Visual intake                                                       */
/* ------------------------------------------------------------------ */

export type ImageCategory = 'site-photo' | 'sketchup-render' | 'shop-drawing' | 'design-peg'

export interface ImageAnalysis {
  styleAndSpatialFlow: string[]
  materialBuildUps: string[]
  constructabilityNotes: string[]
  designPrinciples: Partial<Record<DesignPrinciple, string>>
  summary: string
  /** Which model produced this, or "deterministic" for the no-vision path. */
  producedBy: string
  mode: 'vision' | 'metadata'
  analyzedAt: string
}

/** On-device pixel statistics computed from a 48×48 luminance grid. */
export interface ImageStats {
  luminanceMean: number
  /** Standard deviation of luminance (0–1): tonal contrast. */
  contrast: number
  /** Left/right mirror similarity (0–1): visual balance / symmetry. */
  symmetry: number
  /** Share of edge energy that is horizontal vs vertical (0–1, 0.5 = even). */
  horizontalBias: number
  /** Mean saturation (0–1). */
  colorfulness: number
}

export interface IntakeImage {
  id: string
  name: string
  category: ImageCategory
  mimeType: string
  width: number
  height: number
  sizeBytes: number
  /** Small JPEG data URL for cards (kept in persisted state). */
  thumbnail: string
  /** Optional notes typed by Philippe for this image. */
  notes: string
  /** Dominant colour palette extracted on-device (hex). */
  palette: string[]
  stats: ImageStats
  status: 'pending' | 'analyzing' | 'done' | 'error'
  error: string | null
  analysis: ImageAnalysis | null
  addedAt: string
}

/* ------------------------------------------------------------------ */
/* Interview                                                           */
/* ------------------------------------------------------------------ */

export type PillarId =
  | 'vision'
  | 'site'
  | 'functional'
  | 'aesthetic'
  | 'constructability'
  | 'challenges'
  | 'performance'
  | 'timeline'

export interface InterviewQuestion {
  id: string
  pillar: PillarId
  prompt: string
  helper: string
  placeholder: string
  chips: string[]
  /** Answers shorter than this are considered incomplete. */
  minLength: number
}

export interface Pillar {
  id: PillarId
  index: number
  title: string
  description: string
  questions: InterviewQuestion[]
}

export interface InterviewAnswer {
  questionId: string
  value: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/* Design vocabulary                                                   */
/* ------------------------------------------------------------------ */

export const DESIGN_PRINCIPLES = [
  'Emphasis',
  'Balance',
  'Unity',
  'Contrast',
  'Rhythm',
  'Proportion',
  'Variety',
] as const
export type DesignPrinciple = (typeof DESIGN_PRINCIPLES)[number]

export const ESSENTIAL_CRITERIA = [
  'Maintainability',
  'Durability',
  'Security',
  'Health Safety (Low-VOC)',
  'Aging-in-Place',
] as const
export type EssentialCriterion = (typeof ESSENTIAL_CRITERIA)[number]

/* ------------------------------------------------------------------ */
/* Brief & compliance                                                  */
/* ------------------------------------------------------------------ */

export type ComplianceCheckId =
  | 'client-reference'
  | 'forbidden-athletes'
  | 'political-risk'
  | 'design-principles'
  | 'essential-criteria'
  | 'precedents-where-when'
  | 'structure'

export interface ComplianceIssue {
  message: string
  /** Optional excerpt of the offending text. */
  excerpt?: string
}

export interface ComplianceCheck {
  id: ComplianceCheckId
  label: string
  passed: boolean
  issues: ComplianceIssue[]
  /** True when the auditor can repair this automatically. */
  autoFixable: boolean
}

export interface ComplianceReport {
  checks: ComplianceCheck[]
  passedCount: number
  total: number
  allPassed: boolean
  auditedHash: string
}

export type AthleteReplacement = 'guests' | 'patrons' | 'principals'

export interface BriefDraft {
  markdown: string
  generatedAt: string | null
  generatedBy: string | null
  /** Sections the normaliser had to rebuild from the deterministic composer. */
  repairedSections: number[]
  editedSinceGeneration: boolean
}

export interface Approval {
  approvedAt: string
  /** Hash of the markdown that was approved; any later edit invalidates it. */
  markdownHash: string
}

export type WorkflowStep = 1 | 2 | 3 | 4 | 5
