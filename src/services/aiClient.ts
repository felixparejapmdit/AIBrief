import {
  IMAGE_ANALYSIS_SCHEMA,
  IMAGE_ANALYST_SYSTEM_PROMPT,
  VIP_SYSTEM_PROMPT_COMPACT,
  followUpPrompt,
  imageAnalysisPrompt,
} from '../constants/vipSkillPrompt'
import type {
  DesignPrinciple,
  EngineSettings,
  ImageAnalysis,
  IntakeImage,
  ModelBinding,
  PerformanceSettings,
} from '../types/architecture'
import { DESIGN_PRINCIPLES } from '../types/architecture'
import { normalizeClientReferences, sanitizeForbiddenTerms } from '../utils/complianceAuditor'
import { analyzeFromMetadata, describeMetadata, prepareForModel } from '../utils/imageProcessing'
import { friendlyWebGpuError, trimBaseUrl } from './modelDownloader'
import { webllmChat } from './webllmBridge'
import type { WebLlmMessage } from './webllmProtocol'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  /** data: URLs (JPEG/PNG) */
  images?: string[]
}

export interface GenerateOptions {
  settings: PerformanceSettings
  engine: EngineSettings
  signal?: AbortSignal
  onToken?: (delta: string) => void
  onStatus?: (text: string) => void
  /** JSON schema for structured output (Ollama `format`, Claude `output_config.format`). */
  jsonSchema?: Record<string, unknown>
  maxTokens?: number
}

export type AiErrorKind = 'aborted' | 'unavailable' | 'refused' | 'auth' | 'rate-limit' | 'failed'

export class AiError extends Error {
  readonly kind: AiErrorKind

  constructor(message: string, kind: AiErrorKind = 'failed') {
    super(message)
    this.kind = kind
    this.name = kind === 'aborted' ? 'AbortError' : 'AiError'
  }
}

export function isAborted(err: unknown): boolean {
  return (err instanceof AiError && err.kind === 'aborted') || (err instanceof Error && err.name === 'AbortError')
}

export function describeBinding(b: ModelBinding | null): string {
  if (!b) return 'none'
  const engine = b.engine === 'ollama' ? 'Ollama' : b.engine === 'webllm' ? 'WebGPU' : 'Claude'
  return `${b.model} · ${engine}`
}

const stripDataUrl = (url: string) => url.replace(/^data:[^;]+;base64,/, '')
const mediaTypeOf = (url: string) => (url.match(/^data:([^;]+);/)?.[1] ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

/* ------------------------------------------------------------------ */
/* Ollama                                                              */
/* ------------------------------------------------------------------ */

const capabilityCache = new Map<string, string[]>()

export async function ollamaCapabilities(baseUrl: string, model: string): Promise<string[]> {
  const key = `${trimBaseUrl(baseUrl)}|${model}`
  const cached = capabilityCache.get(key)
  if (cached) return cached
  try {
    const res = await fetch(`${trimBaseUrl(baseUrl)}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    })
    if (!res.ok) return []
    const json = (await res.json()) as { capabilities?: string[]; details?: { families?: string[] }; projector_info?: unknown }
    const caps = json.capabilities ?? (json.projector_info ? ['completion', 'vision'] : ['completion'])
    capabilityCache.set(key, caps)
    return caps
  } catch {
    return []
  }
}

async function ollamaGenerate(binding: ModelBinding, messages: ChatMessage[], opts: GenerateOptions, allowGpuOffload = true, attempt = 1): Promise<string> {
  const base = trimBaseUrl(opts.engine.ollamaBaseUrl)
  const startedAt = Date.now()
  const caps = await ollamaCapabilities(base, binding.model)
  const options: Record<string, number> = {
    temperature: opts.settings.temperature,
    num_ctx: opts.settings.contextWindow,
    num_predict: opts.maxTokens ?? opts.settings.maxTokens,
  }
  if (allowGpuOffload && opts.settings.gpuOffloadPercent === 100) options.num_gpu = 999
  const body: Record<string, unknown> = {
    model: binding.model,
    stream: true,
    keep_alive: '15m',
    options,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.images?.length ? { images: m.images.map(stripDataUrl) } : {}),
    })),
  }
  if (opts.jsonSchema) body.format = opts.jsonSchema
  if (caps.includes('thinking')) body.think = false

  let res: Response
  try {
    res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    })
  } catch (err) {
    if (opts.signal?.aborted) throw new AiError('Generation cancelled.', 'aborted')
    // Ollama only sends response headers once the model is loaded. A connection that drops after a
    // long wait means the server was reachable but the load stalled (typically low memory) — not that
    // Ollama is offline. Retry once (the model may now be resident), then explain what happened.
    if (Date.now() - startedAt > 10_000) {
      if (attempt === 1) {
        opts.onStatus?.(`Ollama is still loading ${binding.model} — retrying…`)
        return ollamaGenerate(binding, messages, opts, allowGpuOffload, 2)
      }
      throw new AiError(
        `Ollama stopped responding while loading "${binding.model}" — this machine may be low on memory. Close other heavy apps or choose a lighter tier in Setup, then retry.`,
        'unavailable',
      )
    }
    throw new AiError(`Ollama is not reachable at ${base}. Start Ollama and try again. (${err instanceof Error ? err.message : String(err)})`, 'unavailable')
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    const message = (() => {
      try {
        return (JSON.parse(text) as { error?: string }).error ?? text
      } catch {
        return text
      }
    })()
    if (allowGpuOffload && options.num_gpu && /memory|out of|cuda|metal|allocate/i.test(message)) {
      opts.onStatus?.('Not enough VRAM for full GPU offload — retrying with automatic layer placement…')
      return ollamaGenerate(binding, messages, opts, false)
    }
    if (res.status === 404) throw new AiError(`Model "${binding.model}" is not installed in Ollama. Use Setup & Model Download to pull it.`, 'unavailable')
    throw new AiError(`Ollama error (HTTP ${res.status}): ${message || 'unknown error'}`)
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let full = ''
  const handle = (line: string) => {
    const msg = JSON.parse(line) as { message?: { content?: string }; error?: string }
    if (msg.error) throw new AiError(`Ollama: ${msg.error}`)
    const delta = msg.message?.content ?? ''
    if (delta) {
      full += delta
      opts.onToken?.(delta)
    }
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += value
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (line) handle(line)
      }
    }
    if (buffer.trim()) handle(buffer.trim())
  } catch (err) {
    if (opts.signal?.aborted) throw new AiError('Generation cancelled.', 'aborted')
    throw err
  }
  return full
}

/* ------------------------------------------------------------------ */
/* WebLLM (WebGPU, in a worker)                                        */
/* ------------------------------------------------------------------ */

async function webllmGenerate(binding: ModelBinding, messages: ChatMessage[], opts: GenerateOptions): Promise<string> {
  const converted: WebLlmMessage[] = messages.map((m) => {
    if (m.role === 'user' && m.images?.length && binding.vision) {
      // Phi-3.5-vision takes one image per turn within a 4K context; use the overview image.
      return { role: 'user', content: [{ type: 'image_url', image_url: { url: m.images[0]! } }, { type: 'text', text: m.content }] }
    }
    return { role: m.role, content: m.content }
  })
  try {
    return await webllmChat({
      modelId: binding.model,
      contextWindow: opts.settings.contextWindow,
      messages: converted,
      temperature: opts.settings.temperature,
      maxTokens: opts.maxTokens ?? opts.settings.maxTokens,
      signal: opts.signal,
      onDelta: opts.onToken,
      onLoadProgress: (p, text) => opts.onStatus?.(`Loading ${binding.model} onto the GPU — ${Math.round(p * 100)}% · ${text.split('. It can take')[0]}`),
    })
  } catch (err) {
    if (opts.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) throw new AiError('Generation cancelled.', 'aborted')
    const raw = err instanceof Error ? err.message : String(err)
    const message = friendlyWebGpuError(raw)
    if (message !== raw || /webgpu/i.test(raw)) throw new AiError(message === raw ? `WebGPU is unavailable in this browser: ${raw}` : message, 'unavailable')
    throw new AiError(`WebGPU engine error: ${raw}`)
  }
}

/* ------------------------------------------------------------------ */
/* Claude (optional cloud fallback, user-supplied API key)              */
/* ------------------------------------------------------------------ */

async function cloudGenerate(binding: ModelBinding, messages: ChatMessage[], opts: GenerateOptions): Promise<string> {
  if (!opts.engine.cloudApiKey.trim()) throw new AiError('Add an Anthropic API key in Setup to use the cloud fallback.', 'auth')
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: opts.engine.cloudApiKey.trim(), dangerouslyAllowBrowser: true, maxRetries: 2 })
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const turns = messages
    .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } => m.role !== 'system')
    .map((m) => ({
      role: m.role,
      content: m.images?.length
        ? [
            ...m.images.map((img) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: mediaTypeOf(img), data: stripDataUrl(img) } })),
            { type: 'text' as const, text: m.content },
          ]
        : m.content,
    }))
  try {
    const stream = client.beta.messages.stream(
      {
        model: binding.model,
        // Thinking is adaptive on current Claude models and counts toward max_tokens, so leave headroom.
        max_tokens: 16000,
        system,
        messages: turns,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: {
          effort: 'medium',
          ...(opts.jsonSchema ? { format: { type: 'json_schema' as const, schema: opts.jsonSchema } } : {}),
        },
      },
      { signal: opts.signal },
    )
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') opts.onToken?.(event.delta.text)
    }
    const final = await stream.finalMessage()
    if (final.stop_reason === 'refusal') {
      throw new AiError('Claude declined this request. Rephrase the input or use a local model.', 'refused')
    }
    return final.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  } catch (err) {
    if (err instanceof AiError) throw err
    if (opts.signal?.aborted) throw new AiError('Generation cancelled.', 'aborted')
    if (err instanceof Anthropic.AuthenticationError) throw new AiError('The Anthropic API key was rejected.', 'auth')
    if (err instanceof Anthropic.PermissionDeniedError) throw new AiError('This API key does not have access to the selected model.', 'auth')
    if (err instanceof Anthropic.RateLimitError) throw new AiError('Anthropic rate limit reached — wait a moment and retry.', 'rate-limit')
    if (err instanceof Anthropic.APIConnectionError) throw new AiError('Could not reach the Anthropic API (offline?).', 'unavailable')
    if (err instanceof Anthropic.APIError) throw new AiError(`Anthropic API error ${err.status ?? ''}: ${err.message}`)
    throw new AiError(err instanceof Error ? err.message : String(err))
  }
}

/* ------------------------------------------------------------------ */
/* Public entry points                                                 */
/* ------------------------------------------------------------------ */

export function generate(binding: ModelBinding, messages: ChatMessage[], opts: GenerateOptions): Promise<string> {
  switch (binding.engine) {
    case 'ollama':
      return ollamaGenerate(binding, messages, opts)
    case 'webllm':
      return webllmGenerate(binding, messages, opts)
    case 'cloud':
      return cloudGenerate(binding, messages, opts)
  }
}

function guard(text: string): string {
  return normalizeClientReferences(sanitizeForbiddenTerms(text, 'guests').text).text
}

function toStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => guard(String(x ?? '').trim())).filter(Boolean).slice(0, 6)
  if (typeof v === 'string' && v.trim()) return v.split(/(?<=[.!?])\s+|\n+/).map((s) => guard(s.trim())).filter(Boolean).slice(0, 6)
  return []
}

export function parseAnalysisJson(raw: string): Omit<ImageAnalysis, 'producedBy' | 'mode' | 'analyzedAt'> | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
  const principlesIn = (obj.designPrinciples ?? {}) as Record<string, unknown>
  const designPrinciples: Partial<Record<DesignPrinciple, string>> = {}
  for (const p of DESIGN_PRINCIPLES) {
    const val = principlesIn[p] ?? principlesIn[p.toLowerCase()]
    if (typeof val === 'string' && val.trim()) designPrinciples[p] = guard(val.trim())
  }
  const result = {
    summary: guard(String(obj.summary ?? '').trim()),
    styleAndSpatialFlow: toStringList(obj.styleAndSpatialFlow),
    materialBuildUps: toStringList(obj.materialBuildUps),
    constructabilityNotes: toStringList(obj.constructabilityNotes),
    designPrinciples,
  }
  const hasContent = result.summary || result.styleAndSpatialFlow.length || result.materialBuildUps.length || result.constructabilityNotes.length
  return hasContent ? result : null
}

/** Analyse one intake image with the active vision model (or the best available fallback). */
export async function analyzeImage(params: {
  image: IntakeImage
  blob: Blob | null
  objective: string
  settings: PerformanceSettings
  engine: EngineSettings
  signal?: AbortSignal
  onToken?: (delta: string) => void
}): Promise<ImageAnalysis> {
  const { image, blob, settings, engine } = params
  const vision = engine.vision?.vision ? engine.vision : null
  const text = engine.text
  const now = () => new Date().toISOString()
  const metadataFallback = analyzeFromMetadata(image)

  if (vision && blob) {
    const tiled =
      settings.highDetailTiling && image.category === 'shop-drawing' && vision.engine !== 'webllm' && !/moondream/i.test(vision.model)
    const images = await prepareForModel(blob, settings.imageResolution, tiled)
    const raw = await generate(
      vision,
      [
        { role: 'system', content: IMAGE_ANALYST_SYSTEM_PROMPT },
        {
          role: 'user',
          content: imageAnalysisPrompt({ category: image.category, objective: params.objective, notes: image.notes, tiled, metadataOnly: null }),
          images: vision.engine === 'webllm' ? images.slice(0, 1) : images,
        },
      ],
      { settings, engine, signal: params.signal, onToken: params.onToken, jsonSchema: vision.engine === 'webllm' ? undefined : (IMAGE_ANALYSIS_SCHEMA as unknown as Record<string, unknown>), maxTokens: Math.min(settings.maxTokens, 900) },
    )
    const parsed = parseAnalysisJson(raw)
    const tag = `${describeBinding(vision)}${tiled ? ' · 2×2 high-detail tiles' : ''}`
    if (parsed) {
      return {
        ...metadataFallback,
        ...parsed,
        designPrinciples: { ...metadataFallback.designPrinciples, ...parsed.designPrinciples },
        styleAndSpatialFlow: parsed.styleAndSpatialFlow.length ? parsed.styleAndSpatialFlow : metadataFallback.styleAndSpatialFlow,
        materialBuildUps: parsed.materialBuildUps.length ? parsed.materialBuildUps : metadataFallback.materialBuildUps,
        constructabilityNotes: parsed.constructabilityNotes.length ? parsed.constructabilityNotes : metadataFallback.constructabilityNotes,
        summary: parsed.summary || metadataFallback.summary,
        producedBy: tag,
        mode: 'vision',
        analyzedAt: now(),
      }
    }
    const prose = guard(raw.replace(/\s+/g, ' ').trim()).slice(0, 280)
    return { ...metadataFallback, summary: prose || metadataFallback.summary, producedBy: `${tag} (unstructured reply)`, mode: 'vision', analyzedAt: now() }
  }

  if (text) {
    const raw = await generate(
      text,
      [
        { role: 'system', content: IMAGE_ANALYST_SYSTEM_PROMPT },
        {
          role: 'user',
          content: imageAnalysisPrompt({ category: image.category, objective: params.objective, notes: image.notes, tiled: false, metadataOnly: describeMetadata(image) }),
        },
      ],
      { settings, engine, signal: params.signal, onToken: params.onToken, jsonSchema: text.engine === 'webllm' ? undefined : (IMAGE_ANALYSIS_SCHEMA as unknown as Record<string, unknown>), maxTokens: Math.min(settings.maxTokens, 700) },
    )
    const parsed = parseAnalysisJson(raw)
    if (parsed) {
      return {
        ...metadataFallback,
        ...parsed,
        designPrinciples: { ...metadataFallback.designPrinciples, ...parsed.designPrinciples },
        producedBy: `${describeBinding(text)} · metadata only (no vision model)`,
        mode: 'metadata',
        analyzedAt: now(),
      }
    }
  }
  return metadataFallback
}

/** One AI-suggested follow-up question for the current interview pillar. */
export async function suggestFollowUp(params: {
  pillarTitle: string
  answered: string
  settings: PerformanceSettings
  engine: EngineSettings
  signal?: AbortSignal
}): Promise<string> {
  const binding = params.engine.text ?? params.engine.vision
  if (!binding) throw new AiError('Configure a model in Setup to get AI follow-up questions.', 'unavailable')
  const raw = await generate(
    binding,
    [
      { role: 'system', content: VIP_SYSTEM_PROMPT_COMPACT },
      { role: 'user', content: followUpPrompt(params.pillarTitle, params.answered) },
    ],
    { settings: params.settings, engine: params.engine, signal: params.signal, maxTokens: 120 },
  )
  const line = raw
    .split('\n')
    .map((l) => l.replace(/^[-*\d.)\s"“]+|["”]+$/g, '').trim())
    .find((l) => l.length > 8)
  if (!line) throw new AiError('The model did not return a usable question — try again.')
  const q = guard(line)
  return /\?$/.test(q) ? q : `${q.replace(/[.!]+$/, '')}?`
}
