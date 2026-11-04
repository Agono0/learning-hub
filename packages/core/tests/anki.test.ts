import { describe, expect, it } from 'vitest'
import {
  parseAnkiDecks,
  parseDelimitedRows,
  parseTags,
  expandReversedCards,
  expandClozeCard,
  sanitizeAnkiHtml,
} from '../src/anki'
import { validateCardContent } from '../src/cards'

describe('parseDelimitedRows (RFC 4180 lexer)', () => {
  it('tokenizes basic TSV rows', () => {
    const input = 'Front1\tBack1\nFront2\tBack2'
    const rows = parseDelimitedRows(input, '\t')
    expect(rows).toEqual([
      ['Front1', 'Back1'],
      ['Front2', 'Back2'],
    ])
  })

  it('handles multiline quoted fields with embedded delimiters and escaped quotes', () => {
    const input = '"Line 1\nLine 2"\t"Say ""Hello!"""\ttag1 tag2\nPlain\tSimple\ttag3'
    const rows = parseDelimitedRows(input, '\t')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual(['Line 1\nLine 2', 'Say "Hello!"', 'tag1 tag2'])
    expect(rows[1]).toEqual(['Plain', 'Simple', 'tag3'])
  })

  it('handles CSV with comma delimiters and CRLF line endings', () => {
    const input = '"Hello, World","Answer, with comma"\r\n"Second","Row"'
    const rows = parseDelimitedRows(input, ',')
    expect(rows).toEqual([
      ['Hello, World', 'Answer, with comma'],
      ['Second', 'Row'],
    ])
  })
})

describe('parseTags', () => {
  it('parses space-separated tags', () => {
    expect(parseTags('biology science::neuro chapter1')).toEqual([
      'biology',
      'science::neuro',
      'chapter1',
    ])
  })

  it('parses comma-separated tags', () => {
    expect(parseTags('biology, science::neuro, chapter1')).toEqual([
      'biology',
      'science::neuro',
      'chapter1',
    ])
  })

  it('returns empty array for empty or whitespace-only inputs', () => {
    expect(parseTags('')).toEqual([])
    expect(parseTags('   ')).toEqual([])
    expect(parseTags(undefined)).toEqual([])
  })
})

describe('parseAnkiDecks', () => {
  it('parses standard Anki TSV export with header comments', () => {
    const input = [
      '#separator:tab',
      '#html:true',
      '#tags column:3',
      '#deck:Biology 101',
      'Mitochondria\tPowerhouse of the cell\torganelles biology',
      'Ribosome\tProtein synthesis\torganelles biology',
    ].join('\n')

    const result = parseAnkiDecks(input)
    expect(result.deckName).toBe('Biology 101')
    expect(result.name).toBe('Biology 101')
    expect(result.metadata.separator).toBe('\t')
    expect(result.metadata.html).toBe(true)
    expect(result.metadata.tagsColumn).toBe(3)
    expect(result.cards).toHaveLength(2)

    expect(result.cards[0]).toMatchObject({
      front: 'Mitochondria',
      back: 'Powerhouse of the cell',
      tags: ['organelles', 'biology'],
      classification: 'basic',
    })
    expect(result.stats.basicCount).toBe(2)
    expect(result.stats.errorCount).toBe(0)
  })

  it('parses CSV format with comma separator', () => {
    const input = [
      '#separator:comma',
      '#html:false',
      '#tags column:3',
      '"What is photosynthesis?","Process converting light to sugar","plants biology"',
    ].join('\n')

    const result = parseAnkiDecks(input)
    expect(result.metadata.separator).toBe(',')
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]!.front).toBe('What is photosynthesis?')
    expect(result.cards[0]!.back).toBe('Process converting light to sugar')
    expect(result.cards[0]!.tags).toEqual(['plants', 'biology'])
  })

  it('autodetects comma delimiter when header is missing', () => {
    const input = [
      '"Question 1","Answer 1","tag1 tag2"',
      '"Question 2","Answer 2","tag3"',
    ].join('\n')

    const result = parseAnkiDecks(input)
    expect(result.metadata.separator).toBe(',')
    expect(result.cards).toHaveLength(2)
    expect(result.cards[0]!.front).toBe('Question 1')
    expect(result.cards[0]!.tags).toEqual(['tag1', 'tag2'])
  })

  it('correctly classifies and parses cloze deletion cards', () => {
    const input = [
      '#separator:tab',
      '#tags column:3',
      'The capital of {{c1::France}} is {{c2::Paris::capital city}}.\tEurope geography\tgeography capitals',
    ].join('\n')

    const result = parseAnkiDecks(input)
    expect(result.cards).toHaveLength(1)
    const card = result.cards[0]!
    expect(card.classification).toBe('cloze')
    expect(card.clozeData).toBeDefined()
    expect(card.clozeData!.answers).toEqual(['France', 'Paris'])
    expect(card.clozeData!.mode).toBe('enumeration')
    expect(card.clozeData!.hint).toBe('capital city')

    const validation = validateCardContent('cloze', card.content.cloze)
    expect(validation.ok).toBe(true)
  })

  it('correctly classifies reversed cards from #notetype header', () => {
    const input = [
      '#separator:tab',
      '#notetype:Basic (and reversed card)',
      'Dog\tChien\tanimals',
    ].join('\n')

    const result = parseAnkiDecks(input)
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]!.classification).toBe('reversed')
  })

  it('expands reversed cards when expandReversed is true', () => {
    const input = [
      '#separator:tab',
      '#notetype:Basic (and reversed card)',
      'Dog\tChien\tanimals',
    ].join('\n')

    const result = parseAnkiDecks(input, { expandReversed: true })
    expect(result.cards).toHaveLength(2)
    expect(result.cards[0]!).toMatchObject({
      front: 'Dog',
      back: 'Chien',
      classification: 'basic',
    })
    expect(result.cards[1]!).toMatchObject({
      front: 'Chien',
      back: 'Dog',
      classification: 'basic',
    })
    expect(result.cards[1]!.tags).toContain('reversed')
  })

  it('expands multi-blank cloze into sibling cards with expandClozeCard', () => {
    const input = [
      '#separator:tab',
      'Canberra is the capital of {{c1::Australia}} and was founded in {{c2::1913}}.\tNotes',
    ].join('\n')

    const result = parseAnkiDecks(input)
    const siblings = expandClozeCard(result.cards[0]!)
    expect(siblings).toHaveLength(2)
    expect(siblings[0]!.front).toContain('{{c1::Australia}}')
    expect(siblings[0]!.front).toContain('1913')
    expect(siblings[1]!.front).toContain('Australia')
    expect(siblings[1]!.front).toContain('{{c2::1913}}')
  })

  it('handles HTML sanitization and entity unescaping', () => {
    expect(sanitizeAnkiHtml('Line 1<br>Line 2&nbsp;&amp;&nbsp;more', false)).toBe(
      'Line 1\nLine 2 & more',
    )
    expect(sanitizeAnkiHtml('<b>Bold</b> <i>Italic</i>', true)).toBe('Bold Italic')
  })

  it('handles empty input gracefully', () => {
    const result = parseAnkiDecks('')
    expect(result.cards).toHaveLength(0)
    expect(result.stats.totalParsed).toBe(0)
  })
})
