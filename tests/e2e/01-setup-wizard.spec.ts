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
    // Plain-language status: no Ollama and no WebGPU in the test browser, so it explains how to get the AI.
    await expect(page.getByTestId('setup-status')).toHaveAttribute('data-state', 'no-engine')
    await expect(page.getByTestId('setup-status-title')).toHaveText('Install Ollama to run the AI on this computer')
    await expect(page.locator('#toggle-auto-download')).toBeChecked()
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
    await page.getByTestId('fine-tune').click()
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

  test('required models download automatically once Ollama is found, with live progress, pause, resume and cancel', async ({ page, mock }) => {
    mock.pullTicks = 40
    mock.pullTickMs = 120
    await page.goto('/')
    await page.getByTestId('tier-balanced').click()
    await connectMockOllama(page, mock)
    // No click needed: finding Ollama starts the download of the tier's required models by itself.

    const row = page.getByTestId('download-row').first()
    await expect(row).toHaveAttribute('data-status', 'downloading')
    await expect(row).toContainText('qwen2.5vl:3b')
    await expect(page.getByTestId('setup-status')).toHaveAttribute('data-state', 'downloading')
    await expect(page.getByTestId('setup-status')).toContainText('qwen2.5vl:3b')
    await expect(page.getByTestId('toast-info').filter({ hasText: 'Downloading the AI models this computer needs' })).toBeVisible()
    await expect(page.getByTestId('engine-status')).toContainText(/\d+%/)
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
    await expect(page.getByTestId('setup-status')).toHaveAttribute('data-state', 'ready')
    await expect(page.getByTestId('setup-status-title')).toHaveText('Your AI assistant is ready')
    expect(mock.installed.has('qwen2.5vl:3b')).toBe(true)

    // Back to the tier detected for this machine: its two models start downloading automatically.
    await page.getByTestId('tier-lightweight').click()
    const moondream = page.locator('[data-testid="download-row"]', { hasText: 'moondream:latest' })
    await expect(moondream).toHaveAttribute('data-status', 'downloading')
    // Cancelling is an explicit "not now": automatic downloads switch off until re-enabled.
    await moondream.getByTestId('download-cancel').click()
    await expect(moondream).toHaveAttribute('data-status', 'cancelled')
    await expect(page.locator('#toggle-auto-download')).not.toBeChecked()
    await expect(page.getByTestId('setup-status')).toHaveAttribute('data-state', 'off')
    expect(mock.installed.has('moondream:latest')).toBe(false)
    expect(mock.requests.filter((r) => r.path === '/api/pull' && (r.body as { model: string }).model === 'llama3.2:3b')).toHaveLength(0)

    // Switching it back on resumes the required downloads.
    mock.pullTicks = 4
    mock.pullTickMs = 25
    await page.getByTestId('status-enable-auto').click()
    await expect(page.locator('#toggle-auto-download')).toBeChecked()
    await expect(page.locator('[data-testid="download-row"][data-status="completed"]', { hasText: 'llama3.2:3b' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('setup-status')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 })
    expect(mock.installed.has('moondream:latest') && mock.installed.has('llama3.2:3b')).toBe(true)
  })

  test('a hand-picked tier is only downloaded after confirmation; auto-download can be switched off', async ({ page, mock }) => {
    await page.goto('/')
    await page.locator('label[for="toggle-auto-download"]').click()
    await expect(page.locator('#toggle-auto-download')).not.toBeChecked()
    await connectMockOllama(page, mock)
    // Auto-download is off: Ollama is found but nothing is pulled.
    await expect(page.getByTestId('setup-status')).toHaveAttribute('data-state', 'off')
    await page.waitForTimeout(500)
    expect(mock.requests.some((r) => r.path === '/api/pull')).toBe(false)
    await expect(page.getByTestId('download-row')).toHaveCount(0)

    // Turn it back on: the detected tier's models install by themselves.
    mock.pullTicks = 4
    mock.pullTickMs = 25
    await page.locator('label[for="toggle-auto-download"]').click()
    await expect(page.locator('[data-testid="download-row"][data-status="completed"]')).toHaveCount(2, { timeout: 30_000 })
    await expect(page.getByTestId('setup-status')).toHaveAttribute('data-state', 'ready')

    // Picking a heavier tier by hand asks first instead of starting a multi-GB download.
    await page.getByTestId('tier-high').click()
    await expect(page.getByTestId('setup-status')).toHaveAttribute('data-state', 'tier-choice')
    await expect(page.getByTestId('setup-status-title')).toHaveText('Download the High-Spec models?')
    await page.waitForTimeout(300)
    expect(mock.requests.some((r) => r.path === '/api/pull' && (r.body as { model: string }).model === 'qwen2.5vl:7b')).toBe(false)
    await page.getByTestId('status-download-tier').click()
    await expect(page.locator('[data-testid="download-row"]', { hasText: 'qwen2.5vl:7b' })).toHaveAttribute('data-status', 'completed', { timeout: 30_000 })
    await expect(page.getByTestId('engine-status')).toContainText('qwen2.5vl:7b')
  })

  test('upgrading from a pre-auto-download save keeps hand-picked models and restores the project', async ({ page, mock }) => {
    mock.installed.add('ornith-1.5:9b')
    // Seed a v1 save (before automatic downloads existed) into IndexedDB before the app boots.
    await page.addInitScript((url) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      const binding = { engine: 'ollama', model: 'ornith-1.5:9b', vision: true }
      const req = indexedDB.open('vip-brief-creator')
      req.onupgradeneeded = () => req.result.createObjectStore('state')
      req.onsuccess = () => {
        const state = { setupCompleted: true, preferredEngine: 'ollama', currentStep: 1, objective: 'Restored objective for The Client from the earlier version.', engine: { ollamaBaseUrl: url, cloudApiKey: '', cloudModel: 'claude-opus-5-5', vision: binding, text: binding } }
        req.result.transaction('state', 'readwrite').objectStore('state').put({ state, version: 1, savedAt: Date.now() + 60_000 }, 'vip-brief-project')
      }
    }, mock.url)
    await page.goto('/')
    await expect(page.getByTestId('objective-input')).toHaveValue('Restored objective for The Client from the earlier version.')
    await expect(page.getByTestId('setup-wizard')).toBeHidden()
    await expect(page.getByTestId('engine-status')).toContainText('ornith-1.5:9b')
    await page.getByTestId('open-setup').click()
    await expect(page.getByTestId('setup-status')).toHaveAttribute('data-state', 'ready')
    // The hand-picked model is kept: nothing recommended is pulled over it.
    await page.waitForTimeout(500)
    expect(mock.requests.some((r) => r.path === '/api/pull')).toBe(false)
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
