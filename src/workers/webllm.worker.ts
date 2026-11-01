import {
  MLCEngine,
  deleteModelAllInfoInCache,
  prebuiltAppConfig,
  type ChatCompletionMessageParam,
} from '@mlc-ai/web-llm'
import { WEBLLM_MODEL_CACHE, createWeightState, streamWebLlmWeights, webllmBaseUrl, type WeightDownloadState } from '../services/modelDownloader'
import type { WorkerRequest, WorkerResponse } from '../services/webllmProtocol'

/** Typed view of the dedicated worker global (the app compiles against the DOM lib). */
const scope = self as unknown as {
  postMessage(msg: WorkerResponse): void
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
}

const post = (msg: WorkerResponse) => scope.postMessage(msg)

const engine = new MLCEngine()
let loaded: { modelId: string; contextWindow: number } | null = null
let loading: Promise<void> | null = null
let loadProgressTarget: string | null = null

engine.setInitProgressCallback((report) => {
  if (loadProgressTarget) post({ id: loadProgressTarget, type: 'load-progress', progress: report.progress, text: report.text })
})

const downloads = new Map<string, { controller: AbortController; reason: 'pause' | 'cancel' | null }>()
const weightStates = new Map<string, WeightDownloadState>()

function modelRecord(modelId: string) {
  const record = prebuiltAppConfig.model_list.find((m) => m.model_id === modelId)
  if (!record) throw new Error(`Model "${modelId}" is not in the WebLLM prebuilt catalog.`)
  return record
}

/** Resolve the weight base URL exactly as WebLLM's cleanModelUrl() does. */
function baseUrlFor(modelId: string): string {
  let url = modelRecord(modelId).model
  url += url.endsWith('/') ? '' : '/'
  if (!/.+\/resolve\/.+\//.test(url)) url += 'resolve/main/'
  const resolved = new URL(url).href
  if (resolved !== webllmBaseUrl(modelId)) {
    // Keep the main-thread cache probe honest if WebLLM ever relocates weights.
    console.warn(`[webllm] weight URL ${resolved} differs from the catalog convention.`)
  }
  return resolved
}

async function ensureLoaded(id: string, modelId: string, contextWindow: number): Promise<void> {
  if (loaded?.modelId === modelId && loaded.contextWindow === contextWindow) return
  while (loading) await loading.catch(() => undefined)
  if (loaded?.modelId === modelId && loaded.contextWindow === contextWindow) return
  loadProgressTarget = id
  loading = (async () => {
    // reload() unloads any previously loaded model first, so only one model occupies VRAM.
    await engine.reload(modelId, { context_window_size: contextWindow })
    loaded = { modelId, contextWindow }
  })()
  try {
    await loading
  } finally {
    loading = null
    loadProgressTarget = null
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function isAbort(err: unknown): boolean {
  return (err instanceof DOMException && err.name === 'AbortError') || (err instanceof Error && /abort/i.test(err.name + err.message))
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data
  try {
    switch (req.type) {
      case 'download': {
        const existing = downloads.get(req.modelId)
        if (existing) existing.controller.abort()
        const controller = new AbortController()
        const entry = { controller, reason: null as 'pause' | 'cancel' | null }
        downloads.set(req.modelId, entry)
        const state = weightStates.get(req.modelId) ?? createWeightState()
        weightStates.set(req.modelId, state)
        try {
          await streamWebLlmWeights({
            baseUrl: baseUrlFor(req.modelId),
            signal: controller.signal,
            state,
            onProgress: (p) => post({ id: req.id, type: 'download-progress', ...p }),
          })
          weightStates.delete(req.modelId)
          post({ id: req.id, type: 'result', value: true })
        } finally {
          if (downloads.get(req.modelId) === entry) downloads.delete(req.modelId)
        }
        return
      }
      case 'abort-download': {
        const entry = downloads.get(req.modelId)
        if (entry) {
          entry.reason = req.reason
          entry.controller.abort()
        }
        if (req.reason === 'cancel') weightStates.delete(req.modelId)
        post({ id: req.id, type: 'result', value: true })
        return
      }
      case 'load': {
        await ensureLoaded(req.id, req.modelId, req.contextWindow)
        post({ id: req.id, type: 'result', value: true })
        return
      }
      case 'chat': {
        await ensureLoaded(req.id, req.modelId, req.contextWindow)
        const stream = await engine.chat.completions.create({
          messages: req.messages as ChatCompletionMessageParam[],
          stream: true,
          temperature: req.temperature,
          max_tokens: req.maxTokens,
        })
        let full = ''
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? ''
          if (delta) {
            full += delta
            post({ id: req.id, type: 'delta', text: delta })
          }
        }
        post({ id: req.id, type: 'result', value: full })
        return
      }
      case 'interrupt': {
        await engine.interruptGenerate()
        post({ id: req.id, type: 'result', value: true })
        return
      }
      case 'delete': {
        if (loaded?.modelId === req.modelId) {
          await engine.unload()
          loaded = null
        }
        weightStates.delete(req.modelId)
        await deleteModelAllInfoInCache(req.modelId, prebuiltAppConfig)
        // WebLLM removes weights, tokenizer.json/.model, config and wasm; sweep any other files
        // (e.g. tokenizer_config.json) stored under the model's URL so nothing is left behind.
        if (await caches.has(WEBLLM_MODEL_CACHE)) {
          const base = baseUrlFor(req.modelId)
          const cache = await caches.open(WEBLLM_MODEL_CACHE)
          for (const key of await cache.keys()) if (key.url.startsWith(base)) await cache.delete(key)
        }
        post({ id: req.id, type: 'result', value: true })
        return
      }
      case 'unload': {
        await engine.unload()
        loaded = null
        post({ id: req.id, type: 'result', value: true })
        return
      }
    }
  } catch (err) {
    post({ id: req.id, type: 'error', message: errorMessage(err), aborted: isAbort(err) })
  }
}
