Prerequisites & Context Setup:
- Working Directory: Repository root
- Pre-flight Checks: Verify Node.js (v20+) and npm are installed. If initializing an empty directory, scaffold a Vite + React + TypeScript project (npm create vite@latest . -- --template react-ts) and verify clean git status.

Task: Build a Cross-Platform (macOS & Windows) Installable PWA for the "VIP Architectural Design Brief Creator" (Woodland Construction) featuring an Automated Hardware & GPU Spec Detection Setup Wizard, a 1-Click Local AI Model Downloader & Configurator, Interactive Visual/Shop-Drawing Analysis, Guided 8-Pillar Interview, Compliance Auditor, and Print-Ready PDF Generator.
Execution Mode: Plan Mode (multi-file architectural implementation)
Target Files:
- [CREATE] package.json
- [CREATE] vite.config.ts
- [CREATE] tailwind.config.js
- [CREATE] public/manifest.webmanifest
- [CREATE] src/types/architecture.ts
- [CREATE] src/constants/vipSkillPrompt.ts
- [CREATE] src/constants/modelCatalog.ts
- [CREATE] src/services/hardwareDetector.ts
- [CREATE] src/services/modelDownloader.ts
- [CREATE] src/services/aiClient.ts
- [CREATE] src/utils/complianceAuditor.ts
- [CREATE] src/store/useProjectStore.ts
- [CREATE] src/components/SetupWizard/HardwareSetupModal.tsx
- [CREATE] src/components/Header/TopNavBar.tsx
- [CREATE] src/components/VisualIntake/ImageAnalysisDropzone.tsx
- [CREATE] src/components/Interview/GuidedInterviewPanel.tsx
- [CREATE] src/components/BriefPreview/BriefEditorAndAudit.tsx
- [CREATE] src/components/PdfExport/PrintReadyPdfView.tsx
- [CREATE] src/App.tsx

Context & Conventions:
- Language & Framework: TypeScript (strict), React 19, Vite, Tailwind CSS, Lucide React icons, Zustand (with IndexedDB persistence via idb-keyval or localStorage), react-markdown + remark-gfm for exact Markdown table rendering, and @mlc-ai/web-llm + local Ollama REST API bridge (http://localhost:11434) for local model downloading and multimodal vision inference.
- PWA Configuration: Configure vite-plugin-pwa with registerType: 'autoUpdate', standalone display mode, offline caching, and desktop installability for both macOS (Safari/Chrome/Edge) and Windows (Chrome/Edge).

Guardrails & Forbidden Actions:
- FORBIDDEN: Do NOT use placeholder stubs (TODO, unimplemented, or fake non-functional buttons). Every wizard step, hardware probe, model download progress bar, and interview stage must be fully wired.
- FORBIDDEN: Never allow the generated brief or system prompt to use the word "athletes" when referring to pavilion users. Enforce an active regex guardrail in src/utils/complianceAuditor.ts that flags and replaces "athletes" with "guests", "patrons", or "principals".
- FORBIDDEN: Do not unlock PDF generation until the user has completed the intake/interview and explicitly clicked "Approve Draft for Print" in Step 4.
- MANDATORY: Always refer to the VIP strictly as "Client" or "The Client" and prepare all briefs on behalf of "Philippe, Construction Manager at Woodland Construction".
- MANDATORY: The drafted brief in Step 3/4 MUST strictly output the exact 9-section Markdown layout template without altering section headers or table columns.

Implementation Steps:
- [ ] 1. Scaffold Project & PWA Manifest (vite.config.ts, public/manifest.webmanifest):
  - Configure Vite with React, Tailwind CSS, and vite-plugin-pwa so the app can be installed as a standalone desktop app on both Mac and Windows.
  - Design a luxury architectural dark/slate-and-warm-brass UI theme suited for Woodland Construction.

- [ ] 2. Build the Cross-Platform Hardware & GPU Spec Detector (src/services/hardwareDetector.ts, src/constants/modelCatalog.ts):
  - Implement detectMachineSpecs() that inspects:
    a) OS & Platform: Detects macOS (Apple Silicon vs. Intel) and Windows PC (Windows 10/11) via navigator.userAgentData and navigator.userAgent.
    b) GPU & VRAM Estimation: Probes WebGPU (navigator.gpu.requestAdapter()) to read adapter.info and adapter.limits.maxBufferSize / maxStorageBufferBindingSize, plus WebGL2 WEBGL_debug_renderer_info (UNMASKED_RENDERER_WEBGL) to identify Apple M1/M2/M3/M4 chips, NVIDIA RTX/GTX GPUs, AMD Radeon, or Intel Iris/UHD graphics.
    c) CPU & RAM: Reads navigator.hardwareConcurrency (logical cores) and navigator.deviceMemory (with a manual RAM/VRAM override selector in the UI since browsers cap deviceMemory at 8GB).
    d) Available Disk Quota: Calls navigator.storage.estimate() to verify sufficient free GB for model weights.
  - Create a deterministic Recommendation Engine in src/constants/modelCatalog.ts that maps detected specs to 3 Hardware Profiles:
    - High-Spec Tier (16GB+ Unified Memory Mac or 10GB+ VRAM Windows PC): Recommends qwen2.5-vl:7b / Llama-3.2-11B-Vision-Instruct-q4f16_1-MLC (Context: 8192, Image Resolution: 1344px high-detail mode for shop drawings, GPU Offload: 100%).
    - Balanced Mid-Range Tier (8GB–16GB RAM / 6GB–8GB VRAM): Recommends qwen2.5-vl:3b / Phi-3.5-vision-instruct-q4f16_1-MLC (Context: 4096, Image Resolution: 1024px, GPU Offload: 100%).
    - Lightweight / Integrated GPU Tier (<8GB RAM or Integrated Graphics): Recommends moondream:latest + Llama-3.2-3B-Instruct-q4f16_1-MLC (Context: 2048, Image Resolution: 768px, Low-Memory WebGPU mode).

- [ ] 3. Implement the Setup Wizard & 1-Click Model Downloader (src/components/SetupWizard/HardwareSetupModal.tsx, src/services/modelDownloader.ts):
  - Launch automatically on first run AND make it accessible anytime via a prominent "Setup & Model Download" button in the top navigation bar (src/components/Header/TopNavBar.tsx).
  - Display a clean visual scorecard of the user's detected Mac or Windows PC specs (OS, CPU Cores, Detected GPU Renderer, Estimated RAM/VRAM, Free Storage, WebGPU Support Status).
  - Highlight the Recommended Model & Optimal Settings Card with a single "1-Click Apply & Download Best Model" primary CTA button.
  - Implement modelDownloader.ts supporting two seamless local engines (plus an optional Cloud API fallback key input):
    a) **Browser WebGPU Engine (@mlc-ai/web-llm):** Streams model shards directly into browser IndexedDB/Cache with a live percentage progress bar, MB downloaded, speed, and pause/cancel support.
    b) **Local Ollama Engine (http://localhost:11434/api/pull):** Automatically checks if Ollama is running locally; if detected, pulls the recommended vision model (qwen2.5-vl / llava / moondream) via streaming NDJSON progress updates directly inside the PWA UI.
  - Include a 1-click "Apply Recommended Performance Settings" toggle that auto-configures Temperature (0.25 for technical precision), Context Window, Max Tokens, and Image Tiling Resolution.

- [ ] 4. Encode the VIP Architectural Design Brief Skill & System Prompt (src/constants/vipSkillPrompt.ts, src/services/aiClient.ts):
  - Embed the complete VIP Architectural Design Brief Creator instructions into vipSkillPrompt.ts:
    - Persona: Senior architectural strategist and technical design lead assisting Philippe (Construction Manager at Woodland Construction) for a high-profile VIP "Client".
    - Core Rules: Strictly refer to the VIP as "Client"; never use the word "athletes"; avoid all political connections/entanglements and summarize any social/reputational sentiment risks in easy-to-read bullets; always integrate the 5 Essential Criteria (Maintainability, Durability, Security, Health safety / low-VOCs, Aging-in-place friendliness) and the 7 Principles of Architectural Design (Emphasis, Balance, Unity, Contrast, Rhythm, Proportion, Variety); require Evidence-Based Problem Solving with real-world precedents stating explicitly Where & When tested.

- [ ] 5. Build the 5-Step Guided Workflow UI (src/components/VisualIntake/, src/components/Interview/, src/components/BriefPreview/, src/components/PdfExport/):

- **Step 1: Intake & Visual Analysis (ImageAnalysisDropzone.tsx):**
    - Welcome Philippe, prompt for the core project objective, and provide a multi-file drag-and-drop uploader for Site Photos, SketchUp Renders, Technical Shop Drawings, and Design Pegs.
    - Convert uploaded images to Base64/DataURLs, analyze them with the active Vision model, and display structured cards showing: Style & Spatial Flow, Material Build-Ups & Structural Transitions (e.g., aluminum grids, EPDM pads, steel covers), Constructability Notes, and 7 Principles of Design observations.
  - **Step 2: Guided 8-Pillar Interview (GuidedInterviewPanel.tsx):**
    - Ask only 1–2 focused questions at a time while tracking completion across the 8 required pillars:
      1. Project Vision & Goals
      2. Site & Context
      3. Functional Requirements
      4. Aesthetic Direction & 7 Design Principles
      5. Constructability & Site Integration
      6. Challenges & Evidence-Based Problem Solving (Where & When precedents)
      7. Performance & Wellbeing (Maintainability, Durability, Security, Low-VOC Health, Aging-in-Place)
      8. Timeline & Parameters
    - Include quick-fill architectural suggestion chips and a real-time Pillar Progress Sidebar.
  - **Step 3: Draft the VIP Design Brief (BriefEditorAndAudit.tsx):**
    - Generate the complete brief using EXACTLY the mandated 9-section Markdown layout template:
      - Header: # ARCHITECTURAL DESIGN BRIEF, **Prepared for:** The Client, **Prepared by:** Woodland Construction, **Date:** [Current Date]
      - ## 1. Executive Summary (Easy-to-understand bulleted summary)
      - ## 2. Project Vision & Objectives (Blockquote strategic "why")
      - ## 3. Site Analysis & Context
      - ## 4. Functional Space Program (Markdown Table: Space / Zone | Adjacency | Key Requirements & Non-Negotiables)
      - ## 5. Aesthetic, Material & Design Principles (Atmosphere, 7 Principles integration, Material Palette, Lighting)
      - ## 6. Constructability & Material Specifications (Critical Transitions, Existing Site Integrations, and Markdown Table: System / Component | Specification | Function / Note)
      - ## 7. Strategic Problem Solving & Proven Precedents (Markdown Table: Identified Challenge | Proposed Solution | Real-World Precedent / Proof (Where & When))
      - ## 8. Performance, Safety & Longevity (Maintainability & Durability, Health Safety & Wellbeing, Security Integration, Aging-in-Place Friendliness)
      - ## 9. Project Parameters (Timeline, Execution Constraints & Political/Reputational Risk Shield Summary)
  - **Step 4: Review, Refine & Compliance Audit (src/utils/complianceAuditor.ts):**
    - Display a live Compliance Scorecard beside the draft verifying:
      - [x] Strictly uses "The Client"
      - [x] Zero usage of forbidden term "athletes" (auto-sanitizer button included)
      - [x] Political entanglement & sentiment risk audit passed
      - [x] All 7 Principles of Architecture addressed
      - [x] All 5 Essential Criteria (Maintainability, Durability, Security, Low-VOC, Aging-in-Place) included
      - [x] Real-world precedents include Where & When proof
      - [x] Exact 9-section Markdown structure verified
    - Provide an explicit "Approve Draft & Unlock Print-Ready PDF" button.
  - **Step 5: Print-Ready PDF Generator (PrintReadyPdfView.tsx):**
    - Once approved, unlock the executive PDF preview and 1-click "Export Print-Ready PDF" action (using clean @media print styling + html2pdf.js / native print pagination with Woodland Construction headers, footers, page numbers, and crisp table borders).

Verification & Quality Gates:
- Terminal Verification: Run npm install && npm run build and ensure zero TypeScript or bundler errors.
- Functional / Inspection Gate: Launch npm run dev and verify with the Browser Sub-Agent that:
  1. The Setup Wizard opens, accurately detects the machine's OS/CPU/GPU/WebGPU specs, recommends the right model tier, and displays the 1-Click Model Download progress UI.
  2. The top header bar includes a persistent 1-click button to reopen the Model Downloader & Hardware Settings.
  3. All 5 workflow steps (Visual Intake -> 8-Pillar Interview -> Exact 9-Section Brief Draft -> Compliance Audit & Approval -> Print-Ready PDF Export) function end-to-end with local persistence.