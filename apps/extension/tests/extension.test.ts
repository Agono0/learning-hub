import { describe, expect, it } from 'vitest'
import { buildDnrRules, isDomainAllowed } from '@learning-hub/core/focus-lock'

describe('extension rules and allowlist evaluation', () => {
  it('generates declarative dynamic rules matching domain list', () => {
    const rules = buildDnrRules({ domains: ['my-university.edu', 'canvas.instructure.com'] })
    expect(rules.length).toBeGreaterThan(2)

    const redirectRule = rules.find((r: { id: number }) => r.id === 999999)
    expect(redirectRule?.action.type).toBe('redirect')

    const allowed = rules
      .filter((r: { priority: number }) => r.priority === 2)
      .flatMap(
        (r: { condition: { requestDomains?: string[] } }) => r.condition.requestDomains ?? [],
      )
    expect(allowed).toContain('my-university.edu')
    expect(allowed).toContain('canvas.instructure.com')
    expect(allowed).toContain('youtube.com')
  })

  it('correctly classifies permitted and forbidden web origins', () => {
    const list = ['learn.microsoft.com', 'developer.mozilla.org']
    expect(isDomainAllowed('learn.microsoft.com', list)).toBe(true)
    expect(isDomainAllowed('developer.mozilla.org', list)).toBe(true)
    expect(isDomainAllowed('news.ycombinator.com', list)).toBe(false)
    expect(isDomainAllowed('reddit.com', list)).toBe(false)
  })
})
