import type { EngineKind, MachineSpecs, ModelBinding } from '../types/architecture'
import { type OllamaStatus, ollamaHasModel } from './modelDownloader'

/**
 * Decides — deterministically — which AI models must be downloaded automatically.
 *
 * Fresh install: the recommended engine (Ollama when it is running, otherwise in-browser WebGPU) is
 * configured with the recommended models for the detected tier and every missing model is
 * downloaded. Later runs re-download a required model that went missing, and follow the detected
 * tier when the hardware information changes. A tier picked by hand is only downloaded on request
 * (people compare tiers before committing to a multi-GB download), and models picked by hand are
 * respected. Nothing is ever downloaded while offline, on a Data-Saver connection, without enough
 * browser storage, or after the user cancelled a download.
 */

export interface DownloadTarget {
  engine: 'ollama' | 'webllm'
  model: string
}

export interface EngineBindings {
  vision: ModelBinding | null
  text: ModelBinding | null
  downloads: DownloadTarget[]
}

export type AutoDownloadReason =
  | 'disabled'
  | 'detecting'
  | 'busy'
  | 'no-engine'
  | 'cloud'
  | 'ready'
  | 'attempted'
  | 'offline'
  | 'save-data'
  | 'storage'
  | 'tier-choice'

export type AutoDownloadPlan =
  | { action: 'none'; reason: AutoDownloadReason }
  | { action: 'wait'; reason: AutoDownloadReason }
  | { action: 'configure'; kind: 'ollama' | 'webllm'; downloads: DownloadTarget[]; blocked: AutoDownloadReason | null }
  | { action: 'download'; downloads: DownloadTarget[] }

export interface AutoDownloadInput {
  enabled: boolean
  specs: MachineSpecs | null
  /** null until the first Ollama check has finished. */
  ollama: OllamaStatus | null
  preferredEngine: EngineKind | null
  /** True when the user bound models by hand in "Advanced". */
  bindingsManual: boolean
  /** True when the user picked a tier other than the detected one. */
  tierOverridden: boolean
  current: { vision: ModelBinding | null; text: ModelBinding | null }
  recommended: (kind: 'ollama' | 'webllm') => EngineBindings
  webllmCached: Record<string, boolean>
  /** A download is running or paused. */
  busy: boolean
  /** Keys ("engine:model") already auto-started this session — never auto-retried in a loop. */
  attempted: ReadonlySet<string>
  online: boolean
  saveData: boolean
  freeStorageGB: number | null
  sizeGB: (target: DownloadTarget) => number
}

export const targetKey = (t: DownloadTarget) => `${t.engine}:${t.model}`

const sameBinding = (a: ModelBinding | null, b: ModelBinding | null) => (a?.engine ?? null) === (b?.engine ?? null) && (a?.model ?? null) === (b?.model ?? null)

/** The engine auto-download installs into: the user's choice, else Ollama if running, else WebGPU. */
export function autoEngine(input: Pick<AutoDownloadInput, 'preferredEngine' | 'ollama' | 'specs'>): EngineKind | null {
  if (input.preferredEngine) return input.preferredEngine
  if (input.ollama?.reachable) return 'ollama'
  if (input.specs?.webgpu.adapterAvailable) return 'webllm'
  return null
}

export function planAutoDownload(input: AutoDownloadInput): AutoDownloadPlan {
  if (!input.enabled) return { action: 'none', reason: 'disabled' }
  if (!input.specs || !input.ollama) return { action: 'wait', reason: 'detecting' }
  if (input.busy) return { action: 'none', reason: 'busy' }

  const kind = autoEngine(input)
  if (kind === 'cloud') return { action: 'none', reason: 'cloud' }
  if (!kind) return { action: 'none', reason: 'no-engine' }
  const available = (engine: DownloadTarget['engine']) => (engine === 'ollama' ? Boolean(input.ollama?.reachable) : Boolean(input.specs?.webgpu.adapterAvailable))
  if (!available(kind)) return { action: 'none', reason: 'no-engine' }

  const rec = input.recommended(kind)
  const configure = !input.bindingsManual && (!sameBinding(input.current.vision, rec.vision) || !sameBinding(input.current.text, rec.text))
  const bound: DownloadTarget[] = []
  for (const b of [input.current.vision, input.current.text]) {
    if (b && b.engine !== 'cloud' && !bound.some((t) => t.engine === b.engine && t.model === b.model)) bound.push({ engine: b.engine, model: b.model })
  }
  // Switching an existing setup to a hand-picked tier waits for an explicit "Download now".
  if (configure && input.tierOverridden && (input.current.vision || input.current.text)) return { action: 'none', reason: 'tier-choice' }
  const targets = configure ? rec.downloads : bound
  const missing = targets.filter((t) =>
    t.engine === 'ollama' ? available('ollama') && !ollamaHasModel(input.ollama, t.model) : available('webllm') && !input.webllmCached[t.model],
  )
  const fresh = missing.filter((t) => !input.attempted.has(targetKey(t)))

  const blocked: AutoDownloadReason | null = !fresh.length
    ? null
    : !input.online
      ? 'offline'
      : input.saveData
        ? 'save-data'
        : input.freeStorageGB != null &&
            fresh.filter((t) => t.engine === 'webllm').reduce((gb, t) => gb + input.sizeGB(t), 0) > Math.max(0, input.freeStorageGB - 0.5)
          ? 'storage'
          : null

  if (configure) return { action: 'configure', kind, downloads: blocked ? [] : fresh, blocked }
  if (!fresh.length) return { action: 'none', reason: missing.length ? 'attempted' : 'ready' }
  if (blocked) return { action: 'none', reason: blocked }
  return { action: 'download', downloads: fresh }
}
