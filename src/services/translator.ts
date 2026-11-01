import type { EngineSettings, ModelBinding, PerformanceSettings } from '../types/architecture'
import { type SegmentTranslation, detectTagalog, translatePieces } from '../utils/tagalog'
import { AiError, type ChatMessage, generate } from './aiClient'

/**
 * Tagalog → English translation with the active local model (Ollama / WebGPU) or Claude.
 * A short few-shot exchange keeps small 3B models on task: translation only, English kept verbatim,
 * correct construction vocabulary.
 */
export const TRANSLATOR_SYSTEM_PROMPT = [
  'You translate Filipino (Tagalog) and Taglish into clear, professional English for Woodland Construction, a luxury design-and-build firm.',
  'Rules:',
  '- Output ONLY the English translation: no notes, quotes, labels or explanations.',
  '- Keep English words, numbers, measurements, units, product and brand names and proper nouns exactly as written.',
  '- Use correct architecture and construction terms: sala = living room, kusina = kitchen, kwarto/silid = bedroom, banyo = bathroom, hagdan = staircase, bubong = roof, kisame = ceiling, sahig = floor, pader/dingding = wall, bintana = window, pinto = door, haligi/poste = column, pundasyon = foundation, bakal = steel, semento = concrete, kahoy = timber, yero = metal roofing sheet, bakod = perimeter fence, bakuran = yard, garahe = garage, labahan = laundry area, palapag = storey.',
  '- The person the brief is for (kliyente, may-ari) is "The Client".',
  '- Tagalog pronouns (siya, niya, kanya) have no gender: write "The Client" or "they", never "he" or "she".',
  '- Keep the meaning, tone and level of detail. Do not add or remove information.',
  '- If the text asks a question, translate the question; never answer it.',
].join('\n')

const FEW_SHOT: ChatMessage[] = [
  { role: 'user', content: 'Gusto ko ng malaking kusina na bukas sa sala, at tatlong kwarto na may sariling banyo.' },
  { role: 'assistant', content: 'I want a large kitchen that opens to the living room, and three bedrooms, each with its own bathroom.' },
  { role: 'user', content: 'Dapat matibay sa bagyo at baha ang bahay; 2 palapag lang, may solar panels sa bubong.' },
  { role: 'assistant', content: 'The house must withstand typhoons and floods; only 2 storeys, with solar panels on the roof.' },
  // A fragment stays a fragment (no added "I want…").
  { role: 'user', content: 'Malalaking bintana sa harapan, kahoy na sahig sa itaas.' },
  { role: 'assistant', content: 'Large windows at the front, timber floors upstairs.' },
]

export interface TranslateOptions {
  binding: ModelBinding
  settings: PerformanceSettings
  engine: EngineSettings
  signal?: AbortSignal
}

async function translateChunk(chunk: string, opts: TranslateOptions, strict = false): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: TRANSLATOR_SYSTEM_PROMPT },
    ...FEW_SHOT,
    { role: 'user', content: strict ? `${chunk}\n\n(Reply with the English translation only.)` : chunk },
  ]
  return generate(opts.binding, messages, {
    settings: { ...opts.settings, temperature: strict ? 0 : 0.1 },
    engine: opts.engine,
    signal: opts.signal,
    maxTokens: Math.min(1024, Math.ceil(chunk.length / 2) + 96),
  })
}

/** Translate the Tagalog parts of `text`; English parts (and quick-fill chips) are kept exactly. */
export async function translateTagalogText(text: string, opts: TranslateOptions): Promise<SegmentTranslation> {
  return translatePieces(text, async (chunk) => {
    const first = await translateChunk(chunk, opts)
    // Small models occasionally echo the source; ask once more, strictly.
    if (detectTagalog(first).isTagalog) return translateChunk(chunk, opts, true)
    return first
  })
}

/** Translation that needs no model (offline phrasebook only); null when a model is required. */
export async function translateWithPhrasebook(text: string): Promise<SegmentTranslation | null> {
  try {
    return await translatePieces(text, () => Promise.reject(new AiError('model required', 'unavailable')))
  } catch {
    return null
  }
}
