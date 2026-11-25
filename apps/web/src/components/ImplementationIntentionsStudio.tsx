/**
 * Learning HUB — Implementation Intentions & Habit Formation Studio
 *
 * Interactive studio grounded in:
 * - Gollwitzer (1999); Gollwitzer & Sheeran (2006) — if-then plans (d ≈ 0.65)
 * - Lally, van Jaarsveld, Potts & Wardle (2009) — asymptotic automaticity
 *   growth, median 66 days to 95% (range 18-254)
 * - Oettingen & Gollwitzer (2010) — Mental Contrasting with Implementation
 *   Intentions (MCII)
 *
 * All computation runs locally against
 * `@learning-hub/core/implementation-intentions`; fully usable offline and
 * with AI provider `none`.
 */

'use client'

import React, { useMemo, useState } from 'react'
import {
  evaluatePlanQuality,
  generateIIFSRSCards,
  getCanonicalPlanTemplates,
  IfThenPlanSchema,
  instantiateTemplate,
  OBSTACLE_LIBRARY,
  projectAutomaticity,
  type AutomaticityProjection,
  type PlanQuality,
} from '@learning-hub/core/implementation-intentions'
import { Badge, Button, Callout, Panel, StatCard, Tabs, TextField } from '@/ui'
import {
  CalendarClock,
  ClipboardList,
  Compass,
  Download,
  Layers,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react'

type StudioTab = 'builder' | 'projection' | 'deck'

const TRIGGER_KINDS = [
  { value: 'event', label: 'Event (after an existing routine)' },
  { value: 'place', label: 'Place (when I arrive/sit at …)' },
  { value: 'time', label: 'Time (at a clock time)' },
  { value: 'internal_state', label: 'Internal state (if I feel …)' },
] as const

function qualityTone(score: number): string {
  if (score >= 70) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 45) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

/** Builder tab: draft an if-then plan (optionally from a template) and score it. */
function BuilderPanel() {
  const templates = useMemo(() => getCanonicalPlanTemplates(), [])
  const [templateId, setTemplateId] = useState(templates[0].id)
  const [goal, setGoal] = useState('')
  const [trigger, setTrigger] = useState('')
  const [triggerKind, setTriggerKind] = useState<(typeof TRIGGER_KINDS)[number]['value']>('event')
  const [action, setAction] = useState('')
  const [obstacle, setObstacle] = useState('')
  const [obstacleResponse, setObstacleResponse] = useState('')
  const [quality, setQuality] = useState<PlanQuality | null>(null)

  const loadTemplate = () => {
    const plan = instantiateTemplate(templateId, goal || 'My goal')
    setTrigger(plan.trigger)
    setTriggerKind(plan.triggerKind)
    setAction(plan.action)
    setObstacle(plan.obstacle ?? '')
    setObstacleResponse(plan.obstacleResponse ?? '')
    setQuality(null)
  }

  const evaluate = () => {
    const parsed = IfThenPlanSchema.safeParse({
      id: 'draft',
      goal: goal || 'My goal',
      trigger,
      triggerKind,
      action,
      obstacle: obstacle || undefined,
      obstacleResponse: obstacleResponse || undefined,
    })
    if (parsed.success) setQuality(evaluatePlanQuality(parsed.data))
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="ii-template"
              className="mb-1 block text-sm text-neutral-600 dark:text-neutral-300"
            >
              Start from a template
            </label>
            <select
              id="ii-template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.habitName} ({t.domain})
                </option>
              ))}
            </select>
          </div>
          <TextField
            label="Your goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Master linear algebra"
            className="min-w-56"
          />
          <Button variant="secondary" onClick={loadTemplate} className="min-h-11">
            <Compass className="mr-1 h-4 w-4" /> Load template
          </Button>
        </div>
      </Panel>

      <Panel>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="IF (critical situation)"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            placeholder="After I finish breakfast at the kitchen table"
          />
          <div>
            <label
              htmlFor="ii-kind"
              className="mb-1 block text-sm text-neutral-600 dark:text-neutral-300"
            >
              Trigger kind
            </label>
            <select
              id="ii-kind"
              value={triggerKind}
              onChange={(e) =>
                setTriggerKind(e.target.value as (typeof TRIGGER_KINDS)[number]['value'])
              }
              className="min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              {TRIGGER_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <TextField
            label="THEN (concrete first action)"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="I open the review queue and complete my due cards"
            className="sm:col-span-2"
          />
          <TextField
            label="Standing obstacle (MCII)"
            value={obstacle}
            onChange={(e) => setObstacle(e.target.value)}
            placeholder="Phone notifications pull me away"
          />
          <TextField
            label="If-obstacle coping response"
            value={obstacleResponse}
            onChange={(e) => setObstacleResponse(e.target.value)}
            placeholder="If a notification appears, then I note it and return"
          />
        </div>
        <div className="mt-3">
          <Button
            onClick={evaluate}
            disabled={trigger.trim().length === 0 || action.trim().length === 0}
            className="min-h-11"
          >
            <Sparkles className="mr-1 h-4 w-4" /> Evaluate plan
          </Button>
        </div>
      </Panel>

      {quality && (
        <Panel>
          <div className="mb-3 flex items-baseline gap-3">
            <span className="text-sm text-neutral-500">Plan Quality Index</span>
            <span
              className={`text-3xl font-bold tabular-nums ${qualityTone(quality.qualityIndex)}`}
            >
              {quality.qualityIndex}
            </span>
            <span className="text-xs text-neutral-500">/ 100</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['Trigger specificity', quality.triggerSpecificity],
                ['Action operationality', quality.actionOperationality],
                ['Cue reliability', quality.cueReliability],
                ['Obstacle coverage (MCII)', quality.obstacleCoverage],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="space-y-1">
                <div className="flex justify-between text-xs text-neutral-600 dark:text-neutral-300">
                  <span>{label}</span>
                  <span className="tabular-nums font-semibold">{value}</span>
                </div>
                <div className="h-1.5 rounded-full bg-neutral-200/70 dark:bg-neutral-700/50">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-600 dark:text-neutral-300">
            {quality.rationales.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          {quality.obstacleCoverage < 50 && (
            <div className="mt-3">
              <Callout tone="warning">
                Mental contrasting doubles the technique: name the obstacle that usually kills this
                habit and plan the if-then response to it (Oettingen &amp; Gollwitzer 2010).
              </Callout>
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}

/** Projection tab: automaticity curve from a simulated adherence record. */
function ProjectionPanel() {
  const [daysCount, setDaysCount] = useState(30)
  const [adherencePct, setAdherencePct] = useState(80)
  const [complexity, setComplexity] = useState(1)
  const [projection, setProjection] = useState<AutomaticityProjection | null>(null)

  const compute = () => {
    const record = Array.from({ length: daysCount }, (_, i) => ({
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      performed: (i * 100) % 100 < adherencePct || i % 100 < adherencePct,
    }))
    setProjection(projectAutomaticity(record, complexity))
  }

  return (
    <div className="space-y-4">
      <Panel>
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-300">
          Simulate an adherence record and project habit automaticity on the Lally et al. (2009)
          curve. Perfect adherence reaches ~95% at the 66-day median; missed days forgo their gain
          but do not reset progress.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField
            label="Days practiced so far"
            type="number"
            min={0}
            max={365}
            value={daysCount}
            onChange={(e) => setDaysCount(Number(e.target.value))}
          />
          <TextField
            label="Adherence (%)"
            type="number"
            min={0}
            max={100}
            value={adherencePct}
            onChange={(e) => setAdherencePct(Number(e.target.value))}
          />
          <TextField
            label="Behavior complexity (1 = simple)"
            type="number"
            min={0.25}
            max={3}
            step={0.1}
            value={complexity}
            onChange={(e) => setComplexity(Number(e.target.value))}
          />
        </div>
        <div className="mt-3">
          <Button onClick={compute} className="min-h-11">
            <TrendingUp className="mr-1 h-4 w-4" /> Project automaticity
          </Button>
        </div>
      </Panel>

      {projection && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Current automaticity"
              value={`${projection.currentStrength}%`}
              icon={<Target className="h-4 w-4" />}
              accent="indigo"
              progress={{ value: projection.currentStrength, max: 100 }}
            />
            <StatCard
              label="Days to ~95%"
              value={projection.daysToAutomaticity}
              icon={<CalendarClock className="h-4 w-4" />}
              accent="emerald"
              hint={`Reference median: ${projection.referenceMedianDays} days (Lally 2009)`}
            />
            <StatCard
              label="Adherence"
              value={`${Math.round(projection.adherenceRate * 100)}%`}
              icon={<ClipboardList className="h-4 w-4" />}
              accent="amber"
              hint={`Current streak: ${projection.currentStreak} days`}
            />
          </div>
          <Callout tone="neutral">{projection.caveat}</Callout>
        </>
      )}
    </div>
  )
}

/** Deck tab: FSRS-6 bridge cards for plan anatomy and obstacle drills. */
function DeckPanel() {
  const cards = useMemo(() => generateIIFSRSCards(), [])
  const download = () => {
    const payload = cards
      .map((c) => `${c.front}\n---\n${c.back}\ntags: ${c.tags.join(', ')}`)
      .join('\n\n=====\n\n')
    const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'implementation-intentions-cards.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label="Plan-anatomy cards"
          value={cards.filter((c) => c.tags.includes('plan-anatomy')).length}
          icon={<Layers className="h-4 w-4" />}
          accent="indigo"
        />
        <StatCard
          label="Obstacle drills (MCII)"
          value={cards.filter((c) => c.tags.includes('obstacle')).length}
          icon={<Target className="h-4 w-4" />}
          accent="emerald"
        />
      </div>
      <Panel>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">FSRS-6 bridge deck</h3>
          <Button variant="secondary" onClick={download} className="min-h-11">
            <Download className="mr-1 h-4 w-4" /> Export
          </Button>
        </div>
        <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
          {cards.map((c) => (
            <li
              key={c.sourceRef}
              className="rounded-lg border border-neutral-200 p-2 dark:border-neutral-700"
            >
              <p className="line-clamp-2 font-medium">{c.front}</p>
              <p className="mt-1 text-xs text-neutral-500">{c.tags.join(' · ')}</p>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel>
        <h3 className="mb-2 text-sm font-semibold">Obstacle library</h3>
        <ul className="space-y-2 text-sm">
          {OBSTACLE_LIBRARY.map((o) => (
            <li key={o.id}>
              <Badge className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                {o.category}
              </Badge>{' '}
              <strong>{o.obstacle}</strong> — {o.responsePattern}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}

/** Root studio component: plan builder, automaticity projection, FSRS deck. */
export function ImplementationIntentionsStudio() {
  const [tab, setTab] = useState<StudioTab>('builder')
  return (
    <div className="space-y-4">
      <Tabs<StudioTab>
        label="Implementation intentions sections"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'builder', label: 'Plan builder', icon: <ClipboardList className="h-4 w-4" /> },
          { key: 'projection', label: 'Automaticity', icon: <TrendingUp className="h-4 w-4" /> },
          { key: 'deck', label: 'Deck', icon: <Layers className="h-4 w-4" /> },
        ]}
      />
      {tab === 'builder' && <BuilderPanel />}
      {tab === 'projection' && <ProjectionPanel />}
      {tab === 'deck' && <DeckPanel />}
    </div>
  )
}
