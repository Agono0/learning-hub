/**
 * UX-audit screenshot tool — NOT a test, NOT a build.
 * Assumes a dev server is already running (or coming up) at BASE_URL (argv[2],
 * default http://localhost:3000); polls internally every 300 ms until it
 * answers — no shell sleeps. Captures full-page PNGs (dark desktop + phone 390
 * + light desktop subset) OUTSIDE the repo (never committed).
 * Usage: node scripts/ux-shots.mjs [BASE_URL] [OUT_DIR]
 */
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const OUT = process.argv[3] ?? 'C:/Users/pc/AppData/Local/Temp/ux-shots-redesign'

const ROUTES = [
  ['', 'dashboard'],
  ['review', 'review'],
  ['settings', 'settings'],
  ['courses', 'courses'],
  ['notes', 'notes'],
  ['decks', 'decks'],
  ['focus', 'focus'],
  ['games', 'games'],
  ['metacognition', 'studio'],
  ['definitely-not-a-route', '404'],
]
const LIGHT_PAGES = new Set(['dashboard', 'review', 'settings', 'decks'])

async function waitUp() {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(2500) })
      if (res.ok) return
    } catch {
      /* not up yet — retry in 300 ms */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`dev server never came up at ${BASE}`)
}

try {
  await waitUp()
  console.log(`server up at ${BASE}`)
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()
  let n = 0

  for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('lh-theme', t)
        localStorage.setItem('lh-onboarding-dismissed', '1')
      } catch {}
    }, theme)
    const page = await ctx.newPage()
    for (const [route, name] of ROUTES) {
      if (theme === 'light' && !LIGHT_PAGES.has(name)) continue
      await page.goto(`${BASE}/${route}`, { waitUntil: 'load', timeout: 60000 })
      await page.waitForTimeout(1800)
      await page.evaluate(async () => {
        const step = Math.max(600, Math.round(window.innerHeight * 0.8))
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 180))
        }
        window.scrollTo(0, document.body.scrollHeight)
        await new Promise((r) => setTimeout(r, 250))
        window.scrollTo(0, 0)
        await new Promise((r) => setTimeout(r, 250))
      })
      await page.waitForTimeout(600)
      await page.screenshot({ path: `${OUT}/${theme}-${name}.png`, fullPage: true })
      console.log(`ok ${theme}-${name} (#${++n})`)
    }
    await ctx.close()
  }

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await phone.addInitScript(() => {
    try {
      localStorage.setItem('lh-onboarding-dismissed', '1')
    } catch {}
  })
  const pp = await phone.newPage()
  for (const [route, name] of ROUTES) {
    await pp.goto(`${BASE}/${route}`, { waitUntil: 'load', timeout: 60000 })
    await pp.waitForTimeout(1800)
    await pp.evaluate(async () => {
      const step = Math.max(600, Math.round(window.innerHeight * 0.8))
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 180))
      }
      window.scrollTo(0, document.body.scrollHeight)
      await new Promise((r) => setTimeout(r, 250))
      window.scrollTo(0, 0)
      await new Promise((r) => setTimeout(r, 250))
    })
    await pp.waitForTimeout(600)
    await pp.screenshot({ path: `${OUT}/phone-${name}.png`, fullPage: true })
    console.log(`ok phone-${name} (#${++n})`)
  }
  await phone.close()
  await browser.close()
  console.log(`DONE ${n} shots → ${OUT}`)
} catch (err) {
  console.error(err)
  process.exitCode = 1
}
