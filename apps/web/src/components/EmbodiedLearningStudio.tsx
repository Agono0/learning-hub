'use client'

/**
 * Embodied Learning & Gesture Studio: an embodied-cognition practice loop.
 * Loads canonical scenarios, lets the learner evaluate gesture plans, probe
 * gesture-speech mismatch, validate concreteness-fading ladders and score
 * enactment sessions. All logic lives in @learning-hub/core/embodied-learning.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Hand, Activity, Layers, Footprints } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { Badge, Button, Callout, Panel, StatCard, Tabs, TextArea, TextField } from '@/ui'

interface GestureSpec {
  element: string
  channel: string
  gestureDescription: string
  verbalAnchor: string
  rationale: string
}

interface Scenario {
  id: string
  title: string
  domain: string
  concept: string
  whyEmbodied: string
  gesturePlan: GestureSpec[]
  ladder: { concept: string; rungs: { modality: string; activity: string; bridgePrompt: string }[] }
  tracingExercise: string
  enactmentTask: { verbalVersion: string; enactedVersion: string; domain: string }
  reflectionPrompts: string[]
  citations: string[]
}

interface LibraryResponse {
  scenarios: Scenario[]
  phases: string[]
}

interface PlanReport {
  coveredElements: string[]
  missingElements: string[]
  channels: string[]
  advice: string[]
}

interface MismatchReport {
  alignedCount: number
  mismatchCount: number
  mismatchRate: number
  transitional: boolean
  coaching: string[]
}

interface LadderReport {
  valid: boolean
  problems: string[]
}

interface EnactmentReport {
  enactedRecall: number
  verbalRecall: number
  enactmentAdvantage: number
  interpretation: string
}

export function EmbodiedLearningStudio() {
  const { data, isLoading } = useQuery({
    queryKey: ['embodied-learning'],
    queryFn: () => apiGet<LibraryResponse>('/api/embodied-learning'),
  })
  const [tab, setTab] = useState('scenarios')
  const [scenario, setScenario] = useState<Scenario | null>(null)

  // Gesture plan evaluation state
  const [elementsText, setElementsText] = useState('')
  const [planReport, setPlanReport] = useState<PlanReport | null>(null)

  // Mismatch state
  const [mismatchText, setMismatchText] = useState('')
  const [mismatchReport, setMismatchReport] = useState<MismatchReport | null>(null)

  // Enactment state
  const [enactedHits, setEnactedHits] = useState('0')
  const [enactedTotal, setEnactedTotal] = useState('0')
  const [verbalHits, setVerbalHits] = useState('0')
  const [verbalTotal, setVerbalTotal] = useState('0')
  const [enactmentReport, setEnactmentReport] = useState<EnactmentReport | null>(null)

  async function loadScenario(id: string) {
    const res = await apiSend<{ scenario: Scenario }>('/api/embodied-learning', 'POST', {
      action: 'scenario',
      id,
    })
    setScenario(res.scenario)
    setElementsText(res.scenario.gesturePlan.map((g) => g.element).join('\n'))
    setTab('ground')
  }

  async function runPlanEvaluation() {
    if (!scenario) return
    const coreElements = elementsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const report = await apiSend<PlanReport>('/api/embodied-learning', 'POST', {
      action: 'evaluate-plan',
      plan: scenario.gesturePlan,
      coreElements,
    })
    setPlanReport(report)
  }

  async function runMismatch() {
    const samples = mismatchText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [speechClaim, gestureClaim] = line.split('|').map((s) => s.trim())
        return { speechClaim: speechClaim ?? '', gestureClaim: gestureClaim ?? '' }
      })
      .filter((s) => s.speechClaim.length > 0 && s.gestureClaim.length > 0)
    const report = await apiSend<MismatchReport>('/api/embodied-learning', 'POST', {
      action: 'analyze-mismatch',
      samples,
    })
    setMismatchReport(report)
  }

  async function runLadderCheck() {
    if (!scenario) return
    await apiSend<LadderReport>('/api/embodied-learning', 'POST', {
      action: 'validate-ladder',
      ladder: scenario.ladder,
    })
  }

  async function runEnactment() {
    const enactedCount = Number(enactedTotal) || 0
    const verbalCount = Number(verbalTotal) || 0
    const report = await apiSend<EnactmentReport>('/api/embodied-learning', 'POST', {
      action: 'score-enactment',
      session: {
        taskCount: enactedCount + verbalCount || 1,
        enactedCount,
        recallHitsEnacted: Number(enactedHits) || 0,
        recallHitsVerbal: Number(verbalHits) || 0,
        verbalCount,
      },
    })
    setEnactmentReport(report)
  }

  if (isLoading) return <p className="text-sm text-neutral-500">Loading…</p>

  return (
    <div className="space-y-4">
      <Tabs
        label="Studio phases"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'scenarios', label: 'Scenarios' },
          { value: 'ground', label: 'Ground', disabled: !scenario },
          { value: 'gesture', label: 'Gesture', disabled: !scenario },
          { value: 'mismatch', label: 'Mismatch', disabled: !scenario },
          { value: 'fade', label: 'Fade', disabled: !scenario },
          { value: 'enact', label: 'Enact', disabled: !scenario },
        ]}
      />

      {tab === 'scenarios' && (
        <Panel>
          <div className="space-y-3">
            <p className="text-sm text-neutral-600">
              Pick a canonical scenario. Each one pairs a concept with a gesture plan, a
              concreteness-fading ladder, a tracing exercise and an enactment task.
            </p>
            <ul className="space-y-2">
              {(data?.scenarios ?? []).map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="text-xs text-neutral-500">{s.concept}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">{s.domain}</Badge>
                    <Button variant="secondary" onClick={() => void loadScenario(s.id)}>
                      Open
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      )}

      {tab === 'ground' && scenario && (
        <Panel>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Ground the concept in the body</h3>
            <Callout tone="accent">{scenario.whyEmbodied}</Callout>
            <div>
              <p className="text-xs font-medium uppercase text-neutral-500">Tracing exercise</p>
              <p className="text-sm text-neutral-700">{scenario.tracingExercise}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-neutral-500">Sources</p>
              <ul className="list-disc pl-5 text-xs text-neutral-500">
                {scenario.citations.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
            <Button variant="primary" onClick={() => setTab('gesture')}>
              Continue to gesture plan
            </Button>
          </div>
        </Panel>
      )}

      {tab === 'gesture' && scenario && (
        <Panel>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Gesture plan</h3>
            <ul className="space-y-2">
              {scenario.gesturePlan.map((g) => (
                <li key={g.element} className="rounded-lg border border-neutral-200 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{g.element}</p>
                    <Badge tone="accent">{g.channel}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-neutral-700">{g.gestureDescription}</p>
                  <p className="mt-1 text-xs text-neutral-500">Say: {g.verbalAnchor}</p>
                </li>
              ))}
            </ul>
            <TextArea
              label="Core elements to cover (one per line)"
              value={elementsText}
              onChange={(e) => setElementsText(e.target.value)}
              rows={4}
              placeholder="One concept element per line"
            />
            <Button variant="primary" onClick={() => void runPlanEvaluation()}>
              Evaluate plan coverage
            </Button>
            {planReport && (
              <Callout tone={planReport.missingElements.length === 0 ? 'success' : 'warning'}>
                <ul className="list-disc pl-5 text-sm">
                  {planReport.advice.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </Callout>
            )}
          </div>
        </Panel>
      )}

      {tab === 'mismatch' && scenario && (
        <Panel>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Gesture-speech mismatch check</h3>
            <p className="text-sm text-neutral-600">
              Explain the concept aloud while gesturing, then record what you said and what your
              hands showed, one pair per line, separated by a pipe: said | showed.
            </p>
            <TextArea
              label="Explanation samples (said | showed)"
              value={mismatchText}
              onChange={(e) => setMismatchText(e.target.value)}
              rows={5}
              placeholder={
                'the slope is positive | hand tilts down\nsix eighths fit | six eighths fit'
              }
            />
            <Button variant="primary" onClick={() => void runMismatch()}>
              Analyze mismatch
            </Button>
            {mismatchReport && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <StatCard
                    label="Aligned"
                    value={mismatchReport.alignedCount}
                    icon={<Hand className="h-4 w-4" />}
                  />
                  <StatCard
                    label="Mismatched"
                    value={mismatchReport.mismatchCount}
                    icon={<Activity className="h-4 w-4" />}
                  />
                  <StatCard
                    label="Mismatch rate"
                    value={`${Math.round(mismatchReport.mismatchRate * 100)}%`}
                    icon={<Layers className="h-4 w-4" />}
                  />
                </div>
                <Callout tone={mismatchReport.transitional ? 'accent' : 'neutral'}>
                  {mismatchReport.transitional && (
                    <Badge tone="accent">Transitional state: prime moment for instruction</Badge>
                  )}
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {mismatchReport.coaching.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </Callout>
              </div>
            )}
          </div>
        </Panel>
      )}

      {tab === 'fade' && scenario && (
        <Panel>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Concreteness-fading ladder</h3>
            <ol className="space-y-2">
              {scenario.ladder.rungs.map((rung, i) => (
                <li key={i} className="rounded-lg border border-neutral-200 p-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={rung.modality === 'symbolic' ? 'accent' : 'neutral'}>
                      {rung.modality}
                    </Badge>
                    <p className="text-sm font-medium">Rung {i + 1}</p>
                  </div>
                  <p className="mt-1 text-sm text-neutral-700">{rung.activity}</p>
                  <p className="mt-1 text-xs text-neutral-500">Bridge: {rung.bridgePrompt}</p>
                </li>
              ))}
            </ol>
            <Button variant="secondary" onClick={() => void runLadderCheck()}>
              Validate ladder structure
            </Button>
          </div>
        </Panel>
      )}

      {tab === 'enact' && scenario && (
        <Panel>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Enactment practice</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <Callout tone="neutral">
                <p className="text-xs font-medium uppercase">Verbal version</p>
                <p className="text-sm">{scenario.enactmentTask.verbalVersion}</p>
              </Callout>
              <Callout tone="accent">
                <p className="text-xs font-medium uppercase">Enacted version</p>
                <p className="text-sm">{scenario.enactmentTask.enactedVersion}</p>
              </Callout>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <TextField
                label="Enacted tasks"
                value={enactedTotal}
                onChange={(e) => setEnactedTotal(e.target.value)}
              />
              <TextField
                label="Enacted recalled"
                value={enactedHits}
                onChange={(e) => setEnactedHits(e.target.value)}
              />
              <TextField
                label="Verbal tasks"
                value={verbalTotal}
                onChange={(e) => setVerbalTotal(e.target.value)}
              />
              <TextField
                label="Verbal recalled"
                value={verbalHits}
                onChange={(e) => setVerbalHits(e.target.value)}
              />
            </div>
            <Button variant="primary" onClick={() => void runEnactment()}>
              Score session
            </Button>
            {enactmentReport && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <StatCard
                    label="Enacted recall"
                    value={`${Math.round(enactmentReport.enactedRecall * 100)}%`}
                    icon={<Footprints className="h-4 w-4" />}
                  />
                  <StatCard
                    label="Verbal recall"
                    value={`${Math.round(enactmentReport.verbalRecall * 100)}%`}
                    icon={<Hand className="h-4 w-4" />}
                  />
                  <StatCard
                    label="Enactment advantage"
                    value={`${Math.round(enactmentReport.enactmentAdvantage * 100)} pts`}
                    icon={<Activity className="h-4 w-4" />}
                  />
                </div>
                <Callout tone="success">
                  <p className="text-sm">{enactmentReport.interpretation}</p>
                </Callout>
              </div>
            )}
            <div>
              <p className="text-xs font-medium uppercase text-neutral-500">Reflection</p>
              <ul className="list-disc pl-5 text-sm text-neutral-700">
                {scenario.reflectionPrompts.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>
      )}
    </div>
  )
}
