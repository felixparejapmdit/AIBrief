import type { Locator, Page } from '@playwright/test'
import { answerInterview, closeWizard, expect, test } from './support/fixtures'

interface EventSample {
  name: string
  duration: number
  start: number
  interactionId: number
  target: string
}

declare global {
  interface Window {
    __perf: {
      cls: number
      shifts: Array<{ value: number; sources: string[] }>
      longTasks: Array<{ duration: number; start: number }>
      events: EventSample[]
      typingWindows: Array<[number, number]>
      firstStep: string | null
      wizardEverRendered: boolean
      mark: number
    }
  }
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))]! : 0
}

/** Type real keystrokes and record the time window so they can be measured separately. */
async function typeMeasured(page: Page, target: Locator, text: string): Promise<void> {
  const start = await page.evaluate(() => performance.now())
  await target.pressSequentially(text, { delay: 5 })
  await page.waitForTimeout(80)
  await page.evaluate((s) => window.__perf.typingWindows.push([s, performance.now()]), start)
}

test.describe('Smoothness: no layout shift, no flicker, responsive input', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__perf = { cls: 0, shifts: [], longTasks: [], events: [], typingWindows: [], firstStep: null, wizardEverRendered: false, mark: 0 }
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: Array<{ node?: Node | null }> }>) {
          if (e.hadRecentInput) continue
          window.__perf.cls += e.value
          window.__perf.shifts.push({ value: e.value, sources: (e.sources ?? []).map((s) => (s.node as Element | null)?.outerHTML?.slice(0, 120) ?? '?') })
        }
      }).observe({ type: 'layout-shift', buffered: true })
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__perf.longTasks.push({ duration: e.duration, start: e.startTime })
      }).observe({ type: 'longtask', buffered: true })
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as Array<PerformanceEntry & { target?: Element | null; interactionId?: number }>) {
          window.__perf.events.push({
            name: e.name,
            duration: e.duration,
            start: e.startTime,
            interactionId: e.interactionId ?? 0,
            target: e.target?.getAttribute?.('data-testid') ?? e.target?.tagName ?? '',
          })
        }
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit)
      // Record the very first workflow state React paints (proves there is no default-state flash).
      new MutationObserver(() => {
        if (document.querySelector('[data-testid="setup-wizard"]')) window.__perf.wizardEverRendered = true
        const current = document.querySelector('[aria-current="step"]')
        if (current && !window.__perf.firstStep) window.__perf.firstStep = current.getAttribute('data-testid')
      }).observe(document, { childList: true, subtree: true })
    })
  })

  test('whole workflow stays layout-stable and input stays responsive', async ({ page }) => {
    test.setTimeout(180_000)
    await page.goto('/')
    await closeWizard(page)
    await page.evaluate(() => (window.__perf.mark = performance.now()))

    await typeMeasured(page, page.getByTestId('objective-input'), 'Design a discreet hillside residence and entertaining pavilion for The Client.')
    await page.getByTestId('no-visuals').check()
    await page.getByTestId('to-interview').click()
    await answerInterview(page)
    await page.getByTestId('pillar-vision').click()
    await typeMeasured(page, page.getByTestId('answer-vision-success'), ' Spaces still feel calm, current and effortless to maintain decades after handover.')
    await page.getByTestId('step-3').click()
    await page.getByTestId('generate-brief').click()
    await expect(page.getByTestId('section-count')).toHaveText(/9\/9/)
    const editor = page.getByTestId('brief-editor')
    await editor.click()
    await editor.press('Control+End')
    await typeMeasured(page, editor, '\nAdditional note for The Client: confirm stone samples on site.')
    await page.getByTestId('to-review').click()
    await expect(page.getByTestId('compliance-score')).toHaveText('7/7 passed')
    await page.getByTestId('open-setup').click()
    await expect(page.getByTestId('setup-wizard')).toBeVisible()
    await page.getByTestId('close-setup').click()
    for (const step of [1, 2, 3, 4, 5, 1]) {
      await page.getByTestId(`step-${step}`).click()
      await page.waitForTimeout(260)
    }

    const perf = await page.evaluate(() => window.__perf)
    const inWindow = (t: number) => perf.typingWindows.some(([a, b]) => t >= a && t <= b)
    const keystrokes = perf.events.filter((e) => /^(keydown|keypress|keyup|beforeinput|input)$/.test(e.name) && inWindow(e.start)).map((e) => e.duration)
    // INP-style: worst latency per discrete interaction, then a high percentile across interactions.
    const perInteraction = new Map<number, number>()
    for (const e of perf.events) if (e.interactionId) perInteraction.set(e.interactionId, Math.max(perInteraction.get(e.interactionId) ?? 0, e.duration))
    const interactions = [...perInteraction.values()]
    const afterLoad = perf.longTasks.filter((t) => t.start > perf.mark)
    const report = {
      cls: perf.cls,
      keystrokeEventsOver16ms: keystrokes.length,
      keystrokeP50: pct(keystrokes, 0.5),
      keystrokeP95: pct(keystrokes, 0.95),
      interactions: interactions.length,
      inpP98: pct(interactions, 0.98),
      worstInteraction: Math.max(0, ...interactions),
      longTasksAfterLoad: afterLoad.length,
      longestTaskAfterLoad: Math.max(0, ...afterLoad.map((t) => t.duration)),
    }
    console.log('SMOOTHNESS', JSON.stringify(report))
    test.info().annotations.push({ type: 'smoothness', description: JSON.stringify(report) })

    // Web Vitals "good": CLS ≤ 0.1, INP ≤ 200 ms. The app is held to a 10× stricter CLS bound.
    expect(perf.cls).toBeLessThan(0.01)
    expect(report.keystrokeP95).toBeLessThan(80)
    expect(report.inpP98).toBeLessThan(200)
  })

  test('reload paints the restored step directly — no default-state or wizard flash', async ({ page }) => {
    await page.goto('/')
    await closeWizard(page)
    await page.getByTestId('step-2').click()
    await expect(page.getByTestId('interview-panel')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('interview-panel')).toBeVisible()
    const perf = await page.evaluate(() => window.__perf)
    expect(perf.firstStep).toBe('step-2')
    expect(perf.wizardEverRendered).toBe(false)
    expect(perf.cls).toBeLessThan(0.01)
  })
})
