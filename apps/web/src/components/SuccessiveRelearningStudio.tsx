'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Copy,
  Eye,
  History,
  Layers,
  LineChart,
  Repeat,
  RotateCcw,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { Badge, Button, Panel } from '@/ui'
import { SuccessiveRelearningHUD } from '@/ui/SuccessiveRelearningHUD'
import {
  CALIBRATED_SUCCESSIVE_SUITES,
  type RelearningAuditReport,
  type RelearningItem,
  type RelearningPlan,
  advancePlanToNextSession,
  computeQueueState,
  createRelearningItem,
  generateRelearningAudit,
  recordItemTrial,
  relearningPlanSchema,
  synthesizeFSRSDeckCards,
} from '@learning-hub/core/successive-relearning'

type TabMode = 'recall' | 'curve' | 'attrition' | 'deck'

export function SuccessiveRelearningStudio() {
  const [selectedSuiteId, setSelectedSuiteId] = useState<string>('distributed_systems')
  const [activeTab, setActiveTab] = useState<TabMode>('recall')
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Initialize initial plan from calibrated suites
  const initialPlan = useMemo<RelearningPlan>(() => {
    const suite =
      CALIBRATED_SUCCESSIVE_SUITES[selectedSuiteId] ??
      CALIBRATED_SUCCESSIVE_SUITES.distributed_systems!
    return relearningPlanSchema.parse({
      id: `sr-plan-${suite.id}`,
      title: suite.title,
      domain: suite.domain,
      targetCriterion: 2,
      currentSessionIndex: 0,
      scheduleDays: [1, 3, 7, 16, 35],
      items: suite.items.map((i) =>
        createRelearningItem({
          id: i.id,
          prompt: i.prompt,
          targetAnswer: i.targetAnswer,
          conceptCluster: i.conceptCluster,
          mnemonicCue: i.mnemonicCue,
          acquisitionCriterion: 2,
        }),
      ),
      sessionHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }, [selectedSuiteId])

  const [plan, setPlan] = useState<RelearningPlan>(initialPlan)

  // Reset plan when suite changes
  useEffect(() => {
    setPlan(initialPlan)
    setIsAnswerRevealed(false)
  }, [initialPlan])

  // Try fetching saved plan from backend on mount (Rule 1: apiGet from transport)
  useEffect(() => {
    let cancelled = false
    apiGet<RelearningPlan>(`/api/practice/successive-relearning?suiteId=${selectedSuiteId}`)
      .then((res) => {
        if (!cancelled && res && res.items?.length > 0) {
          setPlan(relearningPlanSchema.parse(res))
        }
      })
      .catch(() => {
        // Fallback to in-memory calibrated plan
      })
    return () => {
      cancelled = true
    }
  }, [selectedSuiteId])

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    const t = setTimeout(() => setToastMessage(null), 3000)
    return () => clearTimeout(t)
  }, [])

  const queueState = useMemo(() => computeQueueState(plan), [plan])
  const auditReport = useMemo<RelearningAuditReport>(() => generateRelearningAudit(plan), [plan])
  const synthesizedCards = useMemo(() => synthesizeFSRSDeckCards(plan), [plan])

  const currentItem = useMemo<RelearningItem | null>(() => {
    if (!queueState.currentItemId) return null
    return plan.items.find((i) => i.id === queueState.currentItemId) ?? null
  }, [plan.items, queueState.currentItemId])

  // Submit trial (Rule 1: apiSend through transport)
  const handleTrial = useCallback(
    async (isCorrect: boolean) => {
      if (!currentItem) return

      const { updatedItem, justMetCriterion } = recordItemTrial(currentItem, {
        itemId: currentItem.id,
        isCorrect,
        latencyMs: 1400,
      })

      const nextItems = plan.items.map((it) => (it.id === currentItem.id ? updatedItem : it))
      const nextPlan: RelearningPlan = {
        ...plan,
        items: nextItems,
        updatedAt: new Date().toISOString(),
      }

      setPlan(nextPlan)
      setIsAnswerRevealed(false)

      if (justMetCriterion) {
        showToast(`Criterion met! "${updatedItem.conceptCluster}" dropped out of active session.`)
      }

      // Persist asynchronously
      try {
        await apiSend('/api/practice/successive-relearning', 'POST', {
          action: 'record_trial',
          plan: nextPlan,
          trial: { itemId: currentItem.id, isCorrect },
        })
      } catch {
        // Safe to continue in-memory
      }
    },
    [currentItem, plan, showToast],
  )

  // Advance to next wave
  const handleAdvanceWave = useCallback(async () => {
    try {
      const { updatedPlan, sessionSummary } = advancePlanToNextSession(plan)
      setPlan(updatedPlan)
      setIsAnswerRevealed(false)
      showToast(
        `Wave ${sessionSummary.sessionIndex} completed! Advanced to Relearning Wave ${updatedPlan.currentSessionIndex}.`,
      )

      await apiSend('/api/practice/successive-relearning', 'POST', {
        action: 'advance_session',
        plan: updatedPlan,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(msg)
    }
  }, [plan, showToast])

  const handleCopyDeck = useCallback(() => {
    const json = JSON.stringify(synthesizedCards, null, 2)
    navigator.clipboard?.writeText(json)
    showToast('FSRS-calibrated cards copied to clipboard.')
  }, [synthesizedCards, showToast])

  const handleResetSession = useCallback(() => {
    setPlan(initialPlan)
    setIsAnswerRevealed(false)
    showToast('Session reset to initial acquisition state.')
  }, [initialPlan, showToast])

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2.5 text-xs text-white dark:text-neutral-900 shadow-lg transition-all">
          {toastMessage}
        </div>
      )}

      {/* Header & Cohort Selection */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-neutral-200 dark:border-(--hub-border) pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-strong flex items-center gap-2">
            <Repeat className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            Successive Relearning &amp; Ebbinghaus Savings Studio
          </h2>
          <p className="text-xs text-secondary mt-0.5">
            Rawson &amp; Dunlosky (2011, 2012) • Hermann Ebbinghaus (1885) Savings Method • Nelson
            &amp; Leonesio (1988)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 max-w-full">
          <label htmlFor="sr-suite-select" className="text-xs font-medium text-secondary">
            Cohort:
          </label>
          <select
            id="sr-suite-select"
            value={selectedSuiteId}
            onChange={(e) => setSelectedSuiteId(e.target.value)}
            className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-3 py-1.5 text-xs font-medium text-strong shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-600"
          >
            {Object.values(CALIBRATED_SUCCESSIVE_SUITES).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.domain})
              </option>
            ))}
          </select>

          <Button variant="ghost" onClick={handleResetSession} title="Reset session">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Real-time Telemetry HUD */}
      <SuccessiveRelearningHUD
        currentSessionIndex={plan.currentSessionIndex}
        totalSessions={plan.scheduleDays.length}
        sessionCriterionPercent={queueState.sessionCriterionPercent}
        activeQueueCount={queueState.activeQueueItemIds.length}
        completedCount={queueState.completedItemIds.length}
        ebbinghausSavingsPercent={auditReport.overallMeanSavingsPercent}
        retentionDecayLambda={plan.items[0]?.retentionDecayRate ?? 0.12}
        estimatedRetention={auditReport.currentEstimatedCohortRetention}
        nextSessionDueInDays={auditReport.nextSessionDueInDays}
        canAdvanceSession={queueState.activeQueueItemIds.length === 0}
        onAdvanceSession={handleAdvanceWave}
      />

      {/* Tabs */}
      <div className="flex border-b border-neutral-200 dark:border-(--hub-border) text-sm font-medium overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap">
        <button
          type="button"
          onClick={() => setActiveTab('recall')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'recall'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <Brain className="h-4 w-4" />
          Criterion Recall Queue ({queueState.activeQueueItemIds.length} Remaining)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('curve')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'curve'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <LineChart className="h-4 w-4" />
          Ebbinghaus Savings Curve ({auditReport.ebbinghausSavingsCurve.length} Waves)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('attrition')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'attrition'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <AlertCircle className="h-4 w-4" />
          High-Attrition Item Radar ({auditReport.highAttritionItems.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('deck')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'deck'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <Layers className="h-4 w-4" />
          FSRS Spacing Bridge ({synthesizedCards.length} Cards)
        </button>
      </div>

      {/* TAB 1: Active Recall Queue */}
      {activeTab === 'recall' && (
        <div className="space-y-6">
          {currentItem ? (
            <div className="rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) p-6 space-y-6 shadow-sm">
              {/* Item Metadata */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-3">
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{currentItem.conceptCluster}</Badge>
                  <span className="text-xs text-secondary">
                    Target Criterion: {currentItem.acquisitionCriterion} consecutive correct
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-secondary">
                  <span>Current Streak:</span>
                  <span className="font-bold text-status-success-text dark:text-status-success-text">
                    {currentItem.sessionConsecutiveStreak} / {currentItem.acquisitionCriterion}
                  </span>
                  <span>• Trials this session: {currentItem.trialsInCurrentSession}</span>
                </div>
              </div>

              {/* Prompt Card */}
              <div className="space-y-3">
                <span className="text-xs uppercase tracking-wider text-secondary font-semibold">
                  Retrieval Challenge:
                </span>
                <p className="text-base sm:text-lg font-medium text-strong leading-relaxed">
                  {currentItem.prompt}
                </p>
                {currentItem.mnemonicCue && (
                  <div className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 pt-1">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Mnemonic Anchor: {currentItem.mnemonicCue}</span>
                  </div>
                )}
              </div>

              {/* Answer Reveal Surface */}
              <div className="space-y-3 pt-2">
                {isAnswerRevealed ? (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
                    <span className="text-xs font-semibold text-status-success-text dark:text-status-success-text block">
                      Target Master Answer:
                    </span>
                    <p className="text-sm font-medium text-strong leading-relaxed">
                      {currentItem.targetAnswer}
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAnswerRevealed(true)}
                    className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-4 text-xs font-medium text-secondary hover:text-strong hover:bg-neutral-50 dark:hover:bg-(--hub-sunken) transition-colors"
                  >
                    <Eye className="h-4 w-4" />
                    Reveal Target Answer to Verify Recall
                  </button>
                )}
              </div>

              {/* Response Decision Buttons */}
              {isAnswerRevealed && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <button
                    type="button"
                    onClick={() => handleTrial(false)}
                    className="flex items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-danger-text dark:text-danger-text hover:bg-rose-500/20 transition-colors"
                  >
                    <XCircle className="h-5 w-5" />
                    Mistake / Partial (Reset Streak &amp; Rotate)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTrial(true)}
                    className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                    Recalled Correctly (+1 Streak towards Criterion)
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) p-8 text-center space-y-4 shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-status-success-text dark:text-status-success-text">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-strong">
                Session Criterion Achieved for All Items!
              </h3>
              <p className="text-xs text-secondary max-w-md mx-auto">
                Every target concept has been verified to the required acquisition criterion of{' '}
                {plan.targetCriterion} correct recalls. Advance to schedule the next distributed
                relearning session.
              </p>
              <Button variant="primary" onClick={handleAdvanceWave}>
                Advance to Next Relearning Wave <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Ebbinghaus Savings Curve */}
      {activeTab === 'curve' && (
        <div className="space-y-6">
          <Panel className="p-5 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-strong flex items-center gap-2">
                <LineChart className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                Empirical Ebbinghaus Savings Projection (Ebbinghaus 1885; Rawson 2012)
              </h3>
              <p className="text-xs text-secondary mt-0.5">
                Quantifies the reduction in trials required to relearn material across spaced waves:
                Savings = ((T₁ - Tₙ) / T₁) × 100%.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-(--hub-border) text-secondary uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3">Wave Index</th>
                    <th className="py-2.5 px-3">Spacing Interval</th>
                    <th className="py-2.5 px-3">Mean Trials to Criterion</th>
                    <th className="py-2.5 px-3">Savings (%)</th>
                    <th className="py-2.5 px-3">Decay Constant (λ)</th>
                    <th className="py-2.5 px-3">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-(--hub-border)">
                  {auditReport.ebbinghausSavingsCurve.map((entry) => {
                    const isPassed = entry.sessionIndex < plan.currentSessionIndex
                    const isCurrent = entry.sessionIndex === plan.currentSessionIndex
                    return (
                      <tr
                        key={entry.sessionIndex}
                        className={isCurrent ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''}
                      >
                        <td className="py-3 px-3 font-semibold text-strong">
                          Wave {entry.sessionIndex}
                          {entry.sessionIndex === 0 ? ' (Acquisition)' : ''}
                        </td>
                        <td className="py-3 px-3 text-secondary">
                          {entry.nominalIntervalDays === 0
                            ? 'Day 0'
                            : `+${entry.nominalIntervalDays} days`}
                        </td>
                        <td className="py-3 px-3 text-strong font-medium">
                          {entry.meanTrialsToCriterion.toFixed(1)} trials
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={
                              entry.savingsPercent > 50
                                ? 'text-status-success-text dark:text-status-success-text font-bold'
                                : 'text-strong font-medium'
                            }
                          >
                            {entry.savingsPercent.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-secondary font-mono">
                          {entry.retentionDecayLambda.toFixed(4)}
                        </td>
                        <td className="py-3 px-3">
                          <Badge tone={isPassed ? 'success' : isCurrent ? 'accent' : 'neutral'}>
                            {isPassed ? 'Completed' : isCurrent ? 'Active Now' : 'Projected'}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 3: High-Attrition Item Radar */}
      {activeTab === 'attrition' && (
        <div className="space-y-6">
          <Panel className="p-5 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-strong flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-status-warning-text" />
                High-Attrition Outlier Radar (Nelson &amp; Leonesio 1988)
              </h3>
              <p className="text-xs text-secondary mt-0.5">
                Items requiring disproportionate trials to reach criterion are flagged with targeted
                cognitive remediation anchors.
              </p>
            </div>

            {auditReport.highAttritionItems.length > 0 ? (
              <div className="space-y-4">
                {auditReport.highAttritionItems.map((item) => (
                  <div
                    key={item.itemId}
                    className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-strong text-sm">Item ID: {item.itemId}</span>
                      <Badge tone="warning">
                        {item.trialsToCriterion} trials ({item.baselineRatio}× baseline)
                      </Badge>
                    </div>
                    <p className="text-strong font-medium">{item.prompt}</p>
                    <div className="rounded bg-neutral-100 dark:bg-(--hub-panel-2) p-3 text-secondary leading-relaxed border border-neutral-200 dark:border-(--hub-border)">
                      <span className="font-semibold text-strong block mb-1">
                        Pedagogical Remediation Directive:
                      </span>
                      {item.remediationRecommendation}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) p-6 text-center text-xs text-secondary space-y-2">
                <CheckCircle2 className="h-5 w-5 text-status-success-text mx-auto" />
                <p className="font-medium text-strong">Zero High-Attrition Outliers Detected</p>
                <p>All items in this cohort reached criterion within normal trial variance.</p>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* TAB 4: FSRS-6 Spacing Bridge */}
      {activeTab === 'deck' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-strong flex items-center gap-2">
                <History className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                FSRS-6 Calibrated Spaced Repetition Cards ({synthesizedCards.length} Cards)
              </h3>
              <p className="text-xs text-secondary">
                Stability S₀ and Difficulty D calibrated directly from empirical successive
                relearning trials.
              </p>
            </div>

            <Button variant="ghost" onClick={handleCopyDeck}>
              <Copy className="h-4 w-4 mr-1.5" />
              Copy Deck JSON
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {synthesizedCards.map((card) => (
              <div
                key={card.id}
                className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) p-4 space-y-3 text-xs flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge tone="neutral">{card.conceptCluster}</Badge>
                    <span className="font-bold text-strong">
                      Stability S₀: {card.calibratedStability}d • Diff: {card.calibratedDifficulty}
                    </span>
                  </div>
                  <p className="font-medium text-strong whitespace-pre-line">{card.prompt}</p>
                </div>

                <div className="pt-2 border-t border-neutral-200 dark:border-(--hub-border) space-y-1 text-secondary">
                  <span className="text-[11px] font-semibold text-status-success-text dark:text-status-success-text block">
                    Answer:
                  </span>
                  <p className="text-[11px] leading-relaxed">{card.targetAnswer}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
