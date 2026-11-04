import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  parseAnkiDecks,
  parseDelimitedRows,
  parseTags,
  sanitizeAnkiHtml,
  expandReversedCards,
  expandClozeCard,
} from '../src/anki'
import {
  clozeSegments,
  evaluateClozeAnswer,
  evaluateTypeinAnswer,
  isCardAnswerCorrect,
  normalizeAnswer,
  parseCloze,
  validateCardContent,
} from '../src/cards'

describe('Anki Lexer & RFC 4180 Fuzzing & Boundary Stress Tests', () => {
  it('handles nested quotes, escaped quotes, and empty quoted fields', () => {
    // Single escaped quote inside quoted field -> should be single quote
    const res1 = parseDelimitedRows('""""', ',')
    expect(res1).toEqual([['"']])

    // Field containing quotes around word
    const res2 = parseDelimitedRows('"Say ""Hello"""\t"World"', '\t')
    expect(res2).toEqual([['Say "Hello"', 'World']])

    // Quadruple quotes surrounding text: """Text""" -> "Text"
    const res3 = parseDelimitedRows('"""Text"""', ',')
    expect(res3).toEqual([['"Text"']])

    // Empty quoted fields
    const res4 = parseDelimitedRows('""\t""', '\t')
    expect(res4).toEqual([['', '']])
  })

  it('handles unclosed quotes without crashing or hanging', () => {
    // EOF reached while inQuotes is true
    const unclosed = '"This quote is never closed\tsecond field'
    const rows = parseDelimitedRows(unclosed, '\t')
    expect(rows).toBeDefined()
    expect(rows.length).toBeGreaterThanOrEqual(1)
    // The entire unclosed string was captured into a field
    expect(rows[0]![0]).toContain('This quote is never closed')
  })

  it('handles mixed CRLF, LF, and CR line endings uniformly', () => {
    const input = 'Row1Col1\tRow1Col2\r\nRow2Col1\tRow2Col2\nRow3Col1\tRow3Col2\rRow4Col1\tRow4Col2'
    const rows = parseDelimitedRows(input, '\t')
    expect(rows).toEqual([
      ['Row1Col1', 'Row1Col2'],
      ['Row2Col1', 'Row2Col2'],
      ['Row3Col1', 'Row3Col2'],
      ['Row4Col1', 'Row4Col2'],
    ])
  })

  it('preserves commas inside TSV and tabs inside CSV', () => {
    // Commas inside TSV without quotes
    const tsv = 'Hello, world\tHow, are, you?\ttag1, tag2'
    const tsvRows = parseDelimitedRows(tsv, '\t')
    expect(tsvRows).toEqual([['Hello, world', 'How, are, you?', 'tag1, tag2']])

    // Tabs inside CSV quoted fields
    const csv = '"Hello\tWorld","Col 2\twith\ttabs"'
    const csvRows = parseDelimitedRows(csv, ',')
    expect(csvRows).toEqual([['Hello\tWorld', 'Col 2\twith\ttabs']])
  })

  it('scales efficiently to 10,000 lines (Performance Benchmark)', () => {
    const lines: string[] = ['#separator:tab', '#deck:Benchmark Deck']
    for (let i = 0; i < 10000; i++) {
      lines.push(`Question ${i}\tAnswer ${i}\ttag_${i % 10}`)
    }
    const input = lines.join('\n')

    const t0 = performance.now()
    const result = parseAnkiDecks(input)
    const elapsedMs = performance.now() - t0

    expect(result.cards.length).toBe(10000)
    expect(result.deckName).toBe('Benchmark Deck')
    // 10,000 lines should parse in under 500ms
    expect(elapsedMs).toBeLessThan(500)
  })

  it('property-based test: arbitrary string rows with RFC 4180 escaping round-trip', () => {
    // Helper to escape fields per RFC 4180
    const escapeField = (f: string) => `"${f.replace(/"/g, '""')}"`

    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.string({ maxLength: 30 }).filter((s) => !s.includes('\r')),
            fc.string({ maxLength: 30 }).filter((s) => !s.includes('\r')),
          ),
          { minLength: 1, maxLength: 50 },
        ),
        (pairs) => {
          const raw = pairs.map(([f, b]) => `${escapeField(f)}\t${escapeField(b)}`).join('\n')
          const parsed = parseDelimitedRows(raw, '\t')
          expect(parsed.length).toBe(pairs.length)
          for (let i = 0; i < pairs.length; i++) {
            expect(parsed[i]![0]).toBe(pairs[i]![0])
            expect(parsed[i]![1]).toBe(pairs[i]![1])
          }
        },
      ),
      { numRuns: 50 },
    )
  })
})

describe('Anki Metadata Comments & Header Variation Tests', () => {
  it('parses separator variations: comma, tab, pipe, semicolon, space', () => {
    const pipeInput = '#separator:pipe\nFront 1|Back 1|tag1\nFront 2|Back 2|tag2'
    const pipeRes = parseAnkiDecks(pipeInput)
    expect(pipeRes.metadata.separator).toBe('|')
    expect(pipeRes.cards).toHaveLength(2)
    expect(pipeRes.cards[0]!.front).toBe('Front 1')

    const semiInput = '#separator:semicolon\nFront 1;Back 1;tag1'
    const semiRes = parseAnkiDecks(semiInput)
    expect(semiRes.metadata.separator).toBe(';')
    expect(semiRes.cards).toHaveLength(1)

    const spaceInput = '#separator:space\nFront Back tag'
    const spaceRes = parseAnkiDecks(spaceInput)
    expect(spaceRes.metadata.separator).toBe(' ')
    expect(spaceRes.cards).toHaveLength(1)
  })

  it('handles uppercase and whitespace variations in header comments', () => {
    const input = [
      '# SEPARATOR : tab',
      '# HTML : false',
      '# TAGS COLUMN : 3',
      '# DECK : Advanced Deck',
      '# NOTETYPE : Cloze',
      'Front {{c1::clo}} text\tBack text\ttag1 tag2',
    ].join('\n')

    const res = parseAnkiDecks(input)
    expect(res.deckName).toBe('Advanced Deck')
    expect(res.metadata.html).toBe(false)
    expect(res.metadata.tagsColumn).toBe(3)
    expect(res.metadata.notetype).toBe('Cloze')
    expect(res.cards).toHaveLength(1)
  })

  it('handles garbage / malformed / missing headers (BUG 6: unknown separator header)', () => {
    const garbageInput = [
      '#random garbage header without colon',
      '#separator:tab',
      '#tags column:not_a_number',
      '#html:neither_true_nor_false',
      'Front\tBack\ttags',
    ].join('\n')

    const res = parseAnkiDecks(garbageInput)
    expect(res.cards).toHaveLength(1)
    expect(res.cards[0]!.front).toBe('Front')
    expect(res.cards[0]!.back).toBe('Back')

    // Document BUG 6 fix: If unknown separator name is given, it falls back to autodetected delimiter
    const unknownSepInput = [
      '#separator:unknown_custom_separator',
      'Front\tBack\ttags',
    ].join('\n')
    const badSepRes = parseAnkiDecks(unknownSepInput)
    expect(badSepRes.metadata.separator).toBe('\t')
    expect(badSepRes.cards[0]!.front).toBe('Front')
    expect(badSepRes.cards[0]!.back).toBe('Back')
  })

  it('preserves data rows starting with "#" (C/C++ or Markdown)', () => {
    const input = [
      '#separator:tab',
      '#include <iostream>\tC++ header for stream IO\tcpp programming',
      '#pragma once\tHeader guard directive\tcpp programming',
      '"#define MAX 100"\tMacro definition\tcpp programming',
      '# Heading 1\tMarkdown title\tmarkdown',
    ].join('\n')

    const res = parseAnkiDecks(input)
    expect(res.cards.length).toBe(4)
    expect(res.errors.length).toBe(0)
    expect(res.cards[0]!.front).toBe('#include <iostream>')
    expect(res.cards[1]!.front).toBe('#pragma once')
    expect(res.cards[2]!.front).toBe('#define MAX 100')
    expect(res.cards[3]!.front).toBe('# Heading 1')
  })
})

describe('Anki Tag Parsing & HTML Sanitization Tests', () => {
  it('parses space-separated, comma-separated, and mixed whitespace tags', () => {
    expect(parseTags('math   physics\t\tchemistry')).toEqual(['math', 'physics', 'chemistry'])
    expect(parseTags('math, physics, chemistry')).toEqual(['math', 'physics', 'chemistry'])
    expect(parseTags('   ,   ')).toEqual([])
  })

  it('handles tags with special characters and hierarchical colons', () => {
    const tags = parseTags('science::physics::mechanics c++ tag#1 $math 100%')
    expect(tags).toEqual(['science::physics::mechanics', 'c++', 'tag#1', '$math', '100%'])
  })

  it('tests tags containing HTML entities or tags', () => {
    const tags1 = parseTags('tag1&nbsp;tag2 tag3&amp;tag4')
    // parseTags does not decode HTML entities
    expect(tags1).toEqual(['tag1&nbsp;tag2', 'tag3&amp;tag4'])
  })

  it('sanitizes HTML tags and entities in fields', () => {
    expect(sanitizeAnkiHtml('<div>Line 1</div><br/><p>Line 2</p>', true)).toBe('Line 1\nLine 2')
    expect(sanitizeAnkiHtml('&lt;hello&gt; &amp; &#39;world&#39;', false)).toBe("<hello> & 'world'")
  })
})

describe('Card Generation & validateCardContent Conformance', () => {
  it('ensures standard cards conform to validateCardContent', () => {
    const input = [
      '#separator:tab',
      'Front 1\tBack 1\ttag1',
      '{{c1::Paris}} is the capital of France\tGeography\ttag2',
    ].join('\n')

    const res = parseAnkiDecks(input)
    for (const card of res.cards) {
      const format = card.classification === 'cloze' ? 'cloze' : 'basic'
      const val = validateCardContent(format, card.content)
      expect(val.ok).toBe(true)
    }
  })

  it('rejects basic cards with empty front and logs error', () => {
    // Empty front: "\tOnly back\ttags"
    const emptyFrontInput = '#separator:tab\n\tOnly back\ttags'
    const res = parseAnkiDecks(emptyFrontInput)
    expect(res.cards.length).toBe(0)
    expect(res.errors.length).toBe(1)
    expect(res.errors[0]!.message).toContain('Card front cannot be empty')
    expect(res.stats.errorCount).toBe(1)

    // Empty back falls back to '...' and passes
    const emptyBackInput = '#separator:tab\nOnly front\t\ttags'
    const res2 = parseAnkiDecks(emptyBackInput)
    expect(res2.cards.length).toBe(1)
    const val2 = validateCardContent('basic', res2.cards[0]!.content)
    expect(val2.ok).toBe(true)
  })

  it('falls back to basic when cloze card has empty answers {{c1::}}', () => {
    const emptyAnswer = '#separator:tab\nBlank: {{c1::}}\tNotes\ttags'
    const res = parseAnkiDecks(emptyAnswer)
    expect(res.cards.length).toBe(1)
    expect(res.cards[0]!.classification).toBe('basic')
    const val = validateCardContent('basic', res.cards[0]!.content)
    expect(val.ok).toBe(true)
  })

  it('falls back to basic when #notetype:Cloze card lacks cloze markers', () => {
    const input = [
      '#separator:tab',
      '#notetype:Cloze',
      'Plain Question without cloze marker\tPlain Answer\ttags',
    ].join('\n')
    const res = parseAnkiDecks(input)
    expect(res.cards.length).toBe(1)
    expect(res.cards[0]!.classification).toBe('basic')
    const val = validateCardContent('basic', res.cards[0]!.content)
    expect(val.ok).toBe(true)
  })

  it('demonstrates finding: unexpanded reversed card classification is not a valid CardFormat', () => {
    const input = '#separator:tab\n#notetype:Basic (and reversed card)\nFront\tBack\ttags'
    const res = parseAnkiDecks(input, { expandReversed: false })
    expect(res.cards[0]!.classification).toBe('reversed')
    // Attempting to validate with classification as format fails because 'reversed' is not in CardFormat
    const val = validateCardContent(res.cards[0]!.classification as any, res.cards[0]!.content)
    expect(val.ok).toBe(false)
    expect(val.errors[0]).toBe('unknown format: reversed')
    // The content itself is actually basic format
    const basicVal = validateCardContent('basic', res.cards[0]!.content)
    expect(basicVal.ok).toBe(true)
  })

  it('autodetects TSV tab delimiter even when text contains natural language commas', () => {
    // TSV file without #separator:tab header, but with commas in the text
    const input = [
      'Hello, my friend, how are you today, Alice?\tFine, thank you, Bob\tgreetings',
      'One, two, three, four, five\tNumbers\tmath',
    ].join('\n')
    const res = parseAnkiDecks(input)
    expect(res.metadata.separator).toBe('\t')
    expect(res.cards[0]!.front).toBe('Hello, my friend, how are you today, Alice?')
    expect(res.cards[0]!.back).toBe('Fine, thank you, Bob')
  })

  it('validates all siblings from expandClozeCard', () => {
    const input = '#separator:tab\n{{c1::One}} and {{c2::Two}} and {{c3::Three}}\tBack\ttags'
    const res = parseAnkiDecks(input)
    expect(res.cards).toHaveLength(1)
    const siblings = expandClozeCard(res.cards[0]!)
    expect(siblings).toHaveLength(3)

    for (const sib of siblings) {
      const val = validateCardContent('cloze', sib.content)
      expect(val.ok).toBe(true)
    }
  })

  it('validates reciprocal cards from expandReversedCards', () => {
    const input = '#separator:tab\n#notetype:Basic (and reversed card)\nCat\tChat\tanimals'
    const res = parseAnkiDecks(input, { expandReversed: true })
    expect(res.cards).toHaveLength(2)

    for (const card of res.cards) {
      const val = validateCardContent('basic', card.content)
      expect(val.ok).toBe(true)
    }
  })
})

describe('Cloze Answer Evaluation Stress Testing (DEF-002)', () => {
  it('evaluates duplicate indices with same answers (e.g. repeated word)', () => {
    const cloze = { text: 'The {{c1::sun}} rises and the {{c1::sun}} sets.' }
    // Record input
    expect(evaluateClozeAnswer(cloze, { 1: 'sun' }).isCorrect).toBe(true)
    // String input
    expect(evaluateClozeAnswer(cloze, 'sun').isCorrect).toBe(true)
    // Array input
    expect(evaluateClozeAnswer(cloze, ['sun']).isCorrect).toBe(true)
  })

  it('evaluates duplicate indices with different answers (conflict edge case)', () => {
    const cloze = { text: 'Eat {{c1::apple}} or {{c1::orange}}' }
    const res = evaluateClozeAnswer(cloze, { 1: 'apple' })
    // Unique blanks map keeps the first one seen
    expect(res.isCorrect).toBe(true)
    expect(res.blanks).toHaveLength(1)
    expect(res.blanks[0]!.expected).toBe('apple')
  })

  it('evaluates non-consecutive / missing indices (e.g. c1 and c5)', () => {
    const cloze = { text: 'Start {{c1::alpha}} middle {{c5::omega}} end' }
    // Record input matching indices 1 and 5
    const resRecord = evaluateClozeAnswer(cloze, { 1: 'alpha', 5: 'omega' })
    expect(resRecord.isCorrect).toBe(true)
    expect(resRecord.blanks[0]!.index).toBe(1)
    expect(resRecord.blanks[1]!.index).toBe(5)

    // Array input matching in order of unique blanks
    const resArray = evaluateClozeAnswer(cloze, ['alpha', 'omega'])
    expect(resArray.isCorrect).toBe(true)
  })

  it('evaluates 0-indexed cloze markers ({{c0::zero}})', () => {
    const cloze = { text: 'Base index {{c0::zero}}' }
    const res = evaluateClozeAnswer(cloze, { 0: 'zero' })
    expect(res.isCorrect).toBe(true)
    expect(res.blanks[0]!.index).toBe(0)
  })

  it('evaluates cloze with hints ({{c1::answer::hint}})', () => {
    const cloze = { text: 'Capital of Japan is {{c1::Tokyo::largest city}}' }
    const res = evaluateClozeAnswer(cloze, 'tokyo')
    expect(res.isCorrect).toBe(true)
    expect(res.blanks[0]!.expected).toBe('Tokyo')
  })

  it('evaluates non-ASCII and Unicode characters (umlauts, Cyrillic, CJK, Emoji)', () => {
    // German umlauts
    const deCloze = { text: 'Das Wetter ist {{c1::schön}}.' }
    expect(evaluateClozeAnswer(deCloze, 'SCHÖN').isCorrect).toBe(true)

    // Cyrillic
    const ruCloze = { text: 'Столица России — {{c1::Москва}}.' }
    expect(evaluateClozeAnswer(ruCloze, 'москва').isCorrect).toBe(true)

    // Japanese Kanji/Hiragana
    const jpCloze = { text: 'これは{{c1::本}}です。' }
    expect(evaluateClozeAnswer(jpCloze, '本').isCorrect).toBe(true)

    // Emoji
    const emojiCloze = { text: 'The rocket goes to {{c1::🚀}}' }
    expect(evaluateClozeAnswer(emojiCloze, '🚀').isCorrect).toBe(true)
  })

  it('evaluates case-sensitivity variations and leading/trailing whitespace', () => {
    const cloze = { text: 'Answer is {{c1::HyperText Markup Language}}' }
    expect(evaluateClozeAnswer(cloze, 'hypertext markup language').isCorrect).toBe(true)
    expect(evaluateClozeAnswer(cloze, '   HYPERTEXT MARKUP LANGUAGE   ').isCorrect).toBe(true)
    expect(evaluateClozeAnswer(cloze, 'Hypertext  Markup  Language').isCorrect).toBe(false) // internal spacing
  })

  it('evaluates empty and whitespace-only inputs', () => {
    const cloze = { text: 'Missing: {{c1::Found}}' }
    expect(evaluateClozeAnswer(cloze, '').isCorrect).toBe(false)
    expect(evaluateClozeAnswer(cloze, '   ').isCorrect).toBe(false)
    expect(evaluateClozeAnswer(cloze, []).isCorrect).toBe(false)
    expect(evaluateClozeAnswer(cloze, {}).isCorrect).toBe(false)
    expect(evaluateClozeAnswer(cloze, { 1: '' }).isCorrect).toBe(false)
  })

  it('evaluates array input with partial answers or mismatched lengths', () => {
    const cloze = { text: '{{c1::A}} and {{c2::B}} and {{c3::C}}' }
    // Only first blank provided
    const partial = evaluateClozeAnswer(cloze, ['A'])
    expect(partial.isCorrect).toBe(false)
    expect(partial.blanks[0]!.isCorrect).toBe(true)
    expect(partial.blanks[1]!.isCorrect).toBe(false)
    expect(partial.blanks[2]!.isCorrect).toBe(false)

    // Too many elements provided
    const excess = evaluateClozeAnswer(cloze, ['A', 'B', 'C', 'D'])
    expect(excess.isCorrect).toBe(true)
    expect(excess.blanks).toHaveLength(3)
  })

  it('evaluates unified isCardAnswerCorrect across formats', () => {
    // Cloze format
    const clozeCard = { cloze: { text: 'Solve {{c1::X}}', answers: ['X'], mode: 'basic' as const } }
    expect(isCardAnswerCorrect(clozeCard, 'x')).toBe(true)
    expect(isCardAnswerCorrect(clozeCard, 'y')).toBe(false)

    // Typein format
    const typeinCard = { typein: { question: 'Q', acceptedAnswers: ['Correct', 'Right'] } }
    expect(isCardAnswerCorrect(typeinCard, 'correct')).toBe(true)
    expect(isCardAnswerCorrect(typeinCard, 'RIGHT')).toBe(true)
    expect(isCardAnswerCorrect(typeinCard, 'wrong')).toBe(false)
    expect(isCardAnswerCorrect(typeinCard, ['correct'])).toBe(true)
    expect(isCardAnswerCorrect(typeinCard, { 1: 'right' })).toBe(true)

    // Unsupported formats return false
    const basicCard = { basic: { front: 'Q', back: 'A' } }
    expect(isCardAnswerCorrect(basicCard, 'A')).toBe(false)

    const mcqCard = { mcq: { question: 'Q', options: ['A', 'B'], correctIndex: 0 } }
    expect(isCardAnswerCorrect(mcqCard, 'A')).toBe(false)
  })
})
