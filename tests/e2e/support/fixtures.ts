import { test as base, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startMockOllama, type MockOllama } from './mockOllama'

export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
export const SHOP_DRAWING = path.join(FIXTURES, 'shop-drawing-A101.png')
export const SITE_PHOTO = path.join(FIXTURES, 'site-photo-hillside.jpg')

/** Console noise that is expected and not an app defect. */
const BENIGN = [
  /Service Worker registration blocked by Playwright/i,
  /No available adapters/i,
  /powerPreference option is currently ignored/i,
  // The app probes the default Ollama port on start; on machines without Ollama that connection is refused.
  /localhost:11434.*(ERR_CONNECTION_REFUSED|Failed to fetch)/i,
  /Failed to load resource: net::ERR_CONNECTION_REFUSED/i,
  // Expected while the offline test has the network disabled.
  /ERR_INTERNET_DISCONNECTED/i,
]

type Fixtures = {
  mock: MockOllama
  consoleErrors: string[]
}

export const test = base.extend<Fixtures>({
  mock: async ({}, use) => {
    const mock = await startMockOllama()
    await use(mock)
    await mock.close()
  },
  // Automatic: every test fails on unexpected console errors/warnings or uncaught exceptions.
  consoleErrors: [
    async ({ page }, use, testInfo) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if ((m.type() === 'error' || m.type() === 'warning') && !BENIGN.some((re) => re.test(m.text()))) errors.push(`${m.type()}: ${m.text()}`)
    })
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    await use(errors)
    if (testInfo.status === testInfo.expectedStatus) expect(errors, 'unexpected console errors/warnings').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Point the app at the mock Ollama server from inside the Setup Wizard. */
export async function connectMockOllama(page: Page, mock: MockOllama): Promise<void> {
  const wizard = page.getByTestId('setup-wizard')
  await expect(wizard).toBeVisible()
  await page.getByTestId('engine-tab-ollama').click()
  await page.getByTestId('ollama-url').fill(mock.url)
  await page.getByTestId('recheck-ollama').click()
  await expect(page.getByTestId('ollama-status')).toContainText('0.40.13-mock running')
}

/** 1-click install of the recommended Ollama models through the mock server (fast pull). */
export async function installMockModels(page: Page, mock: MockOllama): Promise<void> {
  mock.pullTicks = 4
  mock.pullTickMs = 25
  await connectMockOllama(page, mock)
  await page.getByTestId('one-click-download').click()
  await expect(page.getByTestId('download-row')).toHaveCount(2, { timeout: 30_000 })
  await expect(page.locator('[data-testid="download-row"][data-status="completed"]')).toHaveCount(2, { timeout: 30_000 })
  await expect(page.getByTestId('engine-status')).toContainText('moondream:latest')
}

export async function closeWizard(page: Page): Promise<void> {
  await page.getByTestId('finish-setup').click()
  await expect(page.getByTestId('setup-wizard')).toBeHidden()
}

/** Answer every interview question (mix of quick-fill chips and typed answers). */
export async function answerInterview(page: Page): Promise<void> {
  const plan: Array<{ pillar: string; pages: Array<Array<{ id: string; chip?: number; text?: string }>> }> = [
    { pillar: 'vision', pages: [[{ id: 'vision-purpose', chip: 0 }, { id: 'vision-success', chip: 1 }]] },
    { pillar: 'site', pages: [[{ id: 'site-location', text: 'Sloped hillside lot facing south-west with valley views; hot-humid climate with heavy seasonal rain' }, { id: 'site-existing', chip: 2 }]] },
    { pillar: 'functional', pages: [[{ id: 'func-spaces', text: 'Primary suite with dressing room, Guest wing with 3 en-suite bedrooms, Chef’s kitchen with scullery, Gym and recovery spa, Entertaining pavilion with outdoor kitchen' }, { id: 'func-adjacency', chip: 0 }]] },
    { pillar: 'aesthetic', pages: [[{ id: 'aes-style', chip: 2 }, { id: 'aes-principles', chip: 0 }], [{ id: 'aes-materials', chip: 0 }]] },
    { pillar: 'constructability', pages: [[{ id: 'con-systems', chip: 0 }, { id: 'con-transitions', chip: 0 }]] },
    { pillar: 'challenges', pages: [[{ id: 'chal-list', text: 'Privacy from neighbours and drones; Flood and stormwater risk; Glare and solar heat gain' }, { id: 'chal-precedents', chip: 0 }]] },
    { pillar: 'performance', pages: [[{ id: 'perf-maint', chip: 0 }, { id: 'perf-health', chip: 0 }], [{ id: 'perf-aging', chip: 0 }]] },
    { pillar: 'timeline', pages: [[{ id: 'time-schedule', chip: 0 }, { id: 'time-constraints', chip: 0 }]] },
  ]
  for (const { pillar, pages } of plan) {
    await page.getByTestId(`pillar-${pillar}`).click()
    for (let p = 0; p < pages.length; p++) {
      for (const q of pages[p]!) {
        const card = page.getByTestId(`question-${q.id}`)
        if (q.chip != null) await card.getByTestId('suggestion-chip').nth(q.chip).click()
        if (q.text) await page.getByTestId(`answer-${q.id}`).fill(q.text)
      }
      if (p < pages.length - 1) await page.getByTestId('interview-next').click()
    }
    await expect(page.getByTestId(`pillar-${pillar}`)).toHaveAttribute('data-complete', 'true')
  }
}
