import http from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * A real streaming HTTP server that speaks the Ollama REST API subset the app uses
 * (/api/version, /api/tags, /api/show, /api/pull NDJSON, /api/chat NDJSON) with CORS.
 * Pull progress is streamed in timed chunks so pause/resume can be exercised, and a resumed
 * pull continues from where the aborted one stopped — exactly like Ollama's partial blobs.
 */

export interface MockOllama {
  url: string
  installed: Set<string>
  requests: Array<{ path: string; body: unknown }>
  pullTicks: number
  pullTickMs: number
  close(): Promise<void>
}

const forbidden = ['ath', 'letes'].join('')

/** Deliberately imperfect "model output" so the normaliser and every compliance fix get exercised. */
export const SECTION_OUTPUT: Record<number, string> = {
  1: [
    '## 1. Executive Summary',
    '- **Project:** A discreet hillside residence and entertaining pavilion for the VIP.',
    `- **Pavilion:** Hosts visiting ${forbidden} after events in total privacy.`,
    '- **Site:** Sloped lot with valley views and seasonal rain.',
    '- **Risks:** Privacy, stormwater and glare are solved with proven precedents.',
    '- **Timeline:** Design 6 months, build 18 months.',
  ].join('\n'),
  2: ['> The Client wants a sanctuary that stays calm, private and effortless for decades.', '', '- Deliver a private sanctuary.', '- Zero unplanned maintenance call-outs.'].join('\n'),
  3: [
    '- **Location & Climate:** Hillside lot, hot-humid climate with seasonal rain.',
    '- **Access & Privacy:** Separate service entry; the scheme was endorsed by the mayor last spring.',
    '- **Visual Intake Observations:** Shop drawing A-101 shows an aluminum curtain-wall grid over EPDM pads.',
  ].join('\n'),
  4: ['| Space | Adjacency | Requirements |', '|---|---|---|', '| Primary suite | Away from guest wing | Acoustic privacy |', '| Entertaining pavilion | Opens to pool terrace | Weather protection |'].join('\n'),
  5: [
    '### Atmosphere',
    '- Quiet luxury with natural materials.',
    '### 7 Principles of Design Integration',
    '- **Emphasis:** Double-height arrival hall.',
    '- **Balance:** Asymmetric massing around a stone core.',
    '- **Unity:** One palette inside and out.',
    '- **Contrast:** Dark stone against pale oak.',
    '- **Rhythm:** Timber fins along the facade.',
    '- **Proportion:** Human-scaled private rooms.',
    '### Material Palette',
    '- Natural stone, oak and bronze; low-VOC finishes.',
    '### Lighting',
    '- Warm 2700K layered lighting.',
  ].join('\n'),
  6: [
    '### Critical Transitions',
    '- Flush thresholds with steel trench covers.',
    '### Existing Site Integrations',
    '- Existing pool and deck tied into the terrace.',
    '### Material Specifications',
    '| System / Component | Specification | Function / Note |',
    '|---|---|---|',
    '| Facade grid | Thermally broken aluminum curtain wall | Low maintenance |',
    '| Roof | EPDM membrane on isolation pads | Durable waterproofing |',
  ].join('\n'),
  7: [
    '| Identified Challenge | Proposed Solution | Real-World Precedent / Proof (Where & When) |',
    '|---|---|---|',
    '| Flood and stormwater risk | Detention terraces | **Benthemplein Water Square** — Where: Rotterdam, Netherlands; When: 2013. Stores stormwater. |',
    '| Glare and solar heat gain | External shading | A famous tower somewhere with a responsive screen. |',
  ].join('\n'),
  8: [
    '### Maintainability & Durability',
    '- Maintainability: accessible plant; durability: 50+ year structure.',
    '### Health Safety & Wellbeing',
    '- Low-VOC finishes and MERV-13 filtration.',
    '### Security Integration',
    '- Layered perimeter security in the landscape.',
    '### Aging-in-Place Friendliness',
    '- Aging-in-place: step-free ground floor with a future lift.',
  ].join('\n'),
  9: [
    '### Timeline',
    '- Design 6 months, build 18 months.',
    '### Execution Constraints',
    '- Strict NDAs for all trades.',
    '### Political/Reputational Risk Shield Summary',
    '- Strictly apolitical; no political figures are associated with the project.',
    '- Low-profile narrative protects The Client’s reputation and privacy.',
  ].join('\n'),
}

export const IMAGE_ANALYSIS_JSON = {
  summary: 'Technical sheet showing a façade with an aluminum curtain-wall grid over a podium.',
  styleAndSpatialFlow: ['Strong horizontal banding with a regular bay rhythm.', 'Open ground floor flowing to the terrace.'],
  materialBuildUps: ['Aluminum curtain-wall grid on steel frame.', 'EPDM pads isolating rooftop plant.', 'Steel trench covers at thresholds.'],
  constructabilityNotes: ['Confirm thermal breaks at mullion-to-slab junctions.', 'Detail drainage under the steel covers.'],
  designPrinciples: {
    Emphasis: 'Gable marks the entrance.',
    Balance: 'Symmetrical façade.',
    Unity: 'Single grid module.',
    Contrast: 'Solid base against glazing.',
    Rhythm: 'Nine repeating mullions.',
    Proportion: 'Wide, low massing.',
    Variety: 'Shaded plinth adds depth.',
  },
}

/** Canned Tagalog → English translations (the translator's few-shot prompt is detected by its system message). */
export const TRANSLATIONS: Record<string, string> = {
  'Gusto ko ng pribadong bahay sa burol na may malaking kusina at pavilion para sa mga bisita, at dapat matibay ito sa bagyo.':
    'I want a private house on the hillside with a large kitchen and a pavilion for guests, and it must withstand typhoons.',
  'Kailangan ng tatlong kwarto na may sariling banyo ang bawat isa.': 'Three bedrooms are needed, each with its own bathroom.',
  'Dapat matibay sa bagyo at baha ang bahay at hindi madilim ang sala.': 'The house must withstand typhoons and floods, and the living room must not be dark.',
}

function cors(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range')
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function startMockOllama(): Promise<MockOllama> {
  const installed = new Set<string>()
  const requests: MockOllama['requests'] = []
  const pullProgress = new Map<string, number>()
  const state = { pullTicks: 30, pullTickMs: 150 }

  const server = http.createServer(async (req, res) => {
    cors(res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const raw = Buffer.concat(chunks).toString('utf8')
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    const path = (req.url ?? '').split('?')[0] ?? ''
    requests.push({ path, body })
    let closed = false
    res.on('close', () => {
      closed = true
    })

    if (path === '/api/version') return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ version: '0.40.13-mock' }))
    if (path === '/api/tags') {
      return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({ models: [...installed].map((name) => ({ name, size: 1_700_000_000, details: { parameter_size: '3B', quantization_level: 'Q4_K_M', family: 'mock' } })) }),
      )
    }
    if (path === '/api/show') return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ capabilities: ['completion', 'vision'] }))

    if (path === '/api/pull') {
      const model = String(body.model)
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
      const write = (o: unknown) => !closed && res.write(`${JSON.stringify(o)}\n`)
      write({ status: 'pulling manifest' })
      const total = 400 * 1024 * 1024
      let tick = pullProgress.get(model) ?? 0
      while (tick < state.pullTicks) {
        await sleep(state.pullTickMs)
        if (closed) {
          pullProgress.set(model, tick)
          return
        }
        tick++
        write({ status: `pulling sha256:${'a'.repeat(12)}`, digest: `sha256:${'a'.repeat(64)}`, total, completed: Math.round((total * tick) / state.pullTicks) })
      }
      write({ status: 'verifying sha256 digest' })
      await sleep(60)
      write({ status: 'writing manifest' })
      write({ status: 'success' })
      installed.add(model.includes(':') ? model : `${model}:latest`)
      pullProgress.delete(model)
      return void res.end()
    }

    if (path === '/api/chat') {
      const messages = (body.messages as Array<{ content: string }>) ?? []
      const prompt = messages[messages.length - 1]?.content ?? ''
      let text: string
      const section = prompt.match(/TASK: Write the body of section (\d)/)
      if (/^You translate Filipino \(Tagalog\)/.test(messages[0]?.content ?? '')) text = TRANSLATIONS[prompt.trim()] ?? `Translation unavailable for: ${prompt}`
      else if (section) text = SECTION_OUTPUT[Number(section[1])] ?? ''
      else if (/Ask ONE concise follow-up question/.test(prompt)) text = 'Which views from the pavilion must stay completely private from neighbouring lots?'
      else if (body.format) text = JSON.stringify(IMAGE_ANALYSIS_JSON)
      else text = 'OK'
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
      const parts = text.match(/[\s\S]{1,24}/g) ?? []
      for (const part of parts) {
        if (closed) return
        res.write(`${JSON.stringify({ model: body.model, message: { role: 'assistant', content: part }, done: false })}\n`)
        await sleep(4)
      }
      res.write(`${JSON.stringify({ model: body.model, message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' })}\n`)
      return void res.end()
    }

    res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'not found' }))
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    installed,
    requests,
    get pullTicks() {
      return state.pullTicks
    },
    set pullTicks(v: number) {
      state.pullTicks = v
    },
    get pullTickMs() {
      return state.pullTickMs
    },
    set pullTickMs(v: number) {
      state.pullTickMs = v
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
