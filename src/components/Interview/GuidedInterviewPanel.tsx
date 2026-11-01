import { ArrowRight, Check, ChevronLeft, ChevronRight, LoaderCircle, MessageSquareText, Plus, Sparkles, X } from 'lucide-react'
import { memo, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { PILLARS, pillarById, questionPages } from '../../constants/interviewPillars'
import { isAnswered, selectInterviewProgress, useProjectStore } from '../../store/useProjectStore'
import { useRuntimeStore } from '../../store/useRuntimeStore'
import type { InterviewQuestion, PillarId } from '../../types/architecture'
import { ProgressBar } from '../ui/primitives'

function PillarSidebar() {
  const { answers, active, setActivePillar } = useProjectStore(useShallow((s) => ({ answers: s.answers, active: s.activePillar, setActivePillar: s.setActivePillar })))
  const progress = selectInterviewProgress(answers)
  return (
    <aside className="panel h-fit p-4 lg:sticky lg:top-[calc(var(--header-h)+var(--rail-h)+1rem)]" aria-label="Pillar progress" data-testid="pillar-sidebar">
      <div className="label-luxe">Pillar progress</div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="heading-display text-2xl tabular" data-testid="interview-percent">
          {Math.round((progress.answered / progress.total) * 100)}%
        </span>
        <span className="text-xs text-ink-400 tabular">
          {progress.answered}/{progress.total} answers
        </span>
      </div>
      <ProgressBar value={progress.answered / progress.total} label="Interview progress" className="mt-2" />
      <ol className="mt-4 space-y-1">
        {PILLARS.map((p) => {
          const pp = progress.pillars.find((x) => x.id === p.id)!
          const isActive = p.id === active
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setActivePillar(p.id)}
                data-testid={`pillar-${p.id}`}
                data-complete={pp.complete}
                aria-current={isActive ? 'true' : undefined}
                className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 ${isActive ? 'bg-ink-800' : 'hover:bg-ink-850'}`}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] tabular ${
                    pp.complete ? 'border-verdigris-400/70 bg-verdigris-500/15 text-verdigris-300' : isActive ? 'border-brass-400 text-brass-200' : 'border-ink-600 text-ink-400'
                  }`}
                >
                  {pp.complete ? <Check className="h-3 w-3" /> : p.index}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[13px] ${isActive ? 'text-ink-100' : 'text-ink-300'}`}>{p.title}</span>
                  <span className="block text-[10px] text-ink-500 tabular">
                    {pp.answered}/{pp.total} answered
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}

const QuestionCard = memo(function QuestionCard({ q, n }: { q: InterviewQuestion; n: number }) {
  const { value, setAnswer, toggleChip } = useProjectStore(
    useShallow((s) => ({ value: s.answers[q.id]?.value ?? '', setAnswer: s.setAnswer, toggleChip: s.toggleChip })),
  )
  const selected = new Set(value.split(';').map((v) => v.trim()))
  const answered = value.trim().length >= q.minLength
  return (
    <div className="panel-raised p-5" data-testid={`question-${q.id}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] tabular ${answered ? 'bg-verdigris-500/20 text-verdigris-300' : 'bg-brass-500/15 text-brass-200'}`}>
          {answered ? <Check className="h-3 w-3" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <label htmlFor={`a-${q.id}`} className="block text-[15px] font-medium leading-snug text-ink-100">
            {q.prompt}
          </label>
          <p className="mt-1 text-xs text-ink-400">{q.helper}</p>
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Quick-fill suggestions">
            {q.chips.map((chip) => (
              <button
                key={chip}
                type="button"
                className={`chip ${selected.has(chip) ? 'chip-active' : ''}`}
                aria-pressed={selected.has(chip)}
                data-testid="suggestion-chip"
                onClick={() => toggleChip(q.id, chip)}
              >
                {selected.has(chip) ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                {chip}
              </button>
            ))}
          </div>
          <textarea
            id={`a-${q.id}`}
            data-testid={`answer-${q.id}`}
            className="input mt-3 min-h-[84px] resize-y leading-relaxed"
            placeholder={q.placeholder}
            value={value}
            onChange={(e) => setAnswer(q.id, e.target.value)}
          />
        </div>
      </div>
    </div>
  )
})

function FollowUps({ pillar }: { pillar: PillarId }) {
  const { allFollowUps, answer, remove, request, hasModel } = useProjectStore(
    useShallow((s) => ({
      allFollowUps: s.followUps,
      answer: s.answerFollowUp,
      remove: s.removeFollowUp,
      request: s.requestFollowUp,
      hasModel: Boolean(s.engine.text ?? s.engine.vision),
    })),
  )
  const followUps = useMemo(() => allFollowUps.filter((f) => f.pillar === pillar), [allFollowUps, pillar])
  const loading = useRuntimeStore((s) => s.followUpLoading === pillar)
  return (
    <div className="mt-4">
      {followUps.map((f) => (
        <div key={f.id} className="panel-raised mb-3 border-brass-500/30 p-4" data-testid="followup-card">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 text-sm text-brass-100">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brass-300" />
              <span data-testid="followup-question">{f.question}</span>
            </div>
            <button type="button" className="text-ink-400 hover:text-ink-100" aria-label="Remove follow-up" onClick={() => remove(f.id)}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <textarea
            className="input mt-2 min-h-[64px] resize-y"
            placeholder="Answer (optional — included in the brief)"
            data-testid="followup-answer"
            value={f.answer}
            onChange={(e) => answer(f.id, e.target.value)}
          />
        </div>
      ))}
      <button type="button" className="btn-ghost btn-sm" disabled={!hasModel || loading} onClick={() => void request(pillar)} data-testid="ask-followup" title={hasModel ? undefined : 'Configure a model in Setup first'}>
        {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <MessageSquareText className="h-3.5 w-3.5" />}
        {hasModel ? 'Ask the AI for a tailored follow-up question' : 'AI follow-ups need a model (Setup)'}
      </button>
    </div>
  )
}

export function GuidedInterviewPanel() {
  const { activePillar, page, setActivePillar, setPage, setStep, answers } = useProjectStore(
    useShallow((s) => ({ activePillar: s.activePillar, page: s.interviewPage, setActivePillar: s.setActivePillar, setPage: s.setInterviewPage, setStep: s.setStep, answers: s.answers })),
  )
  const pillar = pillarById(activePillar)
  const pages = questionPages(pillar)
  const safePage = Math.min(page, pages.length - 1)
  const questions = pages[safePage] ?? []
  const pillarIdx = PILLARS.findIndex((p) => p.id === pillar.id)
  const isLastPage = safePage === pages.length - 1
  const isLastPillar = pillarIdx === PILLARS.length - 1
  const progress = selectInterviewProgress(answers)
  const pageDone = questions.every((q) => isAnswered(q.id, answers))

  const next = () => {
    if (!isLastPage) setPage(safePage + 1)
    else if (!isLastPillar) setActivePillar(PILLARS[pillarIdx + 1]!.id)
    else setStep(3)
  }
  const prev = () => {
    if (safePage > 0) setPage(safePage - 1)
    else if (pillarIdx > 0) {
      const prevPillar = PILLARS[pillarIdx - 1]!
      setActivePillar(prevPillar.id, questionPages(prevPillar).length - 1)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <PillarSidebar />
      <section className="panel p-6" data-testid="interview-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="label-luxe">
              Pillar {pillar.index} of 8 · Questions {safePage * 2 + 1}–{safePage * 2 + questions.length} of {pillar.questions.length}
            </div>
            <h2 className="heading-display mt-1 text-2xl" data-testid="pillar-title">
              {pillar.title}
            </h2>
            <p className="mt-1 text-sm text-ink-400">{pillar.description}</p>
          </div>
        </div>

        <div key={`${pillar.id}-${safePage}`} className="step-enter mt-5 space-y-4">
          {questions.map((q, i) => (
            <QuestionCard key={q.id} q={q} n={safePage * 2 + i + 1} />
          ))}
        </div>

        {isLastPage && <FollowUps pillar={pillar.id} />}

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-ink-700 pt-4">
          <button type="button" className="btn-ghost" onClick={prev} disabled={pillarIdx === 0 && safePage === 0} data-testid="interview-prev">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <span className="text-xs text-ink-400">{pageDone ? 'Answered — continue when ready.' : 'Use a suggestion chip or type your own answer.'}</span>
          <button type="button" className={pageDone ? 'btn-primary' : 'btn-secondary'} onClick={next} data-testid="interview-next">
            {isLastPage && isLastPillar ? (
              <>
                {progress.complete ? 'Draft the brief' : 'Go to drafting'} <ArrowRight className="h-4 w-4" />
              </>
            ) : (
              <>
                Next <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  )
}
