// Rasterises the brand SVGs into the PNG icon set required by the PWA manifest.
// Usage: node scripts/generate-icons.mjs
import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pub = (p) => path.join(root, 'public', p)

const jobs = [
  { svg: 'favicon.svg', out: 'icons/icon-192.png', size: 192 },
  { svg: 'favicon.svg', out: 'icons/icon-512.png', size: 512 },
  { svg: 'icons/maskable.svg', out: 'icons/maskable-512.png', size: 512 },
  { svg: 'icons/maskable.svg', out: 'apple-touch-icon.png', size: 180 },
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const job of jobs) {
  const svg = await readFile(pub(job.svg), 'utf8')
  await page.setViewportSize({ width: job.size, height: job.size })
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${job.size}" height="${job.size}" `)}</body></html>`,
  )
  await page.locator('svg').screenshot({ path: pub(job.out), omitBackground: true })
  console.log('wrote', job.out)
}
await browser.close()
