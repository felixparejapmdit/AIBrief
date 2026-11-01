import type { DownloadProgress, DownloadStatus } from '../types/architecture'
import type { WeightProgress } from './webllmProtocol'

/**
 * 1-click model downloader for both local engines.
 *
 *  a) Browser WebGPU engine (@mlc-ai/web-llm): weight shards are streamed byte-by-byte into the
 *     browser Cache Storage under the exact keys WebLLM reads ("webllm/model" scope, keyed by shard
 *     URL), giving live %, MB, speed, pause (with mid-shard HTTP Range resume) and cancel.
 *  b) Local Ollama engine: POST /api/pull with streaming NDJSON progress, pause/resume/cancel.
 *
 * This module has no DOM dependencies so the shard streamer can run inside the WebLLM worker.
 */

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434'
export const WEBLLM_MODEL_CACHE = 'webllm/model'

export type ProgressListener = (p: DownloadProgress) => void

/* ------------------------------------------------------------------ */
/* Shared: speed meter + throttled emitter                             */
/* ------------------------------------------------------------------ */

export class SpeedMeter {
  private lastBytes = 0
  private lastTime = 0
  private ema = 0

  reset(bytes: number): void {
    this.lastBytes = bytes
    this.lastTime = performance.now()
    this.ema = 0
  }

  /** Feed the cumulative byte count; returns a smoothed bytes/second figure. */
  sample(bytes: number): number {
    const now = performance.now()
    if (!this.lastTime) {
      this.reset(bytes)
      return 0
    }
    const dt = (now - this.lastTime) / 1000
    if (dt < 0.25) return this.ema
    const instant = Math.max(0, bytes - this.lastBytes) / dt
    this.ema = this.ema ? this.ema * 0.65 + instant * 0.35 : instant
    this.lastBytes = bytes
    this.lastTime = now
    return this.ema
  }
}

/** Translate low-level WebGPU/Dawn failures into guidance Philippe can act on. */
export function friendlyWebGpuError(message: string): string {
  if (/requestDevice|dxcompiler|DynamicLib|shader-f16|ShaderF16/i.test(message)) {
    return 'This browser could not create a WebGPU device with 16-bit shader support (its GPU shader compiler is unavailable). Use an up-to-date Google Chrome or Microsoft Edge, or switch to the Local Ollama engine.'
  }
  if (/device was lost|out of memory|insufficient memory/i.test(message)) {
    return 'The GPU ran out of memory while loading the model. Choose a lighter tier in Setup or close other GPU-heavy apps.'
  }
  return message
}

function isAbort(err: unknown): boolean {
  return (err instanceof DOMException && err.name === 'AbortError') || (err instanceof Error && /abort/i.test(err.name + err.message))
}

/* ================================================================== */
/* WebLLM: byte-level shard streaming into Cache Storage              */
/* ================================================================== */

/** All WebLLM prebuilt weights live at https://huggingface.co/mlc-ai/<model>/resolve/main/. */
export function webllmBaseUrl(modelId: string): string {
  return `https://huggingface.co/mlc-ai/${modelId}/resolve/main/`
}

interface TensorCacheManifest {
  records: Array<{ dataPath: string; nbytes: number }>
}

export interface PartialShard {
  chunks: Uint8Array[]
  received: number
}

/** Survives pause/resume so an interrupted shard continues with an HTTP Range request. */
export interface WeightDownloadState {
  partial: Map<string, PartialShard>
}

export function createWeightState(): WeightDownloadState {
  return { partial: new Map() }
}

async function readManifest(cache: Cache, baseUrl: string, signal: AbortSignal): Promise<TensorCacheManifest> {
  const url = new URL('tensor-cache.json', baseUrl).href
  let res = await cache.match(url)
  if (!res) {
    const fresh = await fetch(url, { signal })
    if (!fresh.ok) throw new Error(`Could not fetch model manifest (HTTP ${fresh.status}).`)
    await cache.put(url, fresh.clone())
    res = fresh
  }
  return (await res.json()) as TensorCacheManifest
}

export async function streamWebLlmWeights(opts: {
  baseUrl: string
  signal: AbortSignal
  state: WeightDownloadState
  onProgress: (p: WeightProgress) => void
  concurrency?: number
}): Promise<void> {
  const { baseUrl, signal, state, onProgress } = opts
  const cache = await caches.open(WEBLLM_MODEL_CACHE)
  onProgress({ phase: 'manifest', bytesDone: 0, bytesTotal: 0, shardsDone: 0, shardsTotal: 0 })
  const manifest = await readManifest(cache, baseUrl, signal)
  const shards = manifest.records.map((r) => ({ url: new URL(r.dataPath, baseUrl).href, nbytes: r.nbytes, name: r.dataPath }))
  const bytesTotal = shards.reduce((a, s) => a + s.nbytes, 0)
  const cachedKeys = new Set((await cache.keys()).map((r) => r.url))

  let completedBytes = 0
  let shardsDone = 0
  const pending: typeof shards = []
  for (const s of shards) {
    if (cachedKeys.has(s.url)) {
      completedBytes += s.nbytes
      shardsDone++
    } else pending.push(s)
  }

  let lastEmit = 0
  const emit = (force = false) => {
    const now = performance.now()
    if (!force && now - lastEmit < 120) return
    lastEmit = now
    let inflight = 0
    for (const p of state.partial.values()) inflight += p.received
    onProgress({ phase: 'downloading', bytesDone: completedBytes + inflight, bytesTotal, shardsDone, shardsTotal: shards.length })
  }
  emit(true)

  const downloadShard = async (shard: (typeof shards)[number]) => {
    let part = state.partial.get(shard.url)
    if (!part) {
      part = { chunks: [], received: 0 }
      state.partial.set(shard.url, part)
    }
    const resuming = part.received > 0 && part.received < shard.nbytes
    const res = await fetch(shard.url, { signal, headers: resuming ? { Range: `bytes=${part.received}-` } : undefined })
    if (!res.ok) throw new Error(`Download failed for ${shard.name} (HTTP ${res.status}).`)
    if (resuming && res.status !== 206) {
      // Server ignored the Range header — restart this shard from byte 0.
      part.chunks = []
      part.received = 0
    }
    if (!res.body) throw new Error('Streaming is not supported by this browser.')
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      part.chunks.push(value)
      part.received += value.byteLength
      emit()
    }
    if (part.received !== shard.nbytes) {
      state.partial.delete(shard.url)
      throw new Error(`Size mismatch for ${shard.name}: expected ${shard.nbytes} bytes, received ${part.received}.`)
    }
    const blob = new Blob(part.chunks as BlobPart[], { type: 'application/octet-stream' })
    await cache.put(
      new Request(shard.url),
      new Response(blob, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(shard.nbytes) } }),
    )
    state.partial.delete(shard.url)
    completedBytes += shard.nbytes
    shardsDone++
    emit(true)
  }

  let next = 0
  const worker = async () => {
    while (next < pending.length) {
      if (signal.aborted) throw new DOMException('Download paused', 'AbortError')
      const shard = pending[next++]!
      await downloadShard(shard)
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 3, Math.max(1, pending.length)) }, worker))

  onProgress({ phase: 'verifying', bytesDone: completedBytes, bytesTotal, shardsDone, shardsTotal: shards.length })
  const keys = new Set((await cache.keys()).map((r) => r.url))
  const missing = shards.filter((s) => !keys.has(s.url))
  if (missing.length) throw new Error(`${missing.length} weight shard(s) failed verification.`)
}

/** Main-thread check that every weight shard of a model is already in Cache Storage. */
export async function isWebLlmModelCached(modelId: string): Promise<boolean> {
  if (typeof caches === 'undefined') return false
  try {
    // caches.open() would create an empty cache as a side effect, so probe with has() first.
    if (!(await caches.has(WEBLLM_MODEL_CACHE))) return false
    const cache = await caches.open(WEBLLM_MODEL_CACHE)
    const baseUrl = webllmBaseUrl(modelId)
    const manifestRes = await cache.match(new URL('tensor-cache.json', baseUrl).href)
    if (!manifestRes) return false
    const manifest = (await manifestRes.json()) as TensorCacheManifest
    const keys = new Set((await cache.keys()).map((r) => r.url))
    return manifest.records.every((r) => keys.has(new URL(r.dataPath, baseUrl).href))
  } catch {
    return false
  }
}

/** Transport implemented by the WebLLM worker bridge (injected to keep this module DOM-free). */
export interface WebLlmTransport {
  download(modelId: string, onProgress: (p: WeightProgress) => void): Promise<void>
  abortDownload(modelId: string, reason: 'pause' | 'cancel'): void
  load(modelId: string, contextWindow: number, onProgress: (progress: number, text: string) => void): Promise<void>
  deleteModel(modelId: string): Promise<void>
}

/* ================================================================== */
/* Task base                                                           */
/* ================================================================== */

abstract class BaseTask {
  protected progress: DownloadProgress
  protected meter = new SpeedMeter()
  private lastEmit = 0
  private readonly listener: ProgressListener

  constructor(engine: DownloadProgress['engine'], model: string, listener: ProgressListener) {
    this.listener = listener
    this.progress = {
      engine,
      model,
      status: 'idle',
      fraction: 0,
      bytesDone: 0,
      bytesTotal: 0,
      bytesPerSecond: 0,
      detail: '',
      error: null,
    }
  }

  get snapshot(): DownloadProgress {
    return { ...this.progress }
  }

  protected update(patch: Partial<DownloadProgress>, force = false): void {
    const statusChanged = patch.status != null && patch.status !== this.progress.status
    this.progress = { ...this.progress, ...patch }
    const now = performance.now()
    if (force || statusChanged || now - this.lastEmit > 100) {
      this.lastEmit = now
      this.listener({ ...this.progress })
    }
  }

  protected setStatus(status: DownloadStatus, detail?: string, error: string | null = null): void {
    this.update({ status, detail: detail ?? this.progress.detail, error, bytesPerSecond: status === 'downloading' ? this.progress.bytesPerSecond : 0 }, true)
  }

  abstract start(): Promise<void>
  abstract pause(): void
  abstract cancel(): Promise<void>
  resume(): Promise<void> {
    return this.start()
  }
}

/* ================================================================== */
/* WebLLM download task                                                */
/* ================================================================== */

export class WebLlmDownloadTask extends BaseTask {
  private running = false
  private readonly transport: WebLlmTransport
  private readonly contextWindow: number

  constructor(model: string, listener: ProgressListener, transport: WebLlmTransport, contextWindow: number) {
    super('webllm', model, listener)
    this.transport = transport
    this.contextWindow = contextWindow
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    this.setStatus('preparing', 'Reading model manifest…')
    this.meter.reset(this.progress.bytesDone)
    try {
      await this.transport.download(this.progress.model, (p) => {
        if (p.phase === 'manifest') return
        if (p.phase === 'verifying') {
          this.update({ status: 'verifying', detail: `Verifying ${p.shardsTotal} shards…`, fraction: 1, bytesDone: p.bytesDone, bytesTotal: p.bytesTotal }, true)
          return
        }
        this.update({
          status: 'downloading',
          bytesDone: p.bytesDone,
          bytesTotal: p.bytesTotal,
          fraction: p.bytesTotal ? p.bytesDone / p.bytesTotal : 0,
          bytesPerSecond: this.meter.sample(p.bytesDone),
          detail: `Shard ${p.shardsDone}/${p.shardsTotal} cached`,
        })
      })
      this.setStatus('loading', 'Compiling WebGPU kernels and loading weights onto the GPU…')
      await this.transport.load(this.progress.model, this.contextWindow, (progress, text) => {
        this.update({ status: 'loading', detail: text.split('. It can take')[0] ?? text, fraction: Math.max(0.999 * progress, 0) })
      })
      this.update({ status: 'completed', fraction: 1, bytesPerSecond: 0, detail: 'Model cached and loaded on the GPU.' }, true)
    } catch (err) {
      if (isAbort(err)) {
        if (this.progress.status !== 'cancelled') this.setStatus('paused', 'Paused — completed shards stay cached; resume continues mid-shard.')
      } else {
        const message = friendlyWebGpuError(err instanceof Error ? err.message : String(err))
        this.setStatus('error', this.progress.status === 'loading' ? 'Weights are cached, but loading onto the GPU failed' : 'Download failed', message)
      }
    } finally {
      this.running = false
    }
  }

  pause(): void {
    if (!this.running) return
    this.transport.abortDownload(this.progress.model, 'pause')
  }

  async cancel(): Promise<void> {
    this.progress.status = 'cancelled'
    this.transport.abortDownload(this.progress.model, 'cancel')
    await this.transport.deleteModel(this.progress.model)
    this.update({ status: 'cancelled', fraction: 0, bytesDone: 0, bytesPerSecond: 0, detail: 'Cancelled — partial weights removed from browser storage.' }, true)
  }
}

/* ================================================================== */
/* Ollama                                                              */
/* ================================================================== */

export interface OllamaModelInfo {
  name: string
  sizeBytes: number
  parameterSize: string | null
  quantization: string | null
  family: string | null
}

export interface OllamaStatus {
  reachable: boolean
  version: string | null
  models: OllamaModelInfo[]
  error: string | null
  checkedAt: string
}

export function trimBaseUrl(url: string): string {
  return (url || DEFAULT_OLLAMA_URL).replace(/\/+$/, '')
}

export async function checkOllama(baseUrl: string, timeoutMs = 2500): Promise<OllamaStatus> {
  const base = trimBaseUrl(baseUrl)
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const [versionRes, tagsRes] = await Promise.all([
      fetch(`${base}/api/version`, { signal: ctrl.signal }),
      fetch(`${base}/api/tags`, { signal: ctrl.signal }),
    ])
    if (!tagsRes.ok) throw new Error(`Ollama responded with HTTP ${tagsRes.status}`)
    const version = versionRes.ok ? ((await versionRes.json()) as { version?: string }).version ?? null : null
    const tags = (await tagsRes.json()) as {
      models?: Array<{ name: string; size: number; details?: { parameter_size?: string; quantization_level?: string; family?: string } }>
    }
    return {
      reachable: true,
      version,
      models: (tags.models ?? []).map((m) => ({
        name: m.name,
        sizeBytes: m.size,
        parameterSize: m.details?.parameter_size ?? null,
        quantization: m.details?.quantization_level ?? null,
        family: m.details?.family ?? null,
      })),
      error: null,
      checkedAt: new Date().toISOString(),
    }
  } catch (err) {
    const message = isAbort(err)
      ? 'Ollama did not respond. Start the Ollama app (or run "ollama serve").'
      : 'Ollama is not reachable at this address. Start Ollama; if this app is served from a non-localhost origin, set OLLAMA_ORIGINS to allow it.'
    return { reachable: false, version: null, models: [], error: message, checkedAt: new Date().toISOString() }
  } finally {
    clearTimeout(t)
  }
}

export function ollamaHasModel(status: OllamaStatus | null, tag: string): boolean {
  if (!status?.reachable) return false
  const want = tag.includes(':') ? tag : `${tag}:latest`
  return status.models.some((m) => m.name === want || m.name === tag)
}

interface PullLine {
  status?: string
  digest?: string
  total?: number
  completed?: number
  error?: string
}

export class OllamaPullTask extends BaseTask {
  private controller: AbortController | null = null
  private layers = new Map<string, { total: number; completed: number }>()
  private readonly baseUrl: string

  constructor(baseUrl: string, model: string, listener: ProgressListener) {
    super('ollama', model, listener)
    this.baseUrl = baseUrl
  }

  async start(): Promise<void> {
    if (this.controller) return
    const controller = new AbortController()
    this.controller = controller
    this.setStatus('preparing', 'Contacting Ollama…')
    this.meter.reset(this.progress.bytesDone)
    try {
      const res = await fetch(`${trimBaseUrl(this.baseUrl)}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.progress.model, stream: true }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) throw new Error(`Ollama pull failed (HTTP ${res.status}).`)
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      let succeeded = false
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += value
        let nl: number
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          if (!line) continue
          const msg = JSON.parse(line) as PullLine
          if (msg.error) throw new Error(msg.error)
          if (this.handleLine(msg)) succeeded = true
        }
      }
      if (buffer.trim()) {
        const msg = JSON.parse(buffer.trim()) as PullLine
        if (msg.error) throw new Error(msg.error)
        if (this.handleLine(msg)) succeeded = true
      }
      if (!succeeded) throw new Error('Ollama closed the stream before the pull completed.')
      this.update({ status: 'completed', fraction: 1, bytesPerSecond: 0, detail: 'Model installed in Ollama.' }, true)
    } catch (err) {
      if (isAbort(err)) {
        if (this.progress.status !== 'cancelled') this.setStatus('paused', 'Paused — Ollama keeps partial layers and resumes where it stopped.')
      } else {
        this.setStatus('error', 'Pull failed', err instanceof Error ? err.message : String(err))
      }
    } finally {
      this.controller = null
    }
  }

  /** Returns true on the final "success" line. */
  private handleLine(msg: PullLine): boolean {
    const status = msg.status ?? ''
    if (msg.digest && msg.total) {
      this.layers.set(msg.digest, { total: msg.total, completed: msg.completed ?? 0 })
      let done = 0
      let total = 0
      for (const l of this.layers.values()) {
        done += l.completed
        total += l.total
      }
      this.update({
        status: 'downloading',
        bytesDone: done,
        bytesTotal: total,
        fraction: total ? done / total : 0,
        bytesPerSecond: this.meter.sample(done),
        detail: `Pulling layer ${msg.digest.replace('sha256:', '').slice(0, 12)}`,
      })
      return false
    }
    if (status === 'success') return true
    if (/verifying/.test(status)) this.update({ status: 'verifying', detail: 'Verifying SHA-256 digest…', fraction: 1 }, true)
    else if (/writing manifest/.test(status)) this.update({ status: 'verifying', detail: 'Writing manifest…' }, true)
    else if (status) this.update({ detail: status })
    return false
  }

  pause(): void {
    this.controller?.abort()
  }

  async cancel(): Promise<void> {
    this.progress.status = 'cancelled'
    this.controller?.abort()
    this.layers.clear()
    this.update({ status: 'cancelled', fraction: 0, bytesDone: 0, bytesPerSecond: 0, detail: 'Cancelled.' }, true)
  }
}
