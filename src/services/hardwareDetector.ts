import type {
  CpuArch,
  GpuClass,
  GpuInfo,
  GpuVendor,
  MachineSpecs,
  OsInfo,
  StorageInfo,
  WebGpuInfo,
} from '../types/architecture'

/* ------------------------------------------------------------------ */
/* Minimal typings for browser APIs not (uniformly) in lib.dom          */
/* ------------------------------------------------------------------ */

interface UaBrand {
  brand: string
  version: string
}
interface UaHighEntropy {
  platform?: string
  platformVersion?: string
  architecture?: string
  bitness?: string
  model?: string
  fullVersionList?: UaBrand[]
}
interface UaData {
  brands: UaBrand[]
  mobile: boolean
  platform: string
  getHighEntropyValues(hints: string[]): Promise<UaHighEntropy>
}
interface GpuAdapterInfoLike {
  vendor?: string
  architecture?: string
  device?: string
  description?: string
  isFallbackAdapter?: boolean
}
interface GpuAdapterLike {
  info?: GpuAdapterInfoLike
  requestAdapterInfo?: () => Promise<GpuAdapterInfoLike>
  limits: { maxBufferSize: number; maxStorageBufferBindingSize: number }
  features: { has(name: string): boolean }
  isFallbackAdapter?: boolean
}
interface GpuLike {
  requestAdapter(options?: { powerPreference?: 'high-performance' | 'low-power' }): Promise<GpuAdapterLike | null>
}
/** Navigator view with the optional APIs typed loosely (lib.dom coverage varies by TS version). */
type NavigatorExt = Omit<Navigator, 'gpu'> & {
  userAgentData?: UaData
  deviceMemory?: number
  gpu?: GpuLike
}

const GB = 1024 ** 3
const round1 = (n: number) => Math.round(n * 10) / 10

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms)
    promise.then(
      (v) => {
        window.clearTimeout(t)
        resolve(v)
      },
      (e: unknown) => {
        window.clearTimeout(t)
        reject(e instanceof Error ? e : new Error(String(e)))
      },
    )
  })
}

/* ------------------------------------------------------------------ */
/* OS & browser                                                        */
/* ------------------------------------------------------------------ */

async function detectOs(nav: NavigatorExt): Promise<{ os: OsInfo; browser: MachineSpecs['browser'] }> {
  const ua = nav.userAgent
  const browser = detectBrowser(nav)
  const uaData = nav.userAgentData

  if (uaData?.getHighEntropyValues) {
    try {
      const he = await withTimeout(
        uaData.getHighEntropyValues(['platform', 'platformVersion', 'architecture', 'bitness', 'model', 'fullVersionList']),
        1500,
        'userAgentData',
      )
      const platform = (he.platform || uaData.platform || '').toLowerCase()
      const arch: CpuArch = he.architecture === 'arm' ? 'arm' : he.architecture === 'x86' ? 'x86' : 'unknown'
      if (platform === 'windows') {
        const major = Number.parseInt((he.platformVersion || '0').split('.')[0] ?? '0', 10)
        // UA-CH: platformVersion major >= 13 is Windows 11, 1..10 is Windows 10, 0 is Windows 7/8/8.1.
        const label = major >= 13 ? 'Windows 11' : major > 0 ? 'Windows 10' : 'Windows (pre-10)'
        return {
          os: { family: 'windows', label: arch === 'arm' ? `${label} on ARM` : label, version: he.platformVersion ?? null, arch, isAppleSilicon: false, source: 'userAgentData' },
          browser,
        }
      }
      if (platform === 'macos') {
        const apple = arch === 'arm'
        return {
          os: {
            family: 'macos',
            label: apple ? 'macOS (Apple Silicon)' : arch === 'x86' ? 'macOS (Intel)' : 'macOS',
            version: he.platformVersion ?? null,
            arch,
            isAppleSilicon: arch === 'unknown' ? null : apple,
            source: 'userAgentData',
          },
          browser,
        }
      }
      if (platform === 'linux') return { os: { family: 'linux', label: 'Linux', version: he.platformVersion ?? null, arch, isAppleSilicon: false, source: 'userAgentData' }, browser }
      if (platform === 'chrome os' || platform === 'chromeos') return { os: { family: 'chromeos', label: 'ChromeOS', version: he.platformVersion ?? null, arch, isAppleSilicon: false, source: 'userAgentData' }, browser }
      if (platform === 'android') return { os: { family: 'android', label: 'Android', version: he.platformVersion ?? null, arch, isAppleSilicon: false, source: 'userAgentData' }, browser }
    } catch {
      /* fall through to the user-agent string */
    }
  }

  // userAgent fallback (Safari, Firefox): Windows 10 and 11 share "Windows NT 10.0";
  // Safari reports "Intel Mac OS X" even on Apple Silicon, so the GPU probe refines it later.
  if (/Windows NT 10\.0/.test(ua)) {
    return { os: { family: 'windows', label: 'Windows 10/11', version: '10.0', arch: /ARM64|aarch64/i.test(ua) ? 'arm' : 'x86', isAppleSilicon: false, source: 'userAgent' }, browser }
  }
  if (/Windows NT/.test(ua)) {
    return { os: { family: 'windows', label: 'Windows', version: ua.match(/Windows NT ([\d.]+)/)?.[1] ?? null, arch: 'x86', isAppleSilicon: false, source: 'userAgent' }, browser }
  }
  if (/iPhone|iPad|iPod/.test(ua)) {
    return { os: { family: 'ios', label: 'iOS / iPadOS', version: null, arch: 'arm', isAppleSilicon: true, source: 'userAgent' }, browser }
  }
  if (/Mac OS X/.test(ua)) {
    const version = ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, '.') ?? null
    return { os: { family: 'macos', label: 'macOS', version, arch: 'unknown', isAppleSilicon: null, source: 'userAgent' }, browser }
  }
  if (/Android/.test(ua)) return { os: { family: 'android', label: 'Android', version: null, arch: 'arm', isAppleSilicon: false, source: 'userAgent' }, browser }
  if (/CrOS/.test(ua)) return { os: { family: 'chromeos', label: 'ChromeOS', version: null, arch: 'unknown', isAppleSilicon: false, source: 'userAgent' }, browser }
  if (/Linux/.test(ua)) return { os: { family: 'linux', label: 'Linux', version: null, arch: /aarch64|arm/i.test(ua) ? 'arm' : 'x86', isAppleSilicon: false, source: 'userAgent' }, browser }
  return { os: { family: 'unknown', label: 'Unknown OS', version: null, arch: 'unknown', isAppleSilicon: null, source: 'userAgent' }, browser }
}

function detectBrowser(nav: NavigatorExt): MachineSpecs['browser'] {
  const brands = nav.userAgentData?.brands ?? []
  const pick = (name: string) => brands.find((b) => b.brand === name)
  const branded = pick('Microsoft Edge') ?? pick('Google Chrome') ?? pick('Opera') ?? pick('Brave') ?? pick('Chromium')
  if (branded) return { name: branded.brand.replace('Google ', '').replace('Microsoft ', ''), version: branded.version }
  const ua = nav.userAgent
  const m =
    ua.match(/Edg\/([\d.]+)/) ? { name: 'Edge', version: ua.match(/Edg\/([\d.]+)/)![1]! } :
    ua.match(/Firefox\/([\d.]+)/) ? { name: 'Firefox', version: ua.match(/Firefox\/([\d.]+)/)![1]! } :
    ua.match(/Chrome\/([\d.]+)/) ? { name: 'Chrome', version: ua.match(/Chrome\/([\d.]+)/)![1]! } :
    ua.match(/Version\/([\d.]+).*Safari/) ? { name: 'Safari', version: ua.match(/Version\/([\d.]+)/)![1]! } :
    { name: 'Unknown', version: '' }
  return { name: m.name, version: m.version.split('.')[0] ?? m.version }
}

/* ------------------------------------------------------------------ */
/* WebGL renderer                                                      */
/* ------------------------------------------------------------------ */

function probeWebGl(): MachineSpecs['webgl'] {
  try {
    const canvas = document.createElement('canvas')
    const gl2 = canvas.getContext('webgl2')
    const gl = (gl2 ?? canvas.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return { renderer: null, vendor: null, version: null }
    const ext = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number; UNMASKED_VENDOR_WEBGL: number } | null
    const renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    const vendor = String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR))
    const version = gl2 ? 'WebGL 2.0' : 'WebGL 1.0'
    ;(gl.getExtension('WEBGL_lose_context') as { loseContext(): void } | null)?.loseContext()
    return { renderer, vendor, version }
  } catch {
    return { renderer: null, vendor: null, version: null }
  }
}

/* ------------------------------------------------------------------ */
/* WebGPU                                                              */
/* ------------------------------------------------------------------ */

async function probeWebGpu(nav: NavigatorExt): Promise<WebGpuInfo> {
  const empty: WebGpuInfo = {
    supported: false,
    adapterAvailable: false,
    vendor: null,
    architecture: null,
    device: null,
    description: null,
    maxBufferSizeGB: null,
    maxStorageBufferBindingSizeGB: null,
    shaderF16: false,
    isFallbackAdapter: false,
    error: null,
  }
  if (!nav.gpu) return { ...empty, error: 'navigator.gpu is not available in this browser.' }
  try {
    // Chrome ignores (and warns about) powerPreference on Windows, so only request it elsewhere.
    const options = /Windows/.test(nav.userAgent) ? undefined : ({ powerPreference: 'high-performance' } as const)
    const adapter = await withTimeout(nav.gpu.requestAdapter(options), 4000, 'WebGPU adapter request')
    if (!adapter) return { ...empty, supported: true, error: 'No WebGPU adapter was returned (GPU blocklisted or disabled).' }
    let info: GpuAdapterInfoLike = adapter.info ?? {}
    if (!adapter.info && adapter.requestAdapterInfo) {
      try {
        info = await adapter.requestAdapterInfo()
      } catch {
        info = {}
      }
    }
    return {
      supported: true,
      adapterAvailable: true,
      vendor: info.vendor || null,
      architecture: info.architecture || null,
      device: info.device || null,
      description: info.description || null,
      maxBufferSizeGB: round1(adapter.limits.maxBufferSize / GB),
      maxStorageBufferBindingSizeGB: round1(adapter.limits.maxStorageBufferBindingSize / GB),
      shaderF16: adapter.features.has('shader-f16'),
      isFallbackAdapter: Boolean(info.isFallbackAdapter ?? adapter.isFallbackAdapter),
      error: null,
    }
  } catch (err) {
    return { ...empty, supported: true, error: err instanceof Error ? err.message : String(err) }
  }
}

/* ------------------------------------------------------------------ */
/* GPU classification & VRAM estimation                                */
/* ------------------------------------------------------------------ */

/** Known dedicated-VRAM sizes. Ordered specific → generic; laptop parts listed before desktop parts. */
const VRAM_TABLE: Array<[RegExp, number]> = [
  // NVIDIA laptop
  [/RTX\s*5090.*Laptop/i, 24], [/RTX\s*5080.*Laptop/i, 16], [/RTX\s*5070\s*Ti.*Laptop/i, 12], [/RTX\s*5070.*Laptop/i, 8], [/RTX\s*5060.*Laptop/i, 8],
  [/RTX\s*4090.*Laptop/i, 16], [/RTX\s*4080.*Laptop/i, 12], [/RTX\s*4070.*Laptop/i, 8], [/RTX\s*4060.*Laptop/i, 8], [/RTX\s*4050.*Laptop/i, 6],
  [/RTX\s*3080\s*Ti.*Laptop/i, 16], [/RTX\s*3080.*Laptop/i, 8], [/RTX\s*3070.*Laptop/i, 8], [/RTX\s*3060.*Laptop/i, 6], [/RTX\s*3050.*Laptop/i, 4],
  // NVIDIA workstation
  [/RTX\s*6000\s*Ada/i, 48], [/RTX\s*A6000/i, 48], [/RTX\s*5000\s*Ada/i, 32], [/RTX\s*A5000/i, 24], [/RTX\s*4500\s*Ada/i, 24],
  [/RTX\s*4000\s*Ada/i, 20], [/RTX\s*A4000/i, 16], [/RTX\s*A2000/i, 6],
  // NVIDIA desktop
  [/RTX\s*5090/i, 32], [/RTX\s*5080/i, 16], [/RTX\s*5070\s*Ti/i, 16], [/RTX\s*5070/i, 12], [/RTX\s*5060/i, 8],
  [/RTX\s*4090/i, 24], [/RTX\s*4080/i, 16], [/RTX\s*4070\s*Ti\s*Super/i, 16], [/RTX\s*4070/i, 12], [/RTX\s*4060/i, 8],
  [/RTX\s*3090/i, 24], [/RTX\s*3080\s*Ti/i, 12], [/RTX\s*3080/i, 10], [/RTX\s*3070/i, 8], [/RTX\s*3060\s*Ti/i, 8], [/RTX\s*3060/i, 12], [/RTX\s*3050/i, 8],
  [/RTX\s*2080\s*Ti/i, 11], [/RTX\s*2080/i, 8], [/RTX\s*2070/i, 8], [/RTX\s*2060\s*Super/i, 8], [/RTX\s*2060/i, 6],
  [/GTX\s*1080\s*Ti/i, 11], [/GTX\s*1080/i, 8], [/GTX\s*1070/i, 8], [/GTX\s*16[56]0/i, 6], [/GTX\s*1650/i, 4], [/GTX\s*1060/i, 6], [/GTX\s*1050\s*Ti/i, 4], [/GTX\s*1050/i, 2],
  // AMD
  [/RX\s*9070/i, 16], [/RX\s*9060\s*XT/i, 8], [/RX\s*7900\s*XTX/i, 24], [/RX\s*7900\s*XT\b/i, 20], [/RX\s*7900/i, 16], [/RX\s*7800/i, 16], [/RX\s*7700/i, 12],
  [/RX\s*7600\s*XT/i, 16], [/RX\s*7600/i, 8], [/RX\s*69[05]0/i, 16], [/RX\s*6800/i, 16], [/RX\s*67[05]0\s*XT/i, 12], [/RX\s*6700/i, 10], [/RX\s*66[05]0/i, 8],
  [/RX\s*6500/i, 4], [/Radeon\s*Pro\s*W7900/i, 48], [/Radeon\s*Pro\s*W7800/i, 32], [/Radeon\s*Pro\s*5[56]00M/i, 8], [/Radeon\s*Pro\s*5300M/i, 4],
  // Intel Arc discrete
  [/Arc.*B580/i, 12], [/Arc.*B570/i, 10], [/Arc.*A770/i, 8], [/Arc.*A750/i, 8], [/Arc.*A580/i, 8], [/Arc.*A380/i, 6],
]

function cleanRenderer(renderer: string): string {
  // "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)" → "NVIDIA GeForce RTX 4070"
  // "ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)" → "Apple M2 Pro"
  let s = renderer
  const angle = s.match(/^ANGLE \((.*)\)$/)
  if (angle?.[1]) {
    const parts = angle[1].split(', ')
    s = parts.length >= 2 ? (parts[1] ?? s) : angle[1]
  }
  return s
    .replace(/ANGLE Metal Renderer:\s*/i, '')
    .replace(/\(0x[0-9a-f]+\)/gi, '')
    .replace(/Direct3D.*$/i, '')
    .replace(/vs_\d_\d.*$/i, '')
    .replace(/OpenGL.*$/i, '')
    .replace(/\(R\)|\(TM\)|®|™/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function classifyGpu(renderer: string | null, webgpu: WebGpuInfo, osFamily: OsInfo['family']): GpuInfo {
  const raw = renderer ?? [webgpu.vendor, webgpu.description || webgpu.architecture].filter(Boolean).join(' ')
  const text = raw || ''
  const lower = text.toLowerCase()
  const model = text ? cleanRenderer(text) : null
  let vendor: GpuVendor = 'unknown'
  let gpuClass: GpuClass = 'unknown'

  if (/swiftshader|llvmpipe|softpipe|basic render|microsoft basic|software/i.test(text) || webgpu.isFallbackAdapter) {
    vendor = /microsoft/i.test(text) ? 'microsoft' : 'unknown'
    gpuClass = 'software'
  } else if (/apple m\d|apple gpu|apple a\d/i.test(text) || webgpu.vendor === 'apple') {
    vendor = 'apple'
    gpuClass = 'apple-silicon'
  } else if (/nvidia|geforce|quadro|rtx|gtx/i.test(text) || webgpu.vendor === 'nvidia') {
    vendor = 'nvidia'
    gpuClass = 'discrete'
  } else if (/amd|radeon|ati /i.test(text) || webgpu.vendor === 'amd' || webgpu.vendor === 'ati') {
    vendor = 'amd'
    // APUs ("Radeon(TM) Graphics", "Radeon 780M", "Vega 8") share system memory.
    // (Discrete Vega 56/64 cards are excluded from the APU pattern.)
    gpuClass = /radeon\s*(\(tm\)\s*)?graphics|radeon\s*\d{3}m|vega\s*(?!56|64)\d+/i.test(lower) ? 'integrated' : 'discrete'
  } else if (/intel/i.test(text) || webgpu.vendor === 'intel') {
    vendor = 'intel'
    gpuClass = /arc.*\b[ab]\d{3}\b/i.test(text) ? 'discrete' : 'integrated'
  } else if (/qualcomm|adreno/i.test(text) || webgpu.vendor === 'qualcomm') {
    vendor = 'qualcomm'
    gpuClass = 'integrated'
  }

  let estimatedVramGB: number | null = null
  let vramSource: GpuInfo['vramSource'] = 'unknown'
  if (gpuClass === 'apple-silicon') {
    vramSource = 'unified-memory'
  } else if (gpuClass === 'integrated') {
    vramSource = 'shared-memory'
  } else if (model) {
    for (const [re, gb] of VRAM_TABLE) {
      if (re.test(model)) {
        estimatedVramGB = gb
        vramSource = 'gpu-lookup'
        break
      }
    }
  }
  // macOS on Intel with "Apple GPU" masking: Safari only exposes "Apple GPU" on Apple Silicon.
  if (osFamily === 'macos' && gpuClass === 'unknown' && /apple/i.test(lower)) gpuClass = 'apple-silicon'

  return { renderer: renderer ?? null, vendor, gpuClass, model, estimatedVramGB, vramSource }
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

async function probeStorage(): Promise<StorageInfo> {
  if (!navigator.storage?.estimate) return { quotaGB: null, usageGB: null, freeGB: null, persisted: null }
  try {
    const { quota = 0, usage = 0 } = await navigator.storage.estimate()
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null
    return {
      quotaGB: round1(quota / GB),
      usageGB: round1(usage / GB),
      freeGB: round1(Math.max(0, quota - usage) / GB),
      persisted,
    }
  } catch {
    return { quotaGB: null, usageGB: null, freeGB: null, persisted: null }
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function detectMachineSpecs(): Promise<MachineSpecs> {
  const nav = navigator as unknown as NavigatorExt
  const webgl = probeWebGl()
  const [{ os, browser }, webgpu, storage] = await Promise.all([detectOs(nav), probeWebGpu(nav), probeStorage()])
  const renderer = webgl.renderer && !/^(webkit webgl|mozilla)$/i.test(webgl.renderer) ? webgl.renderer : null
  const gpu = classifyGpu(renderer, webgpu, os.family)

  // Safari/Firefox on a Mac cannot report the CPU architecture; the GPU settles it.
  if (os.family === 'macos' && os.isAppleSilicon == null) {
    if (gpu.gpuClass === 'apple-silicon') {
      os.isAppleSilicon = true
      os.arch = 'arm'
      os.label = 'macOS (Apple Silicon)'
    } else if (gpu.vendor === 'intel' || gpu.vendor === 'amd' || gpu.vendor === 'nvidia') {
      os.isAppleSilicon = false
      os.arch = 'x86'
      os.label = 'macOS (Intel)'
    }
  }
  if (os.family === 'macos' && os.isAppleSilicon && gpu.gpuClass === 'unknown') gpu.gpuClass = 'apple-silicon'

  const deviceMemory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null
  return {
    detectedAt: new Date().toISOString(),
    os,
    browser,
    cpu: { logicalCores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null },
    // Chrome/Edge clamp deviceMemory to a maximum of 8 GB; anything at the cap may be higher.
    memory: { reportedGB: deviceMemory, capped: deviceMemory != null && deviceMemory >= 8 },
    gpu,
    webgpu,
    webgl: { ...webgl, renderer },
    storage,
  }
}

/** Ask the browser not to evict model weights under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return navigator.storage?.persist ? await navigator.storage.persist() : false
  } catch {
    return false
  }
}
