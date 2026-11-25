/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS preload, loaded with node --require */
/**
 * Test-only preload for the built-server smoke (never shipped, never loaded by the app).
 *
 * `install()` takes the modules it patches so its argument handling can be unit tested with
 * fakes and no sockets (tests/smoke-preload.test.ts). Loaded with --require it installs on the
 * real modules using SMOKE_FIXTURE_PORT and SMOKE_MARKER.
 *
 *  - DNS: fixture.test answers a public-looking address, priv.test answers 10.0.0.5, every
 *    other name fails. No real DNS.
 *  - connect: net.createConnection hands Socket.connect a normalized [options, cb] array
 *    (carrying an internal marker symbol); a direct call hands options. Either way the options
 *    object is edited IN PLACE (copying would drop the marker). fixture.test is pointed at the
 *    local fixture port with the final address remapped to loopback AFTER the app's own pinned
 *    lookup has validated it. Any other non-loopback host is refused before connecting.
 *
 * This is defence in depth only. The hard boundary is the CI network namespace with no
 * interface but loopback (see the workflow step and the script's preflight).
 */
'use strict'

const PUBLIC_LOOKING = '93.184.216.34'
const LOCAL = new Set(['127.0.0.1', 'localhost', '::1'])

function install({ net, dns, fs, fixturePort, markerPath }) {
  const map = { 'fixture.test': PUBLIC_LOOKING, 'priv.test': '10.0.0.5' }
  dns.promises.lookup = async (host, opts) => {
    if (map[host]) {
      const one = { address: map[host], family: 4 }
      return opts && opts.all ? [one] : one
    }
    throw Object.assign(new Error('no external DNS in smoke'), { code: 'ENOTFOUND' })
  }
  const origConnect = net.Socket.prototype.connect
  net.Socket.prototype.connect = function (...args) {
    const o = Array.isArray(args[0]) ? args[0][0] : args[0]
    if (o && typeof o === 'object' && typeof o.host === 'string') {
      if (o.host === 'fixture.test' && typeof o.lookup === 'function') {
        const lk = o.lookup
        const remap = (x) =>
          x.address === PUBLIC_LOOKING ? { address: '127.0.0.1', family: 4 } : x
        o.port = fixturePort
        o.lookup = (h, opt, cb) =>
          lk(h, opt, (e, a, f) => {
            if (e) return cb(e)
            if (markerPath) fs.appendFileSync(markerPath, h + ' ' + JSON.stringify(a) + '\n')
            if (Array.isArray(a)) cb(null, a.map(remap), f)
            else cb(null, a === PUBLIC_LOOKING ? '127.0.0.1' : a, f)
          })
      } else if (o.host === 'priv.test' && typeof o.lookup === 'function') {
        // Let the app's own lookup run: it must refuse 10.0.0.5. If it accepts, fail the
        // connect here so nothing is ever dialled.
        const lk = o.lookup
        o.lookup = (h, opt, cb) =>
          lk(h, opt, (e, a, f) => {
            if (e) return cb(e, a, f)
            return cb(new Error('smoke: app lookup accepted a private address'))
          })
      } else if (!LOCAL.has(o.host)) {
        process.nextTick(() =>
          this.destroy(new Error('smoke: external connect blocked: ' + o.host)),
        )
        return this
      }
    }
    return origConnect.apply(this, args)
  }
  return { restore: () => (net.Socket.prototype.connect = origConnect) }
}

module.exports = { install, PUBLIC_LOOKING }

if (process.env.SMOKE_FIXTURE_PORT) {
  install({
    net: require('node:net'),
    dns: require('node:dns'),
    fs: require('node:fs'),
    fixturePort: Number(process.env.SMOKE_FIXTURE_PORT),
    markerPath: process.env.SMOKE_MARKER || '',
  })
}
