// Captures the 1440×900 manifest screenshot (public/screenshots/desktop-wide.png) from the real app.
// Usage: npm run build && npm run preview  (in another terminal), then  node scripts/generate-screenshot.mjs
import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const out = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'public', 'screenshots', 'desktop-wide.png')
const answers = {
  'vision-purpose': 'A private sanctuary for rest and recovery; A discreet entertaining pavilion for guests',
  'vision-success': 'Zero unplanned maintenance call-outs; Privacy never compromised',
  'site-location': 'Sloped hillside lot with valley views; Hot-humid climate with heavy seasonal rain',
  'site-existing': 'Existing pool and deck to be tied in; Mature oak trees with root protection zones',
  'func-spaces': 'Primary suite with dressing room, Guest wing with 3 en-suite bedrooms, Chef’s kitchen with scullery, Gym and recovery spa',
  'func-adjacency': 'Primary suite separated from the guest wing; Kitchen adjacent to dining and terrace',
  'aes-style': 'Quiet luxury with natural materials',
  'aes-principles': 'Emphasis: a double-height arrival hall; Rhythm: repeated timber fins along the façade',
  'aes-materials': 'Natural stone, oak and bronze; Warm 2700K layered lighting',
  'con-systems': 'Steel frame with aluminum curtain-wall grid; EPDM membrane roofs on isolation pads',
  'con-transitions': 'Flush inside–outside thresholds; Pool edge to terrace drainage',
  'chal-list': 'Privacy from neighbours and drones; Flood and stormwater risk; Glare and solar heat gain',
  'chal-precedents': 'Use proven precedents from the verified library',
  'perf-maint': '50+ year design life for the structure',
  'perf-health': 'Low-VOC, zero-added-formaldehyde finishes throughout; Layered perimeter security integrated into the landscape',
  'perf-aging': 'Step-free ground floor with a future lift shaft',
  'time-schedule': 'Design 6 months, build 18 months',
  'time-constraints': 'Strict NDAs for all trades',
}
const pages = { vision: 1, site: 1, functional: 1, aesthetic: 2, constructability: 1, challenges: 1, performance: 2, timeline: 1 }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:4381/')
await page.getByTestId('finish-setup').click()
await page.getByTestId('objective-input').fill('Design a private hillside residence with an entertaining pavilion that stays discreet, durable and easy to maintain.')
await page.getByTestId('no-visuals').check()
await page.getByTestId('to-interview').click()
for (const [pillar, n] of Object.entries(pages)) {
  await page.getByTestId(`pillar-${pillar}`).click()
  for (let p = 0; p < n; p++) {
    for (const ta of await page.locator('[data-testid^="answer-"]').all()) {
      const id = (await ta.getAttribute('data-testid')).replace('answer-', '')
      await ta.fill(answers[id])
    }
    if (p < n - 1) await page.getByTestId('interview-next').click()
  }
}
await page.getByTestId('step-3').click()
await page.getByTestId('generate-brief').click()
await page.getByTestId('to-review').click()
await page.getByTestId('compliance-score').getByText('8/8 passed').waitFor()
const dismiss = page.getByRole('button', { name: 'Dismiss' })
while (await dismiss.count()) await dismiss.first().click()
await page.waitForTimeout(500)
await page.screenshot({ path: out })
console.log('wrote', out)
await browser.close()
