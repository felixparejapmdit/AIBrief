import { ArrowRight, CircleAlert, CircleCheck, ImagePlus, Layers, LoaderCircle, Ruler, ScanSearch, Sparkles, Trash, Upload } from 'lucide-react'
import { memo, useCallback, useRef, useState, type DragEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { IMAGE_CATEGORY_LABELS } from '../../constants/vipSkillPrompt'
import { describeBinding } from '../../services/aiClient'
import { selectIntakeStatus, useProjectStore } from '../../store/useProjectStore'
import { useRuntimeStore } from '../../store/useRuntimeStore'
import type { ImageCategory, IntakeImage } from '../../types/architecture'
import { DESIGN_PRINCIPLES } from '../../types/architecture'
import { ACCEPTED_IMAGE_TYPES } from '../../utils/imageProcessing'
import { formatBytes } from '../../utils/text'
import { SectionTitle } from '../ui/primitives'

const CATEGORIES: Array<{ id: ImageCategory | 'auto'; label: string }> = [
  { id: 'auto', label: 'Auto-detect' },
  { id: 'site-photo', label: 'Site Photos' },
  { id: 'sketchup-render', label: 'SketchUp Renders' },
  { id: 'shop-drawing', label: 'Shop Drawings' },
  { id: 'design-peg', label: 'Design Pegs' },
]

function AnalysisList({ title, items, icon }: { title: string; items: string[]; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900/60 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-brass-300">
        {icon}
        {title}
      </div>
      <ul className="space-y-1 text-xs leading-relaxed text-ink-200">
        {items.length ? items.map((i, n) => <li key={n}>• {i}</li>) : <li className="text-ink-400">No observations.</li>}
      </ul>
    </div>
  )
}

const ImageCard = memo(function ImageCard({ image }: { image: IntakeImage }) {
  const { updateImage, removeImage, analyzeImage } = useProjectStore(
    useShallow((s) => ({ updateImage: s.updateImage, removeImage: s.removeImage, analyzeImage: s.analyzeImage })),
  )
  const stream = useRuntimeStore((s) => s.analysisStream[image.id])
  const a = image.analysis

  return (
    <article className="panel step-enter grid gap-4 p-4 md:grid-cols-[240px_minmax(0,1fr)]" data-testid="image-card" data-status={image.status}>
      <div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-ink-700 bg-ink-850">
          <img src={image.thumbnail} alt={image.name} width={480} height={360} className="h-full w-full object-cover" decoding="async" />
          <span className="badge absolute left-2 top-2 bg-ink-950/80 text-brass-200">{IMAGE_CATEGORY_LABELS[image.category]}</span>
        </div>
        <div className="mt-2 truncate text-sm text-ink-100" title={image.name}>
          {image.name}
        </div>
        <div className="text-[11px] text-ink-400 tabular">
          {image.width}×{image.height}px · {formatBytes(image.sizeBytes)}
        </div>
        <div className="mt-2 flex gap-1" aria-label="Dominant colours">
          {image.palette.map((c) => (
            <span key={c} className="h-4 w-4 rounded-full border border-ink-600" style={{ backgroundColor: c }} title={c} />
          ))}
        </div>
        <select
          className="input mt-3 py-1.5 text-xs"
          aria-label="Image category"
          data-testid="image-category"
          value={image.category}
          onChange={(e) => updateImage(image.id, { category: e.target.value as ImageCategory })}
        >
          {CATEGORIES.filter((c) => c.id !== 'auto').map((c) => (
            <option key={c.id} value={c.id}>
              {IMAGE_CATEGORY_LABELS[c.id as ImageCategory]}
            </option>
          ))}
        </select>
        <textarea
          className="input mt-2 min-h-[64px] resize-y py-1.5 text-xs"
          placeholder="Notes for the analyst (e.g. EPDM pad under the steel cover)…"
          aria-label="Image notes"
          data-testid="image-notes"
          value={image.notes}
          onChange={(e) => updateImage(image.id, { notes: e.target.value })}
        />
        <div className="mt-2 flex gap-2">
          <button type="button" className="btn-secondary btn-sm flex-1" disabled={image.status === 'analyzing'} onClick={() => void analyzeImage(image.id)} data-testid="reanalyze-image">
            <ScanSearch className="h-3.5 w-3.5" /> {a ? 'Re-analyse' : 'Analyse'}
          </button>
          <button type="button" className="btn-ghost btn-sm" aria-label={`Remove ${image.name}`} onClick={() => void removeImage(image.id)} data-testid="remove-image">
            <Trash className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="min-w-0">
        {image.status === 'analyzing' && (
          <div className="flex h-full min-h-[220px] flex-col rounded-lg border border-ink-700 bg-ink-950/50 p-4" data-testid="analysis-progress">
            <div className="flex items-center gap-2 text-sm text-brass-200">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Analysing with the active vision model…
            </div>
            <pre className="mt-3 h-40 overflow-hidden whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-ink-400">{stream ? stream.slice(-900) : 'Preparing image tiles…'}</pre>
          </div>
        )}
        {image.status === 'error' && (
          <div className="flex min-h-[220px] items-start gap-2 rounded-lg border border-ember-500/40 bg-ember-500/5 p-4 text-sm text-ember-300">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Analysis failed</div>
              <div className="mt-1 text-xs text-ink-300">{image.error}</div>
            </div>
          </div>
        )}
        {image.status === 'pending' && (
          <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-ink-600 text-sm text-ink-400">Queued for analysis…</div>
        )}
        {image.status === 'done' && a && (
          <div data-testid="analysis-cards">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={`badge ${a.mode === 'vision' ? 'bg-verdigris-500/15 text-verdigris-300' : 'bg-amberglow-400/15 text-amberglow-400'}`} data-testid="analysis-mode">
                <CircleCheck className="h-3 w-3" /> {a.mode === 'vision' ? 'Vision analysis' : 'Metadata-only analysis'}
              </span>
              <span className="truncate text-[11px] text-ink-400">{a.producedBy}</span>
            </div>
            <p className="mb-3 text-sm text-ink-100" data-testid="analysis-summary">
              {a.summary}
            </p>
            <div className="grid gap-2.5 lg:grid-cols-3">
              <AnalysisList title="Style & Spatial Flow" items={a.styleAndSpatialFlow} icon={<Sparkles className="h-3 w-3" />} />
              <AnalysisList title="Material Build-Ups & Transitions" items={a.materialBuildUps} icon={<Layers className="h-3 w-3" />} />
              <AnalysisList title="Constructability Notes" items={a.constructabilityNotes} icon={<Ruler className="h-3 w-3" />} />
            </div>
            <div className="mt-2.5 rounded-lg border border-ink-700 bg-ink-900/60 p-3">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-brass-300">7 Principles of Design</div>
              <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                {DESIGN_PRINCIPLES.map((p) => (
                  <div key={p} className="flex gap-2">
                    <dt className="w-20 shrink-0 text-ink-400">{p}</dt>
                    <dd className="text-ink-200">{a.designPrinciples[p] || '—'}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </div>
    </article>
  )
})

export function ImageAnalysisDropzone() {
  const s = useProjectStore(
    useShallow((st) => ({
      objective: st.objective,
      setObjective: st.setObjective,
      images: st.images,
      addFiles: st.addFiles,
      analyzeAll: st.analyzeAll,
      cancelAnalysis: st.cancelAnalysis,
      noVisuals: st.noVisualAssets,
      setNoVisuals: st.setNoVisualAssets,
      setStep: st.setStep,
      vision: st.engine.vision,
      text: st.engine.text,
      openWizard: st.openWizard,
    })),
  )
  const status = useProjectStore(useShallow((st) => selectIntakeStatus(st)))
  const [category, setCategory] = useState<ImageCategory | 'auto'>('auto')
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const analyzing = s.images.some((im) => im.status === 'analyzing' || im.status === 'pending')

  const onFiles = useCallback((list: FileList | null) => {
    if (list?.length) void s.addFiles(Array.from(list), category)
  }, [s, category])

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    onFiles(e.dataTransfer.files)
  }

  return (
    <div className="space-y-6">
      <section className="panel overflow-hidden">
        <div className="bg-gradient-to-r from-brass-500/10 via-transparent to-transparent px-6 py-5">
          <div className="label-luxe">Step 1 · Intake &amp; Visual Analysis</div>
          <h1 className="heading-display mt-1 text-3xl" data-testid="welcome-heading">
            Welcome, Philippe.
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-300">
            Let’s prepare The Client’s Architectural Design Brief on behalf of Woodland Construction. Start with the core project objective, then add site photos, SketchUp renders, technical shop drawings and design pegs for analysis.
          </p>
        </div>
        <div className="border-t border-ink-700 px-6 py-5">
          <label htmlFor="objective" className="text-sm font-medium text-ink-100">
            What is the core objective of this project?
          </label>
          <textarea
            id="objective"
            data-testid="objective-input"
            className="input mt-2 min-h-[92px] resize-y text-[15px] leading-relaxed"
            placeholder="e.g. Design a private hillside residence with an entertaining pavilion that stays discreet, durable and easy to maintain for decades."
            value={s.objective}
            onChange={(e) => s.setObjective(e.target.value)}
          />
          <div className="mt-1.5 flex justify-between text-[11px]">
            <span className={status.objectiveOk ? 'text-verdigris-300' : 'text-ink-400'}>{status.objectiveOk ? 'Objective captured' : 'At least 15 characters'}</span>
            <span className="text-ink-500 tabular">{s.objective.trim().length} chars</span>
          </div>
        </div>
      </section>

      <section className="panel p-6">
        <SectionTitle eyebrow="Visual intake" title="Upload visual material">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-300">
            <span className="text-ink-400">Vision engine:</span>
            <button type="button" className="chip" onClick={s.openWizard} data-testid="vision-engine-chip">
              {s.vision?.vision ? describeBinding(s.vision) : s.text ? `${describeBinding(s.text)} (metadata only)` : 'On-device pixel analysis — set up a model'}
            </button>
          </div>
        </SectionTitle>

        <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Upload as">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={category === c.id}
              data-testid={`upload-category-${c.id}`}
              className={`chip ${category === c.id ? 'chip-active' : ''}`}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div
          data-testid="dropzone"
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault()
            dragDepth.current++
            setDragging(true)
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => {
            dragDepth.current = Math.max(0, dragDepth.current - 1)
            if (!dragDepth.current) setDragging(false)
          }}
          onDrop={onDrop}
          className={`flex min-h-[150px] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors duration-150 ${
            dragging ? 'border-brass-400 bg-brass-500/10' : 'border-ink-600 bg-ink-950/40 hover:border-ink-500'
          }`}
        >
          <div className="grid h-12 w-12 place-items-center rounded-full bg-brass-500/15 text-brass-300">{dragging ? <Upload className="h-5 w-5" /> : <ImagePlus className="h-5 w-5" />}</div>
          <p className="mt-3 text-sm text-ink-100">Drag &amp; drop images here, or click to browse</p>
          <p className="mt-1 text-xs text-ink-400">PNG, JPEG, WebP, GIF, BMP or AVIF · multiple files · up to 40 MB each</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            className="hidden"
            data-testid="file-input"
            onChange={(e) => {
              onFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        {s.images.length > 0 ? (
          <>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-ink-300">
                <span className="text-ink-100 tabular">{s.images.filter((i) => i.status === 'done').length}</span> of <span className="tabular">{s.images.length}</span> analysed
              </div>
              <div className="flex gap-2">
                {analyzing ? (
                  <button type="button" className="btn-secondary btn-sm" onClick={s.cancelAnalysis} data-testid="cancel-analysis">
                    Stop analysis
                  </button>
                ) : (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => void s.analyzeAll()} data-testid="analyze-all" disabled={s.images.every((i) => i.status === 'done')}>
                    <ScanSearch className="h-3.5 w-3.5" /> Analyse remaining
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3 space-y-4">
              {s.images.map((im) => (
                <ImageCard key={im.id} image={im} />
              ))}
            </div>
          </>
        ) : (
          <label className="mt-4 flex items-center gap-2 text-sm text-ink-300">
            <input type="checkbox" className="h-4 w-4 accent-[#c9a14a]" checked={s.noVisuals} onChange={(e) => s.setNoVisuals(e.target.checked)} data-testid="no-visuals" />
            This project has no visual assets yet — continue with the interview only.
          </label>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-ink-400" data-testid="intake-status">
          {status.complete ? 'Intake complete.' : !status.objectiveOk ? 'Add the core objective to complete the intake.' : 'Upload and analyse at least one image, or confirm there are no visual assets.'}
        </div>
        <button type="button" className="btn-primary" onClick={() => s.setStep(2)} data-testid="to-interview">
          Continue to 8-Pillar Interview <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
