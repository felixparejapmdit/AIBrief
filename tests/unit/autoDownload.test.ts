import { describe, expect, it } from 'vitest'
import { type AutoDownloadInput, type EngineBindings, autoEngine, planAutoDownload } from '../../src/services/autoDownload'
import type { OllamaStatus } from '../../src/services/modelDownloader'
import { specs } from './fixtures'

const ollamaUp = (models: string[] = []): OllamaStatus => ({
  reachable: true,
  version: '0.40.13',
  models: models.map((name) => ({ name, sizeBytes: 1, parameterSize: null, quantization: null, family: null })),
  error: null,
  checkedAt: '2026-11-01T00:00:00.000Z',
})
const ollamaDown: OllamaStatus = { reachable: false, version: null, models: [], error: 'refused', checkedAt: '2026-11-01T00:00:00.000Z' }

const LIGHT_OLLAMA: EngineBindings = {
  vision: { engine: 'ollama', model: 'moondream:latest', vision: true },
  text: { engine: 'ollama', model: 'llama3.2:3b', vision: false },
  downloads: [
    { engine: 'ollama', model: 'moondream:latest' },
    { engine: 'ollama', model: 'llama3.2:3b' },
  ],
}
const LIGHT_WEB: EngineBindings = {
  vision: null,
  text: { engine: 'webllm', model: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', vision: false },
  downloads: [{ engine: 'webllm', model: 'Llama-3.2-3B-Instruct-q4f16_1-MLC' }],
}

function input(patch: Partial<AutoDownloadInput> = {}): AutoDownloadInput {
  return {
    enabled: true,
    specs: specs({}),
    ollama: ollamaUp(),
    preferredEngine: null,
    bindingsManual: false,
    tierOverridden: false,
    current: { vision: null, text: null },
    recommended: (kind) => (kind === 'ollama' ? LIGHT_OLLAMA : LIGHT_WEB),
    webllmCached: {},
    busy: false,
    attempted: new Set(),
    online: true,
    saveData: false,
    freeStorageGB: 50,
    sizeGB: () => 2,
    ...patch,
  }
}

describe('automatic model download planner', () => {
  it('fresh install with Ollama running: configures Ollama and downloads every missing model', () => {
    const plan = planAutoDownload(input())
    expect(plan).toEqual({ action: 'configure', kind: 'ollama', downloads: LIGHT_OLLAMA.downloads, blocked: null })
  })

  it('only downloads what is missing (models already in Ollama are just bound)', () => {
    const plan = planAutoDownload(input({ ollama: ollamaUp(['moondream:latest', 'llama3.2:3b']) }))
    expect(plan).toEqual({ action: 'configure', kind: 'ollama', downloads: [], blocked: null })
    const partial = planAutoDownload(input({ ollama: ollamaUp(['moondream:latest']) }))
    expect(partial.action === 'configure' && partial.downloads).toEqual([{ engine: 'ollama', model: 'llama3.2:3b' }])
  })

  it('without Ollama it falls back to the in-browser engine when WebGPU is available', () => {
    expect(planAutoDownload(input({ ollama: ollamaDown }))).toMatchObject({ action: 'configure', kind: 'webllm', downloads: LIGHT_WEB.downloads })
  })

  it('reports "no engine" when neither Ollama nor WebGPU is available, and waits until detection finishes', () => {
    const noGpu = specs({})
    noGpu.webgpu.adapterAvailable = false
    expect(planAutoDownload(input({ ollama: ollamaDown, specs: noGpu }))).toEqual({ action: 'none', reason: 'no-engine' })
    expect(planAutoDownload(input({ ollama: null }))).toEqual({ action: 'wait', reason: 'detecting' })
    expect(planAutoDownload(input({ specs: null }))).toEqual({ action: 'wait', reason: 'detecting' })
  })

  it('does nothing when disabled, while a download runs, or once everything is installed', () => {
    expect(planAutoDownload(input({ enabled: false }))).toEqual({ action: 'none', reason: 'disabled' })
    expect(planAutoDownload(input({ busy: true }))).toEqual({ action: 'none', reason: 'busy' })
    const done = input({ ollama: ollamaUp(['moondream:latest', 'llama3.2:3b']), current: { vision: LIGHT_OLLAMA.vision, text: LIGHT_OLLAMA.text } })
    expect(planAutoDownload(done)).toEqual({ action: 'none', reason: 'ready' })
  })

  it('re-downloads a required model that went missing', () => {
    const plan = planAutoDownload(input({ ollama: ollamaUp(['moondream:latest']), current: { vision: LIGHT_OLLAMA.vision, text: LIGHT_OLLAMA.text } }))
    expect(plan).toEqual({ action: 'download', downloads: [{ engine: 'ollama', model: 'llama3.2:3b' }] })
  })

  it('never retries an auto-started download in a loop', () => {
    const attempted = new Set(['ollama:moondream:latest', 'ollama:llama3.2:3b'])
    const plan = planAutoDownload(input({ attempted, current: { vision: LIGHT_OLLAMA.vision, text: LIGHT_OLLAMA.text } }))
    expect(plan).toEqual({ action: 'none', reason: 'attempted' })
  })

  it('respects models chosen by hand instead of re-applying the recommendation', () => {
    const manual = { vision: { engine: 'ollama' as const, model: 'ornith-1.5:9b', vision: true }, text: { engine: 'ollama' as const, model: 'ornith-1.5:9b', vision: true } }
    expect(planAutoDownload(input({ bindingsManual: true, current: manual, ollama: ollamaUp(['ornith-1.5:9b']) }))).toEqual({ action: 'none', reason: 'ready' })
    expect(planAutoDownload(input({ bindingsManual: true, current: manual }))).toEqual({ action: 'download', downloads: [{ engine: 'ollama', model: 'ornith-1.5:9b' }] })
  })

  it('follows a tier change by configuring the new tier’s models', () => {
    const balanced: EngineBindings = {
      vision: { engine: 'ollama', model: 'qwen2.5vl:3b', vision: true },
      text: { engine: 'ollama', model: 'qwen2.5vl:3b', vision: true },
      downloads: [{ engine: 'ollama', model: 'qwen2.5vl:3b' }],
    }
    const plan = planAutoDownload(input({ current: { vision: LIGHT_OLLAMA.vision, text: LIGHT_OLLAMA.text }, recommended: () => balanced }))
    expect(plan).toEqual({ action: 'configure', kind: 'ollama', downloads: balanced.downloads, blocked: null })
  })

  it('waits for confirmation before switching an existing setup to a hand-picked tier', () => {
    const balanced: EngineBindings = { vision: { engine: 'ollama', model: 'qwen2.5vl:7b', vision: true }, text: { engine: 'ollama', model: 'qwen2.5vl:7b', vision: true }, downloads: [{ engine: 'ollama', model: 'qwen2.5vl:7b' }] }
    const current = { vision: LIGHT_OLLAMA.vision, text: LIGHT_OLLAMA.text }
    expect(planAutoDownload(input({ tierOverridden: true, current, recommended: () => balanced }))).toEqual({ action: 'none', reason: 'tier-choice' })
    // On a fresh install the chosen tier is simply what gets installed.
    expect(planAutoDownload(input({ tierOverridden: true, recommended: () => balanced }))).toMatchObject({ action: 'configure', downloads: balanced.downloads })
  })

  it('holds back large downloads when offline, on Data Saver, or without browser storage', () => {
    expect(planAutoDownload(input({ online: false }))).toMatchObject({ action: 'configure', downloads: [], blocked: 'offline' })
    expect(planAutoDownload(input({ saveData: true }))).toMatchObject({ action: 'configure', downloads: [], blocked: 'save-data' })
    expect(planAutoDownload(input({ ollama: ollamaDown, freeStorageGB: 1 }))).toMatchObject({ action: 'configure', kind: 'webllm', downloads: [], blocked: 'storage' })
    // Ollama stores models on disk, outside the browser quota.
    expect(planAutoDownload(input({ freeStorageGB: 1 }))).toMatchObject({ action: 'configure', kind: 'ollama', blocked: null })
  })

  it('keeps the engine the user chose; the cloud engine needs no download', () => {
    expect(autoEngine({ preferredEngine: 'webllm', ollama: ollamaUp(), specs: specs({}) })).toBe('webllm')
    expect(planAutoDownload(input({ preferredEngine: 'cloud' }))).toEqual({ action: 'none', reason: 'cloud' })
    expect(planAutoDownload(input({ preferredEngine: 'ollama', ollama: ollamaDown }))).toEqual({ action: 'none', reason: 'no-engine' })
  })
})
