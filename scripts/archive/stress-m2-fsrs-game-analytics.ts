/**
 * Empirical Stress Harness for Milestone 2 Core Domain:
 * FSRS Retrievability, Game Accuracy & Grading, Diurnal Analytics.
 */
import { calculateRetrievability } from '../packages/core/src/fsrs'
import {
  calculateMatchingAccuracy,
  gradeForAccuracy,
  calculateMatchingXp,
  evaluateMatchingGame,
} from '../packages/core/src/games'
import { timeOfDayPerformance, type TimeOfDayOptions } from '../packages/core/src/analytics'

interface StressSummary {
  section: string
  totalTests: number
  passed: number
  failed: number
  violations: Array<{ test: string; input: unknown; output: unknown; expected: string }>
}

const summaries: StressSummary[] = []

function runSuite(section: string, runner: (summary: StressSummary) => void): StressSummary {
  const summary: StressSummary = { section, totalTests: 0, passed: 0, failed: 0, violations: [] }
  runner(summary)
  summaries.push(summary)
  return summary
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. FSRS RETRIEVABILITY TELEMETRY
// ─────────────────────────────────────────────────────────────────────────────

runSuite('FSRS Retrievability: Grid Invariant [0, 1]', (s) => {
  const stabilities = [-10, 0, 0.0001, 1, 10, 100, 1000, 1e6, Infinity, NaN]
  const elapsedDays = [-10, 0, 0.0001, 1, 10, 100, 1000, 1e6, Infinity, NaN]

  for (const stab of stabilities) {
    for (const t of elapsedDays) {
      s.totalTests++
      const r = calculateRetrievability(stab, t)
      const valid =
        typeof r === 'number' && !Number.isNaN(r) && Number.isFinite(r) && r >= 0 && r <= 1
      if (valid) {
        s.passed++
      } else {
        s.failed++
        s.violations.push({
          test: `calculateRetrievability(${stab}, ${t})`,
          input: { stab, t },
          output: r,
          expected: '0 <= R <= 1, finite, not NaN',
        })
      }
    }
  }
})

runSuite('FSRS Retrievability: Calibration Anchor R(S, S) ≈ 0.90', (s) => {
  const testStabilities = [0.001, 0.01, 0.1, 0.5, 1, 2, 5, 10, 30, 90, 180, 365, 1000, 10000]
  for (const stab of testStabilities) {
    s.totalTests++
    const r = calculateRetrievability(stab, stab)
    // Calibration anchor: R(S, S) should be 0.90 within 1e-4
    const diff = Math.abs(r - 0.9)
    if (diff < 1e-4) {
      s.passed++
    } else {
      s.failed++
      s.violations.push({
        test: `R(${stab}, ${stab}) anchor`,
        input: { stab },
        output: r,
        expected: 'Math.abs(r - 0.90) < 1e-4',
      })
    }
  }
})

runSuite('FSRS Retrievability: Custom Decay Anchor Invariant', (s) => {
  const decays = [0.01, 0.05, 0.1, 0.1542, 0.25, 0.5, 0.9]
  const stab = 10
  for (const d of decays) {
    s.totalTests++
    const r = calculateRetrievability(stab, stab, d)
    const diff = Math.abs(r - 0.9)
    if (diff < 1e-4) {
      s.passed++
    } else {
      s.failed++
      s.violations.push({
        test: `R(${stab}, ${stab}, decay=${d}) anchor`,
        input: { stab, decay: d },
        output: r,
        expected: 'Math.abs(r - 0.90) < 1e-4',
      })
    }
  }
})

runSuite('FSRS Retrievability: Monotonicity Over Time', (s) => {
  const stabilities = [0.1, 1, 10, 50, 100, 365]
  for (const stab of stabilities) {
    let prevR = 1.0
    for (let t = 0; t <= 1000; t += 5) {
      s.totalTests++
      const r = calculateRetrievability(stab, t)
      // Monotonic non-increasing: r <= prevR
      if (r <= prevR + 1e-9) {
        s.passed++
      } else {
        s.failed++
        s.violations.push({
          test: `Monotonicity violation at stab=${stab}, t=${t}`,
          input: { stab, t, prevR },
          output: r,
          expected: `r (${r}) <= prevR (${prevR})`,
        })
      }
      prevR = r
    }
  }
})

runSuite('FSRS Retrievability: Random Continuous Fuzzing (10,000 samples)', (s) => {
  // Deterministic pseudo-random LCG for reproducible stress testing
  let seed = 42
  function pseudoRandom() {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }

  for (let i = 0; i < 10000; i++) {
    s.totalTests++
    // Range covers [-100, 100,000] with log and linear sampling
    const stab = (pseudoRandom() - 0.1) * 1000
    const elapsed = (pseudoRandom() - 0.1) * 1000
    const r = calculateRetrievability(stab, elapsed)
    const valid =
      typeof r === 'number' && !Number.isNaN(r) && Number.isFinite(r) && r >= 0 && r <= 1
    if (valid) {
      s.passed++
    } else {
      s.failed++
      s.violations.push({
        test: `Fuzz sample #${i}`,
        input: { stab, elapsed },
        output: r,
        expected: '0 <= R <= 1, finite, not NaN',
      })
    }
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. MATCHING GAME MATH INVARIANTS
// ─────────────────────────────────────────────────────────────────────────────

runSuite('Matching Game: Accuracy Grid Invariant [0, 1]', (s) => {
  const pairsList = [0, 1, 4, 10, 100, -5, NaN, Infinity]
  const missesList = [0, 1, 4, 10, 1000, -5, NaN, Infinity]

  for (const pairs of pairsList) {
    for (const misses of missesList) {
      s.totalTests++
      const acc = calculateMatchingAccuracy(pairs, misses)
      const valid =
        typeof acc === 'number' &&
        !Number.isNaN(acc) &&
        Number.isFinite(acc) &&
        acc >= 0 &&
        acc <= 1
      if (valid) {
        s.passed++
      } else {
        s.failed++
        s.violations.push({
          test: `calculateMatchingAccuracy(${pairs}, ${misses})`,
          input: { pairs, misses },
          output: acc,
          expected: '0 <= accuracy <= 1, finite, not NaN',
        })
      }
    }
  }
})

runSuite('Matching Game: Grade For Accuracy Range [1, 2, 3, 4]', (s) => {
  const inputs = [
    -100,
    -1,
    -0.0001,
    0,
    0.001,
    0.1,
    0.39,
    0.39999,
    0.4,
    0.40001,
    0.5,
    0.69,
    0.69999,
    0.7,
    0.70001,
    0.89,
    0.89999,
    0.9,
    0.90001,
    0.99,
    1.0,
    1.0001,
    1.5,
    10,
    100,
    Infinity,
    -Infinity,
    NaN,
  ]

  for (const val of inputs) {
    s.totalTests++
    const grade = gradeForAccuracy(val)
    const valid = ([1, 2, 3, 4] as number[]).includes(grade)
    if (valid) {
      s.passed++
    } else {
      s.failed++
      s.violations.push({
        test: `gradeForAccuracy(${val})`,
        input: val,
        output: grade,
        expected: '1 | 2 | 3 | 4',
      })
    }
  }
})

runSuite('Matching Game: Grade Threshold Exact Boundaries', (s) => {
  const cases: Array<[number, number]> = [
    [0.0, 1],
    [0.3999, 1],
    [0.4, 2],
    [0.6999, 2],
    [0.7, 3],
    [0.8999, 3],
    [0.9, 4],
    [1.0, 4],
  ]
  for (const [acc, expectedGrade] of cases) {
    s.totalTests++
    const grade = gradeForAccuracy(acc)
    if (grade === expectedGrade) {
      s.passed++
    } else {
      s.failed++
      s.violations.push({
        test: `gradeForAccuracy(${acc}) exact threshold`,
        input: acc,
        output: grade,
        expected: String(expectedGrade),
      })
    }
  }
})

runSuite('Matching Game: calculateMatchingXp Finite & Non-negative', (s) => {
  const pairsList = [-5, 0, 1, 4, 8, 12, 100, NaN, Infinity]
  const accList = [-1, 0, 0.5, 0.8, 0.9, 1.0, 2.0, NaN, Infinity]
  const timeMsList = [undefined, -1000, 0, 500, 2000, 10000, 32000, 60000, NaN, Infinity]

  for (const pairs of pairsList) {
    for (const accuracy of accList) {
      for (const timeMs of timeMsList) {
        s.totalTests++
        const res = calculateMatchingXp({ pairs, accuracy, timeMs })
        const validXp =
          typeof res.xp === 'number' &&
          !Number.isNaN(res.xp) &&
          Number.isFinite(res.xp) &&
          res.xp >= 0
        const validBase =
          typeof res.base === 'number' &&
          !Number.isNaN(res.base) &&
          Number.isFinite(res.base) &&
          res.base >= 0
        const validRecall =
          typeof res.recallBonus === 'number' &&
          !Number.isNaN(res.recallBonus) &&
          Number.isFinite(res.recallBonus) &&
          res.recallBonus >= 0
        const validSpeed = typeof res.speedBonus === 'boolean'

        if (validXp && validBase && validRecall && validSpeed) {
          s.passed++
        } else {
          s.failed++
          s.violations.push({
            test: `calculateMatchingXp({ pairs: ${pairs}, accuracy: ${accuracy}, timeMs: ${timeMs} })`,
            input: { pairs, accuracy, timeMs },
            output: res,
            expected: 'Finite non-negative numbers for xp, base, recallBonus; boolean speedBonus',
          })
        }
      }
    }
  }
})

runSuite('Matching Game: evaluateMatchingGame Finite & Non-negative Properties', (s) => {
  const pairsList = [-5, 0, 1, 4, 8, 12, 100, NaN, Infinity]
  const missesList = [-5, 0, 1, 4, 10, 100, NaN, Infinity]
  const timeMsList = [undefined, 0, 2000, 15000, 60000, NaN, Infinity]

  for (const pairs of pairsList) {
    for (const misses of missesList) {
      for (const timeMs of timeMsList) {
        s.totalTests++
        const res = evaluateMatchingGame({ pairs, misses, timeMs })
        const validPairs = Number.isFinite(res.pairs) && res.pairs >= 0
        const validMisses = Number.isFinite(res.misses) && res.misses >= 0
        const validAttempts = Number.isFinite(res.totalAttempts) && res.totalAttempts >= 0
        const validAcc = Number.isFinite(res.accuracy) && res.accuracy >= 0 && res.accuracy <= 1
        const validScorePct =
          Number.isFinite(res.scorePct) && res.scorePct >= 0 && res.scorePct <= 100
        const validGrade = ([1, 2, 3, 4] as number[]).includes(res.grade)
        const validXp = Number.isFinite(res.xp) && res.xp >= 0
        const validSpeed = typeof res.speedBonus === 'boolean'

        if (
          validPairs &&
          validMisses &&
          validAttempts &&
          validAcc &&
          validScorePct &&
          validGrade &&
          validXp &&
          validSpeed
        ) {
          s.passed++
        } else {
          s.failed++
          s.violations.push({
            test: `evaluateMatchingGame({ pairs: ${pairs}, misses: ${misses}, timeMs: ${timeMs} })`,
            input: { pairs, misses, timeMs },
            output: res,
            expected: 'All properties non-negative, finite, valid ranges',
          })
        }
      }
    }
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. ANALYTICS DIURNAL PERFORMANCE INVARIANTS
// ─────────────────────────────────────────────────────────────────────────────

runSuite('Analytics: 24-Hour Coverage & UTC Binning', (s) => {
  const reviews = Array.from({ length: 24 }, (_, i) => ({
    reviewedAt: `2026-11-04T${String(i).padStart(2, '0')}:15:00.000Z`,
    rating: i % 2 === 0 ? 3 : 1, // alternate correct / not correct
  }))

  const result = timeOfDayPerformance(reviews)
  s.totalTests++
  if (result.length === 24) s.passed++
  else s.failed++

  for (let h = 0; h < 24; h++) {
    s.totalTests++
    const bin = result[h]!
    const expectedCorrect = h % 2 === 0 ? 1 : 0
    const expectedRate = expectedCorrect === 1 ? 1.0 : 0.0
    if (
      bin.hour === h &&
      bin.total === 1 &&
      bin.correct === expectedCorrect &&
      bin.rate === expectedRate
    ) {
      s.passed++
    } else {
      s.failed++
      s.violations.push({
        test: `UTC hour ${h} bin`,
        input: { hour: h },
        output: bin,
        expected: `total=1, correct=${expectedCorrect}, rate=${expectedRate}`,
      })
    }
  }
})

runSuite('Analytics: Timezone Offsets (+720, -720, +330, 0)', (s) => {
  const baseTime = '2026-11-04T12:00:00.000Z' // 12:00 UTC
  const testCases: Array<{ opts: TimeOfDayOptions | number; expectedHour: number; label: string }> =
    [
      { opts: 0, expectedHour: 12, label: 'UTC 0 (number)' },
      { opts: { timezoneOffsetMinutes: 0 }, expectedHour: 12, label: 'UTC 0 (opts)' },
      { opts: { timezoneOffsetHours: 0 }, expectedHour: 12, label: 'UTC 0 (hours opt)' },
      { opts: 720 / 60, expectedHour: 0, label: '+720 min / +12h (wraps to 00:00 next day)' },
      { opts: { timezoneOffsetMinutes: 720 }, expectedHour: 0, label: '+720 min (opts)' },
      { opts: -720 / 60, expectedHour: 0, label: '-720 min / -12h (wraps to 00:00 same/prev day)' },
      { opts: { timezoneOffsetMinutes: -720 }, expectedHour: 0, label: '-720 min (opts)' },
      {
        opts: { timezoneOffsetMinutes: 330 },
        expectedHour: 17,
        label: '+330 min / +5.5h (12:00 + 5:30 -> 17:30 -> hour 17)',
      },
      { opts: 5.5, expectedHour: 17, label: '5.5 hours shorthand -> hour 17' },
      { opts: -330 / 60, expectedHour: 6, label: '-5.5 hours (12:00 - 5:30 -> 06:30 -> hour 6)' },
    ]

  for (const tc of testCases) {
    s.totalTests++
    const reviews = [{ reviewedAt: baseTime, rating: 3 }]
    const result = timeOfDayPerformance(reviews, tc.opts)
    const activeBins = result.filter((h) => h.total > 0)

    if (activeBins.length === 1 && activeBins[0]!.hour === tc.expectedHour) {
      s.passed++
    } else {
      s.failed++
      s.violations.push({
        test: tc.label,
        input: tc.opts,
        output: activeBins,
        expected: `Single active bin at hour ${tc.expectedHour}`,
      })
    }
  }
})

runSuite('Analytics: Day Boundary Forward Wrap-Around (23h + offset)', (s) => {
  // Review at 23:30:00Z
  const review23 = [{ reviewedAt: '2026-11-04T23:30:00.000Z', rating: 4 }]

  const forwardCases: Array<{
    opts: TimeOfDayOptions | number
    expectedHour: number
    label: string
  }> = [
    { opts: 1, expectedHour: 0, label: '23:30 + 1h -> 00:30 (hour 0 next day)' },
    { opts: 2, expectedHour: 1, label: '23:30 + 2h -> 01:30 (hour 1 next day)' },
    { opts: 3.5, expectedHour: 3, label: '23:30 + 3.5h -> 03:00 (hour 3 next day)' },
    { opts: 12, expectedHour: 11, label: '23:30 + 12h -> 11:30 (hour 11 next day)' },
  ]

  for (const fc of forwardCases) {
    s.totalTests++
    const res = timeOfDayPerformance(review23, fc.opts)
    const active = res.filter((h) => h.total > 0)
    if (active.length === 1 && active[0]!.hour === fc.expectedHour) {
      s.passed++
    } else {
      s.failed++
      s.violations.push({
        test: fc.label,
        input: fc.opts,
        output: active,
        expected: `Active bin at hour ${fc.expectedHour}`,
      })
    }
  }
})

runSuite('Analytics: Day Boundary Backward Wrap-Around (00h - offset)', (s) => {
  // Review at 00:30:00Z
  const review00 = [{ reviewedAt: '2026-11-04T00:30:00.000Z', rating: 4 }]

  const backwardCases: Array<{
    opts: TimeOfDayOptions | number
    expectedHour: number
    label: string
  }> = [
    { opts: -1, expectedHour: 23, label: '00:30 - 1h -> 23:30 (hour 23 prev day)' },
    { opts: -2, expectedHour: 22, label: '00:30 - 2h -> 22:30 (hour 22 prev day)' },
    { opts: -3.5, expectedHour: 21, label: '00:30 - 3.5h -> 21:00 (hour 21 prev day)' },
    { opts: -12, expectedHour: 12, label: '00:30 - 12h -> 12:30 (hour 12 prev day)' },
  ]

  for (const bc of backwardCases) {
    s.totalTests++
    const res = timeOfDayPerformance(review00, bc.opts)
    const active = res.filter((h) => h.total > 0)
    if (active.length === 1 && active[0]!.hour === bc.expectedHour) {
      s.passed++
    } else {
      s.failed++
      s.violations.push({
        test: bc.label,
        input: bc.opts,
        output: active,
        expected: `Active bin at hour ${bc.expectedHour}`,
      })
    }
  }
})

runSuite('Analytics: Backwards Compatibility Without Options', (s) => {
  const mixedReviews = [
    { reviewedAt: '2026-11-04T02:15:00.000Z', rating: 3 },
    { reviewedAt: '2026-11-04T08:45:00.000Z', rating: 1 },
    { reviewedAt: '2026-11-04T15:20:00.000Z', rating: 4 },
    { reviewedAt: '2026-11-04T21:05:00.000Z', rating: 2 },
  ]

  s.totalTests++
  const defaultRes = timeOfDayPerformance(mixedReviews)
  const zeroNumRes = timeOfDayPerformance(mixedReviews, 0)
  const zeroOptRes = timeOfDayPerformance(mixedReviews, { timezoneOffsetMinutes: 0 })

  const identical =
    JSON.stringify(defaultRes) === JSON.stringify(zeroNumRes) &&
    JSON.stringify(defaultRes) === JSON.stringify(zeroOptRes)

  if (identical) {
    s.passed++
  } else {
    s.failed++
    s.violations.push({
      test: 'Default vs opts(0) identity',
      input: null,
      output: { defaultRes, zeroNumRes, zeroOptRes },
      expected: 'Strict JSON equality across default, opts=0, opts={timezoneOffsetMinutes: 0}',
    })
  }

  // Also check legacy string slice equivalence on standard UTC ISO strings
  s.totalTests++
  let sliceMatches = true
  for (const r of mixedReviews) {
    const sliceHour = Number.parseInt(r.reviewedAt.slice(11, 13), 10)
    const bin = defaultRes[sliceHour]!
    if (bin.total === 0) sliceMatches = false
  }
  if (sliceMatches) s.passed++
  else {
    s.failed++
    s.violations.push({
      test: 'Legacy UTC string slice hour match',
      input: mixedReviews,
      output: defaultRes,
      expected: 'Legacy slice matches default result',
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PRINT AGGREGATE SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

console.log('='.repeat(80))
console.log('EMPIRICAL STRESS TEST EXECUTION REPORT')
console.log('='.repeat(80))

let totalAll = 0
let passedAll = 0
let failedAll = 0

for (const s of summaries) {
  totalAll += s.totalTests
  passedAll += s.passed
  failedAll += s.failed
  const status = s.failed === 0 ? 'PASS' : 'FAIL'
  console.log(`[${status}] ${s.section}`)
  console.log(`       Tests: ${s.totalTests} | Passed: ${s.passed} | Failed: ${s.failed}`)
  if (s.failed > 0) {
    console.log(`       First ${Math.min(5, s.violations.length)} violations:`)
    for (const v of s.violations.slice(0, 5)) {
      console.log(`         - ${v.test}`)
      console.log(`           Input:    ${JSON.stringify(v.input)}`)
      console.log(`           Output:   ${JSON.stringify(v.output)}`)
      console.log(`           Expected: ${v.expected}`)
    }
  }
}

console.log('-'.repeat(80))
console.log(`AGGREGATE TOTAL: ${totalAll} | PASSED: ${passedAll} | FAILED: ${failedAll}`)
console.log('='.repeat(80))
