import { CircleAlert, CircleCheck, FileDown, LoaderCircle, Lock, Printer } from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { PREPARED_ON_BEHALF_OF } from '../../constants/vipSkillPrompt'
import { selectIntakeStatus, selectInterviewProgress, selectIsApproved, useProjectStore } from '../../store/useProjectStore'
import { useRuntimeStore } from '../../store/useRuntimeStore'
import { extractDate } from '../../utils/briefTemplate'
import { MarkdownView, SectionTitle } from '../ui/primitives'

type PageSize = 'Letter' | 'A4'

/** Page geometry in millimetres. */
const PAGE: Record<PageSize, { w: number; h: number; jspdf: string }> = {
  Letter: { w: 215.9, h: 279.4, jspdf: 'letter' },
  A4: { w: 210, h: 297, jspdf: 'a4' },
}
const MARGIN = { top: 22, right: 16, bottom: 20, left: 16 }
const MM_TO_PX = 96 / 25.4

interface JsPdfLike {
  internal: { getNumberOfPages(): number; pageSize: { getWidth(): number; getHeight(): number } }
  setPage(n: number): void
  setFont(name: string, style: string): void
  setFontSize(size: number): void
  setTextColor(r: number, g: number, b: number): void
  setDrawColor(r: number, g: number, b: number): void
  setLineWidth(w: number): void
  line(x1: number, y1: number, x2: number, y2: number): void
  text(text: string, x: number, y: number, opts?: { align?: 'left' | 'right' | 'center' }): void
  save(name: string): void
}

function drawRunningHeadersAndFooters(pdf: JsPdfLike): number {
  const pages = pdf.internal.getNumberOfPages()
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const left = MARGIN.left
  const right = W - MARGIN.right
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i)
    // Header
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7.5)
    pdf.setTextColor(110, 85, 36)
    pdf.text('WOODLAND CONSTRUCTION', left, 12.5)
    pdf.setFont('helvetica', 'normal')
    pdf.text('Architectural Design Brief  ·  Confidential', right, 12.5, { align: 'right' })
    pdf.setDrawColor(176, 138, 58)
    pdf.setLineWidth(0.45)
    pdf.line(left, 15, right, 15)
    // Footer
    pdf.setDrawColor(216, 210, 196)
    pdf.setLineWidth(0.25)
    pdf.line(left, H - 13.5, right, H - 13.5)
    pdf.setFontSize(7)
    pdf.setTextColor(107, 117, 132)
    pdf.text(`Prepared for The Client by Woodland Construction  ·  ${PREPARED_ON_BEHALF_OF}`, left, H - 9)
    pdf.setFont('helvetica', 'bold')
    pdf.text(`Page ${i} of ${pages}`, right, H - 9, { align: 'right' })
  }
  return pages
}

/** Clone the document offscreen at exact page width and keep headings with the block that follows them. */
function prepareExportNode(source: HTMLElement, size: PageSize): { node: HTMLElement; cleanup: () => void } {
  const innerPx = Math.round((PAGE[size].w - MARGIN.left - MARGIN.right) * MM_TO_PX)
  const holder = document.createElement('div')
  holder.setAttribute('aria-hidden', 'true')
  holder.style.cssText = `position:fixed;left:-20000px;top:0;width:${innerPx}px;background:#ffffff;`
  const node = source.cloneNode(true) as HTMLElement
  node.removeAttribute('id')
  node.className = 'pdf-doc'
  node.style.width = `${innerPx}px`
  // A little bottom room so the last line's descenders are never clipped by the canvas edge.
  node.style.padding = '0 0 12px'
  holder.appendChild(node)
  document.body.appendChild(holder)
  const pageInnerPx = (PAGE[size].h - MARGIN.top - MARGIN.bottom) * MM_TO_PX
  for (const h of Array.from(node.querySelectorAll('h1, h2, h3'))) {
    const next = h.nextElementSibling as HTMLElement | null
    if (!next || next.tagName === 'H2' || next.tagName === 'H3') continue
    const height = next.getBoundingClientRect().height
    if (height > 0 && height < pageInnerPx * 0.35) {
      const wrap = document.createElement('div')
      wrap.className = 'pdf-avoid-break'
      h.before(wrap)
      wrap.append(h, next)
    }
  }
  return { node, cleanup: () => holder.remove() }
}

export function PrintReadyPdfView() {
  const s = useProjectStore(
    useShallow((st) => ({
      markdown: st.brief.markdown,
      approved: selectIsApproved(st),
      intake: selectIntakeStatus(st).complete,
      interview: selectInterviewProgress(st.answers).complete,
      hasDraft: st.brief.markdown.length > 0,
      pageSize: st.pageSize,
      setPageSize: st.setPageSize,
      setStep: st.setStep,
    })),
  )
  const toast = useRuntimeStore((r) => r.toast)
  const [exporting, setExporting] = useState(false)
  const [lastExport, setLastExport] = useState<{ pages: number; at: string } | null>(null)

  if (!s.approved) {
    return (
      <div className="panel mx-auto max-w-2xl p-8 text-center" data-testid="pdf-locked">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brass-500/15 text-brass-300">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="heading-display mt-4 text-2xl">The Print-Ready PDF is locked</h2>
        <p className="mt-2 text-sm text-ink-400">PDF generation unlocks only after the intake and interview are complete and the draft is explicitly approved in Step 4.</p>
        <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left text-sm">
          {[
            [s.intake, 'Intake & visual analysis complete'],
            [s.interview, '8-pillar interview complete'],
            [s.hasDraft, '9-section draft generated'],
            [s.approved, '“Approve Draft for Print” clicked in Step 4'],
          ].map(([ok, label]) => (
            <li key={String(label)} className="flex items-center gap-2">
              {ok ? <CircleCheck className="h-4 w-4 text-verdigris-300" /> : <CircleAlert className="h-4 w-4 text-amberglow-400" />}
              <span className={ok ? 'text-ink-200' : 'text-ink-400'}>{label}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="btn-primary mt-6" onClick={() => s.setStep(s.hasDraft ? 4 : 3)} data-testid="pdf-go-review">
          {s.hasDraft ? 'Go to Review & Approval' : 'Go to Drafting'}
        </button>
      </div>
    )
  }

  const page = PAGE[s.pageSize]
  const date = extractDate(s.markdown) ?? 'Brief'

  const exportPdf = async () => {
    if (!selectIsApproved(useProjectStore.getState())) {
      toast('The draft changed since approval — approve it again in Step 4.', 'warning')
      return
    }
    const source = document.getElementById('pdf-content')
    if (!source) return
    setExporting(true)
    // The preview renders its later sections over a few frames; make sure it is complete.
    for (let i = 0; i < 40 && source.querySelector('[data-rendered="partial"]'); i++) await new Promise((r) => requestAnimationFrame(r))
    const { node, cleanup } = prepareExportNode(source, s.pageSize)
    try {
      const { default: html2pdf } = await import('html2pdf.js')
      const filename = `Architectural-Design-Brief_The-Client_${date.replace(/[^\w]+/g, '-')}.pdf`
      const pdf = (await html2pdf()
        .set({
          margin: [MARGIN.top, MARGIN.left, MARGIN.bottom, MARGIN.right],
          filename,
          image: { type: 'jpeg', quality: 0.97 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, letterRendering: true },
          jsPDF: { unit: 'mm', format: page.jspdf, orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'li', 'blockquote', '.pdf-avoid-break'] },
          // html2pdf.js's bundled typings omit the (supported) `pagebreak` option.
        } as never)
        .from(node)
        .toPdf()
        .get('pdf')) as JsPdfLike
      const pages = drawRunningHeadersAndFooters(pdf)
      pdf.save(filename)
      setLastExport({ pages, at: new Date().toLocaleTimeString() })
      toast(`Exported ${filename} (${pages} pages).`, 'success')
    } catch (err) {
      toast(`PDF export failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      cleanup()
      setExporting(false)
    }
  }

  const printNative = () => {
    if (!selectIsApproved(useProjectStore.getState())) {
      toast('The draft changed since approval — approve it again in Step 4.', 'warning')
      return
    }
    window.print()
  }

  return (
    <div>
      <style>{`@media print { @page { size: ${s.pageSize === 'A4' ? 'A4' : 'letter'} portrait; } }`}</style>
      <SectionTitle eyebrow="Step 5 · Print-Ready PDF Generator" title="Executive PDF preview">
        <div className="no-print flex flex-wrap items-center gap-2" data-testid="pdf-toolbar">
          <div className="flex rounded-lg border border-ink-700 bg-ink-950/60 p-0.5" role="radiogroup" aria-label="Page size">
            {(['Letter', 'A4'] as const).map((size) => (
              <button
                key={size}
                type="button"
                role="radio"
                aria-checked={s.pageSize === size}
                data-testid={`page-size-${size}`}
                onClick={() => s.setPageSize(size)}
                className={`rounded-md px-3 py-1.5 text-xs transition-colors duration-150 ${s.pageSize === size ? 'bg-ink-800 text-brass-200' : 'text-ink-300 hover:text-ink-100'}`}
              >
                {size}
              </button>
            ))}
          </div>
          <button type="button" className="btn-secondary" onClick={printNative} data-testid="print-native">
            <Printer className="h-4 w-4" /> Print / Save as PDF
          </button>
          <button type="button" className="btn-primary" onClick={() => void exportPdf()} disabled={exporting} data-testid="export-pdf">
            {exporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Export Print-Ready PDF
          </button>
        </div>
      </SectionTitle>
      {lastExport && (
        <p className="no-print -mt-2 mb-4 text-xs text-verdigris-300" data-testid="export-result">
          Exported {lastExport.pages} pages at {lastExport.at} with Woodland Construction headers, footers and page numbers.
        </p>
      )}

      <div className="overflow-x-auto pb-6">
        <div
          id="print-root"
          data-testid="pdf-preview"
          className="pdf-sheet pdf-doc mx-auto rounded-sm"
          style={{ width: `${page.w}mm`, minHeight: `${page.h}mm`, padding: `${MARGIN.top - 8}mm ${MARGIN.right}mm ${MARGIN.bottom - 6}mm ${MARGIN.left}mm` }}
        >
          <div className="pdf-running-header">
            <span style={{ fontWeight: 700 }}>Woodland Construction</span>
            <span>Architectural Design Brief · Confidential</span>
          </div>
          <div id="pdf-content">
            <MarkdownView markdown={s.markdown} className="" />
          </div>
          <div className="pdf-running-footer">
            <span>Prepared for The Client by Woodland Construction · {PREPARED_ON_BEHALF_OF}</span>
            <span>Page numbers are applied on export</span>
          </div>
        </div>
      </div>
    </div>
  )
}
