import {
  parseAnkiDecks,
  parseDelimitedRows,
  parseTags,
  sanitizeAnkiHtml,
  expandReversedCards,
  expandClozeCard,
} from '../packages/core/src/anki'
import {
  validateCardContent,
  parseCloze,
  evaluateClozeAnswer,
  isCardAnswerCorrect,
} from '../packages/core/src/cards'

let totalChecks = 0
let failedChecks = 0
const failures: Array<{ desc: string; details: any }> = []

function check(desc: string, cond: boolean, details?: any) {
  totalChecks++
  if (!cond) {
    failedChecks++
    failures.push({ desc, details })
    if (failures.length <= 15) {
      console.error(`[FAIL] ${desc}`, details ?? '')
    }
  }
}

console.log('================================================================================')
console.log('CHALLENGER 1 EMPIRICAL ADVERSARIAL STRESS HARNESS — ANKI PARSER & CLOZE')
console.log('================================================================================\n')

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT 1: Data rows starting with '#' preserved when multi-column
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Testing Requirement 1: Multi-column rows starting with "#" ---')

const hashRowCases = [
  { raw: '#include <iostream>\tC++ stream I/O header\tcpp programming', front: '#include <iostream>' },
  { raw: '#pragma once\tCompiler header guard directive\tcpp programming', front: '#pragma once' },
  { raw: '"#define MAX_BUFFER 4096"\tPreprocessor macro\tcpp programming', front: '#define MAX_BUFFER 4096' },
  { raw: '# Heading 1: Introduction\tMarkdown primary title\tmarkdown', front: '# Heading 1: Introduction' },
  { raw: '## Heading 2: Subtitle\tMarkdown secondary title\tmarkdown', front: '## Heading 2: Subtitle' },
  { raw: '### Heading 3: Detail\tMarkdown tertiary title\tmarkdown', front: '### Heading 3: Detail' },
  { raw: '#!/usr/bin/env bash\tShebang script execution line\tbash shell', front: '#!/usr/bin/env bash' },
  { raw: '# TODO: refactor logic\tPython comment card\tpython', front: '# TODO: refactor logic' },
  { raw: '#region Internal Logic\tC# preprocessor block\tcsharp', front: '#region Internal Logic' },
  { raw: '#1 Ranked Question\tAnswer to question 1\tranking', front: '#1 Ranked Question' },
  { raw: '#[derive(Debug)]\tRust attribute macro\trust programming', front: '#[derive(Debug)]' },
]

// Test 1.1: TSV with #separator:tab header
{
  const tsvHeaderInput = ['#separator:tab', '#deck:C++ & Markdown Deck', ...hashRowCases.map((c) => c.raw)].join('\n')
  const res = parseAnkiDecks(tsvHeaderInput)
  check('TSV with #separator:tab preserves all 11 hash cards', res.cards.length === 11, { count: res.cards.length })
  check('TSV with #separator:tab logs 0 errors', res.errors.length === 0, { errors: res.errors })
  for (let i = 0; i < hashRowCases.length; i++) {
    check(`Card ${i} front matches verbatim: ${hashRowCases[i].front}`, res.cards[i]?.front === hashRowCases[i].front, {
      expected: hashRowCases[i].front,
      actual: res.cards[i]?.front,
    })
  }
}

// Test 1.2: TSV without #separator:tab header (implicit tab autodetection)
{
  const tsvNoHeaderInput = hashRowCases.map((c) => c.raw).join('\n')
  const res = parseAnkiDecks(tsvNoHeaderInput)
  check('TSV without header preserves all 11 hash cards', res.cards.length === 11, { count: res.cards.length })
  check('TSV without header autodetects tab', res.metadata.separator === '\t', { sep: res.metadata.separator })
  for (let i = 0; i < hashRowCases.length; i++) {
    check(`Implicit TSV card ${i} front: ${hashRowCases[i].front}`, res.cards[i]?.front === hashRowCases[i].front)
  }
}

// Test 1.3: Pipe delimited with #separator:pipe
{
  const pipeInput = [
    '#separator:pipe',
    '#include <vector>|STL vector|cpp',
    '#pragma pack(1)|Struct packing|cpp',
    '# Title|H1|md',
  ].join('\n')
  const res = parseAnkiDecks(pipeInput)
  check('Pipe with #separator:pipe preserves 3 hash cards', res.cards.length === 3, { count: res.cards.length })
  check('Pipe card 0 front is #include <vector>', res.cards[0]?.front === '#include <vector>')
}

// Test 1.4: Single-column comment rows are skipped, while multi-column rows are preserved
{
  const mixedInput = [
    '#separator:tab',
    '# This is a standalone single-column comment',
    '# Another single column comment',
    '#include <stdio.h>\tStandard C IO\tcpp',
    '# A comment in the middle',
    '# Heading 1\tMarkdown title\tmd',
    '# Trailing comment',
  ].join('\n')
  const res = parseAnkiDecks(mixedInput)
  check('Single-column comments dropped, multi-column kept (2 cards)', res.cards.length === 2, { count: res.cards.length })
  check('Mixed cards[0] is #include', res.cards[0]?.front === '#include <stdio.h>')
  check('Mixed cards[1] is # Heading 1', res.cards[1]?.front === '# Heading 1')
  check('No errors logged for valid single-column comments', res.errors.length === 0, { errors: res.errors })
}

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT 2: Delimiter autodetection not overridden by prose commas / entities
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Testing Requirement 2: Delimiter autodetection robustness ---')

// Test 2.1: TSV with intense natural language commas (commas outnumber tabs 20:1)
{
  const proseTsv = [
    'First, second, third, fourth, fifth, sixth, seventh, eighth\tAnswer, one, two, three\ttag1, tag2',
    'However, as previously noted, this, that, and the other\tIndeed, quite so, my friend\ttag3',
    'Items: a, b, c, d, e, f, g, h, i, j, k, l, m\tResult: z, y, x, w, v\ttag4',
  ].join('\n')
  const res = parseAnkiDecks(proseTsv)
  check('Heavy prose commas do not override tab delimiter', res.metadata.separator === '\t', { sep: res.metadata.separator })
  check('Heavy prose cards count is 3', res.cards.length === 3, { count: res.cards.length })
  check('First card front contains all commas intact', res.cards[0]?.front.startsWith('First, second, third'), {
    front: res.cards[0]?.front,
  })
}

// Test 2.2: HTML entities containing semicolons (&amp;, &lt;, &gt;, &quot;, &#39;, &nbsp;)
{
  const htmlEntitiesTsv = [
    'Formula &amp; definition: &lt;tag&gt; &quot;quote&quot; &amp; &nbsp; &amp; &#39;test&#39;\tBack field\ttags',
    'More &amp; more &amp; more &amp; entities &lt;x&gt; &gt;y&lt;\tBack 2\ttags',
  ].join('\n')
  const res = parseAnkiDecks(htmlEntitiesTsv)
  check('HTML entity semicolons do not skew TSV autodetection', res.metadata.separator === '\t', { sep: res.metadata.separator })
  check('Parsed 2 cards from entity TSV', res.cards.length === 2)
}

// Test 2.3: HTML entities in pipe-delimited file without header
{
  const htmlEntitiesPipe = [
    'Formula &amp; definition: &lt;tag&gt;|Back field|tags',
    'More &amp; entities|Back 2|tags',
  ].join('\n')
  const res = parseAnkiDecks(htmlEntitiesPipe)
  check('HTML entity semicolons do not skew pipe autodetection', res.metadata.separator === '|', { sep: res.metadata.separator })
  check('Parsed 2 cards from entity Pipe file', res.cards.length === 2)
}

// Test 2.4: Actual semicolon delimiter with HTML entities present
{
  const semiWithEntities = [
    'A &amp; B &lt; C;Answer with &quot;quotes&quot;;tag1',
    'D &gt; E &amp; F;Second answer;tag2',
  ].join('\n')
  const res = parseAnkiDecks(semiWithEntities)
  check('Actual semicolon delimiter detected even with entities', res.metadata.separator === ';', { sep: res.metadata.separator })
  check('Parsed 2 cards from entity Semicolon file', res.cards.length === 2)
}

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT 3: Empty front fields rejected and logged to errors
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Testing Requirement 3: Empty front field rejection & error logging ---')

const invalidFrontRows = [
  { input: '\tBack only\ttags', label: 'empty string' },
  { input: '   \tBack only\ttags', label: 'whitespace only' },
  { input: '\t\tBack only\ttags', label: 'multiple tabs' },
  { input: '<br>\tBack only\ttags', label: 'HTML <br> only' },
  { input: '<br/><br />\tBack only\ttags', label: 'HTML <br/> only' },
  { input: '&nbsp;\tBack only\ttags', label: 'HTML &nbsp; entity only' },
  { input: '   &nbsp;   <br>  \tBack only\ttags', label: 'Mixed HTML space and break' },
]

for (const { input, label } of invalidFrontRows) {
  const res = parseAnkiDecks(input)
  check(`Invalid front (${label}) produces 0 cards`, res.cards.length === 0, { cards: res.cards })
  check(`Invalid front (${label}) logs exactly 1 error`, res.errors.length === 1, { errors: res.errors })
  check(`Invalid front (${label}) error message is informative`, res.errors[0]?.message === 'Card front cannot be empty', {
    msg: res.errors[0]?.message,
  })
  check(`Invalid front (${label}) stats errorCount matches errors length`, res.stats.errorCount === 1)
}

// Test 3.2: Empty back field is ALLOWED and falls back to '...' in content
{
  const emptyBackInput = 'Front with no back\t\ttags'
  const res = parseAnkiDecks(emptyBackInput)
  check('Empty back field produces 1 valid card', res.cards.length === 1)
  check('Empty back field card.content.basic.back falls back to "..."', (res.cards[0]?.content as any).basic?.back === '...', {
    contentBack: (res.cards[0]?.content as any).basic?.back,
  })
  const val = validateCardContent('basic', res.cards[0]!.content)
  check('Empty back card passes validateCardContent(basic)', val.ok === true, { errors: val.errors })
}

// Test 3.3: Entirely empty row (both front and back empty) in multi-row deck
{
  const bothEmpty = 'Valid Front\tValid Back\ttags\n\t\t'
  const res = parseAnkiDecks(bothEmpty)
  check('Multi-row with empty row produces 1 valid card', res.cards.length === 1)
  check('Multi-row with empty row logs error for line 2', res.errors.length === 1 && res.errors[0]?.line === 2)
}

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT 4: Cloze cards with empty answers {{c1::}} fall back to basic
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Testing Requirement 4: Cloze empty answers fallback ---')

const emptyClozeCases = [
  'Blank question: {{c1::}}\tAnswer notes\ttags',
  'Multiple blank: {{c1::}} and {{c2::}}\tAnswer notes\ttags',
  'Empty with hint: {{c1::::some hint}}\tAnswer notes\ttags',
]

for (const input of emptyClozeCases) {
  const res = parseAnkiDecks(input)
  check(`Empty cloze (${input.slice(0, 25)}) parsed 1 card`, res.cards.length === 1)
  check(`Empty cloze (${input.slice(0, 25)}) classification is 'basic'`, res.cards[0]?.classification === 'basic', {
    cls: res.cards[0]?.classification,
  })
  const val = validateCardContent('basic', res.cards[0]!.content)
  check(`Empty cloze (${input.slice(0, 25)}) passes validateCardContent(basic)`, val.ok === true, { errors: val.errors })
}

// Test 4.2: Mixed empty and non-empty blanks (e.g. {{c1::}} and {{c2::valid}})
{
  const mixedCloze = 'One {{c1::}} and two {{c2::Valid Answer}}\tNotes\ttags'
  const res = parseAnkiDecks(mixedCloze)
  check('Mixed empty/valid cloze is classified as cloze', res.cards[0]?.classification === 'cloze', {
    cls: res.cards[0]?.classification,
  })
  check('Mixed cloze contains valid answer', res.cards[0]?.clozeData?.answers[0] === 'Valid Answer')
  const val = validateCardContent('cloze', res.cards[0]!.content)
  check('Mixed cloze passes validateCardContent(cloze)', val.ok === true, { errors: val.errors })
}

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT 5: #notetype:Cloze cards without markers fall back to basic
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Testing Requirement 5: #notetype:Cloze markerless fallback ---')

const markerlessClozeCases = [
  {
    header: '#notetype:Cloze',
    data: 'What is the capital of Australia?\tCanberra\tgeography',
  },
  {
    header: '#notetype:cloze',
    data: 'Identify the mitochondrion\tPowerhouse of cell\tbiology',
  },
  {
    header: '#NOTETYPE:CLOZE (v2)',
    data: 'Incomplete marker {c1::missing brace}\tAnswer\ttags',
  },
  {
    header: '#notetype: cloze',
    data: 'Single colon marker {{c1:single colon}}\tAnswer\ttags',
  },
  {
    header: '#notetype:Cloze',
    data: 'No c index marker {{answer}}\tAnswer\ttags',
  },
]

for (const { header, data } of markerlessClozeCases) {
  const input = `#separator:tab\n${header}\n${data}`
  const res = parseAnkiDecks(input)
  check(`Markerless cloze (${header}) parsed 1 card`, res.cards.length === 1)
  check(`Markerless cloze (${header}) classification is 'basic'`, res.cards[0]?.classification === 'basic', {
    cls: res.cards[0]?.classification,
  })
  const val = validateCardContent('basic', res.cards[0]!.content)
  check(`Markerless cloze (${header}) conforms to Zod basic schema`, val.ok === true, { errors: val.errors })
}

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT 6: Delimiter header #separator: rejection of arbitrary multichar
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Testing Requirement 6: Delimiter header #separator: validation ---')

const badSeparators = [
  'unknown_custom_separator',
  'none',
  'custom',
  'excel',
  'auto',
  'multi::char',
  '---',
  'foo_bar_sep',
]

for (const badSep of badSeparators) {
  const input = `#separator:${badSep}\nFront\tBack\ttags`
  const res = parseAnkiDecks(input)
  check(`Bad separator "${badSep}" falls back to autodetection (\t)`, res.metadata.separator === '\t', {
    actualSep: res.metadata.separator,
  })
  check(`Bad separator "${badSep}" parsed card successfully`, res.cards.length === 1)
  check(`Bad separator "${badSep}" card front is "Front"`, res.cards[0]?.front === 'Front')
}

// Known valid separator aliases
const validSeparators = [
  { header: '#separator:tab', expected: '\t' },
  { header: '#separator:\\t', expected: '\t' },
  { header: '#separator:comma', expected: ',' },
  { header: '#separator:,', expected: ',' },
  { header: '#separator:semicolon', expected: ';' },
  { header: '#separator:;', expected: ';' },
  { header: '#separator:pipe', expected: '|' },
  { header: '#separator:|', expected: '|' },
  { header: '#separator:space', expected: ' ' },
  { header: '#separator:~', expected: '~' },
  { header: '#separator:^', expected: '^' },
]

for (const { header, expected } of validSeparators) {
  const input = `${header}\nFront${expected}Back${expected}tags`
  const res = parseAnkiDecks(input)
  check(`Valid separator "${header}" resolves to ${JSON.stringify(expected)}`, res.metadata.separator === expected, {
    actual: res.metadata.separator,
    expected,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT 7: Empty delimiter does not cause infinite loop in parseDelimitedRows
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Testing Requirement 7: Empty delimiter infinite loop guard ---')

const emptyDelimCases = [
  '',
  null as any,
  undefined as any,
]

for (const d of emptyDelimCases) {
  const t0 = performance.now()
  const rows = parseDelimitedRows('Front1\tBack1\nFront2\tBack2', d)
  const elapsedMs = performance.now() - t0
  check(`parseDelimitedRows with delimiter ${JSON.stringify(d)} returns immediately (<50ms)`, elapsedMs < 50, { elapsedMs })
  check(`parseDelimitedRows with delimiter ${JSON.stringify(d)} tokenizes 2 rows using fallback tab`, rows.length === 2, { rows })
  check(`Row 0 content is ['Front1', 'Back1']`, rows[0]?.[0] === 'Front1' && rows[0]?.[1] === 'Back1')
}

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT 8: Fuzzing & Property Stress Test Matrix (1,000 generated cards)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Testing Requirement 8: Generative stress matrix (1,000 cards) ---')

const generatedRows: string[] = ['#separator:tab', '#deck:Adversarial Generated Deck']

const unicodePrefixes = ['#include <iostream>', '#pragma pack', '# Heading 1', '#!/bin/bash', '普通の質問', 'Вопрос 1', 'Frage schön', 'Emoji 🚀 Question']
const bodyTypes = [
  'Simple question',
  'Question, with, several, commas, embedded',
  'Question &amp; with &lt;entities&gt; &quot;everywhere&quot;',
  'Question with {{c1::Cloze Answer}}',
  'Question with {{c1::}} empty blank',
  'Question with {{c1::First}} and {{c2::Second::Hint}}',
  '"Quoted question with ""nested quotes"" and \n newline"',
]

for (let i = 0; i < 1000; i++) {
  const prefix = unicodePrefixes[i % unicodePrefixes.length]
  const body = bodyTypes[i % bodyTypes.length]
  const front = `${prefix} — ${body} #${i}`
  const back = `Answer #${i}, details, explanations &amp; facts`
  const tags = `tag_${i % 10} generated::batch_${i % 5}`
  generatedRows.push(`${front}\t${back}\t${tags}`)
}

const fuzzInput = generatedRows.join('\n')
const t0Fuzz = performance.now()
const fuzzRes = parseAnkiDecks(fuzzInput)
const elapsedFuzz = performance.now() - t0Fuzz

check('1000 generated cards parsed in under 200ms', elapsedFuzz < 200, { elapsedFuzz })
check('1000 generated cards all successfully parsed', fuzzRes.cards.length === 1000, { count: fuzzRes.cards.length })
check('0 errors encountered during 1000 card fuzz', fuzzRes.errors.length === 0, { errors: fuzzRes.errors })

// Validate EVERY card against validateCardContent oracle
let schemaFailures = 0
for (let i = 0; i < fuzzRes.cards.length; i++) {
  const card = fuzzRes.cards[i]!
  const fmt = card.classification === 'cloze' ? 'cloze' : 'basic'
  const val = validateCardContent(fmt, card.content)
  if (!val.ok) {
    schemaFailures++
    if (schemaFailures <= 5) {
      console.error(`Schema failure at card ${i}:`, val.errors, card)
    }
  }
}
check('All 1,000 cards pass validateCardContent schema oracle', schemaFailures === 0, { schemaFailures })

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT 9: Cloze Evaluation Deep Edge Cases
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Testing Requirement 9: Cloze Answer Evaluation Edge Cases ---')

// 9.1 Overlapping answer strings
{
  const cloze = { text: 'The {{c1::cat}} and the {{c2::caterpillar}}' }
  const res = evaluateClozeAnswer(cloze, { 1: 'cat', 2: 'caterpillar' })
  check('Overlapping answers evaluate correctly', res.isCorrect === true)
}

// 9.2 Empty hint vs present hint
{
  const parsed1 = parseCloze('{{c1::Answer::}}')
  check('Trailing empty hint parses answer', parsed1.answers[0] === 'Answer')
  const parsed2 = parseCloze('{{c1::Answer::Useful Hint}}')
  check('Valid hint parsed', parsed2.hint === 'Useful Hint')
}

// 9.3 Cloze expansion with duplicate indices
{
  const text = 'The {{c1::sun}} is hot and {{c1::sun}} is bright and {{c2::moon}} is cool'
  const cData = parseCloze(text)
  const card = {
    front: text,
    back: 'Back',
    tags: ['astronomy'],
    classification: 'cloze' as const,
    deckName: 'Default',
    clozeData: cData,
    content: { cloze: cData },
    rawFields: [],
  }
  const expanded = expandClozeCard(card)
  check('expandClozeCard with duplicate c1 produces 2 sibling cards (c1, c2)', expanded.length === 2, { count: expanded.length })
  check('Sibling 1 cloze answers contains "sun"', expanded[0]?.clozeData?.answers.includes('sun') === true)
  check('Sibling 2 cloze answers contains "moon"', expanded[1]?.clozeData?.answers.includes('moon') === true)
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY & VERDICT
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n================================================================================')
console.log(`TOTAL CHECKS: ${totalChecks}`)
console.log(`PASSED: ${totalChecks - failedChecks}`)
console.log(`FAILED: ${failedChecks}`)
console.log('================================================================================')

if (failedChecks > 0) {
  console.log('\nFAILED CHECKS LIST:')
  for (const f of failures) {
    console.log(`- ${f.desc}`, JSON.stringify(f.details))
  }
  process.exit(1)
} else {
  console.log('\nALL EMPIRICAL ADVERSARIAL CHECKS PASSED!')
  process.exit(0)
}
