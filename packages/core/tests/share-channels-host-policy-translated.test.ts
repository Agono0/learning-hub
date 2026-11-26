import { describe, expect, it } from 'vitest'

import { checkHostUrl, classifyIp } from '../src/share-channels/host-policy'

/** IPv4-translated (::ffff:0:a.b.c.d) aliases the embedded IPv4 address like the mapped form. */
describe('host policy: IPv4-translated IPv6 (::ffff:0:0:0/96)', () => {
  it.each([
    ['::ffff:0:7f00:1', 'loopback'],
    ['[::ffff:0:7f00:1]', 'loopback'],
    ['::ffff:0:a00:1', 'private'],
    ['::ffff:0:a9fe:a9fe', 'link-local'],
    ['::ffff:0:c0a8:101', 'private'],
  ])('classifies %s as %s', (addr, why) => {
    expect(classifyIp(addr)).toBe(why)
  })

  it('refuses translated forms of private hosts as a URL host', () => {
    for (const host of ['[::ffff:0:7f00:1]', '[::ffff:0:a00:1]', '[::ffff:0:a9fe:a9fe]']) {
      expect(checkHostUrl(`https://${host}/x`).ok, host).toBe(false)
      // the loopback opt-in is for loopback only (the mapped form behaves the same way)
      const loop = host.includes('7f00')
      expect(checkHostUrl(`http://${host}:8080/x`, { allowHttpLoopback: true }).ok, host).toBe(loop)
    }
  })

  it('does not change neighbours: mapped stays refused, a public global address stays allowed', () => {
    expect(classifyIp('::ffff:7f00:1')).toBe('loopback')
    expect(classifyIp('::ffff:808:808')).toBe('ipv4-embedded')
    expect(classifyIp('2606:4700:4700::1111')).toBeNull()
    expect(checkHostUrl('https://[2606:4700:4700::1111]/x').ok).toBe(true)
  })
})
