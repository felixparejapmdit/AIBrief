import {
  ArrowRight,
  Check,
  CircleAlert,
  CircleCheck,
  Columns2,
  Eye,
  FileText,
  Languages,
  LoaderCircle,
  LockOpen,
  PenLine,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { BRIEF_SECTIONS } from '../../constants/vipSkillPrompt'
import { describeBinding } from '../../services/aiClient'
import { useDebounced } from '../../hooks/useDebounced'
import { describeField, selectIntakeStatus, selectInterviewProgress, selectIsApproved, selectPendingTranslations, useProjectStore } from '../../store/useProjectStore'
import { useRuntimeStore } from '../../store/useRuntimeStore'
import type { AthleteReplacement, ComplianceCheck, ComplianceReport } from '../../types/architecture'
import { auditBrief, countSections } from '../../utils/complianceAuditor'
import { MarkdownView, ProgressBar, SectionTitle } from '../ui/primitives'

type ViewMode = 'edit' | 'split' | 'preview'

/* ------------------------------------------------------------------ */
/* Shared hooks                                                         */
/* ------------------------------------------------------------------ */

function useReadiness() {
  return useProjectStore(
    useShallow((s) => {
      const intake = selectIntakeStatus(s)
      const interview = selectInterviewProgress(s.answers)
      return { intake: intake.complete, interview: interview.complete, answered: interview.answered, total: interview.total }
    }),
  )
}

/** Inputs that still contain Tagalog, with what is happening to each and a way to reach it. */
function PendingTranslations({ keys }: { keys: string[] }) {
  const s = useProjectStore(
    useShallow((st) => ({ objective: st.objective, answers: st.answers, followUps: st.followUps, images: st.images, setStep: st.setStep, setActivePillar: st.setActivePillar, keep: st.keepAsTyped, openWizard: st.openWizard })),
  )
  const statuses = useRuntimeStore((r) => r.translationStatus)
  if (!keys.length) return null
  return (
    <div className="mt-4 rounded-xl border border-amberglow-400/40 bg-amberglow-400/5 p-4" data-testid="pending-translations">
      <div className="flex items-center gap-2 text-sm text-ink-100">
        <Languages className="h-4 w-4 text-amberglow-400" />
        {keys.length} {keys.length === 1 ? 'answer is' : 'answers are'} still in Tagalog. The brief is written in English, so {keys.length === 1 ? 'it is' : 'they are'} translated first.
      </div>
      <ul className="mt-3 space-y-2">
        {keys.map((key) => {
          const where = describeField(s, key)
          const st = statuses[key]
          const note =
            st?.state === 'translating'
              ? 'Translating now…'
              : st?.state === 'waiting-model'
                ? 'Waits for the AI model to finish downloading.'
                : st?.state === 'no-model'
                  ? 'Needs the AI model (Setup) — or rewrite it in English.'
                  : st?.state === 'error'
                    ? `Translation failed: ${st.error}`
                    : 'Queued for translation.'
          return (
            <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" data-testid="pending-translation">
              <span className="min-w-0 flex-1 truncate text-ink-200" title={where.label}>
                {where.label}
              </span>
              <span className="text-ink-400">{note}</span>
              <button
                type="button"
                className="font-medium text-brass-300 hover:underline"
                onClick={() => {
                  if (where.pillar) s.setActivePillar(where.pillar, where.page)
                  s.setStep(where.step)
                }}
              >
                Go to answer
              </button>
              {st?.state === 'no-model' && (
                <button type="button" className="font-medium text-brass-300 hover:underline" onClick={s.openWizard}>
                  Open Setup
                </button>
              )}
              <button type="button" className="font-medium text-ink-300 hover:text-ink-100 hover:underline" onClick={() => s.keep(key)} data-testid="pending-keep">
                Keep as typed
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The audit runs on the settled text, so keystrokes never wait for it. */
function useAudit(markdown: string): ComplianceReport {
  const settled = useDebounced(markdown, 120)
  return useMemo(() => auditBrief(settled), [settled])
}

/* ------------------------------------------------------------------ */
/* Drafting progress                                                    */
/* ------------------------------------------------------------------ */

function DraftProgressPanel() {
  const draft = useRuntimeStore((s) => s.draft)
  const { cancel, generate } = useProjectStore(useShallow((s) => ({ cancel: s.cancelGeneration, generate: s.generateBrief })))
  const boxRef = useRef<HTMLPreElement>(null)
  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [draft?.text])
  if (!draft) return null
  const fraction = draft.running ? Math.max(0, (draft.section - 1) / BRIEF_SECTIONS.length) + Math.min(draft.text.length / 2400, 0.95) / BRIEF_SECTIONS.length : 1
  return (
    <div className="panel mt-5 p-5" data-testid="draft-progress">
      {draft.error ? (
        <div className="flex items-start gap-3 text-sm text-ember-300" data-testid="draft-error">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1">
            <div className="font-medium">Drafting failed at section {draft.section || 1}</div>
            <div className="mt-1 text-xs text-ink-300">{draft.error}</div>
          </div>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void generate()}>
            <RotateCcw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-brass-200">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              <span data-testid="draft-status">{draft.status}</span>
            </div>
            <button type="button" className="btn-secondary btn-sm" onClick={cancel} data-testid="cancel-generation">
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
          <div className="mt-3 flex gap-1" aria-hidden>
            {BRIEF_SECTIONS.map((s) => (
              <span
                key={s.number}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${s.number < draft.section ? 'bg-verdigris-400' : s.number === draft.section ? 'bg-brass-400' : 'bg-ink-700'}`}
              />
            ))}
          </div>
          <ProgressBar value={fraction} label="Drafting progress" className="sr-only" />
          <pre ref={boxRef} className="mt-4 h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-ink-700 bg-ink-950/70 p-4 font-mono text-xs leading-relaxed text-ink-200" data-testid="draft-stream">
            {draft.text || 'Waiting for the first tokens…'}
          </pre>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Editor                                                               */
/* ------------------------------------------------------------------ */

const EditorPane = memo(function EditorPane({ mode }: { mode: ViewMode }) {
  const { markdown, setMarkdown } = useProjectStore(useShallow((s) => ({ markdown: s.brief.markdown, setMarkdown: s.setBriefMarkdown })))
  const settled = useDebounced(markdown, 120)
  return (
    <div className={`grid gap-4 ${mode === 'split' ? 'xl:grid-cols-2' : ''}`}>
      {mode !== 'preview' && (
        <textarea
          data-testid="brief-editor"
          aria-label="Brief Markdown editor"
          spellCheck
          className="input min-h-[640px] resize-y font-mono text-[12.5px] leading-relaxed"
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
        />
      )}
      {mode !== 'edit' && (
        <div className="panel-raised max-h-[820px] min-h-[640px] overflow-y-auto px-7 py-6" data-testid="brief-preview">
          <MarkdownView markdown={settled} />
        </div>
      )}
    </div>
  )
})

function ViewToggle({ mode, setMode }: { mode: ViewMode; setMode: (m: ViewMode) => void }) {
  const opts: Array<{ id: ViewMode; label: string; icon: React.ReactNode }> = [
    { id: 'edit', label: 'Edit', icon: <PenLine className="h-3.5 w-3.5" /> },
    { id: 'split', label: 'Split', icon: <Columns2 className="h-3.5 w-3.5" /> },
    { id: 'preview', label: 'Preview', icon: <Eye className="h-3.5 w-3.5" /> },
  ]
  return (
    <div className="flex rounded-lg border border-ink-700 bg-ink-950/60 p-0.5" role="tablist" aria-label="View mode">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={mode === o.id}
          data-testid={`view-${o.id}`}
          onClick={() => setMode(o.id)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors duration-150 ${mode === o.id ? 'bg-ink-800 text-brass-200' : 'text-ink-300 hover:text-ink-100'}`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Step 3: Draft                                                        */
/* ------------------------------------------------------------------ */

function DraftStep() {
  const s = useProjectStore(
    useShallow((st) => ({
      brief: st.brief,
      generate: st.generateBrief,
      setStep: st.setStep,
      binding: st.engine.text ?? st.engine.vision,
    })),
  )
  const running = useRuntimeStore((r) => Boolean(r.draft?.running))
  const ready = useReadiness()
  const pending = useProjectStore(useShallow(selectPendingTranslations))
  const [mode, setMode] = useState<ViewMode>('split')
  const canGenerate = ready.intake && ready.interview && pending.length === 0 && !running
  const sections = useMemo(() => countSections(s.brief.markdown), [s.brief.markdown])
  const words = useMemo(() => (s.brief.markdown.match(/\S+/g) ?? []).length, [s.brief.markdown])

  return (
    <div>
      <SectionTitle eyebrow="Step 3 · Draft the VIP Design Brief" title="Exact 9-section Architectural Design Brief">
        <div className="text-xs text-ink-400">
          Written by: <span className="text-ink-100">{s.binding ? describeBinding(s.binding) : 'Built-in brief writer (no AI model)'}</span>
        </div>
      </SectionTitle>

      <div className="panel p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-center">
          <Readiness ok={ready.intake} label="Intake & visual analysis complete" testId="ready-intake" />
          <Readiness ok={ready.interview} label={`8-pillar interview complete (${ready.answered}/${ready.total})`} testId="ready-interview" />
          <Readiness ok={pending.length === 0} label={pending.length ? `${pending.length} Tagalog ${pending.length === 1 ? 'answer' : 'answers'} to translate` : 'All answers in English'} testId="ready-language" />
          <button type="button" className="btn-primary" disabled={!canGenerate} onClick={() => void s.generate()} data-testid="generate-brief">
            {running ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {s.brief.markdown ? 'Regenerate draft' : 'Generate the 9-section brief'}
          </button>
        </div>
        <PendingTranslations keys={pending} />
        {!s.binding && (
          <p className="mt-3 text-xs text-ink-400">No drafting model is configured, so the built-in brief writer drafts the brief from your interview. Install the AI model in Setup for AI drafting.</p>
        )}
        {s.brief.markdown && !running && <p className="mt-3 text-xs text-ink-400">Regenerating replaces your edits and clears any approval.</p>}
      </div>

      <DraftProgressPanel />

      {s.brief.markdown && !running && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
              <span className={`badge ${sections === BRIEF_SECTIONS.length ? 'bg-verdigris-500/15 text-verdigris-300' : 'bg-ember-500/15 text-ember-300'}`} data-testid="section-count">
                <FileText className="h-3 w-3" /> {sections}/9 sections
              </span>
              <span className="tabular">{words.toLocaleString()} words</span>
              {s.brief.generatedBy && <span>· {s.brief.generatedBy}</span>}
              {s.brief.repairedSections.length > 0 && (
                <span className="text-amberglow-400" data-testid="repaired-note">
                  · Sections {s.brief.repairedSections.join(', ')} normalised to the mandated template
                </span>
              )}
            </div>
            <ViewToggle mode={mode} setMode={setMode} />
          </div>
          <EditorPane mode={mode} />
          <div className="mt-5 flex justify-end">
            <button type="button" className="btn-primary" onClick={() => s.setStep(4)} data-testid="to-review">
              Continue to Review &amp; Compliance <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Readiness({ ok, label, testId }: { ok: boolean; label: string; testId: string }) {
  return (
    <div className="flex items-center gap-2 text-sm" data-testid={testId} data-ok={ok}>
      {ok ? <CircleCheck className="h-4 w-4 text-verdigris-300" /> : <CircleAlert className="h-4 w-4 text-amberglow-400" />}
      <span className={ok ? 'text-ink-100' : 'text-ink-300'}>{label}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Step 4: Review & Compliance                                          */
/* ------------------------------------------------------------------ */

function CheckRow({ check }: { check: ComplianceCheck }) {
  const { applyFix, replacement, setReplacement } = useProjectStore(
    useShallow((s) => ({ applyFix: s.applyFix, replacement: s.athleteReplacement, setReplacement: s.setAthleteReplacement })),
  )
  const translating = useRuntimeStore((r) => r.briefTranslating)
  const [open, setOpen] = useState(false)
  const isForbidden = check.id === 'forbidden-athletes'
  const isLanguage = check.id === 'english-only'
  return (
    <li className={`rounded-xl border p-3 ${check.passed ? 'border-ink-700 bg-ink-900/50' : 'border-ember-500/40 bg-ember-500/5'}`} data-testid={`check-${check.id}`} data-passed={check.passed}>
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded ${check.passed ? 'bg-verdigris-500/20 text-verdigris-300' : 'bg-ember-500/20 text-ember-300'}`} aria-hidden>
          {check.passed ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] leading-snug text-ink-100">{check.label}</div>
          {!check.passed && (
            <button type="button" className="mt-0.5 text-[11px] text-ember-300 underline-offset-2 hover:underline" onClick={() => setOpen((o) => !o)}>
              {check.issues.length} issue{check.issues.length === 1 ? '' : 's'} {open ? '— hide' : '— show'}
            </button>
          )}
        </div>
        {!check.passed && check.autoFixable && !isForbidden && (
          <button type="button" className="btn-secondary btn-sm shrink-0" disabled={isLanguage && translating} onClick={() => applyFix(check.id)} data-testid={`fix-${check.id}`}>
            {isLanguage ? (
              <>
                {translating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />} Translate to English
              </>
            ) : (
              <>
                <WandSparkles className="h-3.5 w-3.5" /> Fix
              </>
            )}
          </button>
        )}
      </div>
      {isForbidden && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-7">
          <label className="text-[11px] text-ink-400" htmlFor="replacement-select">
            Replace with
          </label>
          <select
            id="replacement-select"
            className="input w-auto py-1 text-xs"
            data-testid="replacement-select"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value as AthleteReplacement)}
          >
            <option value="guests">guests</option>
            <option value="patrons">patrons</option>
            <option value="principals">principals</option>
          </select>
          <button type="button" className="btn-secondary btn-sm" disabled={check.passed} onClick={() => applyFix('forbidden-athletes')} data-testid="sanitize-athletes">
            <ShieldCheck className="h-3.5 w-3.5" /> Auto-sanitize
          </button>
        </div>
      )}
      {open && !check.passed && (
        <ul className="mt-2 space-y-1.5 pl-7 text-[11px] text-ink-300">
          {check.issues.slice(0, 12).map((iss, i) => (
            <li key={i}>
              <div>{iss.message}</div>
              {iss.excerpt && <div className="mt-0.5 truncate font-mono text-ink-500">“…{iss.excerpt}…”</div>}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function ReviewStep() {
  const s = useProjectStore(
    useShallow((st) => ({
      markdown: st.brief.markdown,
      approval: st.approval,
      approved: selectIsApproved(st),
      approve: st.approve,
      revoke: st.revokeApproval,
      fixAll: st.applyAllFixes,
      setStep: st.setStep,
    })),
  )
  const toast = useRuntimeStore((r) => r.toast)
  const ready = useReadiness()
  const report = useAudit(s.markdown)
  const [mode, setMode] = useState<ViewMode>('preview')
  const canApprove = ready.intake && ready.interview && report.allPassed && report.auditedHash !== '' && !s.approved

  if (!s.markdown) {
    return (
      <div className="panel p-8 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-brass-300" />
        <h2 className="heading-display mt-3 text-xl">No draft to review yet</h2>
        <p className="mt-1 text-sm text-ink-400">Generate the 9-section brief in Step 3 first.</p>
        <button type="button" className="btn-primary mt-4" onClick={() => s.setStep(3)}>
          Go to Step 3
        </button>
      </div>
    )
  }

  return (
    <div>
      <SectionTitle eyebrow="Step 4 · Review, Refine & Compliance Audit" title="Compliance review">
        <ViewToggle mode={mode} setMode={setMode} />
      </SectionTitle>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <EditorPane mode={mode} />
        <aside className="space-y-4 xl:sticky xl:top-[calc(var(--header-h)+var(--rail-h)+1rem)] xl:h-fit">
          <section className="panel p-4" data-testid="compliance-scorecard">
            <div className="flex items-center justify-between">
              <div className="label-luxe">Live compliance scorecard</div>
              <span className={`badge tabular ${report.allPassed ? 'bg-verdigris-500/15 text-verdigris-300' : 'bg-ember-500/15 text-ember-300'}`} data-testid="compliance-score">
                {report.passedCount}/{report.total} passed
              </span>
            </div>
            <ul className="mt-3 space-y-2">
              {report.checks.map((c) => (
                <CheckRow key={c.id} check={c} />
              ))}
            </ul>
            {!report.allPassed && (
              <button type="button" className="btn-secondary mt-3 w-full" onClick={s.fixAll} data-testid="fix-all">
                <WandSparkles className="h-4 w-4" /> Fix all automatically
              </button>
            )}
          </section>

          <section className="panel p-4" data-testid="approval-panel">
            <div className="label-luxe">Approval</div>
            <ul className="mt-3 space-y-1.5 text-xs">
              <Prereq ok={ready.intake} label="Intake & visual analysis complete" />
              <Prereq ok={ready.interview} label="8-pillar interview complete" />
              <Prereq ok={report.allPassed} label={`All ${report.total} compliance checks passed`} />
            </ul>
            {s.approved && s.approval ? (
              <div className="mt-4" data-testid="approved-state">
                <div className="flex items-center gap-2 rounded-lg border border-verdigris-500/40 bg-verdigris-500/10 px-3 py-2 text-sm text-verdigris-300">
                  <LockOpen className="h-4 w-4" /> Approved {new Date(s.approval.approvedAt).toLocaleString()} — PDF unlocked
                </div>
                <div className="mt-3 flex gap-2">
                  <button type="button" className="btn-primary flex-1" onClick={() => s.setStep(5)} data-testid="to-pdf">
                    Open Print-Ready PDF <ArrowRight className="h-4 w-4" />
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={s.revoke} data-testid="revoke-approval">
                    Revoke
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-ink-400">Any edit to the draft re-locks the PDF until it is approved again.</p>
              </div>
            ) : (
              <button
                type="button"
                className="btn-primary mt-4 w-full py-3"
                disabled={!canApprove}
                aria-label="Approve Draft for Print — Approve Draft & Unlock Print-Ready PDF"
                data-testid="approve-draft"
                onClick={() => {
                  if (s.approve()) toast('Draft approved — the Print-Ready PDF is unlocked.', 'success')
                  else toast('Approval requires a complete intake, interview and a fully compliant draft.', 'warning')
                }}
              >
                <ShieldCheck className="h-4 w-4" /> Approve Draft &amp; Unlock Print-Ready PDF
              </button>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}

function Prereq({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? <CircleCheck className="h-3.5 w-3.5 text-verdigris-300" /> : <CircleAlert className="h-3.5 w-3.5 text-amberglow-400" />}
      <span className={ok ? 'text-ink-200' : 'text-ink-400'}>{label}</span>
    </li>
  )
}

export function BriefEditorAndAudit({ mode }: { mode: 'draft' | 'review' }) {
  return mode === 'draft' ? <DraftStep /> : <ReviewStep />
}
