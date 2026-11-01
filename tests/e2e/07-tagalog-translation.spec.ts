import { answerInterview, closeWizard, expect, installMockModels, test } from './support/fixtures'

const OBJECTIVE_TL = 'Gusto ko ng pribadong bahay sa burol na may malaking kusina at pavilion para sa mga bisita, at dapat matibay ito sa bagyo.'
const OBJECTIVE_EN = 'I want a private house on the hillside with a large kitchen and a pavilion for guests, and it must withstand typhoons.'
const BRIEF_TL = 'Dapat matibay sa bagyo at baha ang bahay at hindi madilim ang sala.'
const BRIEF_EN = 'The house must withstand typhoons and floods, and the living room must not be dark.'

test.describe('Tagalog → English translator', () => {
  test('Tagalog typed by the architect becomes English automatically, with show-original and undo', async ({ page, mock }) => {
    await page.goto('/')
    await installMockModels(page, mock)
    await closeWizard(page)

    await expect(page.getByTestId('language-hint')).toBeVisible()
    const objective = page.getByTestId('objective-input')
    const note = page.locator('[data-testid="translation-note"][data-field="objective"]')
    await objective.fill(OBJECTIVE_TL)
    // While the field is being typed in, the text is left alone and the translation is only announced.
    await expect(note).toHaveAttribute('data-state', 'detected')
    await expect(objective).toHaveValue(OBJECTIVE_TL)
    await objective.blur()
    await expect(objective).toHaveValue(OBJECTIVE_EN)
    await expect(note).toHaveAttribute('data-state', 'done')
    await expect(note).toContainText('Translated from Tagalog')

    await note.getByTestId('translation-show-original').click()
    await expect(page.getByTestId('translation-original')).toContainText(OBJECTIVE_TL)
    await note.getByTestId('translation-undo').click()
    await expect(objective).toHaveValue(OBJECTIVE_TL)
    await expect(note).toHaveAttribute('data-state', 'kept')
    await note.getByTestId('translation-translate').click()
    await expect(objective).toHaveValue(OBJECTIVE_EN)

    // The active writing model translated it, with the dedicated translator prompt.
    const call = mock.requests.find((r) => r.path === '/api/chat' && /^You translate Filipino/.test((r.body as { messages: Array<{ content: string }> }).messages[0]?.content ?? ''))
    expect((call!.body as { model: string }).model).toBe('llama3.2:3b')

    // Interview: an English quick-fill chip stays byte-for-byte; only the Tagalog part is translated.
    await page.getByTestId('no-visuals').check()
    await page.getByTestId('to-interview').click()
    await page.getByTestId('pillar-functional').click()
    const spaces = page.getByTestId('answer-func-spaces')
    await spaces.fill('Primary suite with dressing room; Kailangan ng tatlong kwarto na may sariling banyo ang bawat isa.')
    await page.getByTestId('pillar-title').click()
    await expect(spaces).toHaveValue('Primary suite with dressing room; Three bedrooms are needed, each with its own bathroom.')
    // Short everyday answers come from the offline phrasebook (no model call).
    const before = mock.requests.length
    const adjacency = page.getByTestId('answer-func-adjacency')
    await adjacency.fill('Wala pa po')
    await page.getByTestId('pillar-title').click()
    await expect(adjacency).toHaveValue('None yet')
    expect(mock.requests.slice(before).some((r) => r.path === '/api/chat')).toBe(false)

    // Translations survive a reload.
    await page.reload()
    await page.getByTestId('step-1').click()
    await expect(page.getByTestId('objective-input')).toHaveValue(OBJECTIVE_EN)
    await expect(page.locator('[data-testid="translation-note"][data-field="objective"]')).toHaveAttribute('data-state', 'done')
  })

  test('without an AI model, Tagalog holds drafting until it is translated or kept as typed', async ({ page }) => {
    await page.goto('/')
    await closeWizard(page)
    const objective = page.getByTestId('objective-input')
    await objective.fill(OBJECTIVE_TL)
    await objective.blur()
    const note = page.locator('[data-testid="translation-note"][data-field="objective"]')
    await expect(note).toHaveAttribute('data-state', 'no-model')
    await expect(note).toContainText('install the AI model')
    await expect(objective).toHaveValue(OBJECTIVE_TL)

    await page.getByTestId('no-visuals').check()
    await page.getByTestId('to-interview').click()
    await answerInterview(page)
    await page.getByTestId('step-3').click()
    await expect(page.getByTestId('ready-language')).toHaveAttribute('data-ok', 'false')
    await expect(page.getByTestId('pending-translation')).toHaveCount(1)
    await expect(page.getByTestId('pending-translation')).toContainText('Core project objective')
    await expect(page.getByTestId('generate-brief')).toBeDisabled()

    await page.getByTestId('pending-keep').click()
    await expect(page.getByTestId('ready-language')).toHaveAttribute('data-ok', 'true')
    await expect(page.getByTestId('generate-brief')).toBeEnabled()
    await page.getByTestId('generate-brief').click()
    await expect(page.getByTestId('section-count')).toHaveText(/9\/9 sections/)
    // The kept Tagalog reached the brief, so the English-only check stops approval.
    await page.getByTestId('to-review').click()
    await expect(page.getByTestId('check-english-only')).toHaveAttribute('data-passed', 'false')
    await expect(page.getByTestId('approve-draft')).toBeDisabled()
  })

  test('Tagalog written into the brief fails the English-only check until translated in one click', async ({ page, mock }) => {
    test.setTimeout(180_000)
    await page.goto('/')
    await installMockModels(page, mock)
    await closeWizard(page)
    await page.getByTestId('objective-input').fill('Deliver a discreet pavilion and residence for The Client with low maintenance.')
    await page.getByTestId('no-visuals').check()
    await page.getByTestId('to-interview').click()
    await answerInterview(page)
    await page.getByTestId('step-3').click()
    await expect(page.getByTestId('ready-language')).toHaveAttribute('data-ok', 'true')
    await page.getByTestId('generate-brief').click()
    await expect(page.getByTestId('section-count')).toHaveText(/9\/9 sections/, { timeout: 60_000 })
    await page.getByTestId('to-review').click()
    await page.getByTestId('fix-all').click()
    await expect(page.getByTestId('compliance-score')).toHaveText('8/8 passed')

    await page.getByTestId('view-edit').click()
    const editor = page.getByTestId('brief-editor')
    await editor.fill((await editor.inputValue()).replace('## 1. Executive Summary\n', `## 1. Executive Summary\n- **Site:** ${BRIEF_TL}\n`))
    await expect(page.getByTestId('check-english-only')).toHaveAttribute('data-passed', 'false')
    await expect(page.getByTestId('compliance-score')).toHaveText('7/8 passed')
    await expect(page.getByTestId('approve-draft')).toBeDisabled()

    await page.getByTestId('fix-english-only').click()
    await expect(page.getByTestId('check-english-only')).toHaveAttribute('data-passed', 'true')
    await expect(editor).toHaveValue(new RegExp(`- \\*\\*Site:\\*\\* ${BRIEF_EN.replace(/[.,]/g, '\\$&')}`))
    await expect(page.getByTestId('compliance-score')).toHaveText('8/8 passed')
    await expect(page.getByTestId('approve-draft')).toBeEnabled()
  })
})
