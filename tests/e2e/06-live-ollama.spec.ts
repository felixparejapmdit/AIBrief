import { SHOP_DRAWING, closeWizard, expect, test } from './support/fixtures'

/**
 * Opt-in tests against the REAL local Ollama server (http://localhost:11434). Run with:
 *   LIVE_OLLAMA=1 [OLLAMA_VISION_MODEL=<vision model>] [OLLAMA_TEXT_MODEL=<text model>] npx playwright test 06
 * Skipped by default because inference speed depends entirely on the host GPU/CPU. Run them one at
 * a time on low-memory machines (each loads a model into RAM).
 */
const LIVE = process.env.LIVE_OLLAMA === '1'
const MODEL = process.env.OLLAMA_VISION_MODEL ?? 'ornith-1.5:9b'
const TEXT_MODEL = process.env.OLLAMA_TEXT_MODEL ?? 'llama3.2:3b'

test.use({ realOllama: true })

test.describe('Live local Ollama inference', () => {
  test.skip(!LIVE, 'Set LIVE_OLLAMA=1 to run against the real local Ollama server.')

  test(`analyses a shop drawing and asks a follow-up with ${MODEL}`, async ({ page }) => {
    test.setTimeout(20 * 60_000)
    await page.goto('/')
    await page.getByTestId('engine-tab-ollama').click()
    await expect(page.getByTestId('ollama-status')).toContainText('running', { timeout: 15_000 })
    await page.getByText('Choose models by hand (advanced)').click()
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

  test(`translates Tagalog input to English with ${TEXT_MODEL}`, async ({ page }) => {
    test.setTimeout(15 * 60_000)
    await page.goto('/')
    await page.getByTestId('engine-tab-ollama').click()
    await expect(page.getByTestId('ollama-status')).toContainText('running', { timeout: 15_000 })
    await page.getByText('Choose models by hand (advanced)').click()
    await page.getByTestId('binding-text').selectOption(`ollama|${TEXT_MODEL}`)
    await closeWizard(page)

    const tagalog = 'Gusto ko ng pribadong bahay sa burol na may malaking kusina na bukas sa sala, tatlong kwarto na may sariling banyo, at dapat matibay ito sa bagyo at baha.'
    const objective = page.getByTestId('objective-input')
    await objective.fill(tagalog)
    await objective.blur()
    const note = page.locator('[data-testid="translation-note"][data-field="objective"]')
    await expect(note).toHaveAttribute('data-state', 'done', { timeout: 10 * 60_000 })
    const english = await objective.inputValue()
    console.log('LIVE translation:', english)
    expect(english).not.toBe(tagalog)
    expect(english).toMatch(/kitchen/i)
    expect(english).toMatch(/bedroom/i)
    expect(english).toMatch(/typhoon|storm/i)
  })
})
