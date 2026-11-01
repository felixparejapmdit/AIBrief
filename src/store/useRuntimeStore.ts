import { create } from 'zustand'
import type { DownloadProgress } from '../types/architecture'
import type { OllamaStatus } from '../services/modelDownloader'
import type { DraftProgress } from '../services/briefGenerator'

/**
 * Transient, high-frequency UI state (download progress, streaming drafts, toasts).
 * Deliberately NOT persisted so token streams and progress ticks never touch IndexedDB.
 */

export interface Toast {
  id: number
  tone: 'info' | 'success' | 'warning' | 'error'
  message: string
}

export interface RuntimeState {
  detecting: boolean
  ollama: OllamaStatus | null
  checkingOllama: boolean
  webllmCached: Record<string, boolean>
  downloads: Record<string, DownloadProgress>
  downloadQueue: string[]
  draft: (DraftProgress & { running: boolean; error: string | null }) | null
  analysisStream: Record<string, string>
  followUpLoading: string | null
  toasts: Toast[]
  installPromptAvailable: boolean
  isStandalone: boolean
  online: boolean
  set: (patch: Partial<RuntimeState>) => void
  setDownload: (key: string, p: DownloadProgress) => void
  toast: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void
}

let toastSeq = 0

export const useRuntimeStore = create<RuntimeState>()((set, get) => ({
  detecting: false,
  ollama: null,
  checkingOllama: false,
  webllmCached: {},
  downloads: {},
  downloadQueue: [],
  draft: null,
  analysisStream: {},
  followUpLoading: null,
  toasts: [],
  installPromptAvailable: false,
  isStandalone: typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  set: (patch) => set(patch),
  setDownload: (key, p) => set((s) => ({ downloads: { ...s.downloads, [key]: p } })),
  toast: (message, tone = 'info') => {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, tone, message }] }))
    window.setTimeout(() => get().dismissToast(id), tone === 'error' ? 7000 : 4200)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const downloadKey = (engine: string, model: string) => `${engine}:${model}`
