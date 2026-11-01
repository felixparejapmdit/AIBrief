import { useRuntimeStore } from '../store/useRuntimeStore'

/** Desktop PWA install prompt (Chrome/Edge on macOS & Windows). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredInstall: InstallPromptEvent | null = null

export function captureInstallPrompt(e: Event): void {
  e.preventDefault()
  deferredInstall = e as InstallPromptEvent
  useRuntimeStore.getState().set({ installPromptAvailable: true })
}

export async function installApp(): Promise<void> {
  if (!deferredInstall) return
  await deferredInstall.prompt()
  const { outcome } = await deferredInstall.userChoice
  deferredInstall = null
  useRuntimeStore.getState().set({ installPromptAvailable: false })
  if (outcome === 'accepted') useRuntimeStore.getState().toast('Installed — launch VIP Brief from your Dock, Start menu or desktop.', 'success')
}
