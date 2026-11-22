/**
 * Unit tests for the mention config (S3-86): prefix toggles, known-name
 * resolution, escaped at-signs, and validation.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MENTION_CONFIG,
  escapeAtSigns,
  extractMentions,
  mentionConfigSchema,
  unescapeAtSigns,
  validateMentions,
} from '../src/tasks/mentions'

const NAMES = new Set(['ana', 'bo'])

describe('extractMentions', () => {
  it('finds known people mentions with ranges', () => {
    const note = 'ping @ana about the deck (cc @bo)'
    const mentions = extractMentions(note, DEFAULT_MENTION_CONFIG, NAMES)
    expect(mentions).toHaveLength(2)
    expect(mentions[0]).toMatchObject({ name: 'ana', known: true, raw: '@ana', start: 5, end: 9 })
    expect(mentions[1]?.known).toBe(true)
  })

  it('unknown names are skipped under onlyKnownNames (default)', () => {
    expect(extractMentions('hi @stranger', DEFAULT_MENTION_CONFIG, NAMES)).toEqual([])
  })

  it('unknown names return marked unknown when the config allows', () => {
    const cfg = mentionConfigSchema.parse({ onlyKnownNames: false })
    const mentions = extractMentions('hi @stranger', cfg, NAMES)
    expect(mentions).toEqual([
      { name: 'stranger', known: false, raw: '@stranger', start: 3, end: 12 },
    ])
  })

  it('project mentions follow their own toggle (off by default)', () => {
    const note = 'ask @ana and @+web'
    expect(extractMentions(note, DEFAULT_MENTION_CONFIG, NAMES)).toHaveLength(1)
    const cfg = mentionConfigSchema.parse({ projects: true })
    const withProjects = extractMentions(note, cfg, NAMES)
    expect(withProjects.map((m) => m.raw)).toEqual(['@ana', '@+web'])
    expect(withProjects[1]).toMatchObject({ name: 'web', known: false })
  })

  it('prefix toggles disable people mentions entirely', () => {
    const cfg = mentionConfigSchema.parse({ people: false, projects: true })
    expect(extractMentions('ask @ana and @+web', cfg, NAMES).map((m) => m.raw)).toEqual(['@+web'])
  })

  it('escaped @@ mentions and emails do not match', () => {
    const note = 'email a@@bo at bo@example.com and @ana'
    const mentions = extractMentions(note, DEFAULT_MENTION_CONFIG, NAMES)
    expect(mentions.map((m) => m.raw)).toEqual(['@ana'])
    expect(mentions[0]?.name).toBe('ana')
  })
})

describe('escape / unescape', () => {
  it('escapes literal at-signs and folds them back', () => {
    expect(escapeAtSigns('reach @bo now')).toBe('reach @@bo now')
    expect(unescapeAtSigns('reach @@bo now')).toBe('reach @bo now')
    expect(escapeAtSigns('plain text')).toBe('plain text')
    expect(escapeAtSigns('a@@b')).toBe('a@@b') // already escaped
  })
})

describe('validateMentions', () => {
  it('accepts valid mention grammar', () => {
    expect(validateMentions('ping @ana_2 and @+web.ok').ok).toBe(true)
  })

  it('flags malformed names', () => {
    const v = validateMentions('ping @who?? here')
    expect(v.ok).toBe(false)
    expect(v.errors[0]).toContain('"@who??" is not a valid mention')
  })
})
