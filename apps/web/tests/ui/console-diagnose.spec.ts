import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.resolve(process.cwd(), process.env.VISUAL_OUT ?? 'visual-out')
const targets = ['/contrasting', '/skills', '/constellation>/contrasting']

test.describe('console diagnosis (fresh page per route)', () => {
  test.setTimeout(180_000)
  for (const url of targets) {
    test(`stack ${url}`, async ({ page }) => {
      await page.addInitScript(() => {
        const w = window as unknown as { __errs: string[] }
        w.__errs = []
        const orig = console.error.bind(console)
        console.error = (...args: unknown[]) => {
          const first = String(args[0] ?? '')
          if (/Maximum update depth|script tag|hydrat/i.test(first)) {
            w.__errs.push(
              `${first.slice(0, 200)}\nARGS:${args
                .slice(1)
                .map((a) => String(a).slice(0, 1500))
                .join(' | ')}\nSTACK:${new Error().stack?.slice(0, 3500)}`,
            )
          }
          orig(...args)
        }
      })
      for (const hop of url.split('>')) {
        await page.goto(hop, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        await page.waitForTimeout(url.includes('>') ? 2500 : 0)
      }
      await page.waitForTimeout(6000)
      const errs = await page.evaluate(() => (window as unknown as { __errs: string[] }).__errs)
      fs.mkdirSync(OUT, { recursive: true })
      fs.writeFileSync(
        path.join(OUT, `console-${url.replace(/[^a-z]+/g, '-').replace(/^-/, '')}.json`),
        JSON.stringify({ url, count: errs.length, errs }, null, 2),
      )
      expect(errs).toBeDefined()
    })
  }
})
