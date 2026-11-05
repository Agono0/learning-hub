/**
 * Regenerate the published curriculum artifacts from the code (single source
 * of truth). Run after changing the LHCF schema, exercise types or prompts:
 *
 *   npm run docs:curriculum
 *
 * Writes docs/curriculum/lhcf.schema.json (JSON Schema — use it in editors,
 * validators, or give it to an AI) and docs/curriculum/PROMPT.md (the
 * copy-paste prompt). packages/core/tests/curriculum-docs.test.ts fails when
 * they are stale.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lhcfJsonSchema, renderPromptDoc } from '../packages/core/src/curriculum/lhcf/publish'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'docs/curriculum')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'lhcf.schema.json'), JSON.stringify(lhcfJsonSchema(), null, 2) + '\n')
writeFileSync(join(out, 'PROMPT.md'), renderPromptDoc())
console.log('[docs:curriculum] wrote docs/curriculum/lhcf.schema.json and PROMPT.md')
