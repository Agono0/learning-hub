/**
 * Worked-Example Fading & Cognitive Load Scaffolding Studio.
 *
 * API-backed studio: the stateful engine (`WorkedExampleSession`) executes
 * SERVER-side through the runtime-neutral handler's stateless snapshot
 * protocol (`/api/scaffolding`): every transition carries the session snapshot
 * and returns the engine's evaluation result plus the next snapshot. The
 * in-browser engine mirror executes the identical transitions only when the
 * API is unreachable (manual-mode guarantee, AGENTS.md rule 9) and paints the
 * synchronous first render. All transport goes through `@/lib/transport` only.
 *
 * Implements:
 * - Renkl & Atkinson (2003, 2004) 4-stage example-problem scaffolding continuum:
 *   Stage 1: Expert Model (Full Worked Example)
 *   Stage 2: Backward Faded (Atkinson et al. 2000 chaining)
 *   Stage 3: Forward Faded (Connective intermediate lemmas)
 *   Stage 4: Independent Problem Solving with Metacognitive Prompting
 * - Sweller (1988, 2010) Cognitive Load Theory:
 *   Intrinsic Load (IL) + Extraneous Load (EL) + Germane Load (GL) <= Cowan (2001) 4 chunks
 * - Chi et al. (1989) Principle-Based Self-Explanation Prompts
 * - Große & Renkl (2007) Erroneous Example Diagnostic Crucible
 * - Kalyuga et al. (2003) Expertise Reversal Effect Detection
 * - Direct FSRS v5 spaced repetition flashcard export bridge
 */

'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Brain,
  CheckCircle2,
  Download,
  Layers,
  Lightbulb,
  RotateCcw,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react'
import { Callout, IconButton } from '@/ui'
import {
  CALIBRATED_SCAFFOLDING_PROBLEMS,
  evaluateErroneousAttempt,
  evaluateSelfExplanation,
  exportStepToFSRS,
  getStepFadingStatus,
  WorkedExampleSession,
  type ErroneousEvaluationResult,
  type FadingStrategy,
  type MisconceptionCategory,
  type ScaffoldingSessionState,
  type ScaffoldingStage,
  type SelfExplanationEvaluation,
  type StepEvaluationResult,
  type WorkedExampleProblem,
} from '@learning-hub/core/scaffolding'
import { apiGet, apiSend } from '@/lib/transport'
import { FadedScaffoldingHUD } from '../ui/FadedScaffoldingHUD'
import { getSharedAudioContext } from '../lib/audio-graph'
import { hapticHeavy, hapticLight, hapticMedium, hapticWarning } from '../platform/haptics'

export type StudioTab = 'derivation' | 'self_explanation' | 'erroneous_crucible' | 'fsrs_export'

export interface WorkedExampleStudioProps {
  initialProblemId?: string
  initialStage?: ScaffoldingStage
  onExportCard?: (card: ReturnType<typeof exportStepToFSRS>) => void
  className?: string
}

/** One step's fading status — the engine `getStepFadingStatus` output shape. */
type StepFadingStatus = ReturnType<typeof getStepFadingStatus>

interface ProblemsResponse {
  ok: boolean
  problems: Record<string, WorkedExampleProblem>
}
interface NewSessionResponse {
  ok: boolean
  state: ScaffoldingSessionState
}
interface EvaluateStepResponse {
  ok: boolean
  result: StepEvaluationResult
  state: ScaffoldingSessionState
}
interface HintResponse {
  ok: boolean
  hint: string
  state: ScaffoldingSessionState
}
interface SessionStateResponse {
  ok: boolean
  state: ScaffoldingSessionState
}
interface SelfExplanationResponse {
  ok: boolean
  result: SelfExplanationEvaluation
}
interface ErroneousResponse {
  ok: boolean
  result: ErroneousEvaluationResult
}
interface FadingStatusesResponse {
  ok: boolean
  statuses: Record<string, StepFadingStatus>
}
interface ExportCardResponse {
  ok: boolean
  card: ReturnType<typeof exportStepToFSRS>
}
interface ExportDeckResponse {
  ok: boolean
  cards: ReturnType<typeof exportStepToFSRS>[]
}

/**
 * Rebuild an engine session from a state snapshot — the in-browser mirror of
 * the handler's snapshot protocol. Used ONLY for the synchronous first paint
 * and when the API is unreachable (manual-mode fallback, AGENTS.md rule 9) so
 * the studio keeps working offline. Array/object fields are copied so engine
 * mutations can never alias React state.
 */
function hydrateSession(snapshot: ScaffoldingSessionState): WorkedExampleSession {
  const session = new WorkedExampleSession(
    snapshot.problemId,
    snapshot.stage,
    snapshot.learnerExpertise,
  )
  const mutable = session as unknown as { state: ScaffoldingSessionState }
  mutable.state = {
    ...snapshot,
    completedStepIds: [...snapshot.completedStepIds],
    selfExplanationScores: { ...snapshot.selfExplanationScores },
  }
  return session
}

export function WorkedExampleStudio({
  initialProblemId = 'raft_leader_election',
  initialStage = 2,
  onExportCard,
  className,
}: WorkedExampleStudioProps) {
  // Problem state
  const [selectedProblemId, setSelectedProblemId] = useState<string>(initialProblemId)
  const [activeTab, setActiveTab] = useState<StudioTab>('derivation')
  const [audioMuted, setAudioMuted] = useState(false)

  // Problem catalog: the bundled calibrated bank paints synchronously; the
  // handler's catalog replaces it once fetched (identical content, server-side
  // authority; manual mode keeps the bundled bank).
  const [problems, setProblems] = useState<Record<string, WorkedExampleProblem>>(
    CALIBRATED_SCAFFOLDING_PROBLEMS,
  )

  // Session state machine snapshot. The INITIAL session is constructed by the
  // in-browser engine mirror so the first paint (and SSR) is synchronous; every
  // transition afterwards is executed by the runtime-neutral handler via the
  // snapshot protocol, with this same mirror as the manual-mode fallback.
  const [sessionState, setSessionState] = useState<ScaffoldingSessionState>(() =>
    new WorkedExampleSession(initialProblemId, initialStage, 0.0).getState(),
  )
  // Latest snapshot readable inside the serialized transition queue.
  const sessionStateRef = useRef(sessionState)

  // Handler-computed pure derivations (key-matched so a stale in-flight
  // response can never render for newer inputs; the engine mirror covers the
  // in-flight window and manual mode).
  const [apiFading, setApiFading] = useState<{
    key: string
    statuses: Record<string, StepFadingStatus>
  } | null>(null)
  const [apiDeck, setApiDeck] = useState<{
    key: string
    cards: Record<number, ReturnType<typeof exportStepToFSRS>>
  } | null>(null)

  // Transition transport states (loading / error surfaces).
  const [stepPending, setStepPending] = useState(false)
  const [hintPending, setHintPending] = useState(false)
  const [explanationPending, setExplanationPending] = useState(false)
  const [erroneousPending, setErroneousPending] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)

  const currentProblem = useMemo<WorkedExampleProblem>(
    () =>
      problems[selectedProblemId] ??
      problems.raft_leader_election ??
      CALIBRATED_SCAFFOLDING_PROBLEMS.raft_leader_election!,
    [problems, selectedProblemId],
  )

  // Step interaction state
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState<number | null>(null)
  const [clozeInput, setClozeInput] = useState('')
  const [stepFeedback, setStepFeedback] = useState<string | null>(null)
  const [stepFeedbackIsCorrect, setStepFeedbackIsCorrect] = useState<boolean | null>(null)
  const [activeHint, setActiveHint] = useState<string | null>(null)

  // Self-Explanation lab state
  const [activePromptIndex, setActivePromptIndex] = useState(0)
  const [userExplanationText, setUserExplanationText] = useState('')
  const [selfExplanationResult, setSelfExplanationResult] =
    useState<SelfExplanationEvaluation | null>(null)

  // Erroneous crucible state
  const [activeErroneousIndex, setActiveErroneousIndex] = useState(0)
  const [selectedFlawedStep, setSelectedFlawedStep] = useState<number>(1)
  const [selectedMisconception, setSelectedMisconception] =
    useState<MisconceptionCategory>('invariant_violation')
  const [learnerRepairText, setLearnerRepairText] = useState('')
  const [erroneousResult, setErroneousResult] = useState<ErroneousEvaluationResult | null>(null)

  // Problem catalog from the handler (mount; the bundled bank remains on failure).
  useEffect(() => {
    let stale = false
    apiGet<ProblemsResponse>('/api/scaffolding')
      .then((res) => {
        if (!stale && res.problems && Object.keys(res.problems).length > 0) {
          setProblems(res.problems)
        }
      })
      .catch(() => {
        // Manual mode: the bundled calibrated problem bank remains.
      })
    return () => {
      stale = true
    }
  }, [])

  // Fading statuses for the whole active problem — handler-computed (the
  // engine mirror below renders synchronously until the response lands).
  const fadingKey = `${selectedProblemId}|${sessionState.stage}|${sessionState.strategy}`
  useEffect(() => {
    let stale = false
    apiSend<FadingStatusesResponse>('/api/scaffolding', 'POST', {
      action: 'fadingStatuses',
      problemId: selectedProblemId,
      stage: sessionState.stage,
      strategy: sessionState.strategy,
    })
      .then((res) => {
        if (!stale && res.statuses) setApiFading({ key: fadingKey, statuses: res.statuses })
      })
      .catch(() => {
        // Manual mode: the per-step engine mirror already rendered.
      })
    return () => {
      stale = true
    }
  }, [fadingKey, selectedProblemId, sessionState.stage, sessionState.strategy])

  // FSRS export deck for the active problem+stage — handler-computed.
  const deckKey = `${selectedProblemId}|${sessionState.stage}`
  useEffect(() => {
    let stale = false
    apiSend<ExportDeckResponse>('/api/scaffolding', 'POST', {
      action: 'exportDeck',
      problemId: selectedProblemId,
      stage: sessionState.stage,
    })
      .then((res) => {
        if (stale || !Array.isArray(res.cards)) return
        const byStep: Record<number, ReturnType<typeof exportStepToFSRS>> = {}
        for (const card of res.cards) byStep[card.metadata.stepIndex] = card
        setApiDeck({ key: deckKey, cards: byStep })
      })
      .catch(() => {
        // Manual mode: the per-step engine mirror already rendered.
      })
    return () => {
      stale = true
    }
  }, [deckKey, selectedProblemId, sessionState.stage])

  // Synthesize Web Audio Earcons
  const playAudioEarcon = useCallback(
    (type: 'success' | 'error' | 'milestone' | 'hint') => {
      if (audioMuted) return
      void getSharedAudioContext()
        .then((ctx) => {
          if (!ctx) return
          if (ctx.state === 'suspended') {
            void ctx.resume()
          }

          const now = ctx.currentTime
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)

          if (type === 'success') {
            osc.type = 'sine'
            osc.frequency.setValueAtTime(523.25, now) // C5
            osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12) // G5
            gain.gain.setValueAtTime(0.12, now)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
            osc.start(now)
            osc.stop(now + 0.25)
          } else if (type === 'error') {
            osc.type = 'sawtooth'
            osc.frequency.setValueAtTime(220, now) // A3
            osc.frequency.exponentialRampToValueAtTime(146.83, now + 0.18) // D3
            gain.gain.setValueAtTime(0.14, now)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
            osc.start(now)
            osc.stop(now + 0.25)
          } else if (type === 'milestone') {
            osc.type = 'triangle'
            osc.frequency.setValueAtTime(440, now) // A4
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.22) // A5
            gain.gain.setValueAtTime(0.15, now)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
            osc.start(now)
            osc.stop(now + 0.35)
          } else if (type === 'hint') {
            osc.type = 'sine'
            osc.frequency.setValueAtTime(329.63, now) // E4
            osc.frequency.exponentialRampToValueAtTime(440, now + 0.1) // A4
            gain.gain.setValueAtTime(0.09, now)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
            osc.start(now)
            osc.stop(now + 0.18)
          }
        })
        .catch(() => {
          // Ignore audio failures
        })
    },
    [audioMuted],
  )

  // ── Serialized session-transition queue ────────────────────────────────────
  // The API is stateless (snapshot protocol): transitions are queued so each
  // request carries ALL prior applied effects and responses apply strictly in
  // order. `sessionGen` invalidates transitions queued for a session that has
  // since been replaced (problem switch / reset).
  const sessionQueue = useRef<Promise<void>>(Promise.resolve())
  const sessionGen = useRef(0)

  /** The one way session state changes: keeps the snapshot ref in lockstep. */
  const setSession = (next: ScaffoldingSessionState) => {
    sessionStateRef.current = next
    setSessionState(next)
  }

  /**
   * Queue one session transition. Uncaught failures (both the handler and the
   * in-browser mirror errored) are logged and surfaced via `sessionError`;
   * handler failures alone are silent — the mirror already applied the result.
   */
  const enqueueSessionAction = (action: () => Promise<void>) => {
    setSessionError(null)
    sessionQueue.current = sessionQueue.current.then(action).catch((err: unknown) => {
      console.error('[scaffolding] session action failed:', err)
      setSessionError(err instanceof Error ? err.message : String(err))
    })
  }

  /** Fresh engine session (problem switch / reset): mirror applied instantly,
   * the handler's `newSession` result confirms it (identical values). */
  const applyNewSession = (problemId: string, stage: ScaffoldingStage, expertise: number) => {
    const gen = ++sessionGen.current
    setSession(new WorkedExampleSession(problemId, stage, expertise).getState())
    enqueueSessionAction(async () => {
      try {
        const res = await apiSend<NewSessionResponse>('/api/scaffolding', 'POST', {
          action: 'newSession',
          problemId,
          stage,
          learnerExpertise: expertise,
        })
        if (res?.state && gen === sessionGen.current) setSession(res.state)
      } catch {
        // Manual mode (rule 9): the in-browser mirror already holds this state.
      }
    })
  }

  // Problem switcher
  const handleProblemChange = (problemId: string) => {
    setSelectedProblemId(problemId)
    applyNewSession(problemId, sessionState.stage, sessionState.learnerExpertise)
    setSelectedChoiceIndex(null)
    setClozeInput('')
    setStepFeedback(null)
    setActiveHint(null)
    setUserExplanationText('')
    setSelfExplanationResult(null)
    setLearnerRepairText('')
    setErroneousResult(null)
    hapticMedium()
  }

  // Stage switcher
  const handleStageChange = (newStage: ScaffoldingStage) => {
    const gen = sessionGen.current
    enqueueSessionAction(async () => {
      try {
        const res = await apiSend<SessionStateResponse>('/api/scaffolding', 'POST', {
          action: 'setStage',
          state: sessionStateRef.current,
          stage: newStage,
        })
        if (gen !== sessionGen.current) return
        if (!res?.state) throw new Error('malformed setStage response')
        setSession(res.state)
      } catch {
        if (gen !== sessionGen.current) return
        // Manual mode (rule 9): the in-browser engine mirror executes the same
        // transition locally.
        const session = hydrateSession(sessionStateRef.current)
        session.setStage(newStage)
        setSession(session.getState())
      }
    })
    setStepFeedback(null)
    setActiveHint(null)
    hapticMedium()
    playAudioEarcon('hint')
  }

  // Strategy switcher
  const handleStrategyChange = (newStrategy: FadingStrategy) => {
    const gen = sessionGen.current
    enqueueSessionAction(async () => {
      try {
        const res = await apiSend<SessionStateResponse>('/api/scaffolding', 'POST', {
          action: 'setStrategy',
          state: sessionStateRef.current,
          strategy: newStrategy,
        })
        if (gen !== sessionGen.current) return
        if (!res?.state) throw new Error('malformed setStrategy response')
        setSession(res.state)
      } catch {
        if (gen !== sessionGen.current) return
        const session = hydrateSession(sessionStateRef.current)
        session.setStrategy(newStrategy)
        setSession(session.getState())
      }
    })
    hapticLight()
  }

  // Step submission — shared applier for the handler result and the mirror.
  const applyStepResult = (result: StepEvaluationResult, nextState: ScaffoldingSessionState) => {
    setStepFeedback(result.feedback)
    setStepFeedbackIsCorrect(result.isCorrect)

    if (result.isCorrect) {
      playAudioEarcon('success')
      hapticLight()
      setSelectedChoiceIndex(null)
      setClozeInput('')
      setActiveHint(null)
      if (nextState.isCompleted) {
        playAudioEarcon('milestone')
        hapticHeavy()
      }
    } else {
      playAudioEarcon('error')
      hapticWarning()
    }

    setSession(nextState)
  }

  // Step submission
  const handleStepSubmit = () => {
    // Synchronous gate over the latest snapshot (the Verify button's disabled
    // state already reflects these conditions for the rendered step).
    const latest = sessionStateRef.current
    const activeStep = currentProblem.steps.find((s) => s.stepIndex === latest.currentStepIndex)
    if (!activeStep) return

    let answer = ''
    if (activeStep.scaffoldOptions) {
      if (selectedChoiceIndex === null) return
      answer = selectedChoiceIndex.toString()
    } else if (activeStep.clozeTarget) {
      if (!clozeInput.trim()) return
      answer = clozeInput.trim()
    } else {
      answer = clozeInput.trim()
    }

    const gen = sessionGen.current
    setStepPending(true)
    enqueueSessionAction(async () => {
      try {
        const res = await apiSend<EvaluateStepResponse>('/api/scaffolding', 'POST', {
          action: 'evaluateStep',
          state: sessionStateRef.current,
          answer,
        })
        if (gen !== sessionGen.current) return
        if (!res?.result || !res.state) throw new Error('malformed evaluateStep response')
        applyStepResult(res.result, res.state)
      } catch {
        if (gen !== sessionGen.current) return
        // Manual mode (rule 9): the in-browser engine mirror grades + advances.
        const session = hydrateSession(sessionStateRef.current)
        applyStepResult(session.evaluateCurrentStepAnswer(answer), session.getState())
      } finally {
        setStepPending(false)
      }
    })
  }

  // Hint button
  const handleRequestHint = () => {
    const gen = sessionGen.current
    setHintPending(true)
    enqueueSessionAction(async () => {
      const applyHint = (hint: string, nextState: ScaffoldingSessionState) => {
        setActiveHint(hint)
        playAudioEarcon('hint')
        hapticLight()
        setSession(nextState)
      }
      try {
        const res = await apiSend<HintResponse>('/api/scaffolding', 'POST', {
          action: 'hint',
          state: sessionStateRef.current,
        })
        if (gen !== sessionGen.current) return
        if (!res?.hint || !res.state) throw new Error('malformed hint response')
        applyHint(res.hint, res.state)
      } catch {
        if (gen !== sessionGen.current) return
        // Manual mode (rule 9): the in-browser engine mirror consumes the hint.
        const session = hydrateSession(sessionStateRef.current)
        applyHint(session.useHint(), session.getState())
      } finally {
        setHintPending(false)
      }
    })
  }

  // Reset problem session
  const handleResetSession = () => {
    applyNewSession(selectedProblemId, sessionState.stage, sessionState.learnerExpertise)
    setSelectedChoiceIndex(null)
    setClozeInput('')
    setStepFeedback(null)
    setActiveHint(null)
    hapticMedium()
  }

  // Self-Explanation submission
  const handleEvaluateExplanation = () => {
    const prompt = currentProblem.selfExplanationPrompts[activePromptIndex]
    if (!prompt || !userExplanationText.trim()) return

    const problemId = currentProblem.id
    const explanation = userExplanationText
    const gen = sessionGen.current
    setExplanationPending(true)
    enqueueSessionAction(async () => {
      try {
        // 1. Score the explanation (pure engine evaluation via the handler).
        let result: SelfExplanationEvaluation
        try {
          const res = await apiSend<SelfExplanationResponse>('/api/scaffolding', 'POST', {
            action: 'evaluateSelfExplanation',
            problemId,
            promptId: prompt.id,
            userExplanation: explanation,
          })
          if (gen !== sessionGen.current) return
          if (!res?.result) throw new Error('malformed self-explanation response')
          result = res.result
        } catch {
          if (gen !== sessionGen.current) return
          // Manual mode (rule 9): the in-browser engine mirror scores identically.
          result = evaluateSelfExplanation({ userExplanation: explanation, prompt })
        }

        // 2. Fold the score into the session (engine transition, snapshot protocol).
        let nextState: ScaffoldingSessionState
        try {
          const res = await apiSend<SessionStateResponse>('/api/scaffolding', 'POST', {
            action: 'recordSelfExplanation',
            state: sessionStateRef.current,
            promptId: prompt.id,
            score: result.score,
          })
          if (gen !== sessionGen.current) return
          if (!res?.state) throw new Error('malformed session response')
          nextState = res.state
        } catch {
          if (gen !== sessionGen.current) return
          const session = hydrateSession(sessionStateRef.current)
          session.recordSelfExplanationScore(prompt.id, result.score)
          nextState = session.getState()
        }

        setSelfExplanationResult(result)
        setSession(nextState)

        if (result.score >= 0.75) {
          playAudioEarcon('success')
          hapticMedium()
        } else {
          playAudioEarcon('hint')
          hapticLight()
        }
      } finally {
        setExplanationPending(false)
      }
    })
  }

  // Erroneous crucible submission (pure evaluation — no session state).
  const handleEvaluateErroneous = () => {
    const variant = currentProblem.erroneousVariants[activeErroneousIndex]
    if (!variant || !learnerRepairText.trim()) return

    const problemId = currentProblem.id
    const stepIndex = selectedFlawedStep
    const misconception = selectedMisconception
    const repairText = learnerRepairText
    setErroneousPending(true)
    void (async () => {
      let result: ErroneousEvaluationResult
      try {
        const res = await apiSend<ErroneousResponse>('/api/scaffolding', 'POST', {
          action: 'evaluateErroneous',
          problemId,
          variantId: variant.id,
          selectedStepIndex: stepIndex,
          selectedMisconception: misconception,
          learnerRepairText: repairText,
        })
        if (!res?.result) throw new Error('malformed erroneous-evaluation response')
        result = res.result
      } catch {
        // Manual mode (rule 9): the in-browser engine mirror diagnoses identically.
        result = evaluateErroneousAttempt({
          selectedStepIndex: stepIndex,
          selectedMisconception: misconception,
          learnerRepairText: repairText,
          erroneousVariant: variant,
        })
      }

      setErroneousResult(result)
      if (result.compositeScore >= 0.7) {
        playAudioEarcon('success')
        hapticHeavy()
      } else {
        playAudioEarcon('error')
        hapticWarning()
      }
    })().finally(() => setErroneousPending(false))
  }

  // Flashcard export — handler-computed card, engine-mirror fallback.
  const handleExportFlashcard = (stepIndex: number) => {
    const problemId = currentProblem.id
    const stage = sessionStateRef.current.stage
    void (async () => {
      let card: ReturnType<typeof exportStepToFSRS>
      try {
        const res = await apiSend<ExportCardResponse>('/api/scaffolding', 'POST', {
          action: 'exportCard',
          problemId,
          stepIndex,
          stage,
        })
        if (!res?.card) throw new Error('malformed exportCard response')
        card = res.card
      } catch {
        // Manual mode (rule 9): the in-browser engine mirror exports the card.
        card = exportStepToFSRS({ problem: currentProblem, stepIndex, stage })
      }

      if (onExportCard) {
        onExportCard(card)
      }

      // Trigger synthetic download of JSON card
      const blob = new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fsrs-scaffold-${problemId}-step-${stepIndex}.json`
      a.click()
      URL.revokeObjectURL(url)

      playAudioEarcon('milestone')
      hapticLight()
    })()
  }

  return (
    <div className={`flex flex-col gap-6 ${className || ''}`}>
      {/* Top Controls & Problem Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-faint">
            Calibrated Problem:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {Object.values(problems).map((p) => {
              const isSelected = p.id === selectedProblemId
              return (
                <button
                  key={p.id}
                  onClick={() => handleProblemChange(p.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'bg-white/5 text-secondary hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {p.title.split(' ')[0]} ({p.domain.replace('_', ' ')})
                </button>
              )
            })}
          </div>
        </div>

        {/* Audio Mute & Reset */}
        <div className="flex items-center gap-2">
          <IconButton
            label={audioMuted ? 'Unmute audio feedback' : 'Mute audio feedback'}
            title={audioMuted ? 'Unmute Earcons' : 'Mute Earcons'}
            onClick={() => setAudioMuted(!audioMuted)}
            className="rounded-xl border border-white/10 bg-white/5 text-faint hover:bg-white/10 hover:text-white"
          >
            {audioMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </IconButton>
          <button
            onClick={handleResetSession}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-white/10 hover:text-white transition-all"
            title="Reset Derivation Progression"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Cognitive Load Telemetry HUD */}
      <FadedScaffoldingHUD
        stage={sessionState.stage}
        strategy={sessionState.strategy}
        cognitiveLoad={sessionState.cognitiveLoad}
        elementInteractivity={currentProblem.elementInteractivity}
        domain={currentProblem.domain}
        problemTitle={currentProblem.title}
        activeStepIndex={sessionState.currentStepIndex}
        totalSteps={currentProblem.steps.length}
        onStageChange={handleStageChange}
        onStrategyChange={handleStrategyChange}
      />

      {/* Session transport error — shown only when BOTH the handler and the
          in-browser engine mirror failed (manual mode keeps API failures
          silent); cleared by the next queued action. */}
      {sessionError && (
        <Callout tone="danger">
          Session action failed — {sessionError}. Your local progress is kept; try again.
        </Callout>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-white/10 text-xs font-bold overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap">
        <button
          onClick={() => {
            setActiveTab('derivation')
            hapticLight()
          }}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 transition-all ${
            activeTab === 'derivation'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-faint hover:text-slate-200'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Derivation & Scaffolding Canvas</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('self_explanation')
            hapticLight()
          }}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 transition-all ${
            activeTab === 'self_explanation'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-faint hover:text-slate-200'
          }`}
        >
          <Brain className="h-4 w-4" />
          <span>Self-Explanation Lab (Chi 1989)</span>
          {Object.keys(sessionState.selfExplanationScores).length > 0 && (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-status-success-text font-bold">
              {Object.keys(sessionState.selfExplanationScores).length} done
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('erroneous_crucible')
            hapticLight()
          }}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 transition-all ${
            activeTab === 'erroneous_crucible'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-faint hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="h-4 w-4 text-status-warning-text" />
          <span>Erroneous Example Crucible (Große 2007)</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('fsrs_export')
            hapticLight()
          }}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 transition-all ${
            activeTab === 'fsrs_export'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-faint hover:text-slate-200'
          }`}
        >
          <Sparkles className="h-4 w-4 text-status-success-text" />
          <span>FSRS Flashcard Bridge</span>
        </button>
      </div>

      {/* Tab 1: Derivation & Scaffolding Canvas */}
      {activeTab === 'derivation' && (
        <div className="flex flex-col gap-5">
          {/* Problem Statement Card */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block mb-1">
              Problem Statement
            </span>
            <p className="text-sm font-medium text-slate-200 leading-relaxed">
              {currentProblem.problemStatement}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-faint">
              <span className="font-semibold text-tertiary">Prerequisites:</span>
              {currentProblem.prerequisites.map((pre, idx) => (
                <span
                  key={idx}
                  className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-secondary"
                >
                  {pre}
                </span>
              ))}
            </div>
          </div>

          {/* Derivation Steps List */}
          <div className="flex flex-col gap-4">
            {currentProblem.steps.map((step) => {
              const status =
                (apiFading?.key === fadingKey ? apiFading.statuses[step.id] : undefined) ??
                getStepFadingStatus({
                  step,
                  totalSteps: currentProblem.steps.length,
                  stage: sessionState.stage,
                  strategy: sessionState.strategy,
                })

              const isCompleted = sessionState.completedStepIds.includes(step.id)
              const isCurrent = step.stepIndex === sessionState.currentStepIndex
              const isFuture = step.stepIndex > sessionState.currentStepIndex

              return (
                <div
                  key={step.id}
                  className={`relative overflow-hidden rounded-2xl border transition-all ${
                    isCurrent
                      ? 'border-indigo-500 bg-slate-900/90 shadow-xl shadow-indigo-500/10'
                      : isCompleted
                        ? 'border-emerald-500/40 bg-slate-950/70'
                        : 'border-white/5 bg-slate-950/40 opacity-70'
                  }`}
                >
                  {/* Step Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-3 bg-white/[0.02]">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black ${
                          isCompleted
                            ? 'bg-emerald-500/20 text-status-success-text border border-emerald-500/30'
                            : isCurrent
                              ? 'bg-indigo-500 text-white'
                              : 'bg-white/10 text-faint'
                        }`}
                      >
                        {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : step.stepIndex}
                      </span>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-faint block">
                          Sub-Goal Chunk
                        </span>
                        <h4 className="text-xs font-bold text-white">{step.subgoalLabel}</h4>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
                        {step.governingPrinciple}
                      </span>
                      {/* One-click Export to FSRS */}
                      <IconButton
                        label="Export Step to FSRS Spaced Repetition Card"
                        size="sm"
                        onClick={() => handleExportFlashcard(step.stepIndex)}
                        className="rounded-lg border border-white/10 bg-white/5 text-faint hover:bg-white/10 hover:text-white"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-status-success-text" />
                      </IconButton>
                    </div>
                  </div>

                  {/* Step Content */}
                  <div className="p-5">
                    {/* Read-Only Mode (Stage 1 or already completed step) */}
                    {status.promptType === 'read_only' ||
                    isCompleted ||
                    (!isCurrent && !isFuture) ? (
                      <div className="flex flex-col gap-3">
                        <div className="rounded-xl border border-white/10 bg-slate-950 p-4 font-mono text-sm font-bold text-status-success-text overflow-x-auto">
                          <code>{step.content}</code>
                        </div>
                        <p className="text-xs text-secondary leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5">
                          <strong>Theoretical Justification:</strong> {step.explanation}
                        </p>
                      </div>
                    ) : null}

                    {/* Faded Completion Interactive Mode (Active Step) */}
                    {status.isOmitted && isCurrent && !isCompleted ? (
                      <div className="flex flex-col gap-4">
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                          <strong>Scaffolded Task:</strong> Complete this derivation step using the
                          governing principle (<em>{step.governingPrinciple}</em>).
                        </div>

                        {/* Multiple Choice Fading Option */}
                        {step.scaffoldOptions ? (
                          <div className="flex flex-col gap-2">
                            <span className="text-xs font-semibold text-secondary">
                              Select the mathematically sound derivation formulation:
                            </span>
                            {step.scaffoldOptions.map((opt, optIdx) => {
                              const isSelected = selectedChoiceIndex === optIdx
                              return (
                                <button
                                  key={optIdx}
                                  onClick={() => setSelectedChoiceIndex(optIdx)}
                                  className={`flex items-start gap-3 rounded-xl border p-3 text-left font-mono text-xs transition-all ${
                                    isSelected
                                      ? 'border-indigo-500 bg-indigo-500/20 text-white font-bold shadow-md shadow-indigo-500/20'
                                      : 'border-white/10 bg-slate-900/60 text-slate-300 hover:bg-white/5 hover:text-white'
                                  }`}
                                >
                                  <span
                                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                      isSelected
                                        ? 'bg-indigo-500 text-white'
                                        : 'bg-white/10 text-faint'
                                    }`}
                                  >
                                    {String.fromCharCode(65 + optIdx)}
                                  </span>
                                  <span className="break-all">{opt}</span>
                                </button>
                              )
                            })}
                          </div>
                        ) : null}

                        {/* Cloze Deletion / Free Generation Fading Option */}
                        {step.clozeTarget ? (
                          <div className="flex flex-col gap-2">
                            <span className="text-xs font-semibold text-secondary">
                              Fill in the missing target variable / expression:
                            </span>
                            <div className="rounded-xl border border-white/10 bg-slate-950 p-3 font-mono text-xs text-slate-200">
                              {step.clozeTemplate ? (
                                <span>{step.clozeTemplate.replace('{{target}}', '________')}</span>
                              ) : (
                                <span>Derive step target:</span>
                              )}
                            </div>
                            <input
                              type="text"
                              value={clozeInput}
                              onChange={(e) => setClozeInput(e.target.value)}
                              placeholder={`Enter target (e.g. "${step.clozeTarget}")...`}
                              className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                            />
                          </div>
                        ) : null}

                        {/* Hint Display */}
                        {activeHint && (
                          <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs text-indigo-300 flex items-start gap-2">
                            <Lightbulb className="h-4 w-4 shrink-0 text-indigo-400 mt-0.5" />
                            <span>{activeHint}</span>
                          </div>
                        )}

                        {/* Feedback Banner */}
                        {stepFeedback && (
                          <div
                            className={`rounded-xl border p-3 text-xs font-semibold flex items-center gap-2 ${
                              stepFeedbackIsCorrect
                                ? 'border-emerald-500/40 bg-emerald-500/15 text-status-success-text'
                                : 'border-rose-500/40 bg-rose-500/15 text-danger-text'
                            }`}
                          >
                            {stepFeedbackIsCorrect ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success-text" />
                            ) : (
                              <XCircle className="h-4 w-4 shrink-0 text-danger-text" />
                            )}
                            <span>{stepFeedback}</span>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center justify-between gap-3 pt-2">
                          <button
                            onClick={handleRequestHint}
                            disabled={hintPending}
                            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-secondary hover:bg-white/10 hover:text-white transition-all"
                          >
                            <Lightbulb className="h-3.5 w-3.5 text-status-warning-text" />
                            <span>Request Hint ({2 - sessionState.hintsUsed} remaining)</span>
                          </button>

                          <button
                            onClick={handleStepSubmit}
                            disabled={
                              stepPending ||
                              (step.scaffoldOptions
                                ? selectedChoiceIndex === null
                                : !clozeInput.trim())
                            }
                            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          >
                            <span>{stepPending ? 'Verifying…' : 'Verify Step'}</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {/* Locked Future Step Indicator */}
                    {isFuture && !isCompleted && !isCurrent ? (
                      <div className="flex items-center gap-2 text-xs text-tertiary py-1">
                        <Layers className="h-3.5 w-3.5" />
                        <span>
                          Step locked until Step {sessionState.currentStepIndex} is verified.
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Completion Celebration Banner */}
          {sessionState.isCompleted && (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-6 text-center backdrop-blur-md">
              <Award className="mx-auto h-12 w-12 text-status-success-text mb-2 animate-bounce" />
              <h3 className="text-base font-black text-white">Derivation Successfully Mastered!</h3>
              <p className="text-xs text-secondary max-w-lg mx-auto mt-1">
                You progressed through the Renkl-Atkinson scaffolding continuum, internalized the
                governing theoretical invariants, and maintained working memory capacity balance.
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <button
                  onClick={() => setActiveTab('self_explanation')}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all"
                >
                  Proceed to Self-Explanation Lab
                </button>
                <button
                  onClick={() => setActiveTab('fsrs_export')}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 transition-all"
                >
                  Export All Steps to FSRS Deck
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Self-Explanation Lab (Chi et al. 1989) */}
      {activeTab === 'self_explanation' && (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block mb-1">
              Chi et al. (1989) Principle-Based Self-Explanation
            </span>
            <p className="text-xs text-secondary leading-relaxed">
              Self-explaining worked examples stimulates germane cognitive load by forcing the
              active generation of domain inferences, linking surface mathematical moves to deep
              structural invariants.
            </p>
          </div>

          {/* Prompt Selector */}
          <div className="flex gap-2">
            {currentProblem.selfExplanationPrompts.map((p, pIdx) => (
              <button
                key={p.id}
                onClick={() => {
                  setActivePromptIndex(pIdx)
                  setUserExplanationText('')
                  setSelfExplanationResult(null)
                  hapticLight()
                }}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                  activePromptIndex === pIdx
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white/5 text-faint hover:bg-white/10 hover:text-white'
                }`}
              >
                Prompt #{pIdx + 1} ({p.promptType.replace('_', ' ')})
              </button>
            ))}
          </div>

          {/* Prompt Card */}
          {currentProblem.selfExplanationPrompts[activePromptIndex] && (
            <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/90 p-5">
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-sm font-bold text-white">
                  {currentProblem.selfExplanationPrompts[activePromptIndex].promptText}
                </h4>
                <span className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-mono text-indigo-300">
                  Target: Step{' '}
                  {currentProblem.selfExplanationPrompts[activePromptIndex].targetStepIndex}
                </span>
              </div>

              {/* Guiding Rubric Hints */}
              <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3 text-xs text-tertiary">
                <span className="font-semibold text-secondary block mb-1">
                  Required Rubric Coverage:
                </span>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {currentProblem.selfExplanationPrompts[activePromptIndex].guidingRubric.map(
                    (r, rIdx) => (
                      <li key={rIdx}>{r}</li>
                    ),
                  )}
                </ul>
              </div>

              {/* Text Input Area */}
              <textarea
                value={userExplanationText}
                onChange={(e) => setUserExplanationText(e.target.value)}
                placeholder="Type your deep principle-based explanation here (e.g. articulate why the Pigeonhole Principle or Bellman Principle of Optimality guarantees this transition)..."
                rows={5}
                className="w-full rounded-xl border border-white/10 bg-slate-950 p-4 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />

              {/* Evaluation Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleEvaluateExplanation}
                  disabled={explanationPending || !userExplanationText.trim()}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50 transition-all"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{explanationPending ? 'Evaluating…' : 'Evaluate Self-Explanation'}</span>
                </button>
              </div>

              {/* Evaluation Results */}
              {selfExplanationResult && (
                <div className="mt-2 flex flex-col gap-3 rounded-xl border border-white/10 bg-slate-950/80 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">
                      Rigor Score: {Math.round(selfExplanationResult.score * 100)}%
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold ${
                        selfExplanationResult.score >= 0.75
                          ? 'bg-emerald-500/20 text-status-success-text'
                          : 'bg-amber-500/20 text-status-warning-text'
                      }`}
                    >
                      Keyword Coverage: {Math.round(selfExplanationResult.keywordCoverage * 100)}%
                    </span>
                  </div>

                  <p className="text-xs text-secondary">
                    {selfExplanationResult.constructiveFeedback}
                  </p>

                  {/* Exemplar Comparison */}
                  <div className="rounded-lg border border-white/5 bg-slate-900 p-3 text-xs text-tertiary">
                    <span className="font-semibold text-indigo-400 block mb-1">
                      Canonical Exemplar Comparison:
                    </span>
                    <p className="italic text-secondary">
                      {selfExplanationResult.exemplarComparison}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Erroneous Example Crucible (Große & Renkl 2007) */}
      {activeTab === 'erroneous_crucible' && (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 shadow-xl backdrop-blur-md">
            <span className="text-[10px] font-bold uppercase tracking-wider text-status-warning-text block mb-1">
              Große & Renkl (2007) Erroneous Example Diagnostic Lab
            </span>
            <p className="text-xs text-secondary leading-relaxed">
              Research demonstrates that debugging incorrect examples combined with correct examples
              fosters deep conceptual schemas and inoculates against negative transfer.
            </p>
          </div>

          {/* Variant Selector */}
          {currentProblem.erroneousVariants.length > 1 && (
            <div className="flex gap-2">
              {currentProblem.erroneousVariants.map((v, vIdx) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setActiveErroneousIndex(vIdx)
                    setSelectedFlawedStep(1)
                    setLearnerRepairText('')
                    setErroneousResult(null)
                    hapticLight()
                  }}
                  className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                    activeErroneousIndex === vIdx
                      ? 'bg-amber-600 text-white'
                      : 'bg-white/5 text-faint hover:bg-white/10 hover:text-white'
                  }`}
                >
                  Flawed Case #{vIdx + 1}
                </button>
              ))}
            </div>
          )}

          {currentProblem.erroneousVariants[activeErroneousIndex] && (
            <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/90 p-5">
              <h4 className="text-xs font-bold text-secondary">
                A flawed proof variant was introduced. Pinpoint the flawed step and classify the
                root misconception:
              </h4>

              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 font-mono text-xs text-danger-text">
                <code>{currentProblem.erroneousVariants[activeErroneousIndex].flawedContent}</code>
              </div>

              {/* Step Selection */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-faint">
                  Which step contains the flaw?
                </span>
                {currentProblem.steps.map((st) => (
                  <button
                    key={st.stepIndex}
                    onClick={() => setSelectedFlawedStep(st.stepIndex)}
                    className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                      selectedFlawedStep === st.stepIndex
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white/5 text-faint hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    Step {st.stepIndex}
                  </button>
                ))}
              </div>

              {/* Misconception Category Selector */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-faint">Misconception Category:</span>
                {(
                  [
                    'invariant_violation',
                    'boundary_edge_case',
                    'premature_optimization',
                    'flawed_induction',
                    'concurrency_race',
                    'fallacious_assumption',
                  ] as MisconceptionCategory[]
                ).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedMisconception(cat)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                      selectedMisconception === cat
                        ? 'bg-amber-600 text-white'
                        : 'bg-white/5 text-faint hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {cat.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {/* Corrective Repair Formulation */}
              <textarea
                value={learnerRepairText}
                onChange={(e) => setLearnerRepairText(e.target.value)}
                placeholder="State the mathematical / logical repair to restore proof validity..."
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />

              <div className="flex justify-end">
                <button
                  onClick={handleEvaluateErroneous}
                  disabled={erroneousPending || !learnerRepairText.trim()}
                  className="flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-amber-600/30 hover:bg-amber-500 disabled:opacity-50 transition-all"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>{erroneousPending ? 'Diagnosing…' : 'Diagnose Misconception'}</span>
                </button>
              </div>

              {/* Erroneous Diagnostic Result */}
              {erroneousResult && (
                <div className="rounded-xl border border-white/10 bg-slate-950/80 p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">
                      Diagnostic Rigor: {Math.round(erroneousResult.compositeScore * 100)}%
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold ${
                        erroneousResult.compositeScore >= 0.7
                          ? 'bg-emerald-500/20 text-status-success-text'
                          : 'bg-rose-500/20 text-danger-text'
                      }`}
                    >
                      {erroneousResult.isStepIdentifiedCorrectly &&
                      erroneousResult.isMisconceptionIdentifiedCorrectly
                        ? 'Category & Step Spot-On'
                        : 'Diagnosis Needed Adjustment'}
                    </span>
                  </div>
                  <p className="text-xs text-secondary">{erroneousResult.diagnosticSummary}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: FSRS Spaced Repetition Bridge */}
      {activeTab === 'fsrs_export' && (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md">
            <span className="text-[10px] font-bold uppercase tracking-wider text-status-success-text block mb-1">
              FSRS v5 Spaced Repetition Flashcard Bridge
            </span>
            <p className="text-xs text-secondary leading-relaxed">
              Export each faded step into high-yield active recall flashcards. Cards feature
              sub-goal chunking, theoretical justifications, and custom tags for long-term
              retention.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentProblem.steps.map((step) => {
              const card =
                (apiDeck?.key === deckKey ? apiDeck.cards[step.stepIndex] : undefined) ??
                exportStepToFSRS({
                  problem: currentProblem,
                  stepIndex: step.stepIndex,
                  stage: sessionState.stage,
                })

              return (
                <div
                  key={step.id}
                  className="flex flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/90 p-5 shadow-lg backdrop-blur-md"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase text-indigo-400 font-bold">
                        Step {step.stepIndex} • {step.subgoalLabel}
                      </span>
                      <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-secondary font-mono">
                        Diff: {card.suggestedDifficulty}/10
                      </span>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-slate-950/80 p-3 text-xs text-slate-300">
                      <strong>Card Front:</strong>
                      <p className="mt-1 text-[11px] text-faint line-clamp-3">{card.front}</p>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-slate-950/80 p-3 text-xs text-slate-300">
                      <strong>Card Back:</strong>
                      <p className="mt-1 text-[11px] text-status-success-text/90 line-clamp-3">
                        {card.back}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between pt-3 border-t border-white/5">
                    <div className="flex gap-1">
                      {card.tags.map((t, tIdx) => (
                        <span key={tIdx} className="text-[10px] text-tertiary">
                          #{t}
                        </span>
                      ))}
                    </div>

                    <button
                      onClick={() => handleExportFlashcard(step.stepIndex)}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-emerald-600/30 hover:bg-emerald-500 transition-all"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Export Card</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
