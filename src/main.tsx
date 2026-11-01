import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import './index.css'
import { captureInstallPrompt } from './services/pwaInstall'
import { useProjectStore } from './store/useProjectStore'
import { useRuntimeStore } from './store/useRuntimeStore'

// Capture the desktop install prompt as early as possible (it can fire before React mounts).
window.addEventListener('beforeinstallprompt', captureInstallPrompt)
window.addEventListener('appinstalled', () => useRuntimeStore.getState().set({ installPromptAvailable: false, isStandalone: true }))

async function boot(): Promise<void> {
  // Hydrate from IndexedDB *before* the first render so the UI never flashes default state.
  try {
    await useProjectStore.persist.rehydrate()
  } catch (err) {
    console.warn('Could not restore the saved project:', err)
  }
  const params = new URLSearchParams(window.location.search)
  const state = useProjectStore.getState()
  // The Setup Wizard launches automatically on first run (and from the PWA "Setup" shortcut).
  if (!state.setupCompleted || params.get('setup') === '1') useProjectStore.setState({ wizardOpen: true })
  if (params.has('setup')) window.history.replaceState(null, '', window.location.pathname)

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  if (import.meta.env.PROD) {
    registerSW({
      immediate: true,
      onOfflineReady: () => useRuntimeStore.getState().toast('Ready to work offline.', 'success'),
    })
  }
}

void boot()
