import { defineConfig, devices } from '@playwright/test'

/** PW_GPU=1 runs Chromium on the host GPU (ANGLE/D3D11 on Windows) instead of the SwiftShader software rasteriser. */
const gpuArgs = process.env.PW_GPU === '1' ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : []

/**
 * End-to-end suite. Runs against the production build (`vite preview`) so the PWA,
 * code-splitting and service worker behave exactly as shipped.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:4381',
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4381',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { args: ['--enable-unsafe-webgpu', ...gpuArgs] } },
    },
  ],
})
