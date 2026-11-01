# VIP Architectural Design Brief Creator — Woodland Construction

An installable, offline-capable PWA (macOS & Windows) that helps **Philippe, Construction Manager at Woodland Construction**, prepare an exact 9-section Architectural Design Brief for **The Client** — using local AI that is sized automatically to the machine it runs on.

| Step | What happens |
| --- | --- |
| **Setup** | Detects OS, CPU, GPU/VRAM, RAM, storage and WebGPU, recommends a hardware tier and **downloads the required models automatically** (Ollama or in-browser WebGPU, with an optional Claude cloud fallback). A plain-language status panel says what is happening and what to do next. |
| **1. Intake & Visual Analysis** | Core objective + drag-and-drop site photos, SketchUp renders, shop drawings and design pegs, analysed into Style & Spatial Flow, Material Build-Ups, Constructability Notes and 7-Principles observations. |
| **2. 8-Pillar Interview** | One or two focused questions at a time, quick-fill chips, a live pillar-progress sidebar and optional AI follow-up questions. |
| **3. Draft** | Generates the brief section by section in the exact mandated 9-section Markdown layout (headings and table columns are enforced). |
| **4. Review & Compliance** | Live scorecard (The Client, forbidden-term guardrail, political/sentiment risk, 7 Principles, 5 Essential Criteria, Where & When precedents, exact structure, English only) with one-click fixes and an explicit **Approve Draft & Unlock Print-Ready PDF** gate. |
| **5. Print-Ready PDF** | Executive preview and 1-click PDF export with Woodland Construction headers, footers, page numbers and crisp tables (plus native vector print). |

Philippe can type in **English or Tagalog (including Taglish)** anywhere — Tagalog is translated to English automatically. Everything is persisted locally (IndexedDB) and works offline once installed.

---

## Quick start

Requires **Node.js 20+**.

```bash
npm install
npm run dev        # http://localhost:5381
npm run build      # type-check + production build (PWA + service worker)
npm run preview    # serve the production build on http://localhost:4381
```

### Install as a desktop app

Open the app in **Chrome or Edge** (macOS or Windows) and use **Install app** in the top bar (or the install icon in the address bar). On macOS Safari 17+, use **File → Add to Dock**. The installed app opens in its own window, works offline, and has a **Setup** shortcut (`/?setup=1`) that jumps straight to the model downloader.

---

## Local AI engines

| Engine | When to use it | Notes |
| --- | --- | --- |
| **Local Ollama** (`http://localhost:11434`) | Best quality/speed; vision models up to 7B+ | Install from [ollama.com](https://ollama.com). The wizard pulls models with live NDJSON progress, pause/resume and cancel. If the app is served from a non-localhost origin, set `OLLAMA_ORIGINS` to that origin. |
| **Browser WebGPU** (`@mlc-ai/web-llm`) | No install at all | Chrome/Edge 113+. Weights stream into browser storage with byte-level progress, speed, pause (resumes mid-shard via HTTP Range) and cancel. Runs entirely in a Web Worker so the UI never stalls. |
| **Cloud fallback** (Claude) | No capable local hardware | Paste an Anthropic API key in Setup (stored only in this browser). Defaults to `claude-opus-5-5` with server-side refusal fallbacks. |

### Automatic model download

On first run the Setup window checks the machine and then downloads the models the detected tier needs — no click required:

- **Engine:** Ollama when it is running (fastest, and it keeps models on disk), otherwise the in-browser WebGPU engine. If neither is available, Setup explains how to install Ollama and starts the download as soon as Ollama is detected.
- **Only what is missing** is downloaded, one model at a time, with live progress in Setup and in the top bar. Downloads continue in the background while the brief is being prepared.
- **Safe by default:** nothing starts while offline, on a Data-Saver connection, or without enough browser storage; a failed download is never retried in a loop; a tier picked by hand is only downloaded after "Download now"; models chosen by hand are respected.
- **Cancel** switches automatic downloads off until the "Download the required AI models automatically" switch is turned back on.

### Tagalog → English translation

- Every free-text field (objective, interview answers, follow-up answers, image notes) detects Tagalog/Taglish and, when Philippe leaves the field, replaces it with English using the active writing model (`src/services/translator.ts`). English parts and quick-fill chips are kept exactly; numbers, units and brand names are preserved.
- Short everyday answers ("Oo", "Wala pa po") are translated offline from a built-in phrasebook. **Show original** and **Undo** are always available; **Keep as typed** leaves a field untouched.
- Without a model, Tagalog waits for the download to finish; drafting is held until every answer is in English (or kept as typed), and the Step 4 **English only** check translates any Tagalog lines in the brief with one click.
- Detection (`src/utils/tagalog.ts`) is unit-tested against every English sentence the app produces, so English text never triggers a translation.

### Hardware tiers (deterministic recommendation engine)

| Tier | Detected when | Ollama | WebGPU | Settings |
| --- | --- | --- | --- | --- |
| **High-Spec** | Apple Silicon with 16 GB+ unified memory, or a dedicated GPU with 10 GB+ VRAM | `qwen2.5vl:7b` | Phi-3.5-vision + Llama-3.1-8B | 8,192 ctx · 1,344 px images (+2×2 shop-drawing tiles) · 100% GPU |
| **Balanced** | 8–16 GB RAM or 6–8 GB VRAM | `qwen2.5vl:3b` | Phi-3.5-vision | 4,096 ctx · 1,024 px · 100% GPU |
| **Lightweight** | < 8 GB RAM or integrated graphics | `moondream:latest` + `llama3.2:3b` | Llama-3.2-3B (+ Moondream via Ollama when running) | 2,048 ctx · 768 px · low-memory mode |

All tiers use temperature **0.25** for technical precision. Browsers cap `navigator.deviceMemory` at 8 GB, so RAM/VRAM overrides are provided in the wizard. GPUs without `shader-f16` automatically get `q4f32` WebLLM weights.

> **Model naming notes.** Ollama publishes Qwen2.5-VL as `qwen2.5vl:7b` / `qwen2.5vl:3b` (no hyphen), so those exact tags are pulled. `Llama-3.2-11B-Vision-Instruct` has no WebLLM build, so the browser engine pairs Phi-3.5-vision (the WebLLM vision model) with Llama-3.1-8B for drafting on high-spec machines.

---

## Guardrails

- **The Client** — "VIP", "owner/homeowner", "customer", honorific + name and lower-case "the client" are flagged and normalised to *The Client*.
- **Forbidden term** — an active regex guardrail (`src/utils/complianceAuditor.ts`) flags every form of "athletes" (case, plural, possessive) and replaces it with *guests*, *patrons* or *principals*. It runs automatically on every generated section and on demand in Step 4. The system prompt itself never contains the term (enforced at module load and by unit tests).
- **Apolitical** — political parties, officials, campaigns and endorsements are flagged outside the Section 9 Risk Shield, which must summarise sentiment risk in bullets.
- **Exact layout** — header block, the nine `##` headings, required `###` subheadings and the three table column sets are validated; a normaliser repairs drifting model output while keeping valid model text.
- **English only** — Tagalog lines in the brief fail the audit until translated (one click), so the client-facing PDF is always in English.
- **PDF gate** — the PDF stays locked until intake and interview are complete, all 8 checks pass and **Approve Draft for Print** is clicked. Any later edit re-locks it.

---

## Testing

```bash
npm run lint       # oxlint
npm test           # Vitest unit tests (auditor, normaliser, composer, tiers, GPU parsing)
npm run test:e2e   # Playwright end-to-end suite against the production build
```

The e2e suite runs a real streaming mock of the Ollama API (pull progress, pause/resume, chat streaming, translation) and covers the Setup Wizard and automatic downloads, the complete 5-step workflow with PDF export and persistence, guardrails and gating, Tagalog translation, smoothness budgets (CLS, keystroke latency, INP) and PWA installability/offline mode. Tests never touch a real Ollama or download real weights: `localhost:11434` is refused and WebGPU is hidden unless a spec opts in.

- `PW_GPU=1 npm run test:e2e` runs Chromium on the host GPU instead of the software rasteriser.
- `LIVE_OLLAMA=1 OLLAMA_VISION_MODEL=<model> OLLAMA_TEXT_MODEL=<model> npx playwright test 06` runs real image analysis and real Tagalog translation against your local Ollama (run one test at a time on low-memory machines).

---

## Project structure

```
src/
  types/architecture.ts            Shared domain types
  constants/vipSkillPrompt.ts      VIP brief skill, system prompts, exact 9-section template
  constants/modelCatalog.ts        Hardware tiers + deterministic recommendation engine
  constants/interviewPillars.ts    8 pillars, questions and quick-fill chips
  constants/precedents.ts          Verified precedents (Where & When)
  services/hardwareDetector.ts     UA-CH / WebGL / WebGPU / storage probes
  services/modelDownloader.ts      Ollama pull + WebLLM shard streaming (pause/resume/cancel)
  services/aiClient.ts             Ollama, WebGPU (worker) and Claude clients; image analysis
  services/briefGenerator.ts       Section-by-section drafting
  services/autoDownload.ts         Automatic model-download planner (pure, unit-tested)
  services/translator.ts           Tagalog → English translation with the active model
  utils/tagalog.ts                 Tagalog detection, offline phrasebook, piece-wise translation
  workers/webllm.worker.ts         WebLLM engine + downloads, off the UI thread
  utils/complianceAuditor.ts       Guardrails, audits and auto-fixes
  utils/briefTemplate.ts           Parser, validator and normaliser for the 9-section layout
  utils/briefComposer.ts           Deterministic composer (no-model path + repair content)
  store/useProjectStore.ts         Zustand store persisted to IndexedDB
  components/…                     Setup wizard, header, intake, interview, editor/audit, PDF
```
