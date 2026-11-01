import { answerInterview, closeWizard, expect, test } from './support/fixtures'
import type { Page } from '@playwright/test'

const FORBIDDEN = ['ath', 'letes'].join('')

async function completePrerequisites(page: Page): Promise<void> {
  await page.goto('/')
  await closeWizard(page)
  await page.getByTestId('objective-input').fill('Deliver a discreet pavilion and residence for The Client with low maintenance.')
  await page.getByTestId('no-visuals').check()
  await expect(page.getByTestId('intake-status')).toHaveText('Intake complete.')
  await page.getByTestId('to-interview').click()
  await answerInterview(page)
}

test.describe('Guardrails, gating & the deterministic (no-model) path', () => {
  test('drafting is locked until intake + interview are complete; the PDF is locked until approval', async ({ page }) => {
    await page.goto('/')
    await closeWizard(page)
    await page.getByTestId('step-3').click()
    await expect(page.getByTestId('generate-brief')).toBeDisabled()
    await expect(page.getByTestId('ready-intake')).toHaveAttribute('data-ok', 'false')
    await page.getByTestId('step-4').click()
    await expect(page.getByText('No draft to review yet')).toBeVisible()
    await page.getByTestId('step-5').click()
    await expect(page.getByTestId('pdf-locked')).toBeVisible()
    await expect(page.getByTestId('export-pdf')).toHaveCount(0)
    await expect(page.getByTestId('print-native')).toHaveCount(0)
  })

  test('no model configured: the composer drafts a fully compliant brief; live audit + auto-fixes guard every edit', async ({ page }) => {
    await completePrerequisites(page)
    await page.getByTestId('step-3').click()
    await expect(page.getByText('No drafting model is configured')).toBeVisible()
    await page.getByTestId('generate-brief').click()
    await expect(page.getByTestId('section-count')).toHaveText(/9\/9 sections/)
    await page.getByTestId('to-review').click()
    await expect(page.getByTestId('compliance-score')).toHaveText('7/7 passed')
    await expect(page.getByTestId('approve-draft')).toBeEnabled()

    // --- Forbidden term: flagged live, sanitised with the chosen replacement ---
    await page.getByTestId('view-edit').click()
    const editor = page.getByTestId('brief-editor')
    const original = await editor.inputValue()
    await editor.fill(original.replace('**Project:**', `**Project:** A lounge for visiting ${FORBIDDEN}.`))
    await expect(page.getByTestId('check-forbidden-athletes')).toHaveAttribute('data-passed', 'false')
    await expect(page.getByTestId('approve-draft')).toBeDisabled()
    await page.getByTestId('replacement-select').selectOption('patrons')
    await page.getByTestId('sanitize-athletes').click()
    await expect(page.getByTestId('check-forbidden-athletes')).toHaveAttribute('data-passed', 'true')
    await expect(editor).toHaveValue(/A lounge for visiting patrons\./)

    // --- Political entanglement ---
    await editor.fill((await editor.inputValue()).replace('**Timeline:**', '**Timeline:** Endorsed by Senator Smith. '))
    await expect(page.getByTestId('check-political-risk')).toHaveAttribute('data-passed', 'false')
    await page.getByTestId('fix-political-risk').click()
    await expect(page.getByTestId('check-political-risk')).toHaveAttribute('data-passed', 'true')
    await expect(editor).not.toHaveValue(/Senator/)

    // --- Exact 9-section structure ---
    await editor.fill((await editor.inputValue()).replace('## 6. Constructability & Material Specifications', '## Constructability notes'))
    await expect(page.getByTestId('check-structure')).toHaveAttribute('data-passed', 'false')
    await page.getByTestId('fix-structure').click()
    await expect(page.getByTestId('check-structure')).toHaveAttribute('data-passed', 'true')
    await expect(editor).toHaveValue(/## 6\. Constructability & Material Specifications/)

    // --- Client identity ---
    await editor.fill((await editor.inputValue()).replace('**Site:**', '**Site:** The homeowner prefers oak. '))
    await expect(page.getByTestId('check-client-reference')).toHaveAttribute('data-passed', 'false')
    await page.getByTestId('fix-all').click()
    await expect(page.getByTestId('compliance-score')).toHaveText('7/7 passed')
    await expect(editor).toHaveValue(/The Client prefers oak/)

    await page.getByTestId('approve-draft').click()
    await expect(page.getByTestId('approved-state')).toBeVisible()
    await page.getByTestId('to-pdf').click()
    await expect(page.getByTestId('export-pdf')).toBeEnabled()
  })
})
