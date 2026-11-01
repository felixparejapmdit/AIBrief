import { expect, test } from './support/fixtures'

test.describe('Installable PWA (macOS & Windows)', () => {
  test('serves a valid standalone manifest with installable icons', async ({ page, request }) => {
    await page.goto('/')
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
    const res = await request.get('/manifest.webmanifest')
    expect(res.ok()).toBe(true)
    const manifest = (await res.json()) as {
      display: string
      start_url: string
      scope: string
      name: string
      short_name: string
      theme_color: string
      background_color: string
      icons: Array<{ src: string; sizes: string; purpose?: string }>
      shortcuts: Array<{ url: string }>
    }
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    expect(manifest.name).toContain('VIP Architectural Design Brief Creator')
    expect(manifest.icons.some((i) => i.sizes === '192x192')).toBe(true)
    expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose !== 'maskable')).toBe(true)
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true)
    expect(manifest.shortcuts[0]?.url).toBe('/?setup=1')
    for (const icon of manifest.icons) {
      const r = await request.get(icon.src)
      expect(r.ok(), icon.src).toBe(true)
    }
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0b0d10')
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png')
  })

  test.describe('service worker', () => {
    test.use({ serviceWorkers: 'allow' })

    test('registers with autoUpdate, precaches the app shell and works fully offline', async ({ page, context }) => {
      await page.goto('/')
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready
      })
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20_000 }).toBe(true)
      const cached = await page.evaluate(async () => {
        const names = await caches.keys()
        const urls: string[] = []
        for (const n of names) for (const r of await (await caches.open(n)).keys()) urls.push(new URL(r.url).pathname)
        return urls
      })
      expect(cached).toContain('/index.html')
      expect(cached.some((u) => /webllm\.worker-.*\.js$/.test(u))).toBe(true)
      expect(cached.some((u) => /html2pdf-.*\.js$/.test(u))).toBe(true)
      expect(cached).toContain('/manifest.webmanifest')

      await context.setOffline(true)
      await page.reload()
      await expect(page.getByTestId('setup-wizard')).toBeVisible()
      await page.getByTestId('finish-setup').click()
      await expect(page.getByTestId('welcome-heading')).toHaveText('Welcome, Philippe.')
      await expect(page.getByText('Offline')).toBeVisible()
      // Lazily-loaded chunks are also served from the precache while offline.
      const ok = await page.evaluate(async (urls) => {
        const target = urls.find((u) => /html2pdf-.*\.js$/.test(u))!
        return (await fetch(target)).ok
      }, cached)
      expect(ok).toBe(true)
      await context.setOffline(false)
    })
  })
})
