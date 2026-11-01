/** Small, dependency-free text helpers shared by the composer, normaliser and auditor. */

export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** Split free text into list items. Chips are joined with "; ", so ";" and new lines always split. */
export function splitItems(text: string, opts: { commas?: boolean } = {}): string[] {
  if (!text) return []
  const pattern = opts.commas ? /[\n;•]+|,(?![^(]*\))/ : /[\n;•]+/
  return text
    .split(pattern)
    // Strip list markers ("- ", "* ", "1. ", "2) ") but never leading numbers such as "50+ year".
    .map((s) => collapseWhitespace(s.trim().replace(/^(?:[-*+•]\s+|\d{1,2}[.)]\s+)/, '')))
    .filter((s) => s.length > 1)
}

/** Whole-word / word-prefix match: `hasWord('seasonal rain', ['sea'])` is false, `['rain']` is true. */
export function hasWord(haystack: string, stems: string[]): boolean {
  return stems.some((stem) => new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(haystack))
}

/** Join list-like free text ("A; B; C") into one natural phrase ("A, b and c"). */
export function phrase(text: string): string {
  const items = splitItems(text)
  return joinNatural(items.map((s, i) => (i ? lowerFirst(stripTrailingPunctuation(s)) : stripTrailingPunctuation(s))))
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export function lowerFirst(s: string): string {
  if (!s) return s
  // Keep acronyms / proper nouns ("EPDM", "Client") intact.
  if (/^[A-Z]{2,}/.test(s) || /^(The Client|Client)\b/.test(s)) return s
  return s.charAt(0).toLowerCase() + s.slice(1)
}

/** Capitalised sentence ending with a full stop. */
export function sentence(s: string): string {
  const t = collapseWhitespace(s)
  if (!t) return t
  return capitalize(/[.!?]$/.test(t) ? t : `${t}.`)
}

export function stripTrailingPunctuation(s: string): string {
  return collapseWhitespace(s).replace(/[.;,:]+$/, '')
}

/** Natural-language list: "a, b and c". */
export function joinNatural(items: string[]): string {
  const xs = items.filter(Boolean)
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

/** Escape text for a single GFM table cell. */
export function escapeCell(s: string): string {
  return collapseWhitespace(s).replace(/\|/g, '\\|')
}

export function tableRow(cells: readonly string[]): string {
  return `| ${cells.map(escapeCell).join(' | ')} |`
}

export function containsAny(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase()
  return needles.some((n) => h.includes(n))
}

/** cyrb53 — fast, well-distributed 53-bit string hash (hex). Used to bind approvals to exact content. */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

export function uid(prefix = 'id'): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)
  return `${prefix}_${rand}`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '—'
  return `${formatBytes(bytesPerSecond)}/s`
}

export function formatEta(remainingBytes: number, bytesPerSecond: number): string {
  if (bytesPerSecond <= 0 || remainingBytes <= 0) return '—'
  const s = Math.round(remainingBytes / bytesPerSecond)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
