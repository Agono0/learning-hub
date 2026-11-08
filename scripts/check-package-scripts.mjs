/**
 * Script-drift guard (F-02, MASTER-FIX-PLAN §10.4) — run via `npm run check:scripts`.
 *
 * Fails CI when:
 *  1. a root script of the form `npm run X --workspace Y` (or `-w Y`) names a
 *     script X that apps/Y/package.json (or packages/Y) does not define — the
 *     class of silent no-op that `worker:deploy` shipped with;
 *  2. (warning, non-fatal) a top-level scripts/ file is referenced by no npm
 *     script, no doc, and no sibling script — one-off utilities belong in
 *     scripts/archive/ (see F-25).
 *
 * Doc-count pins (table/MCP-tool counts vs the docs' claims) activate here in
 * commit 38 once the docs are corrected — see MASTER-FIX-PLAN §10.4.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const errors = []
const warnings = []

// ── 1. workspace-script drift ────────────────────────────────────────────────
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const WS_RE = /npm run ([\w:.-]+) --workspace ([\w@/.-]+)|npm run ([\w:.-]+) -w ([\w@/.-]+)/g

for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
  for (const m of cmd.matchAll(WS_RE)) {
    const scriptName = m[1] ?? m[3]
    const wsName = m[2] ?? m[4]
    const wsDir = wsName.replace(/^@learning-hub\//, '')
    const wsPkgPath = join(root, 'packages', wsDir, 'package.json')
    const appPkgPath = join(root, 'apps', wsDir, 'package.json')
    const wsPkgPathFound = existsSync(wsPkgPath)
      ? wsPkgPath
      : existsSync(appPkgPath)
        ? appPkgPath
        : null
    if (!wsPkgPathFound) {
      errors.push(
        `root script "${name}": workspace "${wsName}" does not exist (no package.json found)`,
      )
      continue
    }
    const wsPkg = JSON.parse(readFileSync(wsPkgPathFound, 'utf8'))
    if (!wsPkg.scripts?.[scriptName]) {
      errors.push(
        `root script "${name}": workspace "${wsName}" defines no script "${scriptName}" ` +
          `(silent no-op — npm --if-present style failures mask this; define it or fix the name)`,
      )
    }
  }
}

// ── 2. orphan scripts (warning until F-25 archives them) ─────────────────────
const scriptsDir = join(root, 'scripts')
const scriptFiles = readdirSync(scriptsDir).filter(
  (f) => !f.startsWith('.') && f !== 'archive' && f !== 'node_modules',
)
const referencable = [
  JSON.stringify(pkg),
  ...Object.values(pkg.scripts ?? {}),
  ...scriptFiles.map((f) => {
    try {
      return readFileSync(join(scriptsDir, f), 'utf8')
    } catch {
      return ''
    }
  }),
].join('\n')
for (const f of scriptFiles) {
  const mentioned =
    referencable.includes(f) ||
    Object.keys(pkg.scripts ?? {}).some((s) => pkg.scripts[s].includes(f))
  if (!mentioned) {
    warnings.push(
      `scripts/${f} is referenced by no npm script and no sibling script (archive it under scripts/archive/ — F-25)`,
    )
  }
}

for (const w of warnings) console.warn(`WARN: ${w}`)
for (const e of errors) console.error(`ERROR: ${e}`)
if (errors.length) {
  console.error(`\ncheck:scripts: ${errors.length} error(s)`)
  process.exit(1)
}
console.log(`check:scripts: OK (${scriptFiles.length} script files, ${warnings.length} warning(s))`)
