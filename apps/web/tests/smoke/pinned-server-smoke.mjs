/**
 * Built-server smoke for the pinned outbound fetch (run after `next build`).
 *
 * Isolated and synthetic: no external DNS or network. A preload script (test only) answers
 * DNS for two made-up names and, AFTER the app's own pinned lookup has validated the
 * public-looking address, redirects the final socket to a fixture listening on 127.0.0.1.
 * Starts the real `next start` twice:
 *   A. normal build: the instrumentation hook must register the pinned fetch, so a
 *      public-looking name reaches the fixture, and a private-resolving name is refused (400)
 *      without any fixture hit.
 *   B. registration removed (compiled instrumentation file deleted): the same fetch must be
 *      refused (no fixture hit, no 200), proving fail-closed.
 * Uses a throwaway LEARNING_HUB_DB path. Exits non-zero on any unmet expectation.
 */
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const nextBin = [
  path.join(webDir, 'node_modules/next/dist/bin/next'),
  path.join(webDir, '../../node_modules/next/dist/bin/next'),
].find(existsSync)
const tmp = mkdtempSync(path.join(tmpdir(), 'pinned-smoke-'))
const FIX = 38411
const PORT = 38412

writeFileSync(
  path.join(tmp, 'preload.cjs'),
  `const dns = require('node:dns')
const net = require('node:net')
const map = { 'fixture.test': '93.184.216.34', 'priv.test': '10.0.0.5' }
dns.promises.lookup = async (host, opts) => {
  if (map[host]) return opts && opts.all ? [{ address: map[host], family: 4 }] : { address: map[host], family: 4 }
  throw Object.assign(new Error('no external DNS in smoke'), { code: 'ENOTFOUND' })
}
const origConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const o = args[0]
  if (o && typeof o === 'object' && typeof o.lookup === 'function' && o.host === 'fixture.test') {
    const lk = o.lookup
    const remap = (x) => (x.address === '93.184.216.34' ? { address: '127.0.0.1', family: 4 } : x)
    const no = { ...o, port: ${FIX}, lookup: (h, opt, cb) => lk(h, opt, (e, a, f) => {
      if (e) return cb(e)
      if (Array.isArray(a)) cb(null, a.map(remap), f)
      else cb(null, a === '93.184.216.34' ? '127.0.0.1' : a, f)
    }) }
    return origConnect.call(this, no, ...args.slice(1))
  }
  return origConnect.apply(this, args)
}
`,
)

let hits = []
const fixture = http.createServer((req, res) => {
  hits.push(`${req.headers.host}${req.url}`)
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(
    '<html><head><title>Smoke</title></head><body><article><h1>Smoke</h1>' +
      '<p>A synthetic paragraph about spaced repetition used only by the smoke test.</p>'.repeat(
        12,
      ) +
      '</article></body></html>',
  )
})
await new Promise((r) => fixture.listen(FIX, '127.0.0.1', r))

function fail(msg) {
  console.error('[pinned-smoke] FAIL:', msg)
  process.exitCode = 1
}

async function startServer() {
  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], {
    cwd: webDir,
    env: {
      ...process.env,
      NODE_OPTIONS: `--require ${path.join(tmp, 'preload.cjs')}`,
      LEARNING_HUB_DB: path.join(tmp, 'smoke.db'),
      PORT: String(PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  child.stdout.on('data', (d) => (log += d))
  child.stderr.on('data', (d) => (log += d))
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(2000) })
      if (r.status) return { child, log: () => log }
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  child.kill()
  throw new Error('server did not start: ' + log.slice(-800))
}

async function ingest(url) {
  const r = await fetch(`http://127.0.0.1:${PORT}/api/reading/ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'url', url }),
    signal: AbortSignal.timeout(30000),
  })
  return { status: r.status, text: (await r.text()).slice(0, 300) }
}

function findInstrumentation() {
  const out = []
  const walk = (d, depth) => {
    if (depth > 3 || !existsSync(d)) return
    for (const n of readdirSync(d)) {
      const p = path.join(d, n)
      if (statSync(p).isDirectory()) walk(p, depth + 1)
      else if (/^instrumentation\.(js|mjs)$/.test(n) || /^instrumentation\.js\.nft\.json$/.test(n))
        out.push(p)
    }
  }
  walk(path.join(webDir, '.next/server'), 0)
  return out
}

const stop = (child) =>
  new Promise((r) => {
    child.once('exit', r)
    child.kill()
    setTimeout(r, 3000)
  })

try {
  const inst = findInstrumentation()
  console.log(
    '[pinned-smoke] compiled instrumentation files:',
    inst.map((p) => path.relative(webDir, p)),
  )
  if (!inst.some((p) => p.endsWith('.js') || p.endsWith('.mjs')))
    fail('build produced no compiled instrumentation')

  // A. normal
  let s = await startServer()
  hits = []
  const ok = await ingest('http://fixture.test/article')
  console.log('[pinned-smoke] A fixture:', ok.status, 'hits', hits)
  if (hits.length !== 1 || hits[0] !== 'fixture.test/article')
    fail('A: fixture was not reached with the original Host')
  if (ok.status === 400 || ok.status === 502)
    fail('A: public-looking fixture refused or failed: ' + ok.text)
  hits = []
  const priv = await ingest('http://priv.test/article')
  console.log('[pinned-smoke] A private:', priv.status, 'hits', hits)
  if (hits.length !== 0) fail('A: private-resolving name reached the fixture')
  if (priv.status === 200) fail('A: private-resolving name succeeded')
  await stop(s.child)

  // B. registration removed
  const moved = inst.filter((p) => /instrumentation\.(js|mjs)$/.test(p))
  for (const p of moved) renameSync(p, p + '.disabled')
  s = await startServer()
  hits = []
  const off = await ingest('http://fixture.test/article')
  console.log('[pinned-smoke] B (no registration):', off.status, 'hits', hits, off.text)
  if (hits.length !== 0) fail('B: request left the process without a registered pinned fetch')
  if (off.status === 200) fail('B: fetch succeeded without registration')
  await stop(s.child)
  for (const p of moved) renameSync(p + '.disabled', p)
} catch (err) {
  fail(String(err && err.stack ? err.stack : err))
} finally {
  fixture.close()
}
if (!process.exitCode) console.log('[pinned-smoke] OK')
process.exit(process.exitCode ?? 0)
