import {
  Cloud,
  Cpu,
  Download,
  Gpu,
  HardDrive,
  KeyRound,
  LoaderCircle,
  MemoryStick,
  Monitor,
  MonitorCog,
  Pause,
  Play,
  RefreshCw,
  Server,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CLOUD_MODELS, HARDWARE_PROFILES, TIER_ORDER, recommendProfile, webllmVariant } from '../../constants/modelCatalog'
import { ollamaHasModel } from '../../services/modelDownloader'
import { selectRecommendation, useProjectStore } from '../../store/useProjectStore'
import { useRuntimeStore } from '../../store/useRuntimeStore'
import type { CatalogModel, DownloadProgress, EngineKind, ModelBinding, TierId } from '../../types/architecture'
import { formatBytes, formatEta, formatSpeed } from '../../utils/text'
import { ProgressBar, Toggle } from '../ui/primitives'

/* ------------------------------------------------------------------ */
/* Spec scorecard                                                       */
/* ------------------------------------------------------------------ */

function SpecTile({ icon, label, value, sub, testId, tone = 'default' }: { icon: ReactNode; label: string; value: string; sub?: string; testId: string; tone?: 'default' | 'good' | 'warn' }) {
  const toneCls = tone === 'good' ? 'text-verdigris-300' : tone === 'warn' ? 'text-amberglow-400' : 'text-ink-100'
  return (
    <div className="panel-raised flex min-h-[86px] gap-3 p-3" data-testid={testId}>
      <div className="mt-0.5 text-brass-300">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</div>
        <div className={`truncate text-sm font-medium ${toneCls}`} title={value}>
          {value}
        </div>
        {sub && <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-400">{sub}</div>}
      </div>
    </div>
  )
}

const RAM_OPTIONS = [4, 8, 16, 18, 24, 32, 36, 48, 64, 96, 128]
const VRAM_OPTIONS = [2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 48]

function SpecScorecard() {
  const { specs, overrides, setOverrides, runDetection } = useProjectStore(
    useShallow((s) => ({ specs: s.specs, overrides: s.overrides, setOverrides: s.setOverrides, runDetection: s.runDetection })),
  )
  const detecting = useRuntimeStore((s) => s.detecting)
  const rec = useProjectStore(selectRecommendation)

  const ram =
    specs == null
      ? '—'
      : overrides.ramGB != null
        ? `${overrides.ramGB} GB (override)`
        : rec.effectiveRamGB != null
          ? `${specs.memory.capped || rec.effectiveRamGB !== specs.memory.reportedGB ? '≥ ' : ''}${rec.effectiveRamGB} GB`
          : 'Not reported'
  const vram =
    specs == null
      ? '—'
      : overrides.vramGB != null
        ? `${overrides.vramGB} GB (override)`
        : specs.gpu.vramSource === 'unified-memory'
          ? `${rec.effectiveVramGB ?? '?'} GB unified`
          : specs.gpu.vramSource === 'shared-memory'
            ? 'Shared system memory'
            : specs.gpu.estimatedVramGB != null
              ? `${specs.gpu.estimatedVramGB} GB dedicated`
              : 'Unknown'

  return (
    <section aria-labelledby="specs-title">
      <div className="mb-3 flex items-center justify-between">
        <h3 id="specs-title" className="label-luxe">
          Detected machine
        </h3>
        <button type="button" className="btn-ghost btn-sm" onClick={() => void runDetection()} disabled={detecting} data-testid="rescan-specs">
          <RefreshCw className={`h-3.5 w-3.5 ${detecting ? 'animate-spin' : ''}`} /> Re-scan
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2.5" data-testid="spec-scorecard">
        <SpecTile testId="spec-os" icon={<Monitor className="h-4 w-4" />} label="Operating system" value={specs ? specs.os.label : 'Detecting…'} sub={specs ? `${specs.browser.name} ${specs.browser.version}${specs.os.version ? ` · v${specs.os.version}` : ''}` : undefined} />
        <SpecTile testId="spec-cpu" icon={<Cpu className="h-4 w-4" />} label="CPU cores" value={specs?.cpu.logicalCores != null ? `${specs.cpu.logicalCores} logical cores` : '—'} sub={specs ? `Architecture: ${specs.os.arch}` : undefined} />
        <SpecTile
          testId="spec-gpu"
          icon={<Gpu className="h-4 w-4" />}
          label="GPU renderer"
          value={specs?.gpu.model ?? specs?.webgpu.description ?? 'Not exposed by browser'}
          sub={specs ? `${specs.gpu.gpuClass.replace('-', ' ')}${specs.webgl.version ? ` · ${specs.webgl.version}` : ''}` : undefined}
        />
        <SpecTile testId="spec-ram" icon={<MemoryStick className="h-4 w-4" />} label="Estimated RAM" value={ram} sub={specs?.memory.capped ? 'Browsers cap reported RAM at 8 GB — override if higher.' : undefined} />
        <SpecTile testId="spec-vram" icon={<Gpu className="h-4 w-4" />} label="Estimated VRAM" value={vram} sub={specs?.webgpu.maxBufferSizeGB != null ? `WebGPU max buffer ${specs.webgpu.maxBufferSizeGB} GB` : undefined} />
        <SpecTile
          testId="spec-storage"
          icon={<HardDrive className="h-4 w-4" />}
          label="Free storage"
          value={specs?.storage.freeGB != null ? `${specs.storage.freeGB} GB available` : 'Unknown'}
          tone={specs?.storage.freeGB != null && specs.storage.freeGB < 8 ? 'warn' : 'default'}
          sub={specs?.storage.quotaGB != null ? `Browser quota ${specs.storage.quotaGB} GB${specs.storage.persisted ? ' · persistent' : ''}` : undefined}
        />
        <div className="col-span-2">
          <SpecTile
            testId="spec-webgpu"
            icon={<Zap className="h-4 w-4" />}
            label="WebGPU support"
            value={!specs ? '—' : specs.webgpu.adapterAvailable ? `Supported${specs.webgpu.shaderF16 ? ' · shader-f16' : ' · f32 only'}` : 'Not available'}
            tone={specs?.webgpu.adapterAvailable ? 'good' : 'warn'}
            sub={specs ? (specs.webgpu.adapterAvailable ? [specs.webgpu.vendor, specs.webgpu.architecture].filter(Boolean).join(' · ') || 'Adapter ready' : (specs.webgpu.error ?? 'Use Chrome or Edge 113+ for the browser engine.')) : undefined}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="text-xs text-ink-300">
          RAM override
          <select
            className="input mt-1"
            data-testid="override-ram"
            value={overrides.ramGB ?? ''}
            onChange={(e) => setOverrides({ ramGB: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Auto-detect</option>
            {RAM_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g} GB
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-300">
          VRAM override
          <select
            className="input mt-1"
            data-testid="override-vram"
            value={overrides.vramGB ?? ''}
            onChange={(e) => setOverrides({ vramGB: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Auto-detect</option>
            {VRAM_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g} GB
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Performance settings                                                 */
/* ------------------------------------------------------------------ */

function PerformanceSettingsPanel() {
  const { settings, applied, setApplied, setSettings } = useProjectStore(
    useShallow((s) => ({ settings: s.settings, applied: s.recommendedApplied, setApplied: s.setRecommendedApplied, setSettings: s.setSettings })),
  )
  return (
    <section aria-labelledby="perf-title" className="mt-6">
      <h3 id="perf-title" className="label-luxe mb-3">
        Performance settings
      </h3>
      <div className="panel-raised p-4">
        <Toggle id="toggle-recommended" checked={applied} onChange={setApplied} label="Apply Recommended Performance Settings" />
        <p className="mt-1 pl-12 text-[11px] text-ink-400">Temperature 0.25 for technical precision, plus the tier’s context window, max tokens and image tiling resolution.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-ink-300" data-testid="perf-settings">
          <label>
            Temperature
            <input
              type="number"
              min={0}
              max={1.5}
              step={0.05}
              className="input mt-1 tabular"
              data-testid="setting-temperature"
              value={settings.temperature}
              onChange={(e) => setSettings({ temperature: Math.max(0, Math.min(1.5, Number(e.target.value) || 0)) })}
            />
          </label>
          <label>
            Context window
            <select className="input mt-1" data-testid="setting-context" value={settings.contextWindow} onChange={(e) => setSettings({ contextWindow: Number(e.target.value) })}>
              {[2048, 4096, 8192, 16384].map((v) => (
                <option key={v} value={v}>
                  {v.toLocaleString()} tokens
                </option>
              ))}
            </select>
          </label>
          <label>
            Max tokens per response
            <select className="input mt-1" data-testid="setting-max-tokens" value={settings.maxTokens} onChange={(e) => setSettings({ maxTokens: Number(e.target.value) })}>
              {[512, 1024, 1536, 2048, 4096].map((v) => (
                <option key={v} value={v}>
                  {v.toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <label>
            Image tiling resolution
            <select className="input mt-1" data-testid="setting-resolution" value={settings.imageResolution} onChange={(e) => setSettings({ imageResolution: Number(e.target.value) })}>
              {[768, 1024, 1344, 1792].map((v) => (
                <option key={v} value={v}>
                  {v}px long edge
                </option>
              ))}
            </select>
          </label>
          <label>
            GPU offload
            <select
              className="input mt-1"
              data-testid="setting-offload"
              value={String(settings.gpuOffloadPercent)}
              onChange={(e) => setSettings({ gpuOffloadPercent: e.target.value === 'auto' ? 'auto' : 100, lowMemoryMode: e.target.value === 'auto' })}
            >
              <option value="100">100% (all layers on GPU)</option>
              <option value="auto">Auto (low-memory mode)</option>
            </select>
          </label>
          <div className="flex flex-col justify-end gap-2 pb-1">
            <Toggle id="toggle-tiling" checked={settings.highDetailTiling} onChange={(v) => setSettings({ highDetailTiling: v })} label={<span className="text-xs">High-detail shop-drawing tiles</span>} />
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Recommendation + engines                                             */
/* ------------------------------------------------------------------ */

function TierCards() {
  const { tierOverride, setTierOverride } = useProjectStore(useShallow((s) => ({ tierOverride: s.tierOverride, setTierOverride: s.setTierOverride })))
  const rec = useProjectStore(selectRecommendation)
  const autoTier = useProjectStore((s) => recommendProfile(s.specs, s.overrides).profile.id)
  return (
    <div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Hardware profile">
        {TIER_ORDER.map((id: TierId) => {
          const p = HARDWARE_PROFILES[id]
          const active = rec.profile.id === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`tier-${id}`}
              onClick={() => setTierOverride(id === autoTier ? null : id)}
              className={`rounded-xl border p-3 text-left transition-colors duration-150 ${active ? 'border-brass-400 bg-brass-500/10' : 'border-ink-700 bg-ink-850 hover:border-ink-500'}`}
            >
              {/* Reserved badge row keeps all three cards the same height. */}
              <div className="mb-1.5 h-[18px]">
                {id === autoTier && <span className="badge bg-brass-500/20 text-[10px] text-brass-200">Recommended</span>}
              </div>
              <div className="text-[13px] font-medium text-ink-100">{p.name.replace(' Tier', '')}</div>
              <div className="mt-1 text-[11px] leading-snug text-ink-400">{p.criteria}</div>
            </button>
          )
        })}
      </div>
      <ul className="mt-3 space-y-1 text-xs text-ink-300" data-testid="recommendation-reasons">
        {rec.reasons.map((r) => (
          <li key={r} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brass-400" />
            {r}
          </li>
        ))}
      </ul>
      {tierOverride && (
        <button type="button" className="mt-2 text-xs text-brass-300 underline-offset-2 hover:underline" onClick={() => setTierOverride(null)}>
          Reset to the recommended tier
        </button>
      )}
    </div>
  )
}

function ModelRow({ model, installed, role }: { model: CatalogModel | { id: string; label: string; approxDownloadGB: number; vision: boolean }; installed: boolean; role: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-ink-400">{role}</div>
        <div className="truncate text-sm text-ink-100">
          {model.label} <span className="font-mono text-[11px] text-ink-400">{model.id}</span>
        </div>
      </div>
      <div className="shrink-0 text-right text-[11px]">
        <div className="text-ink-300 tabular">≈ {model.approxDownloadGB.toFixed(1)} GB</div>
        <div className={installed ? 'text-verdigris-300' : 'text-amberglow-400'}>{installed ? 'Installed' : 'Not downloaded'}</div>
      </div>
    </div>
  )
}

function EnginePanel({ engine }: { engine: EngineKind }) {
  const s = useProjectStore(
    useShallow((st) => ({ engineSettings: st.engine, specs: st.specs, setEngine: st.setEngine, refreshEngines: st.refreshEngines })),
  )
  const rec = useProjectStore(selectRecommendation)
  const { ollama, cached, checking } = useRuntimeStore(useShallow((r) => ({ ollama: r.ollama, cached: r.webllmCached, checking: r.checkingOllama })))
  const p = rec.profile

  if (engine === 'ollama') {
    const models = p.ollama.vision.id === p.ollama.text.id ? [{ role: 'Vision + drafting', m: p.ollama.vision }] : [{ role: 'Vision', m: p.ollama.vision }, { role: 'Drafting', m: p.ollama.text }]
    return (
      <div className="space-y-3" data-testid="engine-panel-ollama">
        <div className="flex items-center gap-2 text-sm" data-testid="ollama-status">
          <span className={`h-2 w-2 rounded-full ${ollama?.reachable ? 'bg-verdigris-400' : 'bg-ember-400'}`} />
          {ollama == null ? 'Checking for Ollama…' : ollama.reachable ? `Ollama ${ollama.version ?? ''} running · ${ollama.models.length} model(s) installed` : 'Ollama not detected'}
        </div>
        {ollama && !ollama.reachable && <p className="text-xs text-ink-400">{ollama.error} Download Ollama from ollama.com (macOS &amp; Windows).</p>}
        <div className="flex gap-2">
          <input
            className="input font-mono text-xs"
            aria-label="Ollama URL"
            data-testid="ollama-url"
            value={s.engineSettings.ollamaBaseUrl}
            onChange={(e) => s.setEngine({ ollamaBaseUrl: e.target.value })}
          />
          <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => void s.refreshEngines()} data-testid="recheck-ollama">
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} /> Re-check
          </button>
        </div>
        {models.map(({ role, m }) => (
          <ModelRow key={m.id} role={role} model={m} installed={ollamaHasModel(ollama, m.id)} />
        ))}
      </div>
    )
  }

  if (engine === 'webllm') {
    const ok = s.specs?.webgpu.adapterAvailable
    const text = { ...p.webllm.text, id: webllmVariant(p.webllm.text.id, rec.webllmPrecision) }
    const vision = p.webllm.vision ? { ...p.webllm.vision, id: webllmVariant(p.webllm.vision.id, rec.webllmPrecision) } : null
    const rows = vision && vision.id === text.id ? [{ role: 'Vision + drafting', m: vision }] : [...(vision ? [{ role: 'Vision', m: vision }] : []), { role: 'Drafting', m: text }]
    return (
      <div className="space-y-3" data-testid="engine-panel-webllm">
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${ok ? 'bg-verdigris-400' : 'bg-ember-400'}`} />
          {ok ? `WebGPU ready — weights stream into browser storage (${rec.webllmPrecision})` : 'WebGPU unavailable in this browser'}
        </div>
        {rows.map(({ role, m }) => (
          <ModelRow key={m.id} role={role} model={m} installed={Boolean(cached[m.id])} />
        ))}
        {!vision && (
          <p className="text-xs text-ink-400">
            Low-memory WebGPU mode is text-only. {ollama?.reachable ? 'Moondream will be pulled into Ollama for image analysis.' : 'Images are analysed on-device from pixel statistics and your notes; start Ollama to add Moondream vision.'}
          </p>
        )}
        {p.id === 'high' && <p className="text-xs text-ink-400">Llama-3.2-11B-Vision has no WebLLM build, so browser vision uses Phi-3.5 Vision and drafting uses Llama 3.1 8B. For 7B-class vision use Ollama.</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="engine-panel-cloud">
      <p className="text-xs text-ink-400">Optional fallback when no local model is available. Images and interview data are sent to Anthropic over HTTPS using your own key; the key stays in this browser only.</p>
      <label className="block text-xs text-ink-300">
        Anthropic API key
        <div className="relative mt-1">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <input
            type="password"
            autoComplete="off"
            className="input pl-9 font-mono"
            placeholder="sk-ant-…"
            data-testid="cloud-key"
            value={s.engineSettings.cloudApiKey}
            onChange={(e) => s.setEngine({ cloudApiKey: e.target.value })}
          />
        </div>
      </label>
      <label className="block text-xs text-ink-300">
        Model
        <select className="input mt-1" data-testid="cloud-model" value={s.engineSettings.cloudModel} onChange={(e) => s.setEngine({ cloudModel: e.target.value })}>
          {CLOUD_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] text-ink-400">Claude manages sampling itself (temperature is not sent); requests use server-side refusal fallbacks.</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Download progress                                                    */
/* ------------------------------------------------------------------ */

const STATUS_LABEL: Record<DownloadProgress['status'], string> = {
  idle: 'Idle',
  preparing: 'Preparing',
  downloading: 'Downloading',
  paused: 'Paused',
  verifying: 'Verifying',
  loading: 'Loading onto GPU',
  completed: 'Completed',
  cancelled: 'Cancelled',
  error: 'Error',
}

function DownloadRow({ id, p }: { id: string; p: DownloadProgress }) {
  const { pause, resume, cancel } = useProjectStore(useShallow((s) => ({ pause: s.pauseDownload, resume: s.resumeDownload, cancel: s.cancelDownload })))
  const active = p.status === 'downloading' || p.status === 'preparing' || p.status === 'verifying' || p.status === 'loading'
  const pct = Math.round(p.fraction * 1000) / 10
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/70 p-3" data-testid="download-row" data-status={p.status}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm text-ink-100">{p.model}</div>
          <div className="text-[11px] text-ink-400">
            {p.engine === 'ollama' ? 'Ollama' : 'Browser WebGPU'} · <span data-testid="download-status">{STATUS_LABEL[p.status]}</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {(p.status === 'downloading' || p.status === 'preparing') && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => pause(id)} data-testid="download-pause">
              <Pause className="h-3.5 w-3.5" /> Pause
            </button>
          )}
          {(p.status === 'paused' || p.status === 'error') && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => resume(id)} data-testid="download-resume">
              <Play className="h-3.5 w-3.5" /> Resume
            </button>
          )}
          {(active || p.status === 'paused' || p.status === 'error') && p.status !== 'loading' && (
            <button type="button" className="btn-danger btn-sm" onClick={() => void cancel(id)} data-testid="download-cancel">
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          )}
        </div>
      </div>
      <ProgressBar value={p.fraction} label={`${p.model} download progress`} className="mt-3" />
      <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-ink-300 tabular">
        <span data-testid="download-percent">{p.status === 'loading' ? `GPU ${Math.round(p.fraction * 100)}%` : `${pct.toFixed(1)}%`}</span>
        <span data-testid="download-bytes">
          {formatBytes(p.bytesDone)} / {p.bytesTotal ? formatBytes(p.bytesTotal) : '—'}
        </span>
        <span data-testid="download-speed">{p.status === 'downloading' ? formatSpeed(p.bytesPerSecond) : '—'}</span>
        <span className="text-right">ETA {p.status === 'downloading' ? formatEta(p.bytesTotal - p.bytesDone, p.bytesPerSecond) : '—'}</span>
      </div>
      <div className="mt-1 truncate text-[11px] text-ink-400" title={p.error ?? p.detail}>
        {p.error ? <span className="text-ember-300">{p.error}</span> : p.detail}
      </div>
    </div>
  )
}

function DownloadPanel() {
  const { downloads, queue } = useRuntimeStore(useShallow((s) => ({ downloads: s.downloads, queue: s.downloadQueue })))
  const entries = Object.entries(downloads)
  if (!entries.length) return null
  return (
    <div className="mt-4 space-y-2" data-testid="download-panel">
      {entries.map(([id, p]) => (
        <DownloadRow key={id} id={id} p={p} />
      ))}
      {queue.length > 0 && <p className="text-[11px] text-ink-400">Queued next: {queue.map((k) => k.split(':').slice(1).join(':')).join(', ')}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Model bindings (advanced)                                            */
/* ------------------------------------------------------------------ */

function BindingSelect({ role }: { role: 'vision' | 'text' }) {
  const { binding, bindModel, engine } = useProjectStore(useShallow((s) => ({ binding: s.engine[role], bindModel: s.bindModel, engine: s.engine })))
  const { ollama, cached } = useRuntimeStore(useShallow((r) => ({ ollama: r.ollama, cached: r.webllmCached })))
  const options = useMemo(() => {
    const list: Array<{ value: string; label: string; b: ModelBinding }> = []
    for (const m of ollama?.models ?? []) list.push({ value: `ollama|${m.name}`, label: `${m.name} · Ollama`, b: { engine: 'ollama', model: m.name, vision: /vl|llava|moondream|vision|gemma3|ornith|minicpm-v|bakllava/i.test(m.name) } })
    for (const [id, ok] of Object.entries(cached)) if (ok) list.push({ value: `webllm|${id}`, label: `${id} · WebGPU`, b: { engine: 'webllm', model: id, vision: /vision/i.test(id) } })
    if (engine.cloudApiKey.trim()) list.push({ value: `cloud|${engine.cloudModel}`, label: `${engine.cloudModel} · Claude`, b: { engine: 'cloud', model: engine.cloudModel, vision: true } })
    if (binding && !list.some((o) => o.value === `${binding.engine}|${binding.model}`)) list.push({ value: `${binding.engine}|${binding.model}`, label: `${binding.model} (not installed yet)`, b: binding })
    return list
  }, [ollama, cached, engine.cloudApiKey, engine.cloudModel, binding])
  return (
    <label className="block text-xs text-ink-300">
      {role === 'vision' ? 'Vision model (image analysis)' : 'Drafting model (interview + brief)'}
      <select
        className="input mt-1"
        data-testid={`binding-${role}`}
        value={binding ? `${binding.engine}|${binding.model}` : ''}
        onChange={(e) => bindModel(role, options.find((o) => o.value === e.target.value)?.b ?? null)}
      >
        <option value="">{role === 'vision' ? 'None — on-device pixel analysis' : 'None — deterministic composer'}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/* ------------------------------------------------------------------ */
/* Modal                                                                */
/* ------------------------------------------------------------------ */

export function HardwareSetupModal() {
  const { open, close, specs, preferred, applyAndDownload } = useProjectStore(
    useShallow((s) => ({
      open: s.wizardOpen,
      close: s.closeWizard,
      specs: s.specs,
      preferred: s.preferredEngine,
      applyAndDownload: s.applyAndDownload,
    })),
  )
  const ollamaReachable = useRuntimeStore((s) => s.ollama?.reachable ?? false)
  const rec = useProjectStore(selectRecommendation)
  const busy = useRuntimeStore((s) => Object.values(s.downloads).some((d) => ['preparing', 'downloading', 'verifying', 'loading'].includes(d.status)))
  const [tab, setTab] = useState<EngineKind | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const autoTab: EngineKind = preferred ?? (ollamaReachable ? 'ollama' : specs?.webgpu.adapterAvailable ? 'webllm' : 'cloud')
  const activeTab = tab ?? autoTab

  useEffect(() => {
    if (!open) return
    // Read the store imperatively: this runs once per opening, not on every spec change.
    const store = () => useProjectStore.getState()
    const lastSpecs = store().specs
    const fresh = lastSpecs && Date.now() - Date.parse(lastSpecs.detectedAt) < 10 * 60 * 1000
    if (!fresh) void store().runDetection()
    void store().refreshEngines()
    const poll = window.setInterval(() => void store().refreshEngines(), 6000)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') store().closeWizard()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      window.clearInterval(poll)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  const tabs: Array<{ id: EngineKind; label: string; icon: ReactNode }> = [
    { id: 'ollama', label: 'Local Ollama', icon: <Server className="h-4 w-4" /> },
    { id: 'webllm', label: 'Browser WebGPU', icon: <Zap className="h-4 w-4" /> },
    { id: 'cloud', label: 'Cloud fallback', icon: <Cloud className="h-4 w-4" /> },
  ]

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop absolute inset-0 bg-ink-950/85" onClick={close} aria-hidden />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
        data-testid="setup-wizard"
        className="modal-panel panel relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden bg-ink-900 outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-700 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-brass-500/15 text-brass-300">
              <MonitorCog className="h-5 w-5" />
            </div>
            <div>
              <h2 id="setup-title" className="heading-display text-xl">
                Setup &amp; Model Download
              </h2>
              <p className="text-xs text-ink-400">Automated hardware &amp; GPU detection for Mac and Windows, with a 1-click local AI installer.</p>
            </div>
          </div>
          <button type="button" className="btn-ghost btn-sm" onClick={close} aria-label="Close setup" data-testid="close-setup">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 gap-6 overflow-y-auto px-6 py-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div>
            <SpecScorecard />
            <PerformanceSettingsPanel />
          </div>

          <div>
            <section aria-labelledby="rec-title" className="rounded-2xl border border-brass-500/40 bg-gradient-to-b from-brass-500/10 to-transparent p-4" data-testid="recommended-card">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 id="rec-title" className="label-luxe">
                    Recommended model &amp; optimal settings
                  </h3>
                  <div className="heading-display mt-1 text-lg" data-testid="recommended-tier">
                    {rec.profile.name}
                  </div>
                  <div className="text-xs text-ink-300">{rec.profile.tagline}</div>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-0.5 text-right text-[11px] text-ink-300 tabular">
                  <span>Context</span>
                  <span className="text-ink-100">{rec.profile.settings.contextWindow.toLocaleString()}</span>
                  <span>Images</span>
                  <span className="text-ink-100">{rec.profile.settings.imageResolution}px</span>
                  <span>GPU</span>
                  <span className="text-ink-100">{rec.profile.settings.lowMemoryMode ? 'Low-memory' : '100%'}</span>
                  <span>Temp</span>
                  <span className="text-ink-100">{rec.profile.settings.temperature}</span>
                </div>
              </div>
              <div className="mt-4">
                <TierCards />
              </div>
            </section>

            <div className="mt-5">
              <div className="flex gap-1 rounded-xl border border-ink-700 bg-ink-950/60 p-1" role="tablist" aria-label="Engine">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === t.id}
                    data-testid={`engine-tab-${t.id}`}
                    onClick={() => setTab(t.id)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors duration-150 ${activeTab === t.id ? 'bg-ink-800 text-brass-200' : 'text-ink-300 hover:text-ink-100'}`}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 min-h-[252px]" role="tabpanel">
                <EnginePanel engine={activeTab} />
              </div>
            </div>

            <button type="button" className="btn-primary mt-4 w-full py-3 text-[15px]" disabled={busy} onClick={() => void applyAndDownload(activeTab)} data-testid="one-click-download">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : activeTab === 'cloud' ? <Sparkles className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              {activeTab === 'cloud' ? '1-Click Apply Cloud Fallback' : '1-Click Apply & Download Best Model'}
            </button>
            <DownloadPanel />

            <details className="mt-5 rounded-xl border border-ink-700 bg-ink-900/50 p-4">
              <summary className="cursor-pointer text-sm text-ink-200">Active model bindings (advanced)</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <BindingSelect role="vision" />
                <BindingSelect role="text" />
              </div>
            </details>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-ink-700 px-6 py-3">
          <p className="text-[11px] text-ink-400">Re-open anytime from “Setup &amp; Model Download” in the top bar. Downloads continue in the background.</p>
          <button type="button" className="btn-primary" onClick={close} data-testid="finish-setup">
            Done — start the brief
          </button>
        </div>
      </div>
    </div>
  )
}
