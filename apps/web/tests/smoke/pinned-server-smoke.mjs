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
  readlinkSync,
  readdirSync,
  rmSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import http from 'node:http'
import { networkInterfaces, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const nextBin = [
  path.join(webDir, 'node_modules/next/dist/bin/next'),
  path.join(webDir, '../../node_modules/next/dist/bin/next'),
].find(existsSync)
const tmp = mkdtempSync(path.join(tmpdir(), 'pinned-smoke-'))
// Hard boundary: refuse to run unless the process has no network interface but loopback
// (CI runs this inside `unshare -n`). Local filesystem read only, sends nothing.
if (process.env.SMOKE_REQUIRE_NO_EGRESS === '1') {
  // /proc/net/* is per network namespace. A fresh `unshare -n` namespace has no route through
  // any interface but loopback (fallback tunnel devices may exist but are down and unrouted).
  // Local reads only, nothing is sent.
  const v4 = readFileSync('/proc/net/route', 'utf8')
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((l) => l.split(/\s+/)[0])
  let v6 = []
  try {
    v6 = readFileSync('/proc/net/ipv6_route', 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => l.trim().split(/\s+/).pop())
  } catch {
    // no IPv6 table
  }
  const fail = (msg, extra) => {
    console.error('[pinned-smoke] REFUSING TO RUN:', msg, extra ?? '')
    process.exit(2)
  }
  const ns = readlinkSync('/proc/self/ns/net')
  const parentNs = process.env.SMOKE_PARENT_NETNS
  if (!parentNs) fail('SMOKE_PARENT_NETNS not provided')
  if (ns === parentNs) fail('network namespace is the same as the parent runner', ns)
  const devs = readFileSync('/proc/net/dev', 'utf8')
    .split('\n')
    .slice(2)
    .map((l) => l.split(':')[0].trim())
    .filter(Boolean)
  if (devs.length !== 1 || devs[0] !== 'lo') fail('interfaces other than lo exist:', devs)
  const up = networkInterfaces()
  if (Object.keys(up).some((k) => k !== 'lo'))
    fail('non-loopback interface is up:', Object.keys(up))
  if (!up.lo || !up.lo.some((a) => a.address === '127.0.0.1')) fail('loopback is not up')
  const routed = [...v4, ...v6].filter((dev) => dev !== 'lo')
  if (routed.length > 0) fail('routes via non-loopback devices exist:', [...new Set(routed)])
  console.log(
    '[pinned-smoke] netns=' + ns + ' parent=' + parentNs + ' interfaces=' + devs.join(','),
  )
  console.log('[pinned-smoke] v4 routes=' + v4.length + ' v6 routes=' + v6.length + ' (all lo)')
  console.log('[pinned-smoke] egress boundary: no routes except loopback')
}
const FIX = 38411
const PORT = 38412

const preload = path.join(path.dirname(fileURLToPath(import.meta.url)), 'smoke-preload.cjs')
const marker = path.join(tmp, 'pinned-lookup-used')

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
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          ([k]) => !/^(https?_proxy|all_proxy|no_proxy)$/i.test(k),
        ),
      ),
      NODE_OPTIONS: `--require ${preload}`,
      SMOKE_FIXTURE_PORT: String(FIX),
      SMOKE_MARKER: marker,
      NEXT_TELEMETRY_DISABLED: '1',
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
  return { status: r.status, text: (await r.text()).slice(0, 2000) }
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

const inst = findInstrumentation()
const moved = inst.filter((p) => /instrumentation\.(js|mjs)$/.test(p))
try {
  console.log(
    '[pinned-smoke] compiled instrumentation files:',
    inst.map((p) => path.relative(webDir, p)),
  )
  if (moved.length === 0) fail('build produced no compiled instrumentation')

  // A. normal build: registration runs.
  let s = await startServer()
  hits = []
  const ok = await ingest('http://fixture.test/article')
  console.log('[pinned-smoke] A public-looking fixture:', ok.status, 'hits', hits, ok.text)
  if (hits.length !== 1 || hits[0] !== 'fixture.test/article')
    fail('A: fixture not reached exactly once with the original Host: ' + JSON.stringify(hits))
  if (!existsSync(marker) || !readFileSync(marker, 'utf8').includes('fixture.test'))
    fail('A: the connection did not go through the app pinned lookup (preload bypass?)')
  if (ok.status >= 300 || !ok.text.includes('Smoke'))
    fail('A: expected a successful ingest of the fixture article, got ' + ok.status + ' ' + ok.text)
  rmSync(marker, { force: true })
  hits = []
  const priv = await ingest('http://priv.test/article')
  console.log('[pinned-smoke] A private-resolving:', priv.status, 'hits', hits, priv.text)
  if (hits.length !== 0) fail('A: private-resolving name reached the fixture')
  if (priv.status !== 400 || !priv.text.includes('Private, local and internal addresses'))
    fail('A: expected 400 address refusal, got ' + priv.status + ' ' + priv.text)
  await stop(s.child)

  // B. registration absent: same request must fail closed for the stated reason.
  rmSync(marker, { force: true })
  for (const p of moved) renameSync(p, p + '.disabled')
  s = await startServer()
  hits = []
  const off = await ingest('http://fixture.test/article')
  console.log('[pinned-smoke] B (no registration):', off.status, 'hits', hits, off.text)
  if (hits.length !== 0) fail('B: request left the process without a registered pinned fetch')
  if (existsSync(marker)) fail('B: pinned lookup ran although registration was removed')
  if (off.status !== 502 || !off.text.includes('address pinning is not registered'))
    fail('B: expected the fail-closed 502 refusal, got ' + off.status + ' ' + off.text)
  await stop(s.child)
} catch (err) {
  fail(String(err && err.stack ? err.stack : err))
} finally {
  for (const p of moved) if (existsSync(p + '.disabled')) renameSync(p + '.disabled', p)
  fixture.close()
}
if (!process.exitCode) console.log('[pinned-smoke] OK')
process.exit(process.exitCode ?? 0)
