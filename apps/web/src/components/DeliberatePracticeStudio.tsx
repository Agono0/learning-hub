/**
 * Learning HUB — Deliberate Practice & Progressive Error Recovery Studio
 *
 * Implements K. Anders Ericsson's Deliberate Practice Theory (1993, 2016),
 * Kurt VanLehn's (1990) Impasse-Driven Learning & Schema Bug Repair,
 * and Nina Keith & Michael Frese's (2008) Error Management Training (EMT).
 */

'use client'

import React, { useMemo, useState } from 'react'
import {
  analyzeErrorTaxonomy,
  type BugClass,
  calculateDeliberateEffortIndex,
  calculateZPDFrontier,
  CALIBRATED_DELIBERATE_SUITES,
  type DeliberatePracticeSuite,
  type FSRSMicroRepairCard,
  type PracticeDifficultyTier,
} from '@learning-hub/core/deliberate'
import { Badge, Button, DeliberatePracticeHUD, Panel } from '@/ui'
import { getSharedAudioContext } from '@/lib/audio-graph'
import { hapticHeavy, hapticLight, hapticMedium } from '../platform/haptics'
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Copy,
  Crosshair,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Target,
  Wrench,
} from 'lucide-react'

type StudioTab = 'drills' | 'impasse' | 'taxonomy' | 'deck'

export function DeliberatePracticeStudio() {
  const [selectedSuiteId, setSelectedSuiteId] = useState<string>('lock_free_concurrency')
  const [activeTab, setActiveTab] = useState<StudioTab>('drills')
  const [currentTier, setCurrentTier] = useState<PracticeDifficultyTier>('foundational')

  // Practice state
  const [drillAnswers, setDrillAnswers] = useState<
    Record<string, { optionId: string; isCorrect: boolean; bugClass?: BugClass }>
  >({})
  const [history, setHistory] = useState<boolean[]>([])
  const [recordedErrors, setRecordedErrors] = useState<BugClass[]>([])
  const [repairedImpasses, setRepairedImpasses] = useState<Set<string>>(new Set())
  const [activeImpasseId, setActiveImpasseId] = useState<string | null>(null)
  const [targetedDeficitReps, setTargetedDeficitReps] = useState<number>(0)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const suite: DeliberatePracticeSuite =
    CALIBRATED_DELIBERATE_SUITES[selectedSuiteId] ??
    CALIBRATED_DELIBERATE_SUITES.lock_free_concurrency

  // Filter drills by current difficulty tier
  const activeDrills = useMemo(() => {
    return suite.drills.filter((d) => d.difficultyTier === currentTier)
  }, [suite, currentTier])

  // ZPD Frontier state calculation
  const zpdFrontier = useMemo(() => {
    const recent = history.slice(-5)
    return calculateZPDFrontier(recent, currentTier)
  }, [history, currentTier])

  // VanLehn Error Taxonomy analysis
  const errorTaxonomy = useMemo(() => {
    return analyzeErrorTaxonomy(recordedErrors)
  }, [recordedErrors])

  // Ericsson Deliberate Effort metrics
  const deliberateEffort = useMemo(() => {
    return calculateDeliberateEffortIndex(
      history.length,
      targetedDeficitReps,
      repairedImpasses.size,
    )
  }, [history.length, targetedDeficitReps, repairedImpasses.size])

  // Audio tone player
  const playTone = (type: 'success' | 'alert' | 'repair') => {
    void getSharedAudioContext()
      .then((ctx) => {
        if (!ctx) return
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)

        const now = ctx.currentTime
        if (type === 'success') {
          osc.frequency.setValueAtTime(587.33, now) // D5
          osc.frequency.exponentialRampToValueAtTime(880.0, now + 0.15) // A5
          gain.gain.setValueAtTime(0.12, now)
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
          osc.start(now)
          osc.stop(now + 0.3)
        } else if (type === 'alert') {
          osc.frequency.setValueAtTime(349.23, now) // F4
          osc.frequency.setValueAtTime(311.13, now + 0.1) // Eb4
          gain.gain.setValueAtTime(0.12, now)
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25)
          osc.start(now)
          osc.stop(now + 0.25)
        } else {
          osc.frequency.setValueAtTime(440, now) // A4
          osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1) // E5
          gain.gain.setValueAtTime(0.15, now)
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35)
          osc.start(now)
          osc.stop(now + 0.35)
        }
      })
      .catch(() => {})
  }

  const triggerToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3200)
  }

  // Answer selection handler
  const handleAnswerSelect = (drillId: string, optionId: string) => {
    const drill = suite.drills.find((d) => d.id === drillId)
    if (!drill) return
    const opt = drill.options.find((o) => o.id === optionId)
    if (!opt) return

    setDrillAnswers((prev) => ({
      ...prev,
      [drillId]: { optionId, isCorrect: opt.isCorrect, bugClass: opt.bugClass },
    }))

    setHistory((prev) => [...prev, opt.isCorrect])
    if (drill.targetedDeficit) {
      setTargetedDeficitReps((prev) => prev + 1)
    }

    if (opt.isCorrect) {
      hapticLight()
      playTone('success')
      triggerToast('Flawless deliberate execution! Sub-skill invariant verified.')
    } else {
      hapticHeavy()
      playTone('alert')
      if (opt.bugClass) {
        setRecordedErrors((prev) => [...prev, opt.bugClass!])
        // Check for matching impasse checkpoint
        const matchedImpasse = suite.impasseCheckpoints.find((c) => c.bugClass === opt.bugClass)
        if (matchedImpasse) {
          setActiveImpasseId(matchedImpasse.id)
          triggerToast(
            `Cognitive Impasse triggered: ${opt.bugClass.replace('_', ' ')}! Opening repair crucible.`,
          )
        } else {
          triggerToast(
            `Error detected: ${opt.bugClass.replace('_', ' ')}. Inspect diagnostic feedback.`,
          )
        }
      }
    }
  }

  // Mark impasse as repaired
  const handleRepairImpasse = (impasseId: string) => {
    setRepairedImpasses((prev) => new Set([...prev, impasseId]))
    hapticMedium()
    playTone('repair')
    triggerToast('Cognitive impasse repaired! Invariant schema consolidated.')
  }

  // Reset progress
  const handleReset = () => {
    setDrillAnswers({})
    setHistory([])
    setRecordedErrors([])
    setRepairedImpasses(new Set())
    setActiveImpasseId(null)
    setTargetedDeficitReps(0)
    triggerToast('Deliberate practice session reset.')
  }

  // Export FSRS micro-repair cards
  const exportedCards = useMemo(() => {
    const cards: FSRSMicroRepairCard[] = []
    for (const drill of suite.drills) {
      for (const opt of drill.options) {
        if (!opt.isCorrect && opt.bugClass) {
          const isRepaired = repairedImpasses.size > 0
          cards.push({
            id: `fsrs_${suite.id}_${drill.id}_${opt.id}`,
            suiteId: suite.id,
            drillId: drill.id,
            bugClass: opt.bugClass,
            prompt: `[${suite.title} - Deliberate Impasse]\n${drill.prompt}`,
            erroneousImpasse: `Identified Bug: ${opt.text}\nDiagnostic: ${opt.diagnosticFeedback}`,
            schemaRepairSolution: opt.schemaRepairInstruction || drill.expectedKeyInsight,
            emtReframingMnemonic:
              'Keith & Frese EMT: "Errors are information! The error exposes the exact boundary of your schema."',
            recommendedStabilityMultiplier: isRepaired ? 1.35 : 0.8,
          })
        }
      }
    }
    return cards
  }, [suite, repairedImpasses])

  const handleCopyDeck = () => {
    navigator.clipboard?.writeText(JSON.stringify(exportedCards, null, 2))
    triggerToast('Copied FSRS micro-repair cards to clipboard!')
  }

  return (
    <div className="space-y-6">
      {/* Toast alert */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg bg-foreground px-4 py-2.5 text-xs text-background shadow-lg transition-all">
          {toastMessage}
        </div>
      )}

      {/* Header & Suite Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            Deliberate Practice &amp; Progressive Error Recovery Studio
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Anders Ericsson (1993, 2016) • Kurt VanLehn (1990) Impasse Schema Repair • Keith &amp;
            Frese (2008) EMT
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="suite-select" className="text-xs font-medium text-muted-foreground">
            Practice Suite:
          </label>
          <select
            id="suite-select"
            value={selectedSuiteId}
            onChange={(e) => {
              setSelectedSuiteId(e.target.value)
              handleReset()
            }}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {Object.values(CALIBRATED_DELIBERATE_SUITES).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>

          <Button variant="ghost" onClick={handleReset} title="Reset session">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Top HUD: ZPD Frontier & Ericsson Deliberate Effort */}
      <DeliberatePracticeHUD
        zpdFrontier={zpdFrontier}
        errorTaxonomy={errorTaxonomy}
        deliberateEffort={deliberateEffort}
        onTierSelect={(t) => setCurrentTier(t)}
      />

      {/* Navigation Tabs */}
      <div className="flex border-b border-border/80 text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('drills')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'drills'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Crosshair className="h-4 w-4" />
          Micro-Skill Drills ({activeDrills.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('impasse')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'impasse'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Wrench className="h-4 w-4" />
          VanLehn Impasse Crucible{' '}
          {activeImpasseId && <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('taxonomy')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'taxonomy'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ShieldAlert className="h-4 w-4" />
          Error Taxonomy &amp; EMT Audit
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('deck')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'deck'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Brain className="h-4 w-4" />
          FSRS Micro-Repair Deck ({exportedCards.length})
        </button>
      </div>

      {/* TAB 1: Micro-Skill Repetition Drills */}
      {activeTab === 'drills' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border/80 bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Targeted Micro-Skill Deficit Drills
                </h3>
                <p className="text-xs text-muted-foreground">
                  Immediate informative feedback with deliberate deficit targeting. Current Tier:{' '}
                  <span className="font-semibold text-foreground capitalize">
                    {currentTier.replace('_', ' ')}
                  </span>
                </p>
              </div>
              <Badge tone="cyan">Target: {suite.targetMasteryGoal.slice(0, 32)}…</Badge>
            </div>

            <div className="space-y-4">
              {activeDrills.map((drill) => {
                const answer = drillAnswers[drill.id]
                const isAnswered = answer !== undefined

                return (
                  <div
                    key={drill.id}
                    className="rounded-lg border border-border/80 bg-card p-5 space-y-3.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-sm">{drill.title}</span>
                        <Badge tone="accent">Deficit: {drill.targetedDeficit}</Badge>
                      </div>
                      {isAnswered && (
                        <Badge tone={answer.isCorrect ? 'success' : 'danger'}>
                          {answer.isCorrect
                            ? 'Mastered'
                            : `Impasse: ${answer.bugClass?.replace('_', ' ')}`}
                        </Badge>
                      )}
                    </div>

                    <p className="text-foreground text-xs leading-relaxed">{drill.prompt}</p>

                    {/* Options */}
                    <div className="space-y-2 pt-1">
                      {drill.options.map((opt) => {
                        const isSelected = answer?.optionId === opt.id

                        let optionStyle =
                          'bg-muted/30 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/70'
                        if (isAnswered) {
                          if (opt.isCorrect) {
                            optionStyle =
                              'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-medium'
                          } else if (isSelected && !opt.isCorrect) {
                            optionStyle =
                              'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400'
                          }
                        }

                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleAnswerSelect(drill.id, opt.id)}
                            className={`w-full text-left rounded-md px-3.5 py-2.5 text-xs transition-colors border ${optionStyle}`}
                          >
                            {opt.text}
                          </button>
                        )
                      })}
                    </div>

                    {/* Diagnostic Feedback upon answering */}
                    {isAnswered && (
                      <div
                        className={`rounded-md p-3 text-xs border ${
                          answer.isCorrect
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        <div className="flex items-center justify-between font-semibold pb-1">
                          <span>
                            {answer.isCorrect
                              ? 'Informative Validation:'
                              : 'Diagnostic Schema Analysis:'}
                          </span>
                          {!answer.isCorrect && (
                            <button
                              type="button"
                              onClick={() => {
                                const matched = suite.impasseCheckpoints.find(
                                  (c) => c.bugClass === answer.bugClass,
                                )
                                if (matched) setActiveImpasseId(matched.id)
                                setActiveTab('impasse')
                              }}
                              className="underline hover:text-foreground text-[11px]"
                            >
                              Resolve in Impasse Crucible →
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] leading-relaxed">
                          {drill.options.find((o) => o.id === answer.optionId)?.diagnosticFeedback}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: VanLehn Impasse & Schema Repair Crucible */}
      {activeTab === 'impasse' && (
        <div className="space-y-6">
          <Panel className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  VanLehn Impasse-Driven Schema Repair Crucible
                </h3>
                <p className="text-xs text-muted-foreground">
                  When current mental procedures fail, sub-goal repair is executed to eliminate
                  mal-rules.
                </p>
              </div>
              <Badge tone="warning">Checkpoints: {suite.impasseCheckpoints.length}</Badge>
            </div>

            <div className="space-y-5">
              {suite.impasseCheckpoints.map((checkpoint) => {
                const isRepaired = repairedImpasses.has(checkpoint.id)

                return (
                  <div
                    key={checkpoint.id}
                    className={`rounded-xl border p-5 space-y-4 text-xs transition-all ${
                      isRepaired
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : activeImpasseId === checkpoint.id
                          ? 'border-rose-500/50 bg-rose-500/5 shadow-md'
                          : 'border-border/80 bg-card'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        <span className="font-bold text-foreground text-sm">
                          {checkpoint.title}
                        </span>
                        <Badge tone="danger">{checkpoint.bugClass.replace('_', ' ')}</Badge>
                      </div>
                      <Badge tone={isRepaired ? 'success' : 'neutral'}>
                        {isRepaired ? 'Repaired' : 'Impasse Active'}
                      </Badge>
                    </div>

                    <div className="rounded-lg bg-muted/40 p-3.5 space-y-2 border border-border/50">
                      <span className="font-semibold text-foreground block">Context Scenario:</span>
                      <p className="text-muted-foreground leading-relaxed">
                        {checkpoint.contextScenario}
                      </p>

                      <span className="font-semibold text-rose-500 block pt-1">
                        Failure Trigger:
                      </span>
                      <p className="text-rose-500 leading-relaxed">{checkpoint.failureTrigger}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-lg bg-rose-500/10 p-3.5 border border-rose-500/20 space-y-1">
                        <span className="font-semibold text-rose-500 block">
                          Erroneous Reasoning:
                        </span>
                        <p className="text-muted-foreground leading-relaxed">
                          {checkpoint.erroneousReasoning}
                        </p>
                      </div>

                      <div className="rounded-lg bg-emerald-500/10 p-3.5 border border-emerald-500/20 space-y-1">
                        <span className="font-semibold text-emerald-500 block">
                          Correct Invariant Repair:
                        </span>
                        <p className="text-muted-foreground leading-relaxed">
                          {checkpoint.correctInvariantRepair}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg bg-cyan-500/10 p-3.5 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 space-y-1">
                      <span className="font-semibold block">Keith &amp; Frese EMT Reframing:</span>
                      <p className="leading-relaxed">{checkpoint.conceptualReframingEMT}</p>
                    </div>

                    {/* Metacognitive Reflection Questions */}
                    <div className="space-y-2 pt-1 border-t border-border/60">
                      <span className="font-semibold text-foreground block">
                        Metacognitive Invariant Prompts:
                      </span>
                      <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                        {checkpoint.reflectionQuestions.map((q, qIdx) => (
                          <li key={qIdx}>{q}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button
                        variant={isRepaired ? 'ghost' : 'primary'}
                        onClick={() => handleRepairImpasse(checkpoint.id)}
                        disabled={isRepaired}
                      >
                        {isRepaired ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-500" />
                            Impasse Consolidated
                          </>
                        ) : (
                          <>
                            <Wrench className="h-4 w-4 mr-1.5" />
                            Consolidate Schema Repair
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 3: Error Taxonomy & EMT Metacognitive Audit */}
      {activeTab === 'taxonomy' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Panel className="p-5 space-y-4">
            <h3 className="text-base font-semibold text-foreground">
              Kurt VanLehn Error Bug Audit
            </h3>
            <p className="text-xs text-muted-foreground">
              Total accumulated errors categorized into VanLehn’s 4 core failure modes.
            </p>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between text-xs p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <span className="font-semibold text-rose-500">Misconceptions (Severity 4):</span>
                <span className="font-bold text-foreground">
                  {errorTaxonomy.misconceptionCount} errors
                </span>
              </div>
              <div className="flex items-center justify-between text-xs p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <span className="font-semibold text-amber-500">
                  Procedural Lapses (Severity 3):
                </span>
                <span className="font-bold text-foreground">
                  {errorTaxonomy.proceduralLapseCount} errors
                </span>
              </div>
              <div className="flex items-center justify-between text-xs p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
                <span className="font-semibold text-violet-500">
                  Boundary Oversights (Severity 2):
                </span>
                <span className="font-bold text-foreground">
                  {errorTaxonomy.boundaryOversightCount} errors
                </span>
              </div>
              <div className="flex items-center justify-between text-xs p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                <span className="font-semibold text-cyan-500">Attentional Slips (Severity 1):</span>
                <span className="font-bold text-foreground">
                  {errorTaxonomy.attentionalSlipCount} errors
                </span>
              </div>
            </div>

            <div className="border-t border-border/60 pt-3 text-xs text-muted-foreground flex justify-between">
              <span>Predominant Failure Mode:</span>
              <span className="font-bold text-foreground capitalize">
                {errorTaxonomy.predominantBugClass.replace('_', ' ')}
              </span>
            </div>
          </Panel>

          <Panel className="p-5 space-y-4">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Keith &amp; Frese Error Management Audit
            </h3>
            <p className="text-xs text-muted-foreground">
              Cognitive and emotional regulation strategies that transform failure into adaptive
              transfer.
            </p>

            <div className="rounded-lg bg-muted/40 p-4 space-y-3 text-xs border border-border/60">
              <div className="space-y-1">
                <span className="font-semibold text-foreground block">
                  1. Cognitive Decoupling:
                </span>
                <p className="text-muted-foreground">
                  Separate your personal self-worth from tactical step errors. Errors in lock-free
                  concurrency or numerical computing are structural properties of complex systems,
                  not defects of mind.
                </p>
              </div>

              <div className="space-y-1">
                <span className="font-semibold text-foreground block">2. Invariant Tracking:</span>
                <p className="text-muted-foreground">
                  Identify the exact invariant that broke (e.g. ABA pointer reuse, exponent
                  overflow) and write a mental contract preventing it.
                </p>
              </div>

              <div className="space-y-1">
                <span className="font-semibold text-foreground block">3. Transfer Resilience:</span>
                <p className="text-muted-foreground">
                  Learners trained with Error Management consistently outperform error-avoidant
                  learners on novel, unpredictable edge-case scenarios.
                </p>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 4: FSRS Micro-Repair Deck */}
      {activeTab === 'deck' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                FSRS-6 Deliberate Micro-Repair Deck ({exportedCards.length} Cards)
              </h3>
              <p className="text-xs text-muted-foreground">
                Cards isolating the exact point of cognitive impasse with bug-severity calibrated
                stability S₀.
              </p>
            </div>

            <Button variant="ghost" onClick={handleCopyDeck}>
              <Copy className="h-4 w-4 mr-1.5" />
              Copy Deck JSON
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {exportedCards.map((card) => (
              <div
                key={card.id}
                className="rounded-lg border border-border/80 bg-card p-4 space-y-3 text-xs flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge
                      tone={
                        card.bugClass === 'misconception'
                          ? 'danger'
                          : card.bugClass === 'procedural_lapse'
                            ? 'warning'
                            : 'accent'
                      }
                    >
                      {card.bugClass.replace('_', ' ')}
                    </Badge>
                    <span className="font-bold text-foreground">
                      S₀ ×{card.recommendedStabilityMultiplier.toFixed(2)}
                    </span>
                  </div>

                  <p className="font-medium text-foreground whitespace-pre-line">{card.prompt}</p>
                </div>

                <div className="pt-2 border-t border-border/40 space-y-1.5 text-muted-foreground">
                  <div className="rounded bg-rose-500/10 p-2 text-rose-500 text-[11px]">
                    {card.erroneousImpasse}
                  </div>
                  <div className="rounded bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400 text-[11px]">
                    <span className="font-semibold block">Repair Invariant:</span>
                    {card.schemaRepairSolution}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
