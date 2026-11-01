import { createStore, del, get as idbGet, set as idbSet } from 'idb-keyval'
import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
import { ALL_QUESTIONS, PILLARS, pillarById, questionPages } from '../constants/interviewPillars'
import { DEFAULT_CLOUD_MODEL, HARDWARE_PROFILES, recommendProfile, webllmVariant } from '../constants/modelCatalog'
import { formatBriefDate } from '../constants/vipSkillPrompt'
import { analyzeImage, isAborted, suggestFollowUp } from '../services/aiClient'
import { type DownloadTarget, planAutoDownload, targetKey } from '../services/autoDownload'
import { draftBrief } from '../services/briefGenerator'
import { detectMachineSpecs, requestPersistentStorage } from '../services/hardwareDetector'
import {
  DEFAULT_OLLAMA_URL,
  OllamaPullTask,
  WebLlmDownloadTask,
  checkOllama,
  isWebLlmModelCached,
  ollamaHasModel,
} from '../services/modelDownloader'
import { translateTagalogText, translateWithPhrasebook } from '../services/translator'
import { webllmTransport } from '../services/webllmBridge'
import type {
  Approval,
  AthleteReplacement,
  BriefDraft,
  ComplianceCheckId,
  DownloadProgress,
  EngineKind,
  EngineSettings,
  FieldTranslation,
  HardwareOverrides,
  ImageCategory,
  IntakeImage,
  InterviewAnswer,
  MachineSpecs,
  ModelBinding,
  PerformanceSettings,
  PillarId,
  Recommendation,
  TierId,
  WorkflowStep,
} from '../types/architecture'
import { type BriefInputs, composeBrief } from '../utils/briefComposer'
import { applyAllFixes, applyComplianceFix, auditBrief, sanitizeForbiddenTerms } from '../utils/complianceAuditor'
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, guessCategory, processUpload } from '../utils/imageProcessing'
import { type SegmentTranslation, containsTagalog, findTagalogLines, translateTagalogLines } from '../utils/tagalog'
import { hashString, uid } from '../utils/text'
import { downloadKey, useRuntimeStore } from './useRuntimeStore'

/* ------------------------------------------------------------------ */
/* Persistence: IndexedDB with debounced, structured-clone writes       */
/* ------------------------------------------------------------------ */

const stateDb = createStore('vip-brief-creator', 'state')
const imageDb = createStore('vip-brief-images', 'blobs')
const STORAGE_KEY = 'vip-brief-project'

let pendingWrite: { name: string; value: StorageValue<PersistedData> } | null = null
let lastWritten: PersistedData | null = null
let writeTimer: ReturnType<typeof setTimeout> | undefined

type StoredValue = StorageValue<PersistedData> & { savedAt?: number }

function flushWrites(): void {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = undefined
  if (!pendingWrite) return
  const { name, value } = pendingWrite
  pendingWrite = null
  lastWritten = value.state
  void idbSet(name, { ...value, savedAt: Date.now() } satisfies StoredValue, stateDb)
}

/*
 * IndexedDB writes are asynchronous, so a reload a few milliseconds after a click could abort the
 * transaction. A tiny synchronous localStorage mirror of the navigation state guarantees the user
 * always comes back to exactly where they were; the newer of the two snapshots wins on load.
 */
const SESSION_KEY = 'vip-brief-session'
type SessionMirror = Pick<PersistedData, 'currentStep' | 'setupCompleted' | 'activePillar' | 'interviewPage'> & { savedAt: number }

function writeSession(state: PersistedData): void {
  try {
    const mirror: SessionMirror = {
      currentStep: state.currentStep,
      setupCompleted: state.setupCompleted,
      activePillar: state.activePillar,
      interviewPage: state.interviewPage,
      savedAt: Date.now(),
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(mirror))
  } catch {
    /* storage unavailable (private mode) — IndexedDB remains the source of truth */
  }
}

function readSession(): SessionMirror | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as SessionMirror) : null
  } catch {
    return null
  }
}

/** Discrete milestones are written immediately; only high-frequency typing is debounced. */
function isMilestone(next: PersistedData, prev: PersistedData | null): boolean {
  return (
    !prev ||
    next.setupCompleted !== prev.setupCompleted ||
    next.approval !== prev.approval ||
    next.currentStep !== prev.currentStep ||
    next.brief.generatedAt !== prev.brief.generatedAt ||
    next.images.length !== prev.images.length ||
    next.images.some((im, i) => im.status !== prev.images[i]?.status) ||
    next.engine.vision !== prev.engine.vision ||
    next.engine.text !== prev.engine.text ||
    next.specs !== prev.specs ||
    next.settings !== prev.settings ||
    next.autoDownload !== prev.autoDownload ||
    next.translations !== prev.translations ||
    next.keptOriginal !== prev.keptOriginal
  )
}

const idbStorage: PersistStorage<PersistedData> = {
  getItem: async (name) => {
    const stored = ((await idbGet(name, stateDb)) as StoredValue | undefined) ?? null
    lastWritten = stored?.state ?? null
    const session = readSession()
    if (stored && session && session.savedAt > (stored.savedAt ?? 0)) {
      const { savedAt: _ignored, ...nav } = session
      return { ...stored, state: { ...stored.state, ...nav } }
    }
    return stored
  },
  setItem: (name, value) => {
    writeSession(value.state)
    pendingWrite = { name, value }
    if (isMilestone(value.state, lastWritten)) {
      flushWrites()
      return
    }
    if (writeTimer) clearTimeout(writeTimer)
    writeTimer = setTimeout(flushWrites, 250)
  },
  removeItem: async (name) => {
    pendingWrite = null
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
    await del(name, stateDb)
  },
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushWrites)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushWrites()
  })
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export interface FollowUp {
  id: string
  pillar: PillarId
  question: string
  answer: string
  askedAt: string
}

export interface PersistedData {
  setupCompleted: boolean
  specs: MachineSpecs | null
  overrides: HardwareOverrides
  tierOverride: TierId | null
  preferredEngine: EngineKind | null
  engine: EngineSettings
  settings: PerformanceSettings
  recommendedApplied: boolean
  /** Download the models the detected tier needs automatically (on by default). */
  autoDownload: boolean
  /** The user bound models by hand in "Advanced" — auto-download then keeps those instead. */
  bindingsManual: boolean
  currentStep: WorkflowStep
  objective: string
  images: IntakeImage[]
  noVisualAssets: boolean
  answers: Record<string, InterviewAnswer>
  activePillar: PillarId
  interviewPage: number
  followUps: FollowUp[]
  brief: BriefDraft
  athleteReplacement: AthleteReplacement
  approval: Approval | null
  pageSize: 'Letter' | 'A4'
  /** Field key → the Tagalog original and its English translation now in the field. */
  translations: Record<string, FieldTranslation>
  /** Field key → hash of text the user chose to keep as typed (not translated). */
  keptOriginal: Record<string, string>
}

export interface ProjectState extends PersistedData {
  wizardOpen: boolean
  openWizard: () => void
  closeWizard: () => void
  runDetection: () => Promise<void>
  setOverrides: (patch: Partial<HardwareOverrides>) => void
  setTierOverride: (tier: TierId | null) => void
  setPreferredEngine: (kind: EngineKind) => void
  setEngine: (patch: Partial<EngineSettings>) => void
  setSettings: (patch: Partial<PerformanceSettings>) => void
  setRecommendedApplied: (on: boolean) => void
  refreshEngines: () => Promise<void>
  setAutoDownload: (on: boolean) => void
  /** Start any required model downloads (no-op when disabled, busy or everything is installed). */
  ensureRequiredModels: () => void
  applyAndDownload: (kind: EngineKind) => Promise<void>
  startDownload: (engine: 'ollama' | 'webllm', model: string) => void
  pauseDownload: (key: string) => void
  resumeDownload: (key: string) => void
  cancelDownload: (key: string) => Promise<void>
  bindModel: (role: 'vision' | 'text', binding: ModelBinding | null) => void
  setStep: (step: WorkflowStep) => void
  setObjective: (text: string) => void
  addFiles: (files: File[], category: ImageCategory | 'auto') => Promise<void>
  updateImage: (id: string, patch: Partial<Pick<IntakeImage, 'notes' | 'category'>>) => void
  removeImage: (id: string) => Promise<void>
  analyzeImage: (id: string) => Promise<void>
  analyzeAll: () => Promise<void>
  cancelAnalysis: () => void
  setNoVisualAssets: (on: boolean) => void
  setAnswer: (questionId: string, value: string) => void
  toggleChip: (questionId: string, chip: string) => void
  setActivePillar: (id: PillarId, page?: number) => void
  setInterviewPage: (page: number) => void
  requestFollowUp: (pillar: PillarId) => Promise<void>
  answerFollowUp: (id: string, answer: string) => void
  removeFollowUp: (id: string) => void
  generateBrief: () => Promise<void>
  cancelGeneration: () => void
  setBriefMarkdown: (markdown: string) => void
  applyFix: (id: ComplianceCheckId) => void
  applyAllFixes: () => void
  setAthleteReplacement: (r: AthleteReplacement) => void
  approve: () => boolean
  revokeApproval: () => void
  setPageSize: (size: 'Letter' | 'A4') => void
  resetProject: () => Promise<void>
  /** Translate the Tagalog parts of one form field into English (queued; runs after typing ends). */
  translateField: (key: string) => Promise<void>
  /** Translate every field that still contains Tagalog (skips the field being typed in). */
  translatePending: () => void
  undoTranslation: (key: string) => void
  keepAsTyped: (key: string) => void
  retranslateField: (key: string) => void
  /** Step 4: translate Tagalog lines of the brief itself. */
  translateBriefTagalog: () => Promise<void>
}

const DEFAULT_ENGINE: EngineSettings = {
  ollamaBaseUrl: DEFAULT_OLLAMA_URL,
  cloudApiKey: '',
  cloudModel: DEFAULT_CLOUD_MODEL,
  vision: null,
  text: null,
}

const EMPTY_BRIEF: BriefDraft = { markdown: '', generatedAt: null, generatedBy: null, repairedSections: [], editedSinceGeneration: false }

const defaultPageSize = (): 'Letter' | 'A4' =>
  typeof navigator !== 'undefined' && /^en-(US|CA)|^es-(MX|US)|^fil|^en-PH/i.test(navigator.language) ? 'Letter' : 'A4'

const initialProject = (): Omit<
  PersistedData,
  'setupCompleted' | 'specs' | 'overrides' | 'tierOverride' | 'preferredEngine' | 'engine' | 'settings' | 'recommendedApplied' | 'autoDownload' | 'bindingsManual'
> => ({
  currentStep: 1,
  objective: '',
  images: [],
  noVisualAssets: false,
  answers: {},
  activePillar: 'vision',
  interviewPage: 0,
  followUps: [],
  brief: EMPTY_BRIEF,
  athleteReplacement: 'guests',
  approval: null,
  pageSize: defaultPageSize(),
  translations: {},
  keptOriginal: {},
})

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

let recMemo: { specs: unknown; overrides: unknown; tier: unknown; value: Recommendation } | null = null

/** Memoised on its inputs so it is safe to use directly as a store selector (stable reference). */
export function selectRecommendation(s: Pick<PersistedData, 'specs' | 'overrides' | 'tierOverride'>): Recommendation {
  if (recMemo && recMemo.specs === s.specs && recMemo.overrides === s.overrides && recMemo.tier === s.tierOverride) return recMemo.value
  const rec = recommendProfile(s.specs, s.overrides)
  const value =
    s.tierOverride && s.tierOverride !== rec.profile.id
      ? { ...rec, profile: HARDWARE_PROFILES[s.tierOverride], reasons: [`Manually selected ${HARDWARE_PROFILES[s.tierOverride].name}.`, ...rec.reasons] }
      : rec
  recMemo = { specs: s.specs, overrides: s.overrides, tier: s.tierOverride, value }
  return value
}

export function isAnswered(questionId: string, answers: Record<string, InterviewAnswer>): boolean {
  const q = ALL_QUESTIONS.find((x) => x.id === questionId)
  return (answers[questionId]?.value.trim().length ?? 0) >= (q?.minLength ?? 1)
}

export interface PillarProgress {
  id: PillarId
  answered: number
  total: number
  complete: boolean
}

export function selectInterviewProgress(answers: Record<string, InterviewAnswer>): { pillars: PillarProgress[]; answered: number; total: number; complete: boolean } {
  const pillars = PILLARS.map((p) => {
    const answered = p.questions.filter((q) => isAnswered(q.id, answers)).length
    return { id: p.id, answered, total: p.questions.length, complete: answered === p.questions.length }
  })
  const answered = pillars.reduce((a, p) => a + p.answered, 0)
  const total = pillars.reduce((a, p) => a + p.total, 0)
  return { pillars, answered, total, complete: answered === total }
}

export function selectIntakeStatus(s: Pick<PersistedData, 'objective' | 'images' | 'noVisualAssets'>): { objectiveOk: boolean; visualsOk: boolean; complete: boolean } {
  const objectiveOk = s.objective.trim().length >= 15
  const analyzed = s.images.some((im) => im.status === 'done')
  const visualsOk = analyzed || (s.noVisualAssets && s.images.length === 0)
  return { objectiveOk, visualsOk, complete: objectiveOk && visualsOk }
}

export function selectIsApproved(s: Pick<PersistedData, 'approval' | 'brief'>): boolean {
  return Boolean(s.approval && s.brief.markdown && s.approval.markdownHash === hashString(s.brief.markdown))
}

export function buildBriefInputs(s: PersistedData): BriefInputs {
  return {
    date: formatBriefDate(),
    objective: s.objective,
    answers: Object.fromEntries(Object.entries(s.answers).map(([k, v]) => [k, v.value])),
    images: s.images.map((im) => ({ name: im.name, category: im.category, notes: im.notes, analysis: im.analysis })),
    followUps: s.followUps.map((f) => ({ pillarTitle: PILLARS.find((p) => p.id === f.pillar)?.title ?? '', question: f.question, answer: f.answer })),
    replacement: s.athleteReplacement,
  }
}

/* ------------------------------------------------------------------ */
/* Translatable fields                                                 */
/* "objective" · "answer:<questionId>" · "followup:<id>" · "image:<id>" */
/* ------------------------------------------------------------------ */

type FieldSource = Pick<PersistedData, 'objective' | 'answers' | 'followUps' | 'images'>

export function readField(s: FieldSource, key: string): string | null {
  if (key === 'objective') return s.objective
  const sep = key.indexOf(':')
  const kind = key.slice(0, sep)
  const id = key.slice(sep + 1)
  if (kind === 'answer') return s.answers[id]?.value ?? null
  if (kind === 'followup') return s.followUps.find((f) => f.id === id)?.answer ?? null
  if (kind === 'image') return s.images.find((im) => im.id === id)?.notes ?? null
  return null
}

function fieldKeys(s: FieldSource): string[] {
  return ['objective', ...Object.keys(s.answers).map((id) => `answer:${id}`), ...s.followUps.map((f) => `followup:${f.id}`), ...s.images.map((im) => `image:${im.id}`)]
}

/** Fields that still contain Tagalog (and that the user did not choose to keep as typed). */
export function selectPendingTranslations(s: FieldSource & Pick<PersistedData, 'keptOriginal'>): string[] {
  return fieldKeys(s).filter((key) => {
    const value = readField(s, key)
    return value != null && containsTagalog(value) && s.keptOriginal[key] !== hashString(value)
  })
}

/** Human description of a field and where it lives, for "Go to" links. */
export function describeField(s: FieldSource, key: string): { label: string; step: WorkflowStep; pillar: PillarId | null; page: number } {
  if (key === 'objective') return { label: 'Core project objective', step: 1, pillar: null, page: 0 }
  const id = key.slice(key.indexOf(':') + 1)
  if (key.startsWith('answer:')) {
    const q = ALL_QUESTIONS.find((x) => x.id === id)
    const pillar = q ? pillarById(q.pillar) : null
    const page = pillar ? Math.max(0, questionPages(pillar).findIndex((p) => p.some((x) => x.id === id))) : 0
    return { label: q?.prompt ?? 'Interview answer', step: 2, pillar: q?.pillar ?? null, page }
  }
  if (key.startsWith('followup:')) {
    const f = s.followUps.find((x) => x.id === id)
    const pillar = f ? pillarById(f.pillar) : null
    return { label: f ? `Follow-up: ${f.question}` : 'Follow-up answer', step: 2, pillar: f?.pillar ?? null, page: pillar ? questionPages(pillar).length - 1 : 0 }
  }
  const im = s.images.find((x) => x.id === id)
  return { label: `Notes for ${im?.name ?? 'an image'}`, step: 1, pillar: null, page: 0 }
}

function isFieldFocused(key: string): boolean {
  return typeof document !== 'undefined' && document.activeElement?.getAttribute('data-translate-key') === key
}

/* ------------------------------------------------------------------ */
/* Module-level controllers                                            */
/* ------------------------------------------------------------------ */

const tasks = new Map<string, OllamaPullTask | WebLlmDownloadTask>()
let analysisController: AbortController | null = null
let analysisQueue: Promise<void> = Promise.resolve()
let uploadQueue: Promise<void> = Promise.resolve()
let generationController: AbortController | null = null
let followUpController: AbortController | null = null
/** Downloads auto-started this session, so a failing download is never retried in a loop. */
const autoAttempted = new Set<string>()
let autoToastShown = false
let translationQueue: Promise<void> = Promise.resolve()
const queuedTranslations = new Set<string>()

const runtime = () => useRuntimeStore.getState()
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))
const ACTIVE_DOWNLOAD = new Set<DownloadProgress['status']>(['preparing', 'downloading', 'verifying', 'loading', 'paused'])

/** True when the bound model is installed and usable right now. */
export function isBindingReady(b: ModelBinding | null, cloudKey: string): boolean {
  if (!b) return false
  if (b.engine === 'ollama') return ollamaHasModel(runtime().ollama, b.model)
  if (b.engine === 'webllm') return Boolean(runtime().webllmCached[b.model])
  return cloudKey.trim().length > 0
}

function catalogSizeGB(t: DownloadTarget): number {
  for (const p of Object.values(HARDWARE_PROFILES)) {
    for (const m of [p.ollama.vision, p.ollama.text, p.webllm.vision, p.webllm.text]) {
      if (m && (m.id === t.model || webllmVariant(m.id, 'q4f32_1') === t.model)) return m.approxDownloadGB
    }
  }
  return 2
}

function bindingsFor(kind: EngineKind, rec: Recommendation, s: PersistedData): { vision: ModelBinding | null; text: ModelBinding | null; downloads: Array<{ engine: 'ollama' | 'webllm'; model: string }> } {
  const p = rec.profile
  if (kind === 'cloud') {
    const b: ModelBinding = { engine: 'cloud', model: s.engine.cloudModel || DEFAULT_CLOUD_MODEL, vision: true }
    return { vision: b, text: b, downloads: [] }
  }
  if (kind === 'ollama') {
    const vision: ModelBinding = { engine: 'ollama', model: p.ollama.vision.id, vision: true }
    const text: ModelBinding = { engine: 'ollama', model: p.ollama.text.id, vision: p.ollama.text.vision }
    const models = [...new Set([vision.model, text.model])]
    return { vision, text, downloads: models.map((model) => ({ engine: 'ollama' as const, model })) }
  }
  const text: ModelBinding = { engine: 'webllm', model: webllmVariant(p.webllm.text.id, rec.webllmPrecision), vision: p.webllm.text.vision }
  let vision: ModelBinding | null = p.webllm.vision ? { engine: 'webllm', model: webllmVariant(p.webllm.vision.id, rec.webllmPrecision), vision: true } : null
  const downloads: Array<{ engine: 'ollama' | 'webllm'; model: string }> = []
  // Lightweight browser tier pairs moondream (via Ollama, when running) with Llama-3.2-3B in WebGPU.
  if (!vision && runtime().ollama?.reachable) {
    vision = { engine: 'ollama', model: p.ollama.vision.id, vision: true }
    downloads.push({ engine: 'ollama', model: p.ollama.vision.id })
  }
  for (const b of [vision, text]) if (b?.engine === 'webllm' && !downloads.some((d) => d.model === b.model)) downloads.push({ engine: 'webllm', model: b.model })
  return { vision, text, downloads }
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => {
      const startNextQueued = () => {
        const [next, ...rest] = runtime().downloadQueue
        runtime().set({ downloadQueue: rest })
        if (next) {
          const [engine, ...modelParts] = next.split(':')
          get().startDownload(engine as 'ollama' | 'webllm', modelParts.join(':'))
        }
      }

      const createTask = (engine: 'ollama' | 'webllm', model: string) => {
        const key = downloadKey(engine, model)
        const listener = (p: DownloadProgress) => {
          runtime().setDownload(key, p)
          if (p.status === 'completed') {
            tasks.delete(key)
            runtime().toast(`${model} is ready.`, 'success')
            void get().refreshEngines()
            startNextQueued()
          } else if (p.status === 'error') {
            runtime().toast(`${model}: ${p.error ?? 'download failed'}`, 'error')
          }
        }
        const task =
          engine === 'ollama'
            ? new OllamaPullTask(get().engine.ollamaBaseUrl, model, listener)
            : new WebLlmDownloadTask(model, listener, webllmTransport, get().settings.contextWindow)
        tasks.set(key, task)
        return task
      }

      const enqueueImageAnalysis = (id: string) => {
        analysisQueue = analysisQueue.then(() => get().analyzeImage(id)).catch(() => undefined)
        return analysisQueue
      }

      /** Bind the recommended models for an engine and apply the tier's tuned settings. */
      const configureEngine = (kind: EngineKind) => {
        const s = get()
        const rec = selectRecommendation(s)
        const bindings = bindingsFor(kind, rec, s)
        set({
          preferredEngine: kind,
          bindingsManual: false,
          engine: { ...s.engine, vision: bindings.vision, text: bindings.text },
          ...(s.recommendedApplied ? { settings: rec.profile.settings } : {}),
        })
        return bindings
      }

      /** Start the first download now and queue the rest — one at a time keeps bandwidth and memory in check. */
      const queueDownloads = (targets: DownloadTarget[]) => {
        const [first, ...rest] = targets
        if (!first) return
        runtime().set({ downloadQueue: rest.map((t) => downloadKey(t.engine, t.model)) })
        get().startDownload(first.engine, first.model)
      }

      /* ---------------- Tagalog → English ---------------- */

      const writeField = (key: string, value: string) => {
        if (key === 'objective') return set({ objective: value })
        const id = key.slice(key.indexOf(':') + 1)
        if (key.startsWith('answer:')) return get().setAnswer(id, value)
        if (key.startsWith('followup:')) return get().answerFollowUp(id, value)
        if (key.startsWith('image:')) return get().updateImage(id, { notes: value })
      }

      const runFieldTranslation = async (key: string): Promise<void> => {
        queuedTranslations.delete(key)
        const setStatus = runtime().setTranslationStatus
        const start = get()
        const value = readField(start, key)
        // Never rewrite a field while it is being typed in — it is translated when the user leaves it.
        if (value == null || !containsTagalog(value) || start.keptOriginal[key] === hashString(value) || isFieldFocused(key)) {
          setStatus(key, null)
          return
        }
        const binding = start.engine.text ?? start.engine.vision
        let result: SegmentTranslation | null
        if (binding && isBindingReady(binding, start.engine.cloudApiKey)) {
          setStatus(key, { state: 'translating', model: binding.model })
          try {
            result = await translateTagalogText(value, { binding, settings: start.settings, engine: start.engine })
          } catch (err) {
            setStatus(key, { state: 'error', error: errorText(err) })
            return
          }
        } else {
          // Short everyday answers ("Oo", "Wala pa po") are translated offline; anything longer needs the model.
          result = await translateWithPhrasebook(value)
          if (!result) {
            setStatus(key, binding ? { state: 'waiting-model', model: binding.model } : { state: 'no-model' })
            return
          }
        }
        if (readField(get(), key) !== value) {
          setStatus(key, null)
          if (!isFieldFocused(key)) void get().translateField(key)
          return
        }
        writeField(key, result.text)
        const record: FieldTranslation = {
          original: value,
          english: result.text,
          method: result.modelPieces ? 'model' : 'phrasebook',
          model: result.modelPieces ? (binding?.model ?? null) : null,
          review: result.review,
          at: new Date().toISOString(),
        }
        set({ translations: { ...get().translations, [key]: record } })
        setStatus(key, null)
      }

      return {
        setupCompleted: false,
        specs: null,
        overrides: { ramGB: null, vramGB: null },
        tierOverride: null,
        preferredEngine: null,
        engine: DEFAULT_ENGINE,
        settings: HARDWARE_PROFILES.balanced.settings,
        recommendedApplied: true,
        autoDownload: true,
        bindingsManual: false,
        ...initialProject(),
        wizardOpen: false,

        /* ---------------- Setup wizard ---------------- */
        openWizard: () => set({ wizardOpen: true }),
        closeWizard: () => set({ wizardOpen: false, setupCompleted: true }),

        runDetection: async () => {
          runtime().set({ detecting: true })
          try {
            const specs = await detectMachineSpecs()
            set({ specs })
            if (get().recommendedApplied) set({ settings: selectRecommendation({ ...get(), specs }).profile.settings })
          } finally {
            runtime().set({ detecting: false })
          }
          get().ensureRequiredModels()
        },

        setOverrides: (patch) => {
          const overrides = { ...get().overrides, ...patch }
          set({ overrides })
          if (get().recommendedApplied) set({ settings: selectRecommendation({ ...get(), overrides }).profile.settings })
          // Corrected hardware information can change the required models.
          get().ensureRequiredModels()
        },

        setTierOverride: (tier) => {
          set({ tierOverride: tier })
          if (get().recommendedApplied) set({ settings: selectRecommendation(get()).profile.settings })
          get().ensureRequiredModels()
        },

        setPreferredEngine: (kind) => set({ preferredEngine: kind }),
        setEngine: (patch) => set({ engine: { ...get().engine, ...patch } }),
        setSettings: (patch) => set({ settings: { ...get().settings, ...patch }, recommendedApplied: false }),

        setRecommendedApplied: (on) => {
          if (on) set({ recommendedApplied: true, settings: selectRecommendation(get()).profile.settings })
          else set({ recommendedApplied: false })
        },

        refreshEngines: async () => {
          runtime().set({ checkingOllama: true })
          const s = get()
          const rec = selectRecommendation(s)
          const webllmIds = new Set<string>()
          for (const p of Object.values(HARDWARE_PROFILES)) {
            for (const m of [p.webllm.text, p.webllm.vision]) if (m) webllmIds.add(webllmVariant(m.id, rec.webllmPrecision))
          }
          for (const b of [s.engine.vision, s.engine.text]) if (b?.engine === 'webllm') webllmIds.add(b.model)
          const [ollama, cachedEntries] = await Promise.all([
            checkOllama(s.engine.ollamaBaseUrl),
            Promise.all([...webllmIds].map(async (id) => [id, await isWebLlmModelCached(id)] as const)),
          ])
          runtime().set({ ollama, checkingOllama: false, webllmCached: Object.fromEntries(cachedEntries) })
          get().ensureRequiredModels()
          // A model that just became ready picks up any Tagalog still waiting for translation.
          get().translatePending()
        },

        setAutoDownload: (on) => {
          set({ autoDownload: on })
          if (on) {
            autoAttempted.clear()
            get().ensureRequiredModels()
          } else runtime().set({ autoDownloadReason: 'disabled' })
        },

        ensureRequiredModels: () => {
          const s = get()
          const r = runtime()
          const rec = selectRecommendation(s)
          const connection = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
          const plan = planAutoDownload({
            enabled: s.autoDownload,
            specs: s.specs,
            ollama: r.ollama,
            preferredEngine: s.preferredEngine,
            bindingsManual: s.bindingsManual,
            tierOverridden: s.tierOverride != null,
            current: { vision: s.engine.vision, text: s.engine.text },
            recommended: (kind) => bindingsFor(kind, rec, s),
            webllmCached: r.webllmCached,
            busy: Object.values(r.downloads).some((d) => ACTIVE_DOWNLOAD.has(d.status)),
            attempted: autoAttempted,
            online: r.online,
            saveData: Boolean(connection?.saveData),
            freeStorageGB: s.specs?.storage.freeGB ?? null,
            sizeGB: catalogSizeGB,
          })
          const reason = plan.action === 'none' || plan.action === 'wait' ? plan.reason : plan.action === 'configure' ? plan.blocked : null
          if (r.autoDownloadReason !== reason) r.set({ autoDownloadReason: reason })
          if (plan.action === 'none' || plan.action === 'wait') return
          const firstSetup = !s.engine.vision && !s.engine.text
          if (plan.action === 'configure') configureEngine(plan.kind)
          if (!plan.downloads.length) {
            if (plan.action === 'configure' && firstSetup && !plan.blocked) r.toast('The AI models this computer needs are already installed — ready to go.', 'success')
            return
          }
          for (const t of plan.downloads) autoAttempted.add(targetKey(t))
          if (!autoToastShown) {
            autoToastShown = true
            const gb = plan.downloads.reduce((sum, t) => sum + catalogSizeGB(t), 0)
            r.toast(`Downloading the AI models this computer needs (about ${gb.toFixed(1)} GB). It continues in the background.`, 'info')
          }
          if (plan.downloads.some((t) => t.engine === 'webllm')) void requestPersistentStorage()
          queueDownloads(plan.downloads)
        },

        applyAndDownload: async (kind) => {
          const s = get()
          if (kind === 'cloud' && !s.engine.cloudApiKey.trim()) {
            runtime().toast('Enter an Anthropic API key to use the cloud fallback.', 'warning')
            return
          }
          if (kind === 'ollama' && !runtime().ollama?.reachable) {
            runtime().toast('Ollama is not running — start it, then press Re-check.', 'warning')
            return
          }
          if (kind === 'webllm' && !s.specs?.webgpu.adapterAvailable) {
            runtime().toast('WebGPU is not available in this browser — use Ollama or the cloud fallback.', 'warning')
            return
          }
          const { downloads } = configureEngine(kind)
          if (downloads.length) await requestPersistentStorage()
          const missing = downloads.filter((d) =>
            d.engine === 'ollama' ? !ollamaHasModel(runtime().ollama, d.model) : !runtime().webllmCached[d.model],
          )
          if (!missing.length) {
            runtime().toast(kind === 'cloud' ? 'Cloud fallback configured.' : 'Recommended models are already installed — engine configured.', 'success')
            get().translatePending()
            return
          }
          queueDownloads(missing)
        },

        startDownload: (engine, model) => {
          const key = downloadKey(engine, model)
          const existing = tasks.get(key)
          const status = runtime().downloads[key]?.status
          const task = existing && status !== 'cancelled' ? existing : createTask(engine, model)
          void task.start()
        },

        pauseDownload: (key) => tasks.get(key)?.pause(),
        resumeDownload: (key) => {
          const task = tasks.get(key)
          if (task) void task.resume()
          else {
            const [engine, ...m] = key.split(':')
            get().startDownload(engine as 'ollama' | 'webllm', m.join(':'))
          }
        },
        cancelDownload: async (key) => {
          const task = tasks.get(key)
          runtime().set({ downloadQueue: [] })
          if (task) await task.cancel()
          tasks.delete(key)
          // An explicit cancel is a clear "not now": stop downloading automatically until switched back on.
          if (get().autoDownload) {
            set({ autoDownload: false })
            runtime().set({ autoDownloadReason: 'disabled' })
            runtime().toast('Download cancelled. Automatic downloads are now off — switch them back on in Setup.', 'info')
          }
          void get().refreshEngines()
        },

        bindModel: (role, binding) => set({ engine: { ...get().engine, [role]: binding }, bindingsManual: true }),

        /* ---------------- Workflow ---------------- */
        setStep: (step) => {
          set({ currentStep: step })
          get().translatePending()
        },
        setObjective: (text) => set({ objective: text }),

        addFiles: (files, category) => {
          const accepted = files.filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type) && f.size <= MAX_IMAGE_BYTES)
          const rejected = files.length - accepted.length
          if (rejected) runtime().toast(`${rejected} file(s) skipped — use PNG, JPEG, WebP, GIF, BMP or AVIF under 40 MB.`, 'warning')
          const run = async () => {
            for (const file of accepted) {
              try {
                const processed = await processUpload(file)
                const id = uid('img')
                await idbSet(id, file, imageDb)
                const image: IntakeImage = {
                  id,
                  name: file.name,
                  category: category === 'auto' ? (guessCategory(file.name) ?? 'site-photo') : category,
                  mimeType: file.type,
                  width: processed.width,
                  height: processed.height,
                  sizeBytes: file.size,
                  thumbnail: processed.thumbnail,
                  notes: '',
                  palette: processed.palette,
                  stats: processed.stats,
                  status: 'pending',
                  error: null,
                  analysis: null,
                  addedAt: new Date().toISOString(),
                }
                set({ images: [...get().images, image], noVisualAssets: false })
                void enqueueImageAnalysis(id)
              } catch (err) {
                runtime().toast(`${file.name}: ${errorText(err)}`, 'error')
              }
            }
          }
          // Uploads are serialised so cards always appear in the order they were dropped, even when a
          // later, smaller file would finish decoding first.
          uploadQueue = uploadQueue.then(run).catch(() => undefined)
          return uploadQueue
        },

        updateImage: (id, patch) => set({ images: get().images.map((im) => (im.id === id ? { ...im, ...patch } : im)) }),

        removeImage: async (id) => {
          set({ images: get().images.filter((im) => im.id !== id) })
          await del(id, imageDb)
        },

        analyzeImage: async (id) => {
          const image = get().images.find((im) => im.id === id)
          if (!image) return
          analysisController = new AbortController()
          const signal = analysisController.signal
          const patch = (p: Partial<IntakeImage>) => set({ images: get().images.map((im) => (im.id === id ? { ...im, ...p } : im)) })
          patch({ status: 'analyzing', error: null })
          let streamed = ''
          let raf = 0
          try {
            const blob = ((await idbGet(id, imageDb)) as Blob | undefined) ?? null
            const s = get()
            const analysis = await analyzeImage({
              image,
              blob,
              objective: s.objective,
              settings: s.settings,
              engine: s.engine,
              signal,
              onToken: (d) => {
                streamed += d
                if (!raf)
                  raf = requestAnimationFrame(() => {
                    raf = 0
                    runtime().set({ analysisStream: { ...runtime().analysisStream, [id]: streamed } })
                  })
              },
            })
            patch({ status: 'done', analysis })
          } catch (err) {
            patch({ status: isAborted(err) ? 'pending' : 'error', error: isAborted(err) ? null : errorText(err) })
            if (!isAborted(err)) runtime().toast(`Analysis failed for ${image.name}: ${errorText(err)}`, 'error')
          } finally {
            if (raf) cancelAnimationFrame(raf)
            const rest = { ...runtime().analysisStream }
            delete rest[id]
            runtime().set({ analysisStream: rest })
          }
        },

        analyzeAll: async () => {
          for (const im of get().images) if (im.status !== 'done' && im.status !== 'analyzing') void enqueueImageAnalysis(im.id)
          await analysisQueue
        },

        cancelAnalysis: () => {
          analysisController?.abort()
          analysisQueue = Promise.resolve()
          set({ images: get().images.map((im) => (im.status === 'analyzing' ? { ...im, status: 'pending' } : im)) })
        },

        setNoVisualAssets: (on) => set({ noVisualAssets: on }),

        setAnswer: (questionId, value) =>
          set({ answers: { ...get().answers, [questionId]: { questionId, value, updatedAt: new Date().toISOString() } } }),

        toggleChip: (questionId, chip) => {
          const current = get().answers[questionId]?.value ?? ''
          const parts = current.split(';').map((p) => p.trim()).filter(Boolean)
          const next = parts.includes(chip) ? parts.filter((p) => p !== chip) : [...parts, chip]
          get().setAnswer(questionId, next.join('; '))
        },

        setActivePillar: (id, page = 0) => set({ activePillar: id, interviewPage: page }),
        setInterviewPage: (page) => set({ interviewPage: page }),

        requestFollowUp: async (pillar) => {
          const s = get()
          const p = PILLARS.find((x) => x.id === pillar)!
          followUpController?.abort()
          followUpController = new AbortController()
          runtime().set({ followUpLoading: pillar })
          try {
            const answered = p.questions
              .map((q) => (s.answers[q.id]?.value ? `- ${q.prompt} → ${s.answers[q.id]!.value}` : ''))
              .filter(Boolean)
              .join('\n')
            const question = await suggestFollowUp({ pillarTitle: p.title, answered, settings: s.settings, engine: s.engine, signal: followUpController.signal })
            set({ followUps: [...get().followUps, { id: uid('fu'), pillar, question, answer: '', askedAt: new Date().toISOString() }] })
          } catch (err) {
            if (!isAborted(err)) runtime().toast(errorText(err), 'error')
          } finally {
            runtime().set({ followUpLoading: null })
          }
        },

        answerFollowUp: (id, answer) => set({ followUps: get().followUps.map((f) => (f.id === id ? { ...f, answer } : f)) }),
        removeFollowUp: (id) => set({ followUps: get().followUps.filter((f) => f.id !== id) }),

        /* ---------------- Drafting & audit ---------------- */
        generateBrief: async () => {
          if (runtime().draft?.running) return
          const pending = selectPendingTranslations(get())
          if (pending.length) {
            runtime().toast(`${pending.length} input${pending.length === 1 ? ' is' : 's are'} still in Tagalog — translate ${pending.length === 1 ? 'it' : 'them'} to English before drafting.`, 'warning')
            get().translatePending()
            return
          }
          generationController = new AbortController()
          runtime().set({ draft: { running: true, section: 0, title: '', text: '', status: 'Preparing project context…', error: null } })
          try {
            const s = get()
            const result = await draftBrief({
              input: buildBriefInputs(s),
              settings: s.settings,
              engine: s.engine,
              signal: generationController.signal,
              onProgress: (p) => runtime().set({ draft: { ...p, running: true, error: null } }),
            })
            if (generationController.signal.aborted) throw new DOMException('Cancelled', 'AbortError')
            set({
              brief: {
                markdown: result.markdown,
                generatedAt: new Date().toISOString(),
                generatedBy: result.generatedBy,
                repairedSections: result.repairedSections,
                editedSinceGeneration: false,
              },
              approval: null,
            })
            runtime().set({ draft: null })
            runtime().toast(
              result.forbiddenTermsReplaced
                ? `Draft ready — guardrail replaced ${result.forbiddenTermsReplaced} forbidden term(s).`
                : 'Draft ready in the exact 9-section layout.',
              'success',
            )
          } catch (err) {
            if (isAborted(err) || generationController?.signal.aborted) {
              runtime().set({ draft: null })
              runtime().toast('Drafting cancelled.', 'info')
            } else {
              const d = runtime().draft
              runtime().set({ draft: { section: d?.section ?? 0, title: d?.title ?? '', text: d?.text ?? '', status: 'Drafting failed', running: false, error: errorText(err) } })
            }
          } finally {
            generationController = null
          }
        },

        cancelGeneration: () => generationController?.abort(),

        setBriefMarkdown: (markdown) => {
          const s = get()
          const approvalValid = s.approval && s.approval.markdownHash === hashString(markdown)
          set({ brief: { ...s.brief, markdown, editedSinceGeneration: true }, approval: approvalValid ? s.approval : null })
        },

        applyFix: (id) => {
          if (id === 'english-only') {
            void get().translateBriefTagalog()
            return
          }
          const s = get()
          const composed = composeBrief(buildBriefInputs(s))
          const next = applyComplianceFix(id, s.brief.markdown, { fallback: composed, replacement: s.athleteReplacement, date: formatBriefDate() })
          if (next !== s.brief.markdown) get().setBriefMarkdown(next)
        },

        applyAllFixes: () => {
          const s = get()
          const composed = composeBrief(buildBriefInputs(s))
          get().setBriefMarkdown(applyAllFixes(s.brief.markdown, { fallback: composed, replacement: s.athleteReplacement, date: formatBriefDate() }))
          if (findTagalogLines(get().brief.markdown).length) void get().translateBriefTagalog()
        },

        setAthleteReplacement: (r) => set({ athleteReplacement: r }),

        approve: () => {
          const s = get()
          const report = auditBrief(s.brief.markdown)
          const ready = s.brief.markdown && report.allPassed && selectInterviewProgress(s.answers).complete && selectIntakeStatus(s).complete
          if (!ready) return false
          set({ approval: { approvedAt: new Date().toISOString(), markdownHash: hashString(s.brief.markdown) } })
          return true
        },

        revokeApproval: () => set({ approval: null }),
        setPageSize: (size) => set({ pageSize: size }),

        resetProject: async () => {
          generationController?.abort()
          analysisController?.abort()
          await Promise.all(get().images.map((im) => del(im.id, imageDb)))
          set({ ...initialProject() })
          runtime().set({ draft: null, translationStatus: {} })
        },

        /* ---------------- Tagalog → English ---------------- */
        translateField: (key) => {
          if (queuedTranslations.has(key)) return translationQueue
          queuedTranslations.add(key)
          translationQueue = translationQueue.then(() => runFieldTranslation(key)).catch(() => undefined)
          return translationQueue
        },

        translatePending: () => {
          const s = get()
          const statuses = runtime().translationStatus
          for (const key of selectPendingTranslations(s)) {
            // Our own output that still reads as Tagalog is left for the user to review, and a failed
            // translation waits for "Try again" — neither is re-sent in a loop.
            if (s.translations[key]?.english === readField(s, key) || statuses[key]?.state === 'error' || isFieldFocused(key)) continue
            void get().translateField(key)
          }
        },

        undoTranslation: (key) => {
          const record = get().translations[key]
          if (!record) return
          writeField(key, record.original)
          const translations = { ...get().translations }
          delete translations[key]
          set({ translations, keptOriginal: { ...get().keptOriginal, [key]: hashString(record.original) } })
          runtime().setTranslationStatus(key, null)
        },

        keepAsTyped: (key) => {
          const value = readField(get(), key)
          if (value == null) return
          set({ keptOriginal: { ...get().keptOriginal, [key]: hashString(value) } })
          runtime().setTranslationStatus(key, null)
        },

        retranslateField: (key) => {
          const keptOriginal = { ...get().keptOriginal }
          delete keptOriginal[key]
          set({ keptOriginal })
          void get().translateField(key)
        },

        translateBriefTagalog: async () => {
          const s = get()
          const r = runtime()
          if (r.briefTranslating || !findTagalogLines(s.brief.markdown).length) return
          const binding = s.engine.text ?? s.engine.vision
          if (!binding || !isBindingReady(binding, s.engine.cloudApiKey)) {
            r.toast('Translating needs the AI model. Open Setup to install it, or rewrite those lines in English.', 'warning')
            return
          }
          r.set({ briefTranslating: true })
          const before = s.brief.markdown
          try {
            const opts = { binding, settings: s.settings, engine: s.engine }
            const translated = await translateTagalogLines(before, async (text) => (await translateTagalogText(text, opts)).text)
            if (get().brief.markdown !== before) {
              r.toast('The brief was edited while translating — run “Translate to English” again.', 'warning')
              return
            }
            get().setBriefMarkdown(sanitizeForbiddenTerms(translated, get().athleteReplacement).text)
            r.toast('Tagalog passages translated to English.', 'success')
          } catch (err) {
            r.toast(`Translation failed: ${errorText(err)}`, 'error')
          } finally {
            runtime().set({ briefTranslating: false })
          }
        },
      }
    },
    {
      name: STORAGE_KEY,
      version: 2,
      storage: idbStorage,
      skipHydration: true,
      // v2 added automatic downloads. Models bound before then are treated as the user's own choice,
      // so auto-download never replaces them (1-Click Apply re-enables following the recommendation).
      migrate: (persisted, version) => {
        const state = persisted as PersistedData
        if (version < 2) return { ...state, bindingsManual: Boolean(state.engine?.vision || state.engine?.text) }
        return state
      },
      partialize: (s): PersistedData => ({
        setupCompleted: s.setupCompleted,
        specs: s.specs,
        overrides: s.overrides,
        tierOverride: s.tierOverride,
        preferredEngine: s.preferredEngine,
        engine: s.engine,
        settings: s.settings,
        recommendedApplied: s.recommendedApplied,
        currentStep: s.currentStep,
        objective: s.objective,
        // An interrupted analysis resumes as "pending" after a reload.
        images: s.images.map((im) => (im.status === 'analyzing' ? { ...im, status: 'pending' as const } : im)),
        noVisualAssets: s.noVisualAssets,
        answers: s.answers,
        activePillar: s.activePillar,
        interviewPage: s.interviewPage,
        followUps: s.followUps,
        brief: s.brief,
        athleteReplacement: s.athleteReplacement,
        approval: s.approval,
        pageSize: s.pageSize,
        autoDownload: s.autoDownload,
        bindingsManual: s.bindingsManual,
        translations: s.translations,
        keptOriginal: s.keptOriginal,
      }),
    },
  ),
)

export function flushProjectState(): void {
  flushWrites()
}
