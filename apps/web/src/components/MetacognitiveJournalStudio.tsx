'use client'

/**
 * Metacognitive Journal & Reflection Studio.
 *
 * Implements structured reflection frameworks and metacognitive calibration:
 * - Gibbs Reflective Cycle (Gibbs 1988)
 * - Cognitive Friction Audit & Implementation Intentions (Gollwitzer 1999)
 * - Judgment of Learning (JOL) Calibration & Overconfidence Diagnostics (Dunlosky & Metcalfe 2009)
 * - One-click conversion of takeaways into active recall spaced flashcards
 */
import { useId, useMemo, useState } from 'react'
import { BookOpen, Brain, CheckCircle2, Gauge, Plus, RefreshCw, Sparkles, Zap } from 'lucide-react'
import {
  analyzeMetacognitiveCalibration,
  formatFrictionMarkdown,
  formatGibbsMarkdown,
  generateMetacognitiveActionCard,
  type FrictionAuditSteps,
  type GibbsReflectionSteps,
  type MetacognitiveFramework,
} from '@learning-hub/core'
import { Badge, Button, Callout, Panel } from '@/ui'

export interface MetacognitiveJournalStudioProps {
  onSaveToJournal: (text: string) => Promise<void>
  onCreateActionCard?: (card: { front: string; back: string }) => Promise<void>
  weeklyStats?: {
    totalReviews: number
    totalFocusMinutes: number
    habitsDone: number
    moodAvg: number | null
  }
}

export function MetacognitiveJournalStudio({
  onSaveToJournal,
  onCreateActionCard,
  weeklyStats,
}: MetacognitiveJournalStudioProps) {
  const [activeTab, setActiveTab] = useState<MetacognitiveFramework | 'calibration'>('gibbs')
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [cardCreatedMsg, setCardCreatedMsg] = useState<string | null>(null)

  // Gibbs Reflective Cycle state
  const [gibbs, setGibbs] = useState<GibbsReflectionSteps>({
    description: '',
    feelings: '',
    evaluation: '',
    analysis: '',
    conclusion: '',
    actionPlan: '',
  })

  // Friction Audit state
  const [friction, setFriction] = useState<FrictionAuditSteps>({
    frictionTrigger: '',
    cognitiveBottleneck: '',
    emotionalState: '',
    microIntervention: '',
    accountabilityAnchor: '',
  })

  // Calibration state
  const [predictedScore, setPredictedScore] = useState(85)
  const [actualScore, setActualScore] = useState(70)

  // Single-takeaway card generator state
  const [actionTakeaway, setActionTakeaway] = useState('')
  const [actionRule, setActionRule] = useState('')

  const calibrationResult = useMemo(
    () => analyzeMetacognitiveCalibration(predictedScore, actualScore),
    [predictedScore, actualScore],
  )

  const formattedMarkdown = useMemo(() => {
    if (activeTab === 'gibbs') return formatGibbsMarkdown(gibbs)
    if (activeTab === 'friction_audit') return formatFrictionMarkdown(friction)
    return `### Metacognitive Calibration Analysis\n- **Predicted vs Actual**: ${predictedScore}% vs ${actualScore}%\n- **Diagnosis**: ${calibrationResult.diagnosis}\n- **Remediation**: ${calibrationResult.remediationStrategy}`
  }, [activeTab, gibbs, friction, predictedScore, actualScore, calibrationResult])

  async function handleSave() {
    setIsSaving(true)
    try {
      await onSaveToJournal(formattedMarkdown)
      setSaveSuccess('Reflection saved to daily journal!')
      setTimeout(() => setSaveSuccess(null), 3000)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleCreateCard() {
    if (!actionTakeaway.trim() || !actionRule.trim()) return
    const cardData = generateMetacognitiveActionCard(
      activeTab === 'calibration' ? 'gibbs' : activeTab,
      {
        keyTakeaway: actionTakeaway,
        actionableBehavior: actionRule,
      },
    )

    if (onCreateActionCard) {
      await onCreateActionCard({
        front: cardData.prompt,
        back: cardData.solution,
      })
      setCardCreatedMsg('Action flashcard created!')
      setTimeout(() => setCardCreatedMsg(null), 3000)
      setActionTakeaway('')
      setActionRule('')
    }
  }

  const predScoreId = useId()
  const actScoreId = useId()

  return (
    <div className="space-y-6">
      {/* Framework Selector Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('gibbs')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            activeTab === 'gibbs'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
          }`}
        >
          <RefreshCw className="h-4 w-4" />
          <span>Gibbs Reflective Cycle</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('friction_audit')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            activeTab === 'friction_audit'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Zap className="h-4 w-4" />
          <span>Cognitive Friction Audit</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('calibration')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            activeTab === 'calibration'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Gauge className="h-4 w-4" />
          <span>JOL Calibration Radar</span>
        </button>
      </div>

      {/* Weekly Metacognitive Progress Summary */}
      {weeklyStats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <span className="text-[10px] uppercase font-semibold text-neutral-400">
              Reviews Done
            </span>
            <div className="text-xl font-bold text-white mt-0.5">{weeklyStats.totalReviews}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <span className="text-[10px] uppercase font-semibold text-neutral-400">Deep Focus</span>
            <div className="text-xl font-bold text-white mt-0.5">
              {weeklyStats.totalFocusMinutes}m
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <span className="text-[10px] uppercase font-semibold text-neutral-400">
              Habit Streaks
            </span>
            <div className="text-xl font-bold text-white mt-0.5">
              {weeklyStats.habitsDone} check-ins
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <span className="text-[10px] uppercase font-semibold text-neutral-400">Avg Mood</span>
            <div className="text-xl font-bold text-white mt-0.5">
              {weeklyStats.moodAvg ? `${weeklyStats.moodAvg}/5` : '—'}
            </div>
          </div>
        </div>
      )}

      {/* Main Tab Content */}
      {activeTab === 'gibbs' && (
        <Panel
          title={
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-indigo-400" />
              <span>Gibbs Experiential Reflective Cycle (1988)</span>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-xs text-neutral-400">
              Transform passive experience into active insight across 6 guided stages.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-300">
                  1. Description: What happened?
                </label>
                <textarea
                  className="input w-full h-20 text-xs"
                  placeholder="e.g. In today's algorithms session, I got stuck on the Dijkstra implementation..."
                  value={gibbs.description}
                  onChange={(e) => setGibbs({ ...gibbs, description: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-300">
                  2. Feelings: Thoughts & emotions?
                </label>
                <textarea
                  className="input w-full h-20 text-xs"
                  placeholder="e.g. Felt imposter anxiety when the priority queue edge case failed..."
                  value={gibbs.feelings}
                  onChange={(e) => setGibbs({ ...gibbs, feelings: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-300">
                  3. Evaluation: Good vs Bad?
                </label>
                <textarea
                  className="input w-full h-20 text-xs"
                  placeholder="e.g. Good: understood the greedy choice property. Bad: rushed into code without pseudocode."
                  value={gibbs.evaluation}
                  onChange={(e) => setGibbs({ ...gibbs, evaluation: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-300">
                  4. Analysis: Sense-making & causes?
                </label>
                <textarea
                  className="input w-full h-20 text-xs"
                  placeholder="e.g. Fell into the Illusion of Competence because I had read the solution yesterday."
                  value={gibbs.analysis}
                  onChange={(e) => setGibbs({ ...gibbs, analysis: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-300">
                  5. Conclusion: What else could you do?
                </label>
                <textarea
                  className="input w-full h-20 text-xs"
                  placeholder="e.g. Trace on whiteboard with 3 graph nodes before opening IDE."
                  value={gibbs.conclusion}
                  onChange={(e) => setGibbs({ ...gibbs, conclusion: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-300">
                  6. Action Plan: Next time commitment?
                </label>
                <textarea
                  className="input w-full h-20 text-xs"
                  placeholder="e.g. Enforce 5-minute pencil-and-paper dry run before typing any code."
                  value={gibbs.actionPlan}
                  onChange={(e) => setGibbs({ ...gibbs, actionPlan: e.target.value })}
                />
              </div>
            </div>
          </div>
        </Panel>
      )}

      {activeTab === 'friction_audit' && (
        <Panel
          title={
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <span>Cognitive Friction Audit & Habit Loop Dismantling</span>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-xs text-neutral-400">
              Pinpoint the exact moment cognitive friction or distraction occurred and establish a
              micro-intervention.
            </p>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-300">
                  Friction Trigger Point
                </label>
                <input
                  type="text"
                  className="input w-full text-xs"
                  placeholder="e.g. Reached difficult section in physics chapter and immediately opened browser tab"
                  value={friction.frictionTrigger}
                  onChange={(e) => setFriction({ ...friction, frictionTrigger: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-300">
                    Cognitive Bottleneck
                  </label>
                  <input
                    type="text"
                    className="input w-full text-xs"
                    placeholder="e.g. High extraneous cognitive load / unclear notation"
                    value={friction.cognitiveBottleneck}
                    onChange={(e) =>
                      setFriction({ ...friction, cognitiveBottleneck: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-300">
                    Emotional Arousal State
                  </label>
                  <input
                    type="text"
                    className="input w-full text-xs"
                    placeholder="e.g. Subtle frustration / fear of failure"
                    value={friction.emotionalState}
                    onChange={(e) => setFriction({ ...friction, emotionalState: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-300">
                  Micro-Intervention (2-Minute Rule)
                </label>
                <input
                  type="text"
                  className="input w-full text-xs"
                  placeholder="e.g. Take 3 deep breaths and write down only the single next equation on paper"
                  value={friction.microIntervention}
                  onChange={(e) => setFriction({ ...friction, microIntervention: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-300">
                  Accountability Anchor
                </label>
                <input
                  type="text"
                  className="input w-full text-xs"
                  placeholder="e.g. Log focus session in Learning HUB timer before touching keyboard"
                  value={friction.accountabilityAnchor}
                  onChange={(e) =>
                    setFriction({ ...friction, accountabilityAnchor: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
        </Panel>
      )}

      {activeTab === 'calibration' && (
        <Panel
          title={
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-emerald-400" />
              <span>Judgment of Learning (JOL) Calibration Radar</span>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-xs text-neutral-400">
              Calibrate your subjective confidence against objective performance (Dunlosky &
              Metcalfe 2009).
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3">
                <div className="flex justify-between items-center">
                  <label htmlFor={predScoreId} className="text-xs font-semibold text-neutral-300">
                    Predicted Score / Subjective Confidence
                  </label>
                  <span className="text-sm font-bold font-mono text-indigo-400">
                    {predictedScore}%
                  </span>
                </div>
                <input
                  id={predScoreId}
                  type="range"
                  min="0"
                  max="100"
                  value={predictedScore}
                  onChange={(e) => setPredictedScore(Number(e.target.value))}
                  className="w-full accent-indigo-400"
                />
              </div>

              <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3">
                <div className="flex justify-between items-center">
                  <label htmlFor={actScoreId} className="text-xs font-semibold text-neutral-300">
                    Actual Objective Score
                  </label>
                  <span className="text-sm font-bold font-mono text-emerald-400">
                    {actualScore}%
                  </span>
                </div>
                <input
                  id={actScoreId}
                  type="range"
                  min="0"
                  max="100"
                  value={actualScore}
                  onChange={(e) => setActualScore(Number(e.target.value))}
                  className="w-full accent-emerald-400"
                />
              </div>
            </div>

            {/* Calibration Verdict Card */}
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-indigo-400" />
                  <span className="text-sm font-bold text-white">Calibration Verdict</span>
                </div>

                <Badge
                  tone={
                    calibrationResult.calibrationZone === 'well_calibrated'
                      ? 'success'
                      : calibrationResult.calibrationZone === 'overconfident'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {calibrationResult.calibrationZone.toUpperCase()} (
                  {calibrationResult.biasPct > 0
                    ? `+${calibrationResult.biasPct}%`
                    : `${calibrationResult.biasPct}%`}
                  )
                </Badge>
              </div>

              <Callout
                tone={
                  calibrationResult.calibrationZone === 'well_calibrated'
                    ? 'success'
                    : calibrationResult.calibrationZone === 'overconfident'
                      ? 'danger'
                      : 'warning'
                }
              >
                <div className="space-y-1 text-xs">
                  <p className="font-semibold">{calibrationResult.diagnosis}</p>
                  <p className="opacity-90">{calibrationResult.remediationStrategy}</p>
                </div>
              </Callout>
            </div>
          </div>
        </Panel>
      )}

      {/* Convert Insight into Action Flashcard */}
      <Panel
        title={
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-400" />
            <span>Convert Reflection to Spaced Action Flashcard</span>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-neutral-400">
            Immortalize your metacognitive breakthrough by turning it into an active recall card in
            your deck.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-neutral-300">
                Identified Cognitive Trap
              </label>
              <input
                type="text"
                className="input w-full text-xs"
                placeholder="e.g. Coding immediately without drawing the recursive state diagram"
                value={actionTakeaway}
                onChange={(e) => setActionTakeaway(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-neutral-300">
                Committed Action Rule
              </label>
              <input
                type="text"
                className="input w-full text-xs"
                placeholder="e.g. Enforce 5-minute pencil-and-paper dry run before typing any code"
                value={actionRule}
                onChange={(e) => setActionRule(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            {cardCreatedMsg ? (
              <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" /> {cardCreatedMsg}
              </span>
            ) : (
              <div />
            )}

            <Button
              variant="primary"
              onClick={handleCreateCard}
              disabled={!actionTakeaway.trim() || !actionRule.trim()}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Create Flashcard
            </Button>
          </div>
        </div>
      </Panel>

      {/* Formatted Preview & Save Action */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5">
        <div>
          {saveSuccess && (
            <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" /> {saveSuccess}
            </span>
          )}
        </div>

        <Button variant="primary" onClick={handleSave} disabled={isSaving}>
          <BookOpen className="h-4 w-4 mr-1.5" />
          {isSaving ? 'Saving...' : 'Save Reflection to Journal'}
        </Button>
      </div>
    </div>
  )
}
