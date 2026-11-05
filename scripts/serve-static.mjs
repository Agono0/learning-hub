#!/usr/bin/env node
/**
 * Zero-dependency static server for the Tauri-target export
 * (apps/web/.next-tauri). Lets you run the exact bundle Tauri ships in any
 * Chromium browser — the hub worker + sqlite-wasm + OPFS work on localhost.
 *
 *   node scripts/serve-static.mjs [dir] [port]
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? 'apps/web/.next-tauri')
const port = Number(process.argv[3] ?? 4173)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  let file = normalize(join(root, urlPath))
  if (!file.startsWith(root)) {
    res.writeHead(403).end()
    return
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!existsSync(file)) file = join(root, '404.html')
  res.writeHead(existsSync(file) ? 200 : 404, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  })
  createReadStream(file).pipe(res)
}).listen(port, () => console.log(`[serve-static] ${root} → http://localhost:${port}`))
