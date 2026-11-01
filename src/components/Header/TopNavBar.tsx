import { Check, Download, Lock, MonitorCog, WifiOff } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { ollamaHasModel } from '../../services/modelDownloader'
import { installApp } from '../../services/pwaInstall'
import { selectIntakeStatus, selectInterviewProgress, selectIsApproved, useProjectStore } from '../../store/useProjectStore'
import { useRuntimeStore } from '../../store/useRuntimeStore'
import type { ModelBinding, WorkflowStep } from '../../types/architecture'

/* ------------------------------------------------------------------ */
/* Engine status                                                        */
/* ------------------------------------------------------------------ */

function useBindingReady(b: ModelBinding | null): 'ready' | 'missing' | 'none' {
  const { ollama, cached } = useRuntimeStore(useShallow((s) => ({ ollama: s.ollama, cached: s.webllmCached })))
  const hasKey = useProjectStore((s) => s.engine.cloudApiKey.trim().length > 0)
  if (!b) return 'none'
  if (b.engine === 'ollama') return ollamaHasModel(ollama, b.model) ? 'ready' : 'missing'
  if (b.engine === 'webllm') return cached[b.model] ? 'ready' : 'missing'
  return hasKey ? 'ready' : 'missing'
}

const DOT = { ready: 'bg-verdigris-400', missing: 'bg-amberglow-400', none: 'bg-ink-500' } as const

function EngineChip({ role, binding }: { role: string; binding: ModelBinding | null }) {
  const state = useBindingReady(binding)
  // Live download percentage for this model, as a primitive so other models' ticks don't re-render it.
  const downloading = useRuntimeStore((s) => {
    const d = binding ? Object.values(s.downloads).find((x) => x.model === binding.model) : undefined
    return d && ['preparing', 'downloading', 'verifying', 'loading', 'paused'].includes(d.status) ? (d.status === 'paused' ? 'paused' : `${Math.round(d.fraction * 100)}%`) : ''
  })
  const engine = binding ? (binding.engine === 'ollama' ? 'Ollama' : binding.engine === 'webllm' ? 'this browser' : 'Claude cloud') : ''
  const status = state === 'ready' ? 'ready' : downloading ? `downloading ${downloading}` : state === 'missing' ? 'not installed yet' : 'not set up'
  return (
    <div className="flex min-w-0 items-center gap-2" title={binding ? `${role}: ${binding.model} on ${engine} — ${status}` : `${role}: not set up — open Setup`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${downloading && state !== 'ready' ? 'animate-pulse bg-brass-400' : DOT[state]}`} />
      <span className="text-[11px] uppercase tracking-wider text-ink-400">{role}</span>
      <span className="truncate text-xs text-ink-100">{binding ? binding.model : 'Not set up'}</span>
      {downloading && state !== 'ready' && <span className="shrink-0 text-[11px] text-brass-200 tabular">{downloading}</span>}
    </div>
  )
}

export function TopNavBar() {
  const { vision, text, openWizard } = useProjectStore(useShallow((s) => ({ vision: s.engine.vision, text: s.engine.text, openWizard: s.openWizard })))
  const { installable, online, standalone } = useRuntimeStore(
    useShallow((s) => ({ installable: s.installPromptAvailable, online: s.online, standalone: s.isStandalone })),
  )

  return (
    <header className="no-print sticky top-0 z-40 h-[var(--header-h)] border-b border-ink-700/70 bg-ink-950">
      <div className="mx-auto flex h-full max-w-[1440px] items-center gap-4 px-5">
        <div className="flex shrink-0 items-center gap-3">
          <img src="/favicon.svg" alt="" width={34} height={34} className="h-[34px] w-[34px] rounded-lg" />
          <div className="leading-tight">
            <div className="font-display text-[15px] text-ink-100">VIP Design Brief Creator</div>
            <div className="text-[10px] font-semibold uppercase tracking-luxe text-brass-300">Woodland Construction</div>
          </div>
        </div>

        <button
          type="button"
          onClick={openWizard}
          title="AI status — open Setup"
          className="mx-auto hidden min-w-0 max-w-md flex-1 grid-cols-2 gap-4 rounded-full border border-ink-700 bg-ink-900/70 px-4 py-1.5 text-left transition-colors duration-150 hover:border-ink-500 lg:grid"
          data-testid="engine-status"
        >
          <EngineChip role="Images" binding={vision} />
          <EngineChip role="Writing" binding={text} />
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {!online && (
            <span className="badge border border-amberglow-400/50 text-amberglow-400" title="Offline — local engines keep working">
              <WifiOff className="h-3 w-3" /> Offline
            </span>
          )}
          {installable && !standalone && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => void installApp()} data-testid="install-app">
              <Download className="h-4 w-4" /> Install app
            </button>
          )}
          <button type="button" className="btn-primary" onClick={openWizard} data-testid="open-setup">
            <MonitorCog className="h-4 w-4" />
            Setup &amp; Model Download
          </button>
        </div>
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* Step rail                                                            */
/* ------------------------------------------------------------------ */

const STEPS: Array<{ step: WorkflowStep; title: string; short: string }> = [
  { step: 1, title: 'Intake & Visual Analysis', short: 'Intake' },
  { step: 2, title: '8-Pillar Interview', short: 'Interview' },
  { step: 3, title: 'Draft the Brief', short: 'Draft' },
  { step: 4, title: 'Review & Compliance', short: 'Review' },
  { step: 5, title: 'Print-Ready PDF', short: 'PDF' },
]

export function StepRail() {
  const s = useProjectStore(
    useShallow((st) => ({
      current: st.currentStep,
      setStep: st.setStep,
      intake: selectIntakeStatus(st).complete,
      interview: selectInterviewProgress(st.answers).complete,
      hasDraft: st.brief.markdown.length > 0,
      approved: selectIsApproved(st),
    })),
  )
  const done: Record<WorkflowStep, boolean> = { 1: s.intake, 2: s.interview, 3: s.hasDraft, 4: s.approved, 5: false }
  const locked: Record<WorkflowStep, boolean> = { 1: false, 2: false, 3: false, 4: !s.hasDraft, 5: !s.approved }

  return (
    <nav className="no-print border-b border-ink-800 bg-ink-950/60" aria-label="Workflow steps">
      <ol className="mx-auto flex h-[var(--rail-h)] max-w-[1440px] items-center gap-1 overflow-x-auto px-5">
        {STEPS.map(({ step, title, short }, i) => {
          const active = s.current === step
          return (
            <li key={step} className="flex items-center">
              <button
                type="button"
                data-testid={`step-${step}`}
                aria-current={active ? 'step' : undefined}
                onClick={() => s.setStep(step)}
                className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors duration-150 ${active ? 'bg-ink-800' : 'hover:bg-ink-900'}`}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular ${
                    done[step]
                      ? 'border-verdigris-400/70 bg-verdigris-500/15 text-verdigris-300'
                      : active
                        ? 'border-brass-400 bg-brass-500/15 text-brass-200'
                        : 'border-ink-600 text-ink-300'
                  }`}
                >
                  {done[step] ? <Check className="h-3.5 w-3.5" /> : locked[step] ? <Lock className="h-3 w-3" /> : step}
                </span>
                <span className="leading-tight">
                  <span className={`block text-[10px] uppercase tracking-wider ${active ? 'text-brass-300' : 'text-ink-400'}`}>Step {step}</span>
                  <span className={`block whitespace-nowrap text-[13px] ${active ? 'text-ink-100' : 'text-ink-300 group-hover:text-ink-100'}`}>
                    <span className="hidden md:inline">{title}</span>
                    <span className="md:hidden">{short}</span>
                  </span>
                </span>
              </button>
              {i < STEPS.length - 1 && <span className="mx-1 hidden h-px w-6 bg-ink-700 sm:block" aria-hidden />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
