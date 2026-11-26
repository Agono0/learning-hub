/**
 * Address classes that embed or alias a private IPv4 address must be refused like the plain form,
 * both as a URL host (assertAllowedUrl) and as a resolved address (isPrivateAddress, which the
 * pinned fetch applies to every DNS answer). Public neighbours must stay allowed. Table-driven,
 * no network, no timing.
 */
import { describe, expect, it } from 'vitest'
import { assertAllowedUrl, isPrivateAddress, BoundedFetchError } from '../src/server/bounded-fetch'

const PRIVATE: [string, string][] = [
  ['IPv4-compatible loopback', '::7f00:1'],
  ['IPv4-compatible loopback dotted', '::127.0.0.1'],
  ['IPv4-compatible metadata', '::a9fe:a9fe'],
  ['IPv4-translated loopback', '::ffff:0:7f00:1'],
  ['IPv4-translated private', '::ffff:0:a00:1'],
  ['NAT64 loopback', '64:ff9b::7f00:1'],
  ['NAT64 metadata', '64:ff9b::a9fe:a9fe'],
  ['NAT64 local-use prefix', '64:ff9b:1::1'],
  ['6to4 loopback', '2002:7f00:1::'],
  ['6to4 metadata', '2002:a9fe:a9fe::'],
  ['6to4 10/8', '2002:a00:1::1'],
  ['site-local', 'fec0::1'],
  ['multicast', 'ff02::1'],
  ['documentation', '2001:db8::1'],
  ['Teredo', '2001::1'],
  ['mapped loopback (existing)', '::ffff:7f00:1'],
  ['loopback long form (existing)', '0:0:0:0:0:0:0:1'],
  ['unique-local (existing)', 'fd00:ec2::254'],
  ['link-local (existing)', 'fe80::1'],
  ['benchmarking low', '198.18.0.1'],
  ['benchmarking high', '198.19.255.254'],
  ['documentation 198.51.100', '198.51.100.7'],
  ['documentation 203.0.113', '203.0.113.9'],
]

const PUBLIC: [string, string][] = [
  ['NAT64 of a public IPv4', '64:ff9b::808:808'],
  ['6to4 of a public IPv4', '2002:808:808::'],
  ['IPv4-translated public', '::ffff:0:808:808'],
  ['mapped public', '::ffff:808:808'],
  ['global unicast', '2606:4700::1111'],
  ['global unicast 2', '2a00:1450:4001::200e'],
  ['IPv4 just below benchmarking', '198.17.255.255'],
  ['IPv4 just above benchmarking', '198.20.0.1'],
  ['public IPv4', '8.8.8.8'],
]

const host = (a: string) => (a.includes(':') ? `[${a}]` : a)

describe('private address classes are refused', () => {
  it.each(PRIVATE)('%s (%s)', (_name, addr) => {
    expect(isPrivateAddress(addr)).toBe(true)
    expect(() => assertAllowedUrl(`https://${host(addr)}/x`)).toThrow(BoundedFetchError)
  })
})

describe('public neighbours stay allowed', () => {
  it.each(PUBLIC)('%s (%s)', (_name, addr) => {
    expect(isPrivateAddress(addr)).toBe(false)
    expect(() => assertAllowedUrl(`https://${host(addr)}/x`)).not.toThrow()
  })
})

describe('unparseable IPv6 literals fail closed', () => {
  it.each(['1:2:3', '::g', '1::2::3', '1:2:3:4:5:6:7:8:9', ':::'])('%s', (addr) => {
    expect(isPrivateAddress(addr)).toBe(true)
  })
})
