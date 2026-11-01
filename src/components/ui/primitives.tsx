import { CircleAlert, CircleCheck, Info, Languages, TriangleAlert, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRuntimeStore } from '../../store/useRuntimeStore'

export { MarkdownView } from './MarkdownView'

export function ProgressBar({ value, label, className = '' }: { value: number; label?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, value * 100))
  return (
    <div
      className={`progress-track ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
    >
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Toggle({ checked, onChange, label, id, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; id: string; disabled?: boolean }) {
  return (
    <label htmlFor={id} className={`flex items-center gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span className="relative inline-flex h-5 w-9 shrink-0">
        <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="absolute inset-0 rounded-full bg-ink-600 transition-colors duration-150 peer-checked:bg-brass-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brass-300" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-ink-100 shadow transition-transform duration-150 peer-checked:translate-x-4" />
      </span>
      <span className="text-sm text-ink-100">{label}</span>
    </label>
  )
}

export function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="label-luxe">{eyebrow}</div>
        <h2 className="heading-display mt-1 text-2xl">{title}</h2>
      </div>
      {children}
    </div>
  )
}

/** Tells Philippe he can answer in Tagalog; it is translated to English automatically. */
export function LanguageHint() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-400" data-testid="language-hint">
      <Languages className="h-3.5 w-3.5 text-brass-300" aria-hidden />
      English or Tagalog — Tagalog is translated to English automatically
    </span>
  )
}

const TONE = {
  info: { icon: Info, cls: 'border-ink-600 text-ink-100' },
  success: { icon: CircleCheck, cls: 'border-verdigris-500/60 text-verdigris-300' },
  warning: { icon: TriangleAlert, cls: 'border-amberglow-400/60 text-amberglow-400' },
  error: { icon: CircleAlert, cls: 'border-ember-500/60 text-ember-300' },
} as const

export function Toaster() {
  const { toasts, dismiss } = useRuntimeStore(useShallow((s) => ({ toasts: s.toasts, dismiss: s.dismissToast })))
  return (
    // Bottom-centre: clear of the primary Back / Continue buttons that sit at the bottom corners of every step.
    <div className="no-print pointer-events-none fixed bottom-5 left-1/2 z-[70] flex w-[min(420px,calc(100vw-2.5rem))] -translate-x-1/2 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => {
        const { icon: Icon, cls } = TONE[t.tone]
        return (
          <div key={t.id} role="status" data-testid={`toast-${t.tone}`} className={`step-enter pointer-events-auto flex items-start gap-3 rounded-xl border bg-ink-850 px-4 py-3 text-sm shadow-panel ${cls}`}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="flex-1 text-ink-100">{t.message}</p>
            <button type="button" aria-label="Dismiss" className="text-ink-400 hover:text-ink-100" onClick={() => dismiss(t.id)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-600 px-6 py-12 text-center">
      <div className="mb-3 text-brass-300">{icon}</div>
      <h3 className="heading-display text-lg">{title}</h3>
      {children && <div className="mt-2 max-w-md text-sm text-ink-300">{children}</div>}
    </div>
  )
}
