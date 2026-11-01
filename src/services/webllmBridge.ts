import type { WebLlmTransport } from './modelDownloader'
import type { WebLlmMessage, WeightProgress, WorkerRequest, WorkerResponse } from './webllmProtocol'

/**
 * UI-thread client for the WebLLM worker. The worker (and the ≈6 MB WebLLM runtime inside it)
 * is created lazily the first time the browser engine is actually used.
 */

type Pending = {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  onEvent?: (msg: WorkerResponse) => void
}

let worker: Worker | null = null
const pending = new Map<string, Pending>()
let seq = 0

export class WorkerAbortError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AbortError'
  }
}

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../workers/webllm.worker.ts', import.meta.url), { type: 'module', name: 'webllm' })
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data
    const p = pending.get(msg.id)
    if (!p) return
    if (msg.type === 'result') {
      pending.delete(msg.id)
      p.resolve(msg.value)
    } else if (msg.type === 'error') {
      pending.delete(msg.id)
      p.reject(msg.aborted ? new WorkerAbortError(msg.message) : new Error(msg.message))
    } else {
      p.onEvent?.(msg)
    }
  }
  worker.onerror = (event) => {
    const err = new Error(event.message || 'The WebLLM worker crashed.')
    for (const p of pending.values()) p.reject(err)
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

function call<T>(req: DistributiveOmit<WorkerRequest, 'id'>, onEvent?: (msg: WorkerResponse) => void): Promise<T> {
  const id = `r${++seq}`
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onEvent })
    getWorker().postMessage({ ...req, id } as WorkerRequest)
  })
}

export const webllmTransport: WebLlmTransport = {
  download(modelId, onProgress) {
    return call<void>({ type: 'download', modelId }, (msg) => {
      if (msg.type === 'download-progress') {
        const { phase, bytesDone, bytesTotal, shardsDone, shardsTotal } = msg
        onProgress({ phase, bytesDone, bytesTotal, shardsDone, shardsTotal } satisfies WeightProgress)
      }
    })
  },
  abortDownload(modelId, reason) {
    if (!worker) return
    void call({ type: 'abort-download', modelId, reason })
  },
  load(modelId, contextWindow, onProgress) {
    return call<void>({ type: 'load', modelId, contextWindow }, (msg) => {
      if (msg.type === 'load-progress') onProgress(msg.progress, msg.text)
    })
  },
  deleteModel(modelId) {
    return call<void>({ type: 'delete', modelId })
  },
}

export async function webllmChat(opts: {
  modelId: string
  contextWindow: number
  messages: WebLlmMessage[]
  temperature: number
  maxTokens: number
  signal?: AbortSignal
  onDelta?: (delta: string) => void
  onLoadProgress?: (progress: number, text: string) => void
}): Promise<string> {
  if (opts.signal?.aborted) throw new WorkerAbortError('Generation cancelled.')
  const onAbort = () => {
    if (worker) void call({ type: 'interrupt' })
  }
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const text = await call<string>(
      {
        type: 'chat',
        modelId: opts.modelId,
        contextWindow: opts.contextWindow,
        messages: opts.messages,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
      },
      (msg) => {
        if (msg.type === 'delta') opts.onDelta?.(msg.text)
        else if (msg.type === 'load-progress') opts.onLoadProgress?.(msg.progress, msg.text)
      },
    )
    if (opts.signal?.aborted) throw new WorkerAbortError('Generation cancelled.')
    return text
  } finally {
    opts.signal?.removeEventListener('abort', onAbort)
  }
}

export function webllmUnload(): Promise<void> {
  if (!worker) return Promise.resolve()
  return call<void>({ type: 'unload' })
}
