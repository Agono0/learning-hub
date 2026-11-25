/**
 * Learning HUB — Feedback Literacy & Formative Assessment Studio
 *
 * Interactive studio grounded in:
 * - Hattie & Timperley (2007) — the four feedback levels (task, process,
 *   self-regulation, self) and the three feedback questions.
 * - Kluger & DeNisi (1996) — Feedback Intervention Theory: feedback that
 *   moves attention to the self depresses performance.
 * - Shute (2008) — formative feedback guidelines (specific, nonevaluative,
 *   manageable, scaffolded, process- and self-regulation-oriented).
 * - Butterfield & Metcalfe (2001) — hypercorrection of high-confidence errors.
 *
 * All computation runs locally against `@learning-hub/core/feedback-studio`;
 * the page works fully offline and with AI provider `none` (AGENTS.md rule 9).
 */

'use client'

import React, { useMemo, useState } from 'react'
import {
  auditFeedbackAgainstShute,
  calculateFLMetrics,
  classifyFeedbackStatement,
  FeedbackStatementSchema,
  generateFeedbackFSRSCards,
  getCanonicalFeedbackScenarios,
  gradeScenarioResponse,
  type FeedbackCard,
  type FeedbackClassification,
  type FLMetrics,
} from '@learning-hub/core/feedback-studio'
import { Badge, Button, Callout, FeedbackStudioHUD, Panel, StatCard, Tabs, TextArea } from '@/ui'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Download,
  Layers,
  ListChecks,
  MessageSquareText,
  Sparkles,
  XCircle,
} from 'lucide-react'

type StudioTab = 'practice' | 'analyzer' | 'deck'

const LEVEL_LABEL: Record<string, string> = {
  task: 'Task',
  process: 'Process',
  self_regulation: 'Self-regulation',
  self: 'Self',
}

const LEVEL_BADGE_TONE: Record<string, string> = {
  task: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  process: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  self_regulation: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  self: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
}

const RISK_LABEL: Record<string, string> = {
  trait_praise: 'Trait praise',
  normative_comparison: 'Normative comparison',
  content_free_praise: 'Content-free praise',
  ego_threat: 'Ego threat',
}

/** Practice tab: answer a misconception-tagged scenario, get 3-level feedback. */
function PracticePanel() {
  const scenarios = useMemo(() => getCanonicalFeedbackScenarios(), [])
  const [scenarioId, setScenarioId] = useState(scenarios[0].id)
  const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0]
  const [chosen, setChosen] = useState<string | null>(null)
  const [confidence, setConfidence] = useState(3)
  const [submitted, setSubmitted] = useState(false)

  const result = useMemo(() => {
    if (!submitted || !chosen) return null
    return gradeScenarioResponse({ scenarioId: scenario.id, optionId: chosen, confidence })
  }, [submitted, chosen, scenario.id, confidence])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="fb-scenario" className="text-sm text-neutral-600 dark:text-neutral-300">
          Scenario
        </label>
        <select
          id="fb-scenario"
          value={scenarioId}
          onChange={(e) => {
            setScenarioId(e.target.value)
            setChosen(null)
            setSubmitted(false)
          }}
          className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.domain} — {s.concept}
            </option>
          ))}
        </select>
        <Badge className="bg-neutral-500/10 text-neutral-600 dark:text-neutral-300">
          Difficulty {scenario.difficulty}/5
        </Badge>
      </div>

      <Panel>
        <p className="whitespace-pre-line text-sm font-medium">{scenario.stem}</p>
        <div className="mt-3 space-y-2">
          {scenario.options.map((o) => {
            const selected = chosen === o.id
            const showState = submitted
            const tone = showState
              ? o.isCorrect
                ? 'border-emerald-500/60 bg-emerald-500/5'
                : selected
                  ? 'border-rose-500/60 bg-rose-500/5'
                  : 'border-neutral-200 dark:border-neutral-700'
              : selected
                ? 'border-indigo-500/60 bg-indigo-500/5'
                : 'border-neutral-200 dark:border-neutral-700'
            return (
              <button
                key={o.id}
                type="button"
                disabled={submitted}
                onClick={() => setChosen(o.id)}
                className={`flex min-h-11 w-full items-start gap-2 rounded-xl border p-3 text-left text-sm transition-colors ${tone}`}
              >
                <span className="mt-0.5">
                  {showState && o.isCorrect ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : showState && selected ? (
                    <XCircle className="h-4 w-4 text-rose-500" />
                  ) : (
                    <span className="inline-block h-4 w-4 rounded-full border border-neutral-400" />
                  )}
                </span>
                <span>{o.text}</span>
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor="fb-confidence" className="text-sm text-neutral-600 dark:text-neutral-300">
            Confidence: <strong>{confidence}</strong>/5
          </label>
          <input
            id="fb-confidence"
            type="range"
            min={1}
            max={5}
            value={confidence}
            disabled={submitted}
            onChange={(e) => setConfidence(Number(e.target.value))}
            className="min-h-11 accent-indigo-500"
          />
          <Button
            disabled={!chosen || submitted}
            onClick={() => setSubmitted(true)}
            className="min-h-11"
          >
            Commit answer
          </Button>
          {submitted && (
            <Button
              variant="secondary"
              onClick={() => {
                setChosen(null)
                setSubmitted(false)
              }}
              className="min-h-11"
            >
              Try again
            </Button>
          )}
        </div>
      </Panel>

      {result && (
        <Panel>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {result.isCorrect ? (
              <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                Correct
              </Badge>
            ) : (
              <Badge className="bg-rose-500/10 text-rose-700 dark:text-rose-300">
                Misconception: {result.misconceptionTag}
              </Badge>
            )}
            {result.hypercorrectionFlag && (
              <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300">
                High-confidence error — prioritized for review
              </Badge>
            )}
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-semibold text-sky-700 dark:text-sky-300">Task level</p>
              <p>{result.feedback.task}</p>
            </div>
            <div>
              <p className="font-semibold text-violet-700 dark:text-violet-300">Process level</p>
              <p>{result.feedback.process}</p>
            </div>
            <div>
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                Self-regulation level
              </p>
              <p>{result.feedback.selfRegulation}</p>
            </div>
            <p className="border-t border-neutral-200 pt-2 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
              {result.scenario.explanation}
            </p>
          </div>
        </Panel>
      )}
    </div>
  )
}

/** Analyzer tab: classify pasted feedback statements and audit them. */
function AnalyzerPanel() {
  const [raw, setRaw] = useState('')
  const [classifications, setClassifications] = useState<FeedbackClassification[]>([])
  const [metrics, setMetrics] = useState<FLMetrics | null>(null)
  const [audits, setAudits] = useState<
    { guidelineId: string; status: string; rationale: string }[]
  >([])

  const analyze = () => {
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    const statements = lines.map((text, i) =>
      FeedbackStatementSchema.parse({ id: `stmt-${i + 1}`, text }),
    )
    setClassifications(statements.map(classifyFeedbackStatement))
    setMetrics(calculateFLMetrics(statements))
    setAudits(auditFeedbackAgainstShute(statements).audits)
  }

  return (
    <div className="space-y-4">
      <Panel>
        <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-300">
          Paste feedback statements (one per line). The transparent cue classifier assigns a Hattie
          &amp; Timperley level, flags FIT self-focus risks, and audits the set against Shute&apos;s
          formative guidelines.
        </p>
        <TextArea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={5}
          placeholder={'e.g. You are so smart, well done!\nCheck your units in step 2.'}
          aria-label="Feedback statements to analyze"
        />
        <div className="mt-3">
          <Button onClick={analyze} disabled={raw.trim().length === 0} className="min-h-11">
            <Sparkles className="mr-1 h-4 w-4" /> Analyze feedback
          </Button>
        </div>
      </Panel>

      {metrics && (
        <>
          <FeedbackStudioHUD
            feedbackQualityIndex={metrics.feedbackQualityIndex}
            formativeAlignmentScore={metrics.formativeAlignmentScore}
            levelBalanceScore={metrics.levelBalanceScore}
            selfFocusSafetyScore={metrics.selfFocusSafetyScore}
            statementCount={metrics.statementCount}
          />
          <Panel>
            <h3 className="mb-2 text-sm font-semibold">Per-statement classification</h3>
            <ul className="space-y-2 text-sm">
              {classifications.map((c) => (
                <li
                  key={c.statementId}
                  className="rounded-lg border border-neutral-200 p-2 dark:border-neutral-700"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={LEVEL_BADGE_TONE[c.level]}>{LEVEL_LABEL[c.level]}</Badge>
                    <span className="text-xs text-neutral-500">
                      confidence {(c.confidence * 100).toFixed(0)}%
                    </span>
                    {c.fitRisks.map((r) => (
                      <Badge key={r} className="bg-rose-500/10 text-rose-700 dark:text-rose-300">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        {RISK_LABEL[r]}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <h3 className="mb-2 text-sm font-semibold">Shute (2008) guideline audit</h3>
            <ul className="space-y-1 text-sm">
              {audits.map((a) => (
                <li key={a.guidelineId} className="flex items-start gap-2">
                  <span className="mt-0.5">
                    {a.status === 'pass' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : a.status === 'at_risk' ? (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-rose-500" />
                    )}
                  </span>
                  <span>
                    <strong>{a.guidelineId.replace('shute-', '').replace(/-/g, ' ')}</strong> —{' '}
                    {a.rationale}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}
      {metrics && metrics.statementCount > 0 && metrics.levelCounts.self > 0 && (
        <Callout tone="warning">
          Self-level feedback detected. Hattie &amp; Timperley (2007) and Kluger &amp; DeNisi (1996)
          both show person-directed evaluation is the least effective — and often harmful — form of
          feedback. Convert it to process or self-regulation feedback.
        </Callout>
      )}
    </div>
  )
}

/** Deck tab: preview and export the FSRS-6 bridge cards. */
function DeckPanel() {
  const cards = useMemo(() => generateFeedbackFSRSCards(), [])
  const download = () => {
    const payload = cards
      .map((c: FeedbackCard) => `${c.front}\n---\n${c.back}\ntags: ${c.tags.join(', ')}`)
      .join('\n\n=====\n\n')
    const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'feedback-studio-cards.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Total cards"
          value={cards.length}
          icon={<Layers className="h-4 w-4" />}
          accent="indigo"
        />
        <StatCard
          label="Concept cards"
          value={cards.filter((c) => c.tags.includes('concept')).length}
          icon={<BookOpen className="h-4 w-4" />}
          accent="emerald"
        />
        <StatCard
          label="Misconception cards"
          value={cards.filter((c) => c.tags.includes('misconception')).length}
          icon={<MessageSquareText className="h-4 w-4" />}
          accent="amber"
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
    </div>
  )
}

/** Root studio component: practice, analyzer, and FSRS deck tabs. */
export function FeedbackStudio() {
  const [tab, setTab] = useState<StudioTab>('practice')
  return (
    <div className="space-y-4">
      <Tabs<StudioTab>
        label="Feedback studio sections"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'practice', label: 'Practice', icon: <ListChecks className="h-4 w-4" /> },
          { key: 'analyzer', label: 'Analyzer', icon: <Sparkles className="h-4 w-4" /> },
          { key: 'deck', label: 'Deck', icon: <Layers className="h-4 w-4" /> },
        ]}
      />
      {tab === 'practice' && <PracticePanel />}
      {tab === 'analyzer' && <AnalyzerPanel />}
      {tab === 'deck' && <DeckPanel />}
    </div>
  )
}
