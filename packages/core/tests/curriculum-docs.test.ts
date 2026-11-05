/**
 * Drift guard: the published curriculum artifacts must match the code.
 * If this fails, run `npm run docs:curriculum` and commit the result.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lhcfJsonSchema, renderPromptDoc } from '../src/curriculum'

const docs = resolve(__dirname, '../../../docs/curriculum')
const normalize = (s: string) => s.replace(/\r\n/g, '\n')

describe('published curriculum docs', () => {
  it('lhcf.schema.json is up to date', () => {
    const committed = JSON.parse(readFileSync(resolve(docs, 'lhcf.schema.json'), 'utf8'))
    expect(committed).toEqual(JSON.parse(JSON.stringify(lhcfJsonSchema())))
  })

  it('PROMPT.md is up to date', () => {
    expect(normalize(readFileSync(resolve(docs, 'PROMPT.md'), 'utf8'))).toBe(
      normalize(renderPromptDoc()),
    )
  })
})
