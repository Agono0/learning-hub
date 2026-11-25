import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BLUEPRINT_LIMITS,
  SAMPLE_BLUEPRINTS,
  abortSession,
  blueprintToPlugin,
  canFinish,
  completePhase,
  conditionHolds,
  defaultParams,
  describeBlueprint,
  emptyLibrary,
  estimateMinutes,
  getBlueprintCounters,
  installBlueprint,
  installIntoLibrary,
  parseLibrary,
  reachablePhases,
  recordEvent,
  resetBlueprintCounters,
  resolveParams,
  roundsFor,
  serializeLibrary,
  startInLibrary,
  startSession,
  summarizeSession,
  uninstallFromLibrary,
  validateBlueprint,
  type Blueprint,
  type BlueprintInput,
  type BlueprintSession,
} from '../src/blueprint'
import { eventBus } from '../src/events'
import { listPlugins, resetPlugins, getPluginContributions } from '../src/plugin-loader'

const base = (): BlueprintInput => ({
  schemaVersion: 1,
  id: 'demo',
  name: 'Demo',
  version: '1.0.0',
  summary: 'A demo method.',
  phases: [
    { id: 'a', title: 'A', kind: 'learn', minutes: 5, instructions: 'Do A.' },
    { id: 'b', title: 'B', kind: 'recall', minutes: 3, instructions: 'Do B.', scored: true },
  ],
})

function ok(input: unknown): Blueprint {
  const r = validateBlueprint(input)
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r.blueprint
}

function run(
  bp: Blueprint,
  session: BlueprintSession,
  results: Parameters<typeof completePhase>[2][],
) {
  let s = session
  for (const r of results) {
    const o = completePhase(bp, s, r)
    if (!o.ok) throw new Error(JSON.stringify(o.issues))
    s = o.session
  }
  return s
}

describe('validateBlueprint', () => {
  it('accepts a minimal blueprint and fills defaults', () => {
    const bp = ok(base())
    expect(bp.tags).toEqual([])
    expect(bp.params).toEqual({})
    expect(bp.phases[0]!.branches).toEqual([])
    expect(bp.phases[0]!.scored).toBe(false)
  })

  it('rejects non-objects and unknown keys (strict)', () => {
    expect(validateBlueprint(null).ok).toBe(false)
    expect(validateBlueprint('x').ok).toBe(false)
    const r = validateBlueprint({ ...base(), exec: 'rm -rf /' })
    expect(r.ok).toBe(false)
  })

  it('reports every zod problem with a path', () => {
    const r = validateBlueprint({ ...base(), id: 'Bad Id', version: '1', phases: [] })
    expect(r.ok).toBe(false)
    if (r.ok) return
    const paths = r.issues.map((i) => i.path)
    expect(paths).toContain('id')
    expect(paths).toContain('version')
    expect(paths).toContain('phases')
  })

  it('rejects the wrong schemaVersion', () => {
    expect(validateBlueprint({ ...base(), schemaVersion: 2 }).ok).toBe(false)
  })

  it('rejects duplicate phase ids and unknown goto/next targets', () => {
    const input = base()
    input.phases = [
      { id: 'a', title: 'A', kind: 'learn', minutes: 1, instructions: 'x', next: 'nope' },
      { id: 'a', title: 'A2', kind: 'learn', minutes: 1, instructions: 'x' },
    ]
    const r = validateBlueprint(input)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.issues.some((i) => i.message.includes('duplicate phase id'))).toBe(true)
    expect(r.issues.some((i) => i.message.includes('unknown phase "nope"'))).toBe(true)
  })

  it('rejects score branches on unscored phases', () => {
    const input = base()
    input.phases[0] = {
      id: 'a',
      title: 'A',
      kind: 'learn',
      minutes: 1,
      instructions: 'x',
      branches: [{ when: { metric: 'score', op: '<', value: 50 }, goto: 'b' }],
    }
    const r = validateBlueprint(input)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]!.message).toContain('scored')
  })

  it('allows confidence branches without scoring', () => {
    const input = base()
    input.phases[0] = {
      id: 'a',
      title: 'A',
      kind: 'learn',
      minutes: 1,
      instructions: 'x',
      branches: [{ when: { metric: 'confidence', op: '<', value: 50 }, goto: 'b' }],
    }
    expect(validateBlueprint(input).ok).toBe(true)
  })

  it('checks param references: unknown, wrong type, unbounded range', () => {
    const input = base()
    input.params = {
      flag: { type: 'boolean', label: 'F', default: true },
      loose: { type: 'number', label: 'L', default: 10 },
      wide: { type: 'number', label: 'W', default: 10, min: 0, max: 999 },
    }
    input.phases[0] = {
      id: 'a',
      title: 'A',
      kind: 'learn',
      minutes: { param: 'ghost' },
      instructions: 'x',
    }
    input.phases[1] = {
      id: 'b',
      title: 'B',
      kind: 'learn',
      minutes: { param: 'flag' },
      instructions: 'x',
    }
    input.phases.push({
      id: 'c',
      title: 'C',
      kind: 'learn',
      minutes: { param: 'wide' },
      instructions: 'x',
    })
    const r = validateBlueprint(input)
    expect(r.ok).toBe(false)
    if (r.ok) return
    const msgs = r.issues.map((i) => i.message).join('|')
    expect(msgs).toContain('unknown param "ghost"')
    expect(msgs).toContain('is not a number')
    expect(msgs).toContain('can leave the allowed range')
  })

  it('validates param definitions (default inside bounds, choice membership, min<=max)', () => {
    const input = base()
    input.params = {
      n: { type: 'number', label: 'N', default: 100, min: 0, max: 10 },
      m: { type: 'number', label: 'M', default: 5, min: 9, max: 1 },
      c: { type: 'choice', label: 'C', default: 'z', options: ['x', 'y'] },
    }
    const r = validateBlueprint(input)
    expect(r.ok).toBe(false)
    if (r.ok) return
    const msgs = r.issues.map((i) => i.message).join('|')
    expect(msgs).toContain('outside min/max')
    expect(msgs).toContain('min is greater than max')
    expect(msgs).toContain('not one of options')
  })

  it('enforces literal ranges for minutes, repeat and branch values', () => {
    const input = base()
    input.phases[0] = {
      id: 'a',
      title: 'A',
      kind: 'learn',
      minutes: BLUEPRINT_LIMITS.maxMinutes + 1,
      repeat: 0,
      instructions: 'x',
      scored: true,
      branches: [{ when: { metric: 'score', op: '>', value: 101 }, goto: 'b' }],
    }
    const r = validateBlueprint(input)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues.length).toBeGreaterThanOrEqual(3)
  })

  it('rejects duplicate trigger counters and unknown events', () => {
    const dup = base()
    dup.triggers = [
      { event: 'review.completed', counter: 'n' },
      { event: 'streak.broken', counter: 'n' },
    ]
    expect(validateBlueprint(dup).ok).toBe(false)
    const bad = base()
    // @ts-expect-error unknown event on purpose
    bad.triggers = [{ event: 'disk.wiped', counter: 'n' }]
    expect(validateBlueprint(bad).ok).toBe(false)
  })

  it('warns about unreachable phases and loops with no exit', () => {
    const input = base()
    input.phases = [
      { id: 'a', title: 'A', kind: 'learn', minutes: 1, instructions: 'x', next: 'a' },
      { id: 'b', title: 'B', kind: 'learn', minutes: 1, instructions: 'x' },
    ]
    const r = validateBlueprint(input)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const msgs = r.warnings.map((w) => w.message).join('|')
    expect(msgs).toContain('can never be reached')
    expect(msgs).toContain('no path reaches the end')
  })

  it('reachability and exit helpers agree on a normal blueprint', () => {
    const bp = ok(base())
    expect([...reachablePhases(bp)].sort()).toEqual(['a', 'b'])
    expect(canFinish(bp)).toBe(true)
  })

  it('enforces the phase limit', () => {
    const input = base()
    input.phases = Array.from({ length: BLUEPRINT_LIMITS.maxPhases + 1 }, (_, i) => ({
      id: `p-${i}`,
      title: 'P',
      kind: 'learn' as const,
      minutes: 1,
      instructions: 'x',
    }))
    expect(validateBlueprint(input).ok).toBe(false)
  })
})

describe('params', () => {
  const bp = ok({
    ...base(),
    params: {
      n: { type: 'number', label: 'N', default: 5, min: 1, max: 9 },
      c: { type: 'choice', label: 'C', default: 'x', options: ['x', 'y'] },
      f: { type: 'boolean', label: 'F', default: false },
    },
  })

  it('uses defaults', () => {
    expect(defaultParams(bp)).toEqual({ n: 5, c: 'x', f: false })
  })

  it('accepts valid overrides', () => {
    const r = resolveParams(bp, { n: 7, c: 'y', f: true })
    expect(r.issues).toEqual([])
    expect(r.params).toEqual({ n: 7, c: 'y', f: true })
  })

  it('rejects unknown, mistyped and out-of-range overrides without coercing', () => {
    const r = resolveParams(bp, { ghost: 1, n: 99, c: 'zz', f: 'yes' })
    expect(r.issues.map((i) => i.path).sort()).toEqual([
      'params.c',
      'params.f',
      'params.ghost',
      'params.n',
    ])
    expect(r.params).toEqual({ n: 5, c: 'x', f: false })
    expect(resolveParams(bp, { n: Number.NaN }).issues).toHaveLength(1)
  })
})

describe('runtime', () => {
  const retrieval = SAMPLE_BLUEPRINTS.find((b) => b.id === 'retrieval-sprint')!

  it('starts at the first phase with zeroed counters', () => {
    const s = startSession(retrieval)
    expect(s.ok).toBe(true)
    if (!s.ok) return
    expect(s.session.phaseId).toBe('study')
    expect(s.session.status).toBe('running')
    expect(s.session.counters).toEqual({ reviews: 0 })
  })

  it('refuses to start with bad params', () => {
    const s = startSession(retrieval, { 'study-minutes': 1 })
    expect(s.ok).toBe(false)
  })

  it('walks the happy path to the end', () => {
    const s0 = (startSession(retrieval) as { session: BlueprintSession }).session
    const end = run(retrieval, s0, [{}, { score: 85 }, {}])
    expect(end.status).toBe('finished')
    expect(end.endReason).toBe('finished')
    expect(end.history.map((h) => h.phaseId)).toEqual(['study', 'blank-page', 'reflect'])
    expect(end.history.at(-1)!.next).toBeNull()
  })

  it('takes the branch on a weak score and loops back until it passes', () => {
    const s0 = (startSession(retrieval) as { session: BlueprintSession }).session
    let s = run(retrieval, s0, [{}, { score: 40 }])
    expect(s.phaseId).toBe('restudy')
    s = run(retrieval, s, [{}])
    expect(s.phaseId).toBe('blank-page')
    s = run(retrieval, s, [{ score: 70 }])
    expect(s.phaseId).toBe('reflect')
  })

  it('uses the param-backed threshold', () => {
    const s0 = (startSession(retrieval, { 'pass-score': 95 }) as { session: BlueprintSession })
      .session
    const s = run(retrieval, s0, [{}, { score: 90 }])
    expect(s.phaseId).toBe('restudy')
  })

  it('requires a score on scored phases and range-checks metrics', () => {
    const s0 = run(retrieval, (startSession(retrieval) as { session: BlueprintSession }).session, [
      {},
    ])
    expect(completePhase(retrieval, s0, {}).ok).toBe(false)
    expect(completePhase(retrieval, s0, { score: 101 }).ok).toBe(false)
    expect(completePhase(retrieval, s0, { score: 50, confidence: -1 }).ok).toBe(false)
    const skipped = completePhase(retrieval, s0, { skipped: true })
    expect(skipped.ok).toBe(true)
  })

  it('does not mutate the previous session state', () => {
    const s0 = (startSession(retrieval) as { session: BlueprintSession }).session
    const frozen = JSON.stringify(s0)
    completePhase(retrieval, s0, {})
    expect(JSON.stringify(s0)).toBe(frozen)
  })

  it('a skipped scored phase takes no branch and moves on', () => {
    const s0 = run(retrieval, (startSession(retrieval) as { session: BlueprintSession }).session, [
      {},
    ])
    const s = run(retrieval, s0, [{ skipped: true }])
    expect(s.phaseId).toBe('reflect')
    expect(summarizeSession(s).skipped).toBe(1)
  })

  it('repeats a phase for its round count, then branches', () => {
    const feynman = SAMPLE_BLUEPRINTS.find((b) => b.id === 'feynman-loop')!
    let s = (startSession(feynman, { rounds: 3 }) as { session: BlueprintSession }).session
    s = run(feynman, s, [{}])
    expect(s.phaseId).toBe('explain')
    expect(roundsFor(feynman, s, 'explain')).toBe(3)
    s = run(feynman, s, [{ score: 60 }])
    expect([s.phaseId, s.round]).toEqual(['explain', 2])
    s = run(feynman, s, [{ score: 70 }])
    expect([s.phaseId, s.round]).toEqual(['explain', 3])
    s = run(feynman, s, [{ score: 92 }])
    expect([s.phaseId, s.round]).toEqual(['teach-back', 1])
  })

  it('falls through to the next phase when no branch matches after repeats', () => {
    const feynman = SAMPLE_BLUEPRINTS.find((b) => b.id === 'feynman-loop')!
    let s = (startSession(feynman, { rounds: 1 }) as { session: BlueprintSession }).session
    s = run(feynman, s, [{}, { score: 50 }])
    expect(s.phaseId).toBe('find-gaps')
  })

  it('a finished session rejects further completion', () => {
    const s0 = (startSession(retrieval) as { session: BlueprintSession }).session
    const end = run(retrieval, s0, [{}, { score: 100 }, {}])
    const again = completePhase(retrieval, end, {})
    expect(again.ok).toBe(false)
  })

  it('abort ends a running session and is idempotent', () => {
    const s0 = (startSession(retrieval) as { session: BlueprintSession }).session
    const a = abortSession(s0)
    expect(a.status).toBe('aborted')
    expect(abortSession(a)).toBe(a)
    expect(completePhase(retrieval, a, {}).ok).toBe(false)
  })

  it('stops a runaway loop at the step limit', () => {
    const loop = ok({
      ...base(),
      id: 'loop',
      phases: [{ id: 'a', title: 'A', kind: 'learn', minutes: 1, instructions: 'x', next: 'a' }],
    })
    let s = (startSession(loop) as { session: BlueprintSession }).session
    for (let i = 0; i < BLUEPRINT_LIMITS.maxSteps + 5 && s.status === 'running'; i++) {
      const o = completePhase(loop, s, {})
      if (!o.ok) throw new Error('unexpected')
      s = o.session
    }
    expect(s.status).toBe('finished')
    expect(s.endReason).toBe('step-limit')
    expect(s.steps).toBe(BLUEPRINT_LIMITS.maxSteps)
  })

  it('conditionHolds covers every operator and missing metrics', () => {
    const c = (op: '<' | '<=' | '>' | '>=' | '==', value: number) =>
      conditionHolds({ metric: 'score', op, value }, { score: 50 }, {})
    expect([
      c('<', 51),
      c('<', 50),
      c('<=', 50),
      c('>', 49),
      c('>', 50),
      c('>=', 50),
      c('==', 50),
      c('==', 49),
    ]).toEqual([true, false, true, true, false, true, true, false])
    expect(conditionHolds({ metric: 'confidence', op: '>', value: 1 }, { score: 50 }, {})).toBe(
      false,
    )
    expect(
      conditionHolds({ metric: 'score', op: '>', value: { param: 'x' } }, { score: 50 }, {}),
    ).toBe(false)
  })

  it('counts events only for declared triggers on running sessions', () => {
    const s0 = (startSession(retrieval) as { session: BlueprintSession }).session
    const s1 = recordEvent(
      retrieval,
      recordEvent(retrieval, s0, 'review.completed'),
      'review.completed',
    )
    expect(s1.counters.reviews).toBe(2)
    expect(recordEvent(retrieval, s1, 'streak.broken')).toBe(s1)
    expect(recordEvent(retrieval, abortSession(s1), 'review.completed').counters.reviews).toBe(2)
  })

  it('summarizes scores', () => {
    const s0 = (startSession(retrieval) as { session: BlueprintSession }).session
    const s = run(retrieval, s0, [{}, { score: 40 }, {}, { score: 80 }])
    expect(summarizeSession(s)).toEqual({ steps: 4, scoreAverage: 60, scoreCount: 2, skipped: 0 })
    expect(summarizeSession(s0).scoreAverage).toBeNull()
  })

  it('sessions survive a JSON round trip', () => {
    const s0 = (startSession(retrieval) as { session: BlueprintSession }).session
    const s = run(retrieval, s0, [{}, { score: 40, at: '2026-11-25T10:00:00.000Z' }])
    const copy = JSON.parse(JSON.stringify(s)) as BlueprintSession
    expect(copy).toEqual(s)
    const next = completePhase(retrieval, copy, {})
    expect(next.ok).toBe(true)
  })
})

describe('estimateMinutes', () => {
  it('sums the straight path with repeats and params', () => {
    const feynman = SAMPLE_BLUEPRINTS.find((b) => b.id === 'feynman-loop')!
    // pick 2 + explain 6*2 + gaps 3 + teach 5
    expect(estimateMinutes(feynman)).toBe(22)
    expect(estimateMinutes(feynman, { ...defaultParams(feynman), rounds: 4 })).toBe(34)
  })

  it('does not loop forever on cycles', () => {
    const cyc = ok({
      ...base(),
      phases: [
        { id: 'a', title: 'A', kind: 'learn', minutes: 4, instructions: 'x', next: 'b' },
        { id: 'b', title: 'B', kind: 'learn', minutes: 2, instructions: 'x', next: 'a' },
      ],
    })
    expect(estimateMinutes(cyc)).toBe(6)
  })
})

describe('sample blueprints', () => {
  it('ships three valid, distinct, finishable methods', () => {
    expect(SAMPLE_BLUEPRINTS).toHaveLength(3)
    expect(new Set(SAMPLE_BLUEPRINTS.map((b) => b.id)).size).toBe(3)
    for (const bp of SAMPLE_BLUEPRINTS) {
      const r = validateBlueprint(bp)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.warnings).toEqual([])
      expect(canFinish(bp)).toBe(true)
      expect(reachablePhases(bp).size).toBe(bp.phases.length)
    }
  })

  it('every sample runs to completion with passing scores', () => {
    for (const bp of SAMPLE_BLUEPRINTS) {
      let s = (startSession(bp) as { session: BlueprintSession }).session
      let guard = 0
      while (s.status === 'running' && guard++ < 100) {
        const phase = bp.phases.find((p) => p.id === s.phaseId)!
        const o = completePhase(bp, s, phase.scored ? { score: 95 } : {})
        if (!o.ok) throw new Error(JSON.stringify(o.issues))
        s = o.session
      }
      expect(s.status).toBe('finished')
    }
  })

  it('the interleaved set routes a weak score through the break', () => {
    const bp = SAMPLE_BLUEPRINTS.find((b) => b.id === 'interleaved-set')!
    const s0 = (startSession(bp) as { session: BlueprintSession }).session
    const s = run(bp, s0, [{}, {}, { score: 10 }])
    expect(s.phaseId).toBe('break')
  })
})

describe('plugin bridge', () => {
  beforeEach(() => {
    resetPlugins()
    resetBlueprintCounters()
  })
  afterEach(() => {
    resetPlugins()
    resetBlueprintCounters()
  })

  it('builds a valid plugin definition named after the blueprint', () => {
    const plugin = blueprintToPlugin(SAMPLE_BLUEPRINTS[0]!)
    expect(plugin.name).toBe('blueprint-retrieval-sprint')
    expect(plugin.version).toBe('1.0.0')
  })

  it('installs through the loader and contributes palette, widget, MCP tool and CLI command', async () => {
    const bp = SAMPLE_BLUEPRINTS[0]!
    const res = await installBlueprint(bp)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const reg = res.registered
    expect(reg.paletteActions).toEqual([
      {
        id: 'blueprint-retrieval-sprint.open',
        label: 'Study method: Retrieval Sprint',
        href: '/blueprints?open=retrieval-sprint',
      },
    ])
    expect(reg.dashboardWidgets).toHaveLength(1)
    expect(reg.mcpTools.map((t) => t.name)).toEqual(['blueprint_retrieval_sprint_plan'])
    expect(reg.cliCommands.map((c) => c.name)).toEqual(['blueprint-retrieval-sprint'])
    expect(listPlugins().map((p) => p.plugin.name)).toContain('blueprint-retrieval-sprint')
    expect(getPluginContributions().paletteActions.some((a) => a.id.startsWith('blueprint-'))).toBe(
      true,
    )
  })

  it('the MCP tool returns the plan text and the CLI command prints it', async () => {
    const res = await installBlueprint(SAMPLE_BLUEPRINTS[1])
    if (!res.ok) throw new Error('install failed')
    const out = await res.registered.mcpTools[0]!.handler({})
    expect(out.content[0]!.text).toContain('Feynman Loop v1.0.0')
    expect(out.content[0]!.text).toContain('1. [learn] Pick one concept')
    const lines: string[] = []
    const orig = console.log
    console.log = (...a: unknown[]) => void lines.push(a.join(' '))
    try {
      await res.registered.cliCommands[0]!.run([])
    } finally {
      console.log = orig
    }
    expect(lines.join('\n')).toContain('Feynman Loop')
  })

  it('counts platform events through the bus', async () => {
    const res = await installBlueprint(SAMPLE_BLUEPRINTS[0])
    expect(res.ok).toBe(true)
    eventBus.emit('review.completed', { cardId: 1, grade: 3, xpEarned: 10 })
    eventBus.emit('review.completed', { cardId: 2, grade: 3, xpEarned: 10 })
    eventBus.emit('streak.broken', {})
    expect(getBlueprintCounters('retrieval-sprint')).toEqual({ reviews: 2 })
    expect(describeBlueprint(SAMPLE_BLUEPRINTS[0]!)).toContain('Cards reviewed: 2')
  })

  it('refuses invalid blueprints and duplicate installs with readable issues', async () => {
    const bad = await installBlueprint({ nope: true })
    expect(bad.ok).toBe(false)
    const first = await installBlueprint(SAMPLE_BLUEPRINTS[2])
    expect(first.ok).toBe(true)
    const dup = await installBlueprint(SAMPLE_BLUEPRINTS[2])
    expect(dup.ok).toBe(false)
    if (!dup.ok) expect(dup.issues[0]!.message).toContain('already installed')
  })
})

describe('library', () => {
  it('installs, replaces, starts and uninstalls', () => {
    let lib = emptyLibrary()
    const a = installIntoLibrary(lib, SAMPLE_BLUEPRINTS[0])
    expect(a.ok && a.replaced).toBe(false)
    if (!a.ok) return
    lib = a.library
    const started = startInLibrary(lib, 'retrieval-sprint', { 'study-minutes': 12 })
    expect(started.ok).toBe(true)
    if (!started.ok) return
    lib = started.library
    expect(lib.sessions['retrieval-sprint']!.params['study-minutes']).toBe(12)
    const again = installIntoLibrary(lib, SAMPLE_BLUEPRINTS[0])
    expect(again.ok && again.replaced).toBe(true)
    if (again.ok) expect(again.library.sessions['retrieval-sprint']).toBeUndefined()
    expect(uninstallFromLibrary(lib, 'retrieval-sprint').installed).toEqual([])
  })

  it('reports unknown ids and bad params on start, and bad blueprints on install', () => {
    const lib = emptyLibrary()
    expect(startInLibrary(lib, 'ghost').ok).toBe(false)
    const a = installIntoLibrary(lib, SAMPLE_BLUEPRINTS[1])
    if (!a.ok) throw new Error('x')
    expect(startInLibrary(a.library, 'feynman-loop', { rounds: 99 }).ok).toBe(false)
    expect(installIntoLibrary(lib, { id: 1 }).ok).toBe(false)
  })

  it('round-trips through JSON and survives corrupt storage', () => {
    let lib = emptyLibrary()
    for (const bp of SAMPLE_BLUEPRINTS) {
      const r = installIntoLibrary(lib, bp)
      if (r.ok) lib = r.library
    }
    const s = startInLibrary(lib, 'interleaved-set')
    if (s.ok) lib = s.library
    const back = parseLibrary(serializeLibrary(lib))
    expect(back.installed).toHaveLength(3)
    expect(back.sessions['interleaved-set']!.phaseId).toBe('topic-a')
    expect(parseLibrary(null)).toEqual(emptyLibrary())
    expect(parseLibrary('{not json')).toEqual(emptyLibrary())
    expect(parseLibrary('42')).toEqual(emptyLibrary())
    expect(parseLibrary('{"installed":[{"bad":1}],"sessions":{}}').installed).toEqual([])
  })

  it('drops sessions that no longer match their blueprint', () => {
    let lib = emptyLibrary()
    const a = installIntoLibrary(lib, SAMPLE_BLUEPRINTS[0])
    if (!a.ok) throw new Error('x')
    const s = startInLibrary(a.library, 'retrieval-sprint')
    if (!s.ok) throw new Error('x')
    lib = s.library
    const stale = JSON.parse(serializeLibrary(lib))
    stale.sessions['retrieval-sprint'].blueprintVersion = '0.0.1'
    expect(parseLibrary(JSON.stringify(stale)).sessions).toEqual({})
    const wrongPhase = JSON.parse(serializeLibrary(lib))
    wrongPhase.sessions['retrieval-sprint'].phaseId = 'ghost'
    expect(parseLibrary(JSON.stringify(wrongPhase)).sessions).toEqual({})
  })

  it('deduplicates blueprints with the same id on load', () => {
    const raw = JSON.stringify({
      installed: [SAMPLE_BLUEPRINTS[0], SAMPLE_BLUEPRINTS[0]],
      sessions: {},
    })
    expect(parseLibrary(raw).installed).toHaveLength(1)
  })
})
