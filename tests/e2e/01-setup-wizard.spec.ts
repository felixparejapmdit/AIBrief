import { closeWizard, connectMockOllama, expect, test } from './support/fixtures'

test.describe('Setup Wizard & 1-click model downloader', () => {
  test('opens automatically on first run and shows a full hardware scorecard', async ({ page }) => {
    await page.goto('/')
    const wizard = page.getByTestId('setup-wizard')
    await expect(wizard).toBeVisible()
    await expect(page.getByTestId('spec-os')).toContainText(/Windows (10|11)|macOS|Linux/)
    await expect(page.getByTestId('spec-cpu')).toContainText(/\d+ logical cores/)
    await expect(page.getByTestId('spec-gpu')).not.toContainText('Detecting')
    await expect(page.getByTestId('spec-ram')).toContainText(/GB|Not reported/)
    await expect(page.getByTestId('spec-vram')).not.toHaveText('')
    await expect(page.getByTestId('spec-storage')).toContainText(/GB available|Unknown/)
    await expect(page.getByTestId('spec-webgpu')).toContainText(/Supported|Not available/)
    await expect(page.getByTestId('recommended-tier')).toHaveText(/High-Spec Tier|Balanced Mid-Range Tier|Lightweight \/ Integrated GPU Tier/)
    await expect(page.getByTestId('one-click-download')).toContainText('1-Click Apply & Download Best Model')
  })

  test('recommendation engine reacts to overrides and manual tier selection', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('spec-gpu')).not.toContainText('Detecting')
    const gpuClass = (await page.getByTestId('spec-gpu').innerText()).toLowerCase()
    // Integrated/software graphics always map to the lightweight tier regardless of RAM.
    if (/software|integrated/.test(gpuClass)) {
      await page.getByTestId('override-ram').selectOption('64')
      await expect(page.getByTestId('recommended-tier')).toHaveText('Lightweight / Integrated GPU Tier')
      await expect(page.getByTestId('recommendation-reasons')).toContainText(/software renderer|Integrated graphics/)
    }
    await page.getByTestId('tier-high').click()
    await expect(page.getByTestId('recommended-tier')).toHaveText('High-Spec Tier')
    await expect(page.getByTestId('recommended-card')).toContainText('8,192')
    await expect(page.getByTestId('recommended-card')).toContainText('1344px')
    await page.getByTestId('engine-tab-ollama').click()
    await expect(page.getByTestId('engine-panel-ollama')).toContainText('qwen2.5vl:7b')
    await page.getByTestId('tier-balanced').click()
    await expect(page.getByTestId('engine-panel-ollama')).toContainText('qwen2.5vl:3b')
    await page.getByTestId('engine-tab-webllm').click()
    await expect(page.getByTestId('engine-panel-webllm')).toContainText('Phi-3.5-vision-instruct')
  })

  test('Apply Recommended Performance Settings toggles the tuned values', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('tier-high').click()
    await expect(page.getByTestId('setting-temperature')).toHaveValue('0.25')
    await expect(page.getByTestId('setting-context')).toHaveValue('8192')
    await expect(page.getByTestId('setting-resolution')).toHaveValue('1344')
    await page.getByTestId('setting-temperature').fill('0.7')
    await expect(page.locator('#toggle-recommended')).not.toBeChecked()
    await page.locator('label[for="toggle-recommended"]').click()
    await expect(page.locator('#toggle-recommended')).toBeChecked()
    await expect(page.getByTestId('setting-temperature')).toHaveValue('0.25')
    await page.getByTestId('tier-lightweight').click()
    await expect(page.getByTestId('setting-context')).toHaveValue('2048')
    await expect(page.getByTestId('setting-resolution')).toHaveValue('768')
    await expect(page.getByTestId('setting-offload')).toHaveValue('auto')
  })

  test('1-click download streams live progress and supports pause, resume and cancel', async ({ page, mock }) => {
    mock.pullTicks = 40
    mock.pullTickMs = 120
    await page.goto('/')
    await page.getByTestId('tier-balanced').click()
    await connectMockOllama(page, mock)
    await page.getByTestId('one-click-download').click()

    const row = page.getByTestId('download-row').first()
    await expect(row).toHaveAttribute('data-status', 'downloading')
    await expect(row).toContainText('qwen2.5vl:3b')
    await expect(row.getByTestId('download-bytes')).toContainText('/ 400 MB')
    await expect(row.getByTestId('download-speed')).toContainText(/MB\/s/)
    await expect.poll(async () => parseFloat(await row.getByTestId('download-percent').innerText())).toBeGreaterThan(5)

    await row.getByTestId('download-pause').click()
    await expect(row).toHaveAttribute('data-status', 'paused')
    const pausedAt = parseFloat(await row.getByTestId('download-percent').innerText())
    expect(pausedAt).toBeGreaterThan(0)

    await row.getByTestId('download-resume').click()
    await expect(row).toHaveAttribute('data-status', 'downloading')
    // Resumes from the partial download rather than restarting at 0%.
    await expect.poll(async () => parseFloat(await row.getByTestId('download-percent').innerText())).toBeGreaterThanOrEqual(pausedAt)
    await expect(row).toHaveAttribute('data-status', 'completed', { timeout: 30_000 })
    await expect(page.getByTestId('engine-panel-ollama')).toContainText('Installed')
    await expect(page.getByTestId('engine-status')).toContainText('qwen2.5vl:3b')
    expect(mock.installed.has('qwen2.5vl:3b')).toBe(true)

    // Cancel: switch to the lightweight tier (two new models) and cancel the first pull.
    await page.getByTestId('tier-lightweight').click()
    await page.getByTestId('one-click-download').click()
    const moondream = page.locator('[data-testid="download-row"]', { hasText: 'moondream:latest' })
    await expect(moondream).toHaveAttribute('data-status', 'downloading')
    await moondream.getByTestId('download-cancel').click()
    await expect(moondream).toHaveAttribute('data-status', 'cancelled')
    expect(mock.installed.has('moondream:latest')).toBe(false)
  })

  test('the header button re-opens setup at any time and ?setup=1 deep-links into it', async ({ page }) => {
    await page.goto('/')
    await closeWizard(page)
    await expect(page.getByTestId('welcome-heading')).toHaveText('Welcome, Philippe.')
    await page.getByTestId('open-setup').click()
    await expect(page.getByTestId('setup-wizard')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('setup-wizard')).toBeHidden()
    // Setup is complete, so a plain reload must NOT reopen the wizard…
    await page.reload()
    await expect(page.getByTestId('welcome-heading')).toBeVisible()
    await expect(page.getByTestId('setup-wizard')).toBeHidden()
    // …but the PWA "Setup" shortcut URL does.
    await page.goto('/?setup=1')
    await expect(page.getByTestId('setup-wizard')).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
  })
})
