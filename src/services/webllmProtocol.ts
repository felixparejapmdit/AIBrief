/**
 * Message protocol between the UI thread and the WebLLM worker.
 * WebLLM (≈6 MB) is only ever loaded inside the worker so model download, GPU upload
 * and token generation never block the UI thread.
 */

export type WebLlmContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

export interface WebLlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | WebLlmContentPart[]
}

export type WorkerRequest =
  | { id: string; type: 'download'; modelId: string }
  | { id: string; type: 'abort-download'; modelId: string; reason: 'pause' | 'cancel' }
  | { id: string; type: 'load'; modelId: string; contextWindow: number }
  | {
      id: string
      type: 'chat'
      modelId: string
      contextWindow: number
      messages: WebLlmMessage[]
      temperature: number
      maxTokens: number
    }
  | { id: string; type: 'interrupt' }
  | { id: string; type: 'delete'; modelId: string }
  | { id: string; type: 'unload' }

export interface WeightProgress {
  phase: 'manifest' | 'downloading' | 'verifying'
  bytesDone: number
  bytesTotal: number
  shardsDone: number
  shardsTotal: number
}

export type WorkerResponse =
  | ({ id: string; type: 'download-progress' } & WeightProgress)
  | { id: string; type: 'load-progress'; progress: number; text: string }
  | { id: string; type: 'delta'; text: string }
  | { id: string; type: 'result'; value: unknown }
  | { id: string; type: 'error'; message: string; aborted: boolean }
