// Renders deterministic test images (a technical shop drawing and a site photo) for the e2e suite.
// Usage: node scripts/generate-test-fixtures.mjs
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'tests', 'e2e', 'fixtures')

const shopDrawing = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100">
  <rect width="1600" height="1100" fill="#fff"/>
  <rect x="40" y="40" width="1520" height="1020" fill="none" stroke="#111" stroke-width="4"/>
  <g stroke="#111" stroke-width="3" fill="none">
    <rect x="160" y="200" width="900" height="520"/>
    <line x1="160" y1="460" x2="1060" y2="460"/>
    ${Array.from({ length: 9 }, (_, i) => `<line x1="${260 + i * 100}" y1="200" x2="${260 + i * 100}" y2="720"/>`).join('')}
    <rect x="160" y="720" width="900" height="40" fill="#ddd"/>
    <path d="M160 160 L610 90 L1060 160"/>
  </g>
  <g font-family="Arial" font-size="26" fill="#111">
    <text x="1120" y="230">ALUMINUM CURTAIN-WALL GRID</text>
    <text x="1120" y="280">EPDM PAD UNDER PLANT</text>
    <text x="1120" y="330">STEEL TRENCH COVER @ THRESHOLD</text>
    <text x="1120" y="980" font-size="34" font-weight="bold">SHOP DRAWING A-101</text>
    <text x="160" y="820">9000 mm</text>
  </g>
</svg>`

const sitePhoto = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb2e5"/><stop offset="1" stop-color="#d9ecf7"/></linearGradient>
    <linearGradient id="hill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d8f4e"/><stop offset="1" stop-color="#3d5a2a"/></linearGradient>
  </defs>
  <rect width="1600" height="1000" fill="url(#sky)"/>
  <path d="M0 620 Q 400 420 800 560 T 1600 480 L1600 1000 L0 1000 Z" fill="url(#hill)"/>
  <rect x="980" y="560" width="360" height="160" fill="#c9b79c"/><path d="M960 560 L1160 470 L1360 560 Z" fill="#8a5a3c"/>
  ${Array.from({ length: 7 }, (_, i) => `<circle cx="${140 + i * 120}" cy="${640 - (i % 3) * 30}" r="60" fill="#2f4d22"/>`).join('')}
  <rect x="300" y="760" width="420" height="120" fill="#5aa7c7" opacity="0.85"/>
</svg>`

const browser = await chromium.launch()
const page = await browser.newPage()
for (const [file, svg, w, h, type] of [
  ['shop-drawing-A101.png', shopDrawing, 1600, 1100, 'png'],
  ['site-photo-hillside.jpg', sitePhoto, 1600, 1000, 'jpeg'],
]) {
  await page.setViewportSize({ width: w, height: h })
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`)
  await page.locator('svg').screenshot({ path: path.join(dir, file), type, ...(type === 'jpeg' ? { quality: 88 } : {}) })
  console.log('wrote', file)
}
await browser.close()
