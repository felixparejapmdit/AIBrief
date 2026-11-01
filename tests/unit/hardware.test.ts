import { describe, expect, it } from 'vitest'
import { recommendProfile } from '../../src/constants/modelCatalog'
import { classifyGpu } from '../../src/services/hardwareDetector'
import type { WebGpuInfo } from '../../src/types/architecture'
import { specs } from './fixtures'

const noWebGpu: WebGpuInfo = {
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

describe('GPU classification', () => {
  it.each([
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'nvidia', 'discrete', 'NVIDIA GeForce RTX 4070', 12],
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU (0x00002820) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'nvidia', 'discrete', 'NVIDIA GeForce RTX 4070 Laptop GPU', 8],
    ['ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)', 'apple', 'apple-silicon', 'Apple M3 Pro', null],
    ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'intel', 'integrated', 'Intel Iris Xe Graphics', null],
    ['ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'amd', 'integrated', 'AMD Radeon Graphics', null],
    ['ANGLE (AMD, AMD Radeon RX 7900 XTX (0x0000744C) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'amd', 'discrete', 'AMD Radeon RX 7900 XTX', 24],
    ['ANGLE (AMD, Radeon RX Vega 56 (0x0000687F) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'amd', 'discrete', 'Radeon RX Vega 56', null],
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'unknown', 'software', null, null],
  ])('%s', (renderer, vendor, gpuClass, model, vram) => {
    const g = classifyGpu(renderer, noWebGpu, 'windows')
    expect(g.vendor).toBe(vendor)
    expect(g.gpuClass).toBe(gpuClass)
    if (model) expect(g.model).toBe(model)
    expect(g.estimatedVramGB).toBe(vram)
  })
})

describe('recommendation engine', () => {
  it('Apple M3 Pro (18 GB floor) → High-Spec', () => {
    const r = recommendProfile(specs({ os: { family: 'macos', isAppleSilicon: true }, gpu: { gpuClass: 'apple-silicon', vendor: 'apple', model: 'Apple M3 Pro' } }), { ramGB: null, vramGB: null })
    expect(r.profile.id).toBe('high')
    expect(r.effectiveRamGB).toBe(18)
  })

  it('Apple M1 with 8 GB → Balanced; RAM override 32 → High', () => {
    const s = specs({ os: { family: 'macos', isAppleSilicon: true }, gpu: { gpuClass: 'apple-silicon', vendor: 'apple', model: 'Apple M1' } })
    expect(recommendProfile(s, { ramGB: null, vramGB: null }).profile.id).toBe('balanced')
    expect(recommendProfile(s, { ramGB: 32, vramGB: null }).profile.id).toBe('high')
  })

  it('Windows RTX 4070 (12 GB) → High; RTX 3060 Laptop (6 GB) → Balanced', () => {
    expect(recommendProfile(specs({ gpu: { gpuClass: 'discrete', vendor: 'nvidia', estimatedVramGB: 12 } }), { ramGB: null, vramGB: null }).profile.id).toBe('high')
    expect(recommendProfile(specs({ gpu: { gpuClass: 'discrete', vendor: 'nvidia', estimatedVramGB: 6 } }), { ramGB: null, vramGB: null }).profile.id).toBe('balanced')
  })

  it('integrated graphics or < 8 GB RAM → Lightweight', () => {
    expect(recommendProfile(specs({ gpu: { gpuClass: 'integrated', vendor: 'intel' }, ram: 16 }), { ramGB: null, vramGB: null }).profile.id).toBe('lightweight')
    expect(recommendProfile(specs({ ram: 4 }), { ramGB: null, vramGB: null }).profile.id).toBe('lightweight')
  })

  it('maps tiers to the mandated settings', () => {
    const high = recommendProfile(specs({ gpu: { gpuClass: 'discrete', estimatedVramGB: 16 } }), { ramGB: null, vramGB: null }).profile
    expect(high.settings).toMatchObject({ temperature: 0.25, contextWindow: 8192, imageResolution: 1344, gpuOffloadPercent: 100 })
    expect(high.ollama.vision.id).toBe('qwen2.5vl:7b')
    const light = recommendProfile(specs({ ram: 4 }), { ramGB: null, vramGB: null }).profile
    expect(light.settings).toMatchObject({ contextWindow: 2048, imageResolution: 768, lowMemoryMode: true })
    expect(light.ollama.vision.id).toBe('moondream:latest')
    expect(light.webllm.text.id).toBe('Llama-3.2-3B-Instruct-q4f16_1-MLC')
  })

  it('falls back to q4f32 weights without shader-f16', () => {
    expect(recommendProfile(specs({ shaderF16: false }), { ramGB: null, vramGB: null }).webllmPrecision).toBe('q4f32_1')
  })
})

describe('WebGPU error guidance', () => {
  it('turns Dawn device-creation failures into actionable guidance', async () => {
    const { friendlyWebGpuError } = await import('../../src/services/modelDownloader')
    expect(friendlyWebGpuError("Failed to execute 'requestDevice' on 'GPUAdapter': DynamicLib.Open: dxcompiler.dll Windows Error: 87")).toMatch(/Google Chrome or Microsoft Edge/)
    expect(friendlyWebGpuError('Device was lost. insufficient memory')).toMatch(/lighter tier/)
    expect(friendlyWebGpuError('Some other error')).toBe('Some other error')
  })
})
