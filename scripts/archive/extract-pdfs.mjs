// Extract text from PDFs (e.g. math-333 course material) for import into Learning HUB.
// Usage: node scripts/extract-pdfs.mjs <sourceDir> <outDir>
import { extractText, getDocumentProxy } from 'unpdf'
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'

const srcDir = process.argv[2] ?? 'math-333'
const outDir = process.argv[3] ?? 'data/imports/math333'
mkdirSync(outDir, { recursive: true })

const files = readdirSync(srcDir).filter((f) => f.toLowerCase().endsWith('.pdf'))
console.log('PDFs found:', files.join(', '))
for (const f of files) {
  try {
    const buf = readFileSync(join(srcDir, f))
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), {
      mergePages: true,
    })
    const out = join(outDir, basename(f).replace(/\.pdf$/i, '') + '.txt')
    writeFileSync(out, text)
    console.log(f, '→', out, `(${text.length} chars)`)
  } catch (e) {
    console.log(f, 'FAILED:', e.message)
  }
}
