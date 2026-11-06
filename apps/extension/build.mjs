import { build } from 'esbuild'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outdir = join(__dirname, 'dist')
mkdirSync(outdir, { recursive: true })

await build({
  entryPoints: [join(__dirname, 'src', 'service-worker.ts'), join(__dirname, 'src', 'popup.ts')],
  bundle: true,
  outdir,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  sourcemap: true,
})

copyFileSync(join(__dirname, 'src', 'manifest.json'), join(outdir, 'manifest.json'))
copyFileSync(join(__dirname, 'src', 'blocked.html'), join(outdir, 'blocked.html'))
copyFileSync(join(__dirname, 'src', 'popup.html'), join(outdir, 'popup.html'))

console.log('✅ Extension built into apps/extension/dist')
