/**
 * Tagalog / Taglish detection and the offline phrasebook used by the translator.
 *
 * Detection is lexical: Tagalog function words (ang, ng, mga, hindi, gusto…) are scored, together
 * with common home/construction vocabulary (kusina, bubong, sahig…). Words that are also ordinary
 * English or Philippine-English ("may", "at", "sala") carry little or no weight, so English text —
 * including every chip, prompt and composed brief sentence in this app — never triggers translation.
 */

/** Function words that are unmistakably Tagalog. */
const STRONG = new Set([
  // particles & markers
  'ang', 'ng', 'nang', 'mga', 'ay', 'nina', 'sina', 'kina', 'naman', 'lamang', 'nga', 'rin', 'daw', 'kasi', 'ngunit', 'kapag', 'upang',
  'dahil', 'yung', 'iyong', 'iyon', 'iyan', 'dito', 'diyan', 'doon', 'hindi', 'huwag', 'wag', 'wala', 'walang', 'meron',
  'mayroon', 'marami', 'lahat', 'bawat', 'ganito', 'ganyan', 'ganoon', 'paano', 'bakit', 'saan', 'kailan', 'sino', 'alin', 'ilan',
  'magkano', 'opo', 'oho', 'talaga', 'siguro', 'sana', 'medyo', 'sobra', 'masyado', 'pinaka', 'tsaka', 'saka', 'pati',
  'kahit', 'habang', 'bago', 'pagkatapos', 'tapos', 'hanggang', 'mula', 'tungkol', 'gaya', 'katulad', 'parang', 'kaysa', 'kesa',
  // pronouns
  'ako', 'ikaw', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'namin', 'natin', 'ninyo', 'nila', 'niya', 'akin', 'amin', 'atin', 'inyo',
  'kanila', 'kanya', 'kaniya', 'nito', 'niyan', 'niyon', 'ating', 'aming', 'inyong', 'kanilang',
  // common verbs / modals
  'gusto', 'ayaw', 'nais', 'kailangan', 'dapat', 'puwede', 'pwede', 'maaari', 'gawin', 'gagawin', 'ginawa', 'gumawa', 'ilagay',
  'lagyan', 'gamitin', 'gagamitin', 'ginamit', 'ayusin', 'palitan', 'idagdag', 'dagdagan', 'tanggalin', 'magkaroon', 'ipatayo',
  'magpatayo', 'itayo', 'tumira', 'titira', 'nakatira', 'makita', 'tingnan', 'alam', 'sabihin', 'iwasan', 'mapanatili', 'panatilihin',
  // numbers
  'isa', 'dalawa', 'tatlo', 'apat', 'lima', 'anim', 'pito', 'walo', 'siyam', 'sampu', 'isang',
  // adjectives
  'maganda', 'malaki', 'maliit', 'maluwag', 'malawak', 'mataas', 'mababa', 'matibay', 'malinis', 'mainit', 'malamig', 'maaliwalas',
  'tahimik', 'mahal', 'mura', 'luma', 'bagong', 'mabilis', 'mabagal', 'madali', 'mahirap', 'maayos', 'ligtas', 'pribado', 'pribadong',
  'sarili', 'maliwanag', 'madilim', 'presko', 'matagal', 'masikip', 'makitid',
])

/** Home / construction vocabulary: clearly Tagalog, but some also appear in Philippine-English. */
const DOMAIN = new Set([
  'bahay', 'kwarto', 'kuwarto', 'silid', 'kusina', 'sala', 'banyo', 'palikuran', 'kubeta', 'bubong', 'bubungan', 'pader', 'dingding',
  'sahig', 'kisame', 'hagdan', 'hagdanan', 'bintana', 'pintuan', 'bakuran', 'bakod', 'tarangkahan', 'garahe', 'paradahan', 'lupa',
  'haligi', 'yero', 'semento', 'kahoy', 'bakal', 'bato', 'salamin', 'ilaw', 'kuryente', 'tubig', 'ulan', 'baha', 'init', 'hangin',
  'bagyo', 'lindol', 'araw', 'gabi', 'pamilya', 'anak', 'magulang', 'bisita', 'kapitbahay', 'gastos', 'presyo', 'buwan', 'taon',
  'linggo', 'palapag', 'harapan', 'likod', 'gilid', 'loob', 'labas', 'tanawin', 'burol', 'bundok', 'dagat', 'ilog', 'puno', 'halaman',
  'hardin', 'lababo', 'aparador', 'kabinet', 'kama', 'mesa', 'upuan', 'kainan', 'tulugan', 'labahan', 'imbakan', 'terasa', 'beranda',
])

/** Short words that are Tagalog but also English abbreviations, names or loanwords. */
const WEAK = new Set(['po', 'ho', 'yan', 'yun', 'sa', 'na', 'si', 'ni', 'kay', 'ka', 'ko', 'mo', 'pa', 'ba', 'din', 'raw', 'lang', 'kung', 'pag', 'para', 'pero', 'may', 'ito', 'iba', 'ibang', 'kaya', 'di', 'oo'])

export interface TagalogDetection {
  isTagalog: boolean
  /** Weighted Tagalog evidence. */
  score: number
  strong: number
  words: number
  /** Share of words that are Tagalog. */
  ratio: number
}

const WORD = /[\p{L}]+/gu

function classify(word: string): 'strong' | 'domain' | 'weak' | null {
  if (STRONG.has(word)) return 'strong'
  if (DOMAIN.has(word)) return 'domain'
  if (WEAK.has(word)) return 'weak'
  // Linker "-ng" on a Tagalog word: malaking, magandang, tatlong, sariling, walang…
  if (word.length > 4 && word.endsWith('ng')) {
    const stem = word.slice(0, -2)
    if (STRONG.has(stem)) return 'strong'
    if (DOMAIN.has(stem)) return 'domain'
  }
  // Reduplicated forms: maliliit, malalaki, bahay-bahay
  if (/^(ma|pa|ka)(\w{2})\2/.test(word) && STRONG.has(`${word.slice(0, 2)}${word.slice(4)}`)) return 'strong'
  return null
}

/**
 * `input` mode (form fields) is sensitive enough to catch short Taglish answers.
 * `document` mode (lines of the finished brief) needs more evidence, so proper nouns such as
 * "Bahay Kubo" in an otherwise English sentence never block approval.
 */
export function detectTagalog(text: string, mode: 'input' | 'document' = 'input'): TagalogDetection {
  const raw = text.match(WORD) ?? []
  // In mixed-case text, all-caps tokens are acronyms (PO = purchase order, NG = natural gas), not Tagalog.
  const mixedCase = /\p{Ll}/u.test(text)
  const words = raw.filter((w) => !(mixedCase && w.length >= 2 && w === w.toUpperCase())).map((w) => w.toLowerCase())
  let score = 0
  let strong = 0
  let hits = 0
  for (const w of words) {
    const kind = classify(w)
    if (!kind) continue
    hits++
    if (kind === 'strong') {
      strong++
      score += 1
    } else score += kind === 'domain' ? 0.75 : 0.4
  }
  const ratio = words.length ? hits / words.length : 0
  let isTagalog: boolean
  if (mode === 'document') isTagalog = words.length >= 4 && strong >= 2 && score >= 3 && ratio >= 0.25
  else if (phrasebookLookup(text) != null) isTagalog = true
  else isTagalog = (score >= 1.4 && strong >= 1 && ratio >= 0.2) || (words.length <= 4 && strong >= 1 && ratio >= 0.5)
  return { isTagalog, score, strong, words: words.length, ratio }
}

/* ------------------------------------------------------------------ */
/* Offline phrasebook (exact short answers — no model needed)          */
/* ------------------------------------------------------------------ */

const PHRASEBOOK: Record<string, string> = {
  oo: 'Yes',
  opo: 'Yes',
  oho: 'Yes',
  hindi: 'No',
  'hindi pa': 'Not yet',
  'hindi na': 'No longer',
  'hindi ko alam': 'I do not know',
  'hindi kailangan': 'Not required',
  'hindi sigurado': 'Not sure',
  wala: 'None',
  'wala pa': 'None yet',
  'wala na': 'None',
  'wala naman': 'None',
  'walang problema': 'No problem',
  meron: 'Yes, there is',
  mayroon: 'Yes, there is',
  'meron na': 'Already in place',
  'mayroon na': 'Already in place',
  siguro: 'Possibly',
  'siguro po': 'Possibly',
  puwede: 'Possibly',
  pwede: 'Possibly',
  'pwede na': 'That works',
  kailangan: 'Required',
  'kailangan talaga': 'Essential',
  sige: 'Agreed',
  tama: 'Correct',
  mali: 'Incorrect',
  depende: 'It depends',
  'ok lang': 'That is fine',
  'okay lang': 'That is fine',
  lahat: 'All of them',
  'lahat po': 'All of them',
  marami: 'Many',
  kaunti: 'A few',
  konti: 'A few',
  'gusto ko': 'I like it',
  'ayaw ko': 'I do not want it',
  'gusto namin': 'We like it',
  'ayaw namin': 'We do not want it',
  'hindi ko gusto': 'I do not like it',
}

function phraseKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Exact translation for very short, common answers ("Oo", "Wala pa po"), or null. */
export function phrasebookLookup(text: string): string | null {
  const key = phraseKey(text)
  if (!key || key.split(' ').length > 4) return null
  if (PHRASEBOOK[key]) return PHRASEBOOK[key]
  // Politeness markers carry no meaning in English.
  const bare = key.replace(/\s+(?:po|ho)$/u, '').replace(/^(?:ah|eh|uhm?)\s+/u, '')
  return PHRASEBOOK[bare] ?? null
}

/* ------------------------------------------------------------------ */
/* Segmenting & translation assembly                                   */
/* ------------------------------------------------------------------ */

export interface TextPiece {
  text: string
  /** Separator that followed this piece in the original ("; ", "\n", " "). */
  sep: string
}

/**
 * Split into chip items (";"), lines and sentences. English pieces (e.g. quick-fill chips) are kept
 * byte-for-byte; only Tagalog pieces are translated.
 */
export function splitPieces(text: string): TextPiece[] {
  const pieces: TextPiece[] = []
  const re = /(;\s*|\n+|(?<=[.!?])\s+)/g
  let last = 0
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0
    pieces.push({ text: text.slice(last, at), sep: m[0] })
    last = at + m[0].length
  }
  pieces.push({ text: text.slice(last), sep: '' })
  return pieces
}

const detectionCache = new Map<string, boolean>()

/** True when any sentence / chip item of the text is Tagalog. Cached: safe to call on every render. */
export function containsTagalog(text: string): boolean {
  if (!text || text.trim().length < 2) return false
  const hit = detectionCache.get(text)
  if (hit != null) return hit
  const result = detectTagalog(text).isTagalog || splitPieces(text).some((p) => detectTagalog(p.text).isTagalog)
  if (detectionCache.size > 500) detectionCache.clear()
  detectionCache.set(text, result)
  return result
}

export interface SegmentTranslation {
  text: string
  /** Number of pieces translated by the model. */
  modelPieces: number
  /** Number of pieces translated from the offline phrasebook. */
  phrasebookPieces: number
  /** True when a translated piece may need review (numbers dropped, Tagalog left over). */
  review: boolean
}

/**
 * Translate every Tagalog piece of `text`, keeping English pieces and separators exactly.
 * Consecutive Tagalog sentences are sent together so the model keeps their context.
 */
export async function translatePieces(text: string, translateChunk: (chunk: string) => Promise<string>): Promise<SegmentTranslation> {
  let pieces = splitPieces(text)
  // Tagalog spread thinly across several sentences: translate the text as one chunk.
  if (!pieces.some((p) => detectTagalog(p.text).isTagalog) && detectTagalog(text).isTagalog) pieces = [{ text, sep: '' }]
  const out: string[] = []
  let modelPieces = 0
  let phrasebookPieces = 0
  let review = false
  let i = 0
  while (i < pieces.length) {
    const piece = pieces[i]!
    if (!detectTagalog(piece.text).isTagalog) {
      out.push(piece.text + piece.sep)
      i++
      continue
    }
    // Group following Tagalog sentences that are joined by plain spaces (same paragraph / chip item).
    let j = i
    let chunk = piece.text
    while (j + 1 < pieces.length && /^ +$/.test(pieces[j]!.sep) && detectTagalog(pieces[j + 1]!.text).isTagalog) {
      chunk += pieces[j]!.sep + pieces[j + 1]!.text
      j++
    }
    const lead = chunk.match(/^\s*/)?.[0] ?? ''
    const trail = chunk.match(/\s*$/)?.[0] ?? ''
    const core = chunk.trim()
    const fromBook = phrasebookLookup(core)
    let english: string
    if (fromBook) {
      english = fromBook
      phrasebookPieces++
    } else {
      english = cleanTranslation(await translateChunk(core), core)
      modelPieces++
      if (!english) throw new Error('The model returned an empty translation.')
      if (needsReview(core, english)) review = true
    }
    out.push(lead + english + trail + pieces[j]!.sep)
    i = j + 1
  }
  return { text: out.join(''), modelPieces, phrasebookPieces, review }
}

/** Strip the wrappers small models add around a translation ("Translation:", quotes, notes). */
export function cleanTranslation(raw: string, source: string): string {
  let t = raw.replace(/\r/g, '').trim()
  t = t.replace(/^```[\w-]*\n?/, '').replace(/\n?```$/, '').trim()
  t = t.replace(/^(?:sure[,!.]?\s*)?(?:here(?:'s| is) (?:the |your )?(?:english )?translation[^:\n]*:|(?:english(?: translation)?|translation|in english)\s*:)\s*/i, '')
  // Trailing translator notes.
  t = t.replace(/\n+\s*\(?(?:note|translator['’]?s? note|explanation)\b[\s\S]*$/i, '').trim()
  const quoted = /^["“'](?:[^"“”']|['’](?=\w))*["”']$/s
  if (quoted.test(t) && !/^["“']/.test(source)) t = t.slice(1, -1).trim()
  // A single-line source should yield a single paragraph.
  if (!source.includes('\n')) t = t.split(/\n\s*\n/)[0]!.replace(/\s*\n\s*/g, ' ').trim()
  return t
}

/* ------------------------------------------------------------------ */
/* Markdown documents (the drafted brief)                              */
/* ------------------------------------------------------------------ */

const STRUCTURAL_LINE = /^\s*(?:#|\|?\s*:?-{3,})/

/** Lines of a Markdown document that are written in Tagalog (headings and table rules are skipped). */
export function findTagalogLines(markdown: string): Array<{ index: number; line: string }> {
  const out: Array<{ index: number; line: string }> = []
  markdown.split('\n').forEach((line, index) => {
    if (!line.trim() || STRUCTURAL_LINE.test(line)) return
    if (detectTagalog(line.replace(/\*\*|__|`/g, ''), 'document').isTagalog) out.push({ index, line })
  })
  return out
}

/** Translate every Tagalog line of a Markdown document, keeping list markers, bold labels and table cells. */
export async function translateTagalogLines(markdown: string, translate: (text: string) => Promise<string>): Promise<string> {
  const lines = markdown.split('\n')
  for (const { index, line } of findTagalogLines(markdown)) {
    if (/^\s*\|/.test(line)) {
      const cells = line.split(/(?<!\\)\|/)
      const inner = cells.slice(1, -1)
      let picks = inner.map((c, i) => (containsTagalog(c) ? i : -1)).filter((i) => i >= 0)
      if (!picks.length) picks = inner.map((c, i) => (detectTagalog(c).score >= 1 ? i : -1)).filter((i) => i >= 0)
      for (const i of picks) cells[i + 1] = ` ${(await translate(inner[i]!.trim())).replace(/\s*\n\s*/g, ' ').replace(/(?<!\\)\|/g, '\\|')} `
      lines[index] = cells.join('|')
      continue
    }
    const m = line.match(/^(\s*(?:[-*+]|\d+[.)]|>)\s+)?((?:\*\*|__)[^*_]+(?:\*\*|__):?\s*)?([\s\S]*)$/)
    const [, prefix = '', label = '', rest = line] = m ?? []
    lines[index] = prefix + label + (await translate(rest)).replace(/\s*\n\s*/g, ' ')
  }
  return lines.join('\n')
}

function needsReview(source: string, english: string): boolean {
  const numbers = source.match(/\d+(?:[.,]\d+)?/g) ?? []
  if (numbers.some((n) => !english.includes(n))) return true
  if (detectTagalog(english).isTagalog) return true
  const ratio = english.length / Math.max(1, source.length)
  return ratio < 0.35 || ratio > 3
}
