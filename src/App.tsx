import { useEffect } from 'react'
import { BriefEditorAndAudit } from './components/BriefPreview/BriefEditorAndAudit'
import { StepRail, TopNavBar } from './components/Header/TopNavBar'
import { GuidedInterviewPanel } from './components/Interview/GuidedInterviewPanel'
import { PrintReadyPdfView } from './components/PdfExport/PrintReadyPdfView'
import { HardwareSetupModal } from './components/SetupWizard/HardwareSetupModal'
import { Toaster } from './components/ui/primitives'
import { ImageAnalysisDropzone } from './components/VisualIntake/ImageAnalysisDropzone'
import { useProjectStore } from './store/useProjectStore'
import { useRuntimeStore } from './store/useRuntimeStore'
import type { WorkflowStep } from './types/architecture'

function StepContent({ step }: { step: WorkflowStep }) {
  switch (step) {
    case 1:
      return <ImageAnalysisDropzone />
    case 2:
      return <GuidedInterviewPanel />
    case 3:
      return <BriefEditorAndAudit mode="draft" />
    case 4:
      return <BriefEditorAndAudit mode="review" />
    case 5:
      return <PrintReadyPdfView />
  }
}

export default function App() {
  const step = useProjectStore((s) => s.currentStep)

  useEffect(() => {
    const s = useProjectStore.getState()
    if (!s.specs) void s.runDetection()
    void s.refreshEngines()

    const runtime = useRuntimeStore.getState()
    const onOnline = () => {
      runtime.set({ online: true })
      // Downloads that were waiting for a connection start now.
      useProjectStore.getState().ensureRequiredModels()
    }
    const onOffline = () => runtime.set({ online: false })
    const onVisible = () => {
      if (document.visibilityState === 'visible') void useProjectStore.getState().refreshEngines()
    }
    const standalone = window.matchMedia('(display-mode: standalone)')
    const onDisplayMode = () => runtime.set({ isStandalone: standalone.matches })
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisible)
    standalone.addEventListener('change', onDisplayMode)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisible)
      standalone.removeEventListener('change', onDisplayMode)
    }
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [step])

  return (
    <div className="app-backdrop min-h-screen">
      <TopNavBar />
      <StepRail />
      <main className="mx-auto max-w-[1440px] px-5 pb-16 pt-8">
        <div key={step} className="step-enter">
          <StepContent step={step} />
        </div>
      </main>
      <HardwareSetupModal />
      <Toaster />
    </div>
  )
}
