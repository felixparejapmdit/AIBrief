import { readFile } from 'node:fs/promises'
import { SHOP_DRAWING, SITE_PHOTO, answerInterview, closeWizard, expect, installMockModels, test } from './support/fixtures'

const HEADINGS = [
  '## 1. Executive Summary',
  '## 2. Project Vision & Objectives',
  '## 3. Site Analysis & Context',
  '## 4. Functional Space Program',
  '## 5. Aesthetic, Material & Design Principles',
  '## 6. Constructability & Material Specifications',
  '## 7. Strategic Problem Solving & Proven Precedents',
  '## 8. Performance, Safety & Longevity',
  '## 9. Project Parameters',
]

test('full workflow: intake → 8-pillar interview → 9-section draft → compliance & approval → PDF, with persistence', async ({ page, mock }, testInfo) => {
  test.setTimeout(240_000)
  await page.goto('/')
  await installMockModels(page, mock)
  await closeWizard(page)

  /* ---------------- Step 1: Intake & visual analysis ---------------- */
  await expect(page.getByTestId('welcome-heading')).toHaveText('Welcome, Philippe.')
  await page.getByTestId('objective-input').fill('Design a private hillside residence with an entertaining pavilion that stays discreet, durable and easy to maintain.')
  await page.getByTestId('upload-category-shop-drawing').click()
  await page.getByTestId('file-input').setInputFiles(SHOP_DRAWING)
  await page.getByTestId('upload-category-auto').click()
  await page.getByTestId('file-input').setInputFiles(SITE_PHOTO)
  const cards = page.getByTestId('image-card')
  await expect(cards).toHaveCount(2)
  await expect(page.locator('[data-testid="image-card"][data-status="done"]')).toHaveCount(2, { timeout: 30_000 })
  const first = cards.first()
  await expect(first.getByTestId('image-category')).toHaveValue('shop-drawing')
  await expect(cards.nth(1).getByTestId('image-category')).toHaveValue('site-photo')
  await expect(first.getByTestId('analysis-mode')).toHaveText(/Vision analysis/)
  await expect(first).toContainText('Style & Spatial Flow')
  await expect(first).toContainText('Material Build-Ups & Transitions')
  await expect(first).toContainText('EPDM pads isolating rooftop plant')
  await expect(first).toContainText('Constructability Notes')
  await expect(first).toContainText('7 Principles of Design')
  await expect(first).toContainText('Nine repeating mullions')
  await expect(page.getByTestId('intake-status')).toHaveText('Intake complete.')
  // Vision requests carried the images and the structured-output schema.
  const visionCall = mock.requests.find((r) => r.path === '/api/chat' && (r.body as { format?: unknown }).format)
  expect(visionCall).toBeTruthy()
  expect(((visionCall!.body as { messages: Array<{ images?: string[] }> }).messages.at(-1)?.images ?? []).length).toBeGreaterThan(0)
  expect((visionCall!.body as { model: string }).model).toBe('moondream:latest')

  /* ---------------- Step 2: 8-pillar interview ---------------- */
  await page.getByTestId('to-interview').click()
  await expect(page.getByTestId('pillar-title')).toHaveText('Project Vision & Goals')
  // Only 1–2 questions are shown at a time.
  await expect(page.locator('[data-testid^="question-"]')).toHaveCount(2)
  await expect(page.getByTestId('interview-percent')).toHaveText('0%')
  await answerInterview(page)
  await expect(page.getByTestId('interview-percent')).toHaveText('100%')
  // AI follow-up question from the active drafting model.
  await page.getByTestId('pillar-timeline').click()
  await page.getByTestId('ask-followup').click()
  await expect(page.getByTestId('followup-question')).toHaveText(/neighbouring lots\?$/)
  await page.getByTestId('followup-answer').fill('Screen the pavilion terrace from the eastern neighbours with planting and fins.')

  /* ---------------- Step 3: Draft ---------------- */
  await page.getByTestId('step-3').click()
  await expect(page.getByTestId('ready-intake')).toHaveAttribute('data-ok', 'true')
  await expect(page.getByTestId('ready-interview')).toHaveAttribute('data-ok', 'true')
  await page.getByTestId('generate-brief').click()
  await expect(page.getByTestId('draft-progress')).toBeVisible()
  await expect(page.getByTestId('toast-success').filter({ hasText: 'guardrail replaced 1 forbidden term' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('section-count')).toHaveText(/9\/9 sections/)
  await expect(page.getByTestId('repaired-note')).toContainText('normalised to the mandated template')
  const draft = await page.getByTestId('brief-editor').inputValue()
  expect(draft.split('\n').filter((l) => l.startsWith('## '))).toEqual(HEADINGS)
  expect(draft).toContain('# ARCHITECTURAL DESIGN BRIEF')
  expect(draft).toContain('**Prepared for:** The Client')
  expect(draft).toContain('**Prepared by:** Woodland Construction')
  expect(draft).toMatch(/\*\*Date:\*\* [A-Z][a-z]+ \d{1,2}, \d{4}/)
  expect(draft).toContain('| Space / Zone | Adjacency | Key Requirements & Non-Negotiables |')
  expect(draft).toContain('### 7 Principles Integration')
  expect(draft.toLowerCase()).not.toContain(['ath', 'lete'].join(''))
  expect(draft).toContain('Hosts visiting guests') // active guardrail replaced the forbidden term
  await expect(page.getByTestId('brief-preview').locator('table')).toHaveCount(3)

  /* ---------------- Step 4: Compliance & approval ---------------- */
  await page.getByTestId('to-review').click()
  const card = page.getByTestId('compliance-scorecard')
  await expect(card).toBeVisible()
  await expect(page.getByTestId('check-forbidden-athletes')).toHaveAttribute('data-passed', 'true')
  await expect(page.getByTestId('check-structure')).toHaveAttribute('data-passed', 'true')
  for (const id of ['client-reference', 'political-risk', 'design-principles', 'precedents-where-when']) {
    await expect(page.getByTestId(`check-${id}`)).toHaveAttribute('data-passed', 'false')
  }
  await expect(page.getByTestId('approve-draft')).toBeDisabled()
  // The PDF stays locked until approval.
  await page.getByTestId('step-5').click()
  await expect(page.getByTestId('pdf-locked')).toBeVisible()
  await expect(page.getByTestId('export-pdf')).toHaveCount(0)
  await page.getByTestId('pdf-go-review').click()

  for (const id of ['client-reference', 'political-risk', 'design-principles', 'precedents-where-when']) {
    await page.getByTestId(`fix-${id}`).click()
    await expect(page.getByTestId(`check-${id}`)).toHaveAttribute('data-passed', 'true')
  }
  await expect(page.getByTestId('compliance-score')).toHaveText('7/7 passed')
  const fixed = await page.evaluate(() => (document.querySelector('[data-testid="brief-preview"]') as HTMLElement).innerText)
  expect(fixed).toContain('The Client')
  expect(fixed).not.toMatch(/\bVIP\b/)
  expect(fixed).not.toMatch(/mayor/i)
  expect(fixed).toContain('Variety')
  expect(fixed).toMatch(/Al Bahar Towers — Where: Abu Dhabi, United Arab Emirates; When: 2012/)

  await page.getByTestId('approve-draft').click()
  await expect(page.getByTestId('approved-state')).toBeVisible()
  await expect(page.getByTestId('step-5').locator('svg.lucide-lock')).toHaveCount(0)

  // Any edit after approval re-locks the PDF.
  await page.getByTestId('view-split').click()
  const editor = page.getByTestId('brief-editor')
  await editor.press('End')
  await editor.pressSequentially(' ')
  await expect(page.getByTestId('approve-draft')).toBeVisible()
  await page.getByTestId('step-5').click()
  await expect(page.getByTestId('pdf-locked')).toBeVisible()
  await page.getByTestId('pdf-go-review').click()
  await page.getByTestId('approve-draft').click()
  await page.getByTestId('to-pdf').click()

  /* ---------------- Step 5: Print-ready PDF ---------------- */
  const preview = page.getByTestId('pdf-preview')
  await expect(preview).toContainText('ARCHITECTURAL DESIGN BRIEF')
  await expect(preview).toContainText('Woodland Construction')
  await expect(page.getByTestId('print-native')).toBeEnabled()
  await page.getByTestId('page-size-A4').click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-pdf').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^Architectural-Design-Brief_The-Client_.+\.pdf$/)
  await download.saveAs(testInfo.outputPath('architectural-design-brief.pdf'))
  if (process.env.PDF_OUT) await download.saveAs(process.env.PDF_OUT)
  const pdf = await readFile((await download.path())!)
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
  expect(pages).toBeGreaterThanOrEqual(3)
  await expect(page.getByTestId('export-result')).toContainText(`Exported ${pages} pages`)
  const text = pdf.toString('latin1')
  expect(text).toContain('WOODLAND CONSTRUCTION')
  expect(text).toContain(`Page 1 of ${pages}`)
  // A4 page box = 595.28 × 841.89 pt
  expect(text).toMatch(/\/MediaBox\s*\[\s*0\s+0\s+595\.2\d*\s+841\.8\d*\s*\]/)

  /* ---------------- Local persistence ---------------- */
  await page.reload()
  await expect(page.getByTestId('pdf-preview')).toBeVisible()
  await expect(page.getByTestId('step-5')).toHaveAttribute('aria-current', 'step')
  await page.getByTestId('step-2').click()
  await expect(page.getByTestId('interview-percent')).toHaveText('100%')
  await page.getByTestId('step-1').click()
  await expect(page.getByTestId('image-card')).toHaveCount(2)
  await expect(page.getByTestId('objective-input')).toHaveValue(/hillside residence/)
})
