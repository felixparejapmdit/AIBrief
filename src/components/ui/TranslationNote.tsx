import { Languages, LoaderCircle } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useDebounced } from '../../hooks/useDebounced'
import { useProjectStore } from '../../store/useProjectStore'
import { useRuntimeStore } from '../../store/useRuntimeStore'
import { containsTagalog } from '../../utils/tagalog'
import { hashString } from '../../utils/text'

type NoteState = 'translating' | 'waiting' | 'no-model' | 'error' | 'kept' | 'done' | 'detected' | 'idle'

function LinkButton({ onClick, children, testId }: { onClick: () => void; children: ReactNode; testId: string }) {
  return (
    <button type="button" className="font-medium text-brass-300 underline-offset-2 hover:text-brass-200 hover:underline" onClick={onClick} data-testid={testId}>
      {children}
    </button>
  )
}

/**
 * One fixed-height status line under a text field: shows when Tagalog is detected, translated,
 * waiting for the model, or kept as typed — with Undo / Show original. `idle` renders otherwise.
 */
export function TranslationNote({ fieldKey, value, idle, className = '' }: { fieldKey: string; value: string; idle?: ReactNode; className?: string }) {
  const status = useRuntimeStore((r) => r.translationStatus[fieldKey])
  const waitingModel = status?.state === 'waiting-model' ? status.model : null
  const waitingPct = useRuntimeStore((r) => {
    if (!waitingModel) return null
    const d = Object.values(r.downloads).find((x) => x.model === waitingModel)
    return d && d.status !== 'completed' && d.status !== 'cancelled' ? Math.round(d.fraction * 100) : null
  })
  const { record, kept, undo, keep, retranslate, openWizard } = useProjectStore(
    useShallow((s) => ({
      record: s.translations[fieldKey],
      kept: s.keptOriginal[fieldKey],
      undo: s.undoTranslation,
      keep: s.keepAsTyped,
      retranslate: s.retranslateField,
      openWizard: s.openWizard,
    })),
  )
  const settled = useDebounced(value, 250)
  const tagalog = useMemo(() => containsTagalog(settled), [settled])
  const [showOriginal, setShowOriginal] = useState(false)

  let state: NoteState = 'idle'
  if (status?.state === 'translating') state = 'translating'
  else if (kept != null && kept === hashString(value)) state = 'kept'
  else if (record && record.english === value) state = 'done'
  else if (tagalog && status?.state === 'waiting-model') state = 'waiting'
  else if (tagalog && status?.state === 'no-model') state = 'no-model'
  else if (tagalog && status?.state === 'error') state = 'error'
  else if (tagalog) state = 'detected'

  const icon = <Languages className="h-3.5 w-3.5 shrink-0" aria-hidden />
  return (
    <div className={className}>
      <div className="flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-snug" data-testid="translation-note" data-state={state} data-field={fieldKey} aria-live="polite">
        {state === 'idle' && idle}
        {state === 'translating' && (
          <span className="flex items-center gap-1.5 text-brass-200">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> Translating Tagalog to English…
          </span>
        )}
        {state === 'detected' && (
          <span className="flex items-center gap-1.5 text-brass-200">
            {icon} Tagalog detected — it will be translated to English when you finish typing.
          </span>
        )}
        {state === 'waiting' && (
          <span className="flex items-center gap-1.5 text-brass-200">
            {icon} Tagalog detected — it will be translated as soon as the AI model finishes downloading{waitingPct != null ? ` (${waitingPct}%)` : ''}.
          </span>
        )}
        {state === 'no-model' && (
          <>
            <span className="flex items-center gap-1.5 text-amberglow-400">{icon} Tagalog detected — install the AI model to translate it automatically.</span>
            <LinkButton onClick={openWizard} testId="translation-open-setup">
              Open Setup
            </LinkButton>
            <LinkButton onClick={() => keep(fieldKey)} testId="translation-keep">
              Keep as typed
            </LinkButton>
          </>
        )}
        {state === 'error' && status?.state === 'error' && (
          <>
            <span className="text-ember-300">Couldn’t translate: {status.error}</span>
            <LinkButton onClick={() => retranslate(fieldKey)} testId="translation-retry">
              Try again
            </LinkButton>
            <LinkButton onClick={() => keep(fieldKey)} testId="translation-keep">
              Keep as typed
            </LinkButton>
          </>
        )}
        {state === 'kept' && (
          <>
            <span className="text-ink-300">Kept as typed — not translated.</span>
            <LinkButton onClick={() => retranslate(fieldKey)} testId="translation-translate">
              Translate to English
            </LinkButton>
          </>
        )}
        {state === 'done' && record && (
          <>
            <span className="flex items-center gap-1.5 text-verdigris-300">
              {icon} Translated from Tagalog{record.review ? ' — please check the wording' : ''}.
            </span>
            <LinkButton onClick={() => setShowOriginal((v) => !v)} testId="translation-show-original">
              {showOriginal ? 'Hide original' : 'Show original'}
            </LinkButton>
            <LinkButton onClick={() => undo(fieldKey)} testId="translation-undo">
              Undo
            </LinkButton>
          </>
        )}
      </div>
      {state === 'done' && showOriginal && record && (
        <p className="mt-1.5 rounded-lg border border-ink-700 bg-ink-950/50 px-3 py-2 text-xs leading-relaxed text-ink-300" data-testid="translation-original">
          <span className="text-ink-400">Original (Tagalog): </span>
          {record.original}
        </p>
      )}
    </div>
  )
}
