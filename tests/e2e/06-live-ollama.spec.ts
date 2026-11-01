import { SHOP_DRAWING, closeWizard, expect, test } from './support/fixtures'

/**
 * Opt-in test against the REAL local Ollama server (http://localhost:11434) and a real
 * vision model. Run with:  LIVE_OLLAMA=1 OLLAMA_VISION_MODEL=<installed vision model> npx playwright test 06
 * It is skipped by default because inference speed depends entirely on the host GPU/CPU.
 */
const LIVE = process.env.LIVE_OLLAMA === '1'
const MODEL = process.env.OLLAMA_VISION_MODEL ?? 'ornith-1.5:9b'

test.describe('Live local Ollama inference', () => {
  test.skip(!LIVE, 'Set LIVE_OLLAMA=1 to run against the real local Ollama server.')

  test(`analyses a shop drawing and asks a follow-up with ${MODEL}`, async ({ page }) => {
    test.setTimeout(20 * 60_000)
    await page.goto('/')
    await page.getByTestId('engine-tab-ollama').click()
    await expect(page.getByTestId('ollama-status')).toContainText('running', { timeout: 15_000 })
    await page.locator('details summary').click()
    await page.getByTestId('binding-vision').selectOption(`ollama|${MODEL}`)
    await page.getByTestId('binding-text').selectOption(`ollama|${MODEL}`)
    await closeWizard(page)
    await expect(page.getByTestId('engine-status')).toContainText(MODEL)

    await page.getByTestId('objective-input').fill('Design a discreet hillside residence with an entertaining pavilion for The Client.')
    await page.getByTestId('upload-category-shop-drawing').click()
    await page.getByTestId('file-input').setInputFiles(SHOP_DRAWING)
    const card = page.getByTestId('image-card').first()
    await expect(card.getByTestId('analysis-progress')).toBeVisible()
    await expect(card).toHaveAttribute('data-status', 'done', { timeout: 15 * 60_000 })
    await expect(card.getByTestId('analysis-mode')).toHaveText(/Vision analysis/)
    await expect(card).toContainText(MODEL)
    const summary = await card.getByTestId('analysis-summary').innerText()
    console.log('LIVE vision summary:', summary)
    expect(summary.length).toBeGreaterThan(20)

    await page.getByTestId('to-interview').click()
    await page.getByTestId('answer-vision-purpose').fill('A private sanctuary for rest and recovery with a discreet pavilion for guests.')
    await page.getByTestId('answer-vision-success').fill('Zero unplanned maintenance and privacy never compromised.')
    await page.getByTestId('ask-followup').click()
    await expect(page.getByTestId('followup-question')).toHaveText(/\?$/, { timeout: 4 * 60_000 })
    console.log('LIVE follow-up:', await page.getByTestId('followup-question').innerText())
  })
})
