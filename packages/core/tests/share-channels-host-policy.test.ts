import { describe, expect, it } from 'vitest'

import { checkHostUrl, classifyIp } from '../src/share-channels/host-policy'

const ok = (u: string, opts?: { allowHttpLoopback?: boolean }) => checkHostUrl(u, opts).ok
const reason = (u: string, opts?: { allowHttpLoopback?: boolean }) => {
  const v = checkHostUrl(u, opts)
  return v.ok ? null : v.reason
}

describe('checkHostUrl (string-level host policy)', () => {
  it('accepts https public hosts, with ports and paths', () => {
    expect(ok('https://hub.example.com')).toBe(true)
    expect(ok('https://hub.example.com:8443/base')).toBe(true)
    expect(ok('https://203.0.113.9')).toBe(false) // documentation range is reserved
    expect(ok('https://8.8.8.8')).toBe(true)
    expect(ok('https://[2606:4700:4700::1111]')).toBe(true)
  })

  it('refuses plain http for public hosts', () => {
    expect(reason('http://hub.example.com')).toMatch(/https is required/)
    expect(ok('http://hub.example.com', { allowHttpLoopback: true })).toBe(false)
  })

  it.each([
    'ftp://hub.example.com',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/plain,hi',
    'not a url',
    '',
  ])('refuses non-http(s) or invalid input: %s', (u) => {
    expect(ok(u)).toBe(false)
  })

  it('refuses credentials in the URL', () => {
    expect(reason('https://user:pw@hub.example.com')).toMatch(/credentials/)
    expect(reason('https://user@hub.example.com')).toMatch(/credentials/)
  })

  it.each([
    ['http://127.0.0.1:5432', 'loopback'],
    ['https://127.8.9.10', 'loopback'],
    ['https://[::1]', 'loopback'],
    ['https://localhost', 'loopback'],
    ['https://LOCALHOST.', 'loopback'],
    ['https://app.localhost', 'loopback'],
    ['https://0.0.0.0', 'unspecified'],
    ['https://[::]', 'unspecified'],
    ['https://10.1.2.3', 'private'],
    ['https://172.16.0.1', 'private'],
    ['https://172.31.255.255', 'private'],
    ['https://192.168.1.1', 'private'],
    ['https://169.254.169.254', 'link-local'],
    ['https://100.64.0.1', 'shared-address-space'],
    ['https://224.0.0.1', 'multicast-or-reserved'],
    ['https://[fd00::1]', 'private'],
    ['https://[fe80::1]', 'link-local'],
    ['https://[ff02::1]', 'multicast-or-reserved'],
  ])('refuses %s (%s)', (u, why) => {
    expect(reason(u)).toContain(why)
  })

  it('folds odd IPv4 spellings before checking', () => {
    for (const u of [
      'https://2130706433', // decimal 127.0.0.1
      'https://0x7f000001',
      'https://0x7f.1',
      'https://127.1',
      'https://017700000001',
      'https://2852039166', // 169.254.169.254
      'https://0xa9fea9fe',
    ]) {
      expect(ok(u), u).toBe(false)
    }
  })

  it('refuses IPv4-mapped and embedded IPv6 forms of private ranges', () => {
    for (const u of [
      'https://[::ffff:127.0.0.1]',
      'https://[::ffff:7f00:1]',
      'https://[::ffff:a9fe:a9fe]',
      'https://[::ffff:10.0.0.1]',
      'https://[::127.0.0.1]',
      'https://[64:ff9b::7f00:1]',
      'https://[2002:7f00:1::]',
    ]) {
      expect(ok(u), u).toBe(false)
    }
  })

  it('refuses single-label and internal names', () => {
    expect(reason('https://intranet')).toMatch(/single-label/)
    expect(reason('https://printer.local')).toMatch(/internal/)
    expect(reason('https://db.internal')).toMatch(/internal/)
    expect(reason('https://router.home.arpa')).toMatch(/internal/)
  })

  it('allowHttpLoopback opens loopback only, never LAN or private ranges', () => {
    const dev = { allowHttpLoopback: true }
    expect(ok('http://127.0.0.1:4173', dev)).toBe(true)
    expect(ok('http://localhost:4173', dev)).toBe(true)
    expect(ok('http://[::1]:4173', dev)).toBe(true)
    expect(ok('https://localhost', dev)).toBe(true)
    expect(ok('http://192.168.1.5:4173', dev)).toBe(false)
    expect(ok('http://10.0.0.2', dev)).toBe(false)
    expect(ok('http://169.254.169.254', dev)).toBe(false)
    expect(ok('http://intranet', dev)).toBe(false)
    expect(ok('http://user:pw@127.0.0.1', dev)).toBe(false)
  })

  it('does not resolve names: a public name that points inward still passes (documented gap)', () => {
    // This is the known limit of a string policy. Connect-time checks live in the runtime.
    expect(ok('https://rebind.attacker.example')).toBe(true)
  })
})

describe('classifyIp', () => {
  it('returns null for public unicast and not-an-ip for names', () => {
    expect(classifyIp('8.8.8.8')).toBeNull()
    expect(classifyIp('[2606:4700:4700::1111]')).toBeNull()
    expect(classifyIp('example.com')).toBe('not-an-ip')
    expect(classifyIp('127.0.0.1')).toBe('loopback')
  })
})
