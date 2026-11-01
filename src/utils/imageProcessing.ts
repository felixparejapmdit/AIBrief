import { IMAGE_CATEGORY_LABELS } from '../constants/vipSkillPrompt'
import type { ImageAnalysis, ImageCategory, ImageStats, IntakeImage } from '../types/architecture'
import { DESIGN_PRINCIPLES } from '../types/architecture'

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif']
export const MAX_IMAGE_BYTES = 40 * 1024 * 1024

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement
type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

function makeCanvas(w: number, h: number): { canvas: AnyCanvas; ctx: Ctx2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx) return { canvas, ctx }
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas is not available.')
  return { canvas, ctx }
}

async function canvasToBlob(canvas: AnyCanvas, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality })
  return new Promise((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas encode failed.'))), type, quality),
  )
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'))
    reader.readAsDataURL(blob)
  })
}

export function guessCategory(name: string): ImageCategory | null {
  const n = name.toLowerCase()
  if (/shop|detail|section|elevation|plan|dwg|drawing|sheet|\bsd[-_ ]?\d|\ba\d{3}\b|cad/.test(n)) return 'shop-drawing'
  if (/render|sketchup|skp|viz|3d|enscape|vray|lumion|twinmotion/.test(n)) return 'sketchup-render'
  if (/peg|mood|inspo|inspiration|reference|ref[-_ ]|pinterest|precedent/.test(n)) return 'design-peg'
  if (/site|photo|img_|dsc|pxl_|survey|existing|drone/.test(n)) return 'site-photo'
  return null
}

/* ------------------------------------------------------------------ */
/* Colour helpers                                                      */
/* ------------------------------------------------------------------ */

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s, l]
}

export function colorName(hex: string): string {
  const v = Number.parseInt(hex.slice(1), 16)
  const [h, s, l] = rgbToHsl((v >> 16) & 255, (v >> 8) & 255, v & 255)
  if (s < 0.12 || l < 0.08 || l > 0.94) {
    if (l < 0.12) return 'near-black'
    if (l < 0.3) return 'charcoal'
    if (l < 0.55) return 'mid grey'
    if (l < 0.82) return 'light grey'
    return 'off-white'
  }
  const tone = l < 0.3 ? 'deep ' : l > 0.72 ? 'pale ' : ''
  const hue =
    h < 15 || h >= 345 ? 'red' :
    h < 40 ? (s < 0.45 ? 'terracotta' : 'orange') :
    h < 55 ? (s < 0.45 ? 'sand' : 'ochre') :
    h < 70 ? 'yellow' :
    h < 160 ? (s < 0.35 ? 'sage' : 'green') :
    h < 200 ? 'teal' :
    h < 255 ? (s < 0.3 ? 'slate blue' : 'blue') :
    h < 290 ? 'violet' : 'rose'
  return `${tone}${hue}`
}

/* ------------------------------------------------------------------ */
/* Upload processing                                                   */
/* ------------------------------------------------------------------ */

export interface ProcessedUpload {
  width: number
  height: number
  thumbnail: string
  palette: string[]
  stats: ImageStats
}

const GRID = 48

function computeStats(data: Uint8ClampedArray): { stats: ImageStats; palette: string[] } {
  const lum = new Float32Array(GRID * GRID)
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  let satSum = 0
  for (let i = 0; i < GRID * GRID; i++) {
    const r = data[i * 4] ?? 0
    const g = data[i * 4 + 1] ?? 0
    const b = data[i * 4 + 2] ?? 0
    lum[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    satSum += rgbToHsl(r, g, b)[1]
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    bucket.n++
    bucket.r += r
    bucket.g += g
    bucket.b += b
    buckets.set(key, bucket)
  }
  const n = lum.length
  const mean = lum.reduce((a, x) => a + x, 0) / n
  const contrast = Math.sqrt(lum.reduce((a, x) => a + (x - mean) ** 2, 0) / n)
  let mirrorDiff = 0
  let hEnergy = 0
  let vEnergy = 0
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const v = lum[y * GRID + x] ?? 0
      if (x < GRID / 2) mirrorDiff += Math.abs(v - (lum[y * GRID + (GRID - 1 - x)] ?? 0))
      if (x + 1 < GRID) vEnergy += Math.abs(v - (lum[y * GRID + x + 1] ?? 0)) // change along x = vertical edges
      if (y + 1 < GRID) hEnergy += Math.abs(v - (lum[(y + 1) * GRID + x] ?? 0)) // change along y = horizontal edges
    }
  }
  const symmetry = Math.max(0, 1 - mirrorDiff / ((GRID * GRID) / 2) / 0.5)
  const palette = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map((b) => toHex(b.r / b.n, b.g / b.n, b.b / b.n))
    .filter((hex, i, arr) => arr.findIndex((h) => colorName(h) === colorName(hex)) === i)
    .slice(0, 5)
  return {
    palette,
    stats: {
      luminanceMean: round(mean),
      contrast: round(contrast),
      symmetry: round(symmetry),
      horizontalBias: round(hEnergy + vEnergy > 0 ? hEnergy / (hEnergy + vEnergy) : 0.5),
      colorfulness: round(satSum / n),
    },
  }
}

const round = (x: number) => Math.round(x * 1000) / 1000

export async function processUpload(file: Blob): Promise<ProcessedUpload> {
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = bitmap
    // Thumbnail (fixed 4:3 cover crop keeps card heights stable — no layout shift).
    const tw = 480
    const th = 360
    const { canvas: tc, ctx: tctx } = makeCanvas(tw, th)
    const scale = Math.max(tw / width, th / height)
    const dw = width * scale
    const dh = height * scale
    tctx.fillStyle = '#111418'
    tctx.fillRect(0, 0, tw, th)
    tctx.drawImage(bitmap, (tw - dw) / 2, (th - dh) / 2, dw, dh)
    const thumbnail = await blobToDataUrl(await canvasToBlob(tc, 'image/jpeg', 0.82))
    // Statistics grid.
    const { ctx: gctx } = makeCanvas(GRID, GRID)
    gctx.drawImage(bitmap, 0, 0, GRID, GRID)
    const { stats, palette } = computeStats(gctx.getImageData(0, 0, GRID, GRID).data)
    return { width, height, thumbnail, palette, stats }
  } finally {
    bitmap.close()
  }
}

/**
 * Downscale an image to the configured long-edge resolution for inference.
 * With `tiled`, also returns four high-detail quadrants (for technical shop drawings).
 */
export async function prepareForModel(blob: Blob, maxEdge: number, tiled: boolean): Promise<string[]> {
  const bitmap = await createImageBitmap(blob)
  try {
    const encode = async (sx: number, sy: number, sw: number, sh: number) => {
      const scale = Math.min(1, maxEdge / Math.max(sw, sh))
      const w = Math.max(1, Math.round(sw * scale))
      const h = Math.max(1, Math.round(sh * scale))
      const { canvas, ctx } = makeCanvas(w, h)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h)
      return blobToDataUrl(await canvasToBlob(canvas, 'image/jpeg', 0.9))
    }
    const { width: W, height: H } = bitmap
    const out = [await encode(0, 0, W, H)]
    if (tiled) {
      const hw = Math.ceil(W / 2)
      const hh = Math.ceil(H / 2)
      for (const [x, y] of [[0, 0], [W - hw, 0], [0, H - hh], [W - hw, H - hh]] as const) out.push(await encode(x, y, hw, hh))
    }
    return out
  } finally {
    bitmap.close()
  }
}

/* ------------------------------------------------------------------ */
/* Metadata description & deterministic analysis (no vision model)     */
/* ------------------------------------------------------------------ */

function orientation(w: number, h: number): string {
  const r = w / h
  if (r > 1.9) return 'panoramic'
  if (r > 1.15) return 'landscape'
  if (r < 0.87) return 'portrait'
  return 'square'
}

export function describeMetadata(image: Pick<IntakeImage, 'name' | 'category' | 'width' | 'height' | 'palette' | 'stats' | 'notes'>): string {
  const s = image.stats
  return [
    `File: ${image.name} — ${IMAGE_CATEGORY_LABELS[image.category]}`,
    `Size: ${image.width}×${image.height}px (${orientation(image.width, image.height)})`,
    `Dominant colours: ${image.palette.map(colorName).join(', ') || 'unknown'}`,
    `Tonal contrast: ${s.contrast < 0.12 ? 'low' : s.contrast < 0.22 ? 'moderate' : 'high'}; brightness ${s.luminanceMean < 0.35 ? 'dark' : s.luminanceMean > 0.65 ? 'bright' : 'mid'}`,
    `Left/right symmetry: ${Math.round(s.symmetry * 100)}%; edge emphasis: ${s.horizontalBias > 0.56 ? 'horizontal' : s.horizontalBias < 0.44 ? 'vertical' : 'balanced'}`,
    `Colourfulness: ${s.colorfulness < 0.15 ? 'muted' : s.colorfulness < 0.35 ? 'natural' : 'vivid'}`,
    image.notes ? `Notes: ${image.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

const MATERIAL_WORDS: Array<[RegExp, string]> = [
  [/alumin/i, 'Aluminum framing or grid elements noted — confirm thermal breaks and finish class.'],
  [/epdm|membrane/i, 'EPDM / membrane build-up noted — confirm laps, upstands and isolation pads.'],
  [/steel/i, 'Steel elements noted — confirm corrosion protection and fire rating.'],
  [/timber|wood|oak|clt/i, 'Timber elements noted — confirm species, moisture content and finish.'],
  [/stone|marble|granite|travertine/i, 'Natural stone noted — confirm sealing, fixings and slip rating.'],
  [/glass|glazing/i, 'Glazing noted — confirm solar control, safety glass and sightlines.'],
  [/concrete|slab/i, 'Concrete elements noted — confirm finish class and movement joints.'],
]

const CATEGORY_CONSTRUCTABILITY: Record<ImageCategory, string[]> = {
  'site-photo': ['Verify levels, access routes and laydown space on the site visit.', 'Record existing services and features to be protected during works.'],
  'sketchup-render': ['Translate rendered junctions into buildable 1:5 details before pricing.', 'Confirm that rendered finishes have specified, low-VOC equivalents.'],
  'shop-drawing': ['Check dimensions against the latest revision before fabrication.', 'Confirm tolerances and fixings at every interface shown on the sheet.'],
  'design-peg': ['Treat the peg as design intent; source buildable, durable equivalents.', 'Mock up key finishes for The Client’s approval before ordering.'],
}

/** Deterministic, on-device analysis used when no vision model is configured. */
export function analyzeFromMetadata(image: IntakeImage, producedBy = 'On-device image statistics'): ImageAnalysis {
  const s = image.stats
  const colours = image.palette.map(colorName)
  const warm = colours.some((c) => /terracotta|orange|ochre|sand|red|rose|yellow/.test(c))
  const notes = image.notes ?? ''
  const label = IMAGE_CATEGORY_LABELS[image.category]
  const orient = orientation(image.width, image.height)
  const emphasis = s.horizontalBias > 0.56 ? 'horizontal' : s.horizontalBias < 0.44 ? 'vertical' : 'balanced'
  const materials = MATERIAL_WORDS.filter(([re]) => re.test(notes)).map(([, text]) => text)
  if (!materials.length) {
    materials.push(
      warm
        ? 'Warm mid-tones suggest timber, terracotta or bronze finishes — confirm on site.'
        : 'Cool, neutral tones suggest stone, concrete, metal or glass — confirm on site.',
    )
  }
  const principles: ImageAnalysis['designPrinciples'] = {
    Emphasis: s.contrast > 0.2 ? 'Strong tonal contrast creates clear focal points.' : 'Soft tonal range — emphasis must come from form or light.',
    Balance: s.symmetry > 0.75 ? `Near-symmetrical composition (${Math.round(s.symmetry * 100)}% mirror similarity).` : `Asymmetrical composition (${Math.round(s.symmetry * 100)}% mirror similarity) — balance through massing.`,
    Unity: colours.length <= 3 ? 'A tight palette reads as unified.' : 'A broad palette — unify with a dominant material.',
    Contrast: s.contrast > 0.2 ? 'High light/dark contrast.' : s.contrast > 0.12 ? 'Moderate contrast.' : 'Low contrast, calm tonal field.',
    Rhythm: `${emphasis === 'balanced' ? 'Even' : emphasis.charAt(0).toUpperCase() + emphasis.slice(1)} edge emphasis suggests ${emphasis === 'horizontal' ? 'layered, horizontal bands' : emphasis === 'vertical' ? 'repeated vertical elements' : 'a mixed grid'}.`,
    Proportion: `${orient.charAt(0).toUpperCase() + orient.slice(1)} frame (${image.width}×${image.height}px).`,
    Variety: s.colorfulness > 0.35 ? 'Vivid colour adds variety — use sparingly.' : 'Muted colour keeps variety in texture rather than hue.',
  }
  for (const p of DESIGN_PRINCIPLES) principles[p] ??= ''
  return {
    summary: `${label} in a ${orient} format with a ${colours.slice(0, 3).join(', ') || 'neutral'} palette${notes ? `; notes: ${notes}` : ''}.`,
    styleAndSpatialFlow: [
      `${emphasis === 'horizontal' ? 'Horizontal, grounded' : emphasis === 'vertical' ? 'Vertical, upward' : 'Balanced'} visual emphasis.`,
      `Overall tone is ${s.luminanceMean < 0.35 ? 'dark and enclosed' : s.luminanceMean > 0.65 ? 'bright and open' : 'mid-tone and calm'}.`,
    ],
    materialBuildUps: materials,
    constructabilityNotes: CATEGORY_CONSTRUCTABILITY[image.category],
    designPrinciples: principles,
    producedBy,
    mode: 'metadata',
    analyzedAt: new Date().toISOString(),
  }
}
