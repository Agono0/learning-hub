'use client'

/**
 * Pretesting & Errorful Generation Lab (Kornell, Hays & Bjork 2009).
 *
 * Renders the protocol loop against REAL card questions: guess → feedback →
 * study NOW → retest to criterion. Wrong guesses are celebrated as the
 * protocol's engine — the studio never hides them, and confident wrong
 * guesses are surfaced as hypercorrection retest targets.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Brain,
  CheckCircle2,
  Eye,
  EyeOff,
  FlaskConical,
  RotateCcw,
  Target,
  XCircle,
  Zap,
} from 'lucide-react'
import {
  PretestingSession,
  evaluatePretestingSession,
  type PretestCardState,
  type PretestingSessionReport,
} from '@learning-hub/core'
import { cx } from '../ui/cx'
import { hapticHeavy, hapticLight, hapticWarning } from '../platform/haptics'

export interface PretestCandidate {
  cardId: number
  front: string
  target: string
  kind: string
  question: string
  relatedness: number
  solidPretest: boolean
  stability: number
  difficulty: number
}

export interface PretestingLabProps {
  candidates: PretestCandidate[]
  className?: string
}

const CONFIDENCE_STEPS = [0.1, 0.3, 0.5, 0.7, 0.9]

/**
 * The pretest loop. Session state lives in the pure `PretestingSession`
 * machine; this component mirrors it for rendering.
 */
export function PretestingLab({ candidates, className }: PretestingLabProps) {
  const sessionRef = useRef<PretestingSession | null>(null)
  const [sessionId, setSessionId] = useState(0)
  const [sessionState, setSessionState] = useState(() => {
    const s = new PretestingSession(
      candidates.map((c) => ({ cardId: c.cardId, prompt: c.question, target: c.target })),
    )
    sessionRef.current = s
    return s.getState()
  })
  const [guess, setGuess] = useState('')
  const [confidence, setConfidence] = useState(0.5)
  const [guessStart, setGuessStart] = useState<number | null>(null)
  const [studyStart, setStudyStart] = useState<number | null>(null)
  const [retestInput, setRetestInput] = useState('')

  const reset = useCallback(() => {
    const s = new PretestingSession(
      candidates.map((c) => ({ cardId: c.cardId, prompt: c.question, target: c.target })),
    )
    sessionRef.current = s
    setSessionState(s.getState())
    setGuess('')
    setConfidence(0.5)
    setGuessStart(null)
    setStudyStart(null)
    setRetestInput('')
    setSessionId((id) => id + 1)
  }, [candidates])

  const report: PretestingSessionReport = useMemo(
    () => evaluatePretestingSession([...sessionState.states.values()] as PretestCardState[]),
    [sessionState],
  )

  const active =
    sessionState.activeCardId === null
      ? null
      : (sessionState.states.get(sessionState.activeCardId) ?? null)
  const candidate = active ? (candidates.find((c) => c.cardId === active.cardId) ?? null) : null

  const submitGuess = () => {
    const session = sessionRef.current
    if (!session) return
    const searchMs = guessStart ? Date.now() - guessStart : undefined
    const res = session.recordPretestAttempt({ guess, confidence, searchMs })
    if (res.success) {
      setSessionState(session.getState())
      setStudyStart(Date.now())
      if (res.wasCorrect) hapticLight()
      else hapticHeavy()
    }
  }

  const submitStudy = () => {
    const session = sessionRef.current
    if (!session) return
    const delay = studyStart ? Date.now() - studyStart : 0
    const res = session.recordStudyEpisode(delay)
    if (res.success) {
      setSessionState(session.getState())
      hapticLight()
    }
  }

  const submitRetest = (correct: boolean) => {
    const session = sessionRef.current
    if (!session) return
    const res = session.recordRetest(correct)
    if (res.success) {
      setSessionState(session.getState())
      setRetestInput('')
      if (res.criterionMet) hapticLight()
      else hapticWarning()
    }
  }

  return (
    <div className={cx('space-y-4', className)} data-testid="pretesting-lab">
      {/* Protocol banner */}
      <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/5 p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          <FlaskConical className="h-4 w-4 text-indigo-400" /> The pretesting protocol
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-faint">
          Guess <em>before</em> you study. A wrong guess followed by immediate study encodes better
          than study alone (Kornell, Hays &amp; Bjork 2009) — the failure is the point, as long as
          feedback follows and the study resolves the question.
        </p>
      </div>

      {/* Active loop */}
      {active && candidate ? (
        <div
          className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
          key={sessionId + '-' + active.cardId}
        >
          <div className="flex items-center justify-between text-xs text-faint">
            <span className="font-mono">
              card #{active.cardId} · {active.kind.replace(/_/g, ' ')}
            </span>
            <span
              className={cx(
                'rounded-full border px-2 py-0.5 text-[10px] font-bold',
                candidate.solidPretest
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-status-success-text'
                  : 'border-amber-500/40 bg-amber-500/10 text-status-warning-text',
              )}
            >
              {candidate.solidPretest
                ? `solid pretest · relatedness ${candidate.relatedness}`
                : `arbitrary question · relatedness ${candidate.relatedness}`}
            </span>
          </div>

          {sessionState.phase === 'pretest' && (
            <div className="mt-3 space-y-3">
              <p className="text-base font-semibold leading-relaxed text-white">{active.prompt}</p>
              <textarea
                value={guess}
                onChange={(e) => {
                  setGuess(e.target.value)
                  if (guessStart === null) setGuessStart(Date.now())
                }}
                placeholder="Guess — wrong answers make the study episode stick"
                rows={2}
                aria-label="Your pretest guess"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white placeholder:text-tertiary"
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-faint">Confidence in this guess:</span>
                {CONFIDENCE_STEPS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setConfidence(c)}
                    aria-pressed={confidence === c}
                    className={cx(
                      'min-h-[36px] rounded-lg border px-2.5 py-1 text-xs font-bold',
                      confidence === c
                        ? 'border-indigo-500/50 bg-indigo-500/20 text-indigo-200'
                        : 'border-slate-700 bg-slate-800/60 text-slate-300',
                    )}
                  >
                    {Math.round(c * 100)}%
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={submitGuess}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500"
              >
                <EyeOff className="h-4 w-4" /> Lock the guess and reveal
              </button>
            </div>
          )}

          {sessionState.phase === 'study' && (
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
                <div className="flex items-start gap-2">
                  <Zap className="mt-0.5 h-4 w-4 shrink-0 text-status-warning-text" />
                  <div className="text-xs leading-relaxed text-amber-100">
                    {sessionState.lastFeedback}
                    {sessionState.lastShockConfidence !== null &&
                      sessionState.lastShockConfidence >= 0.7 && (
                        <p className="mt-1 text-amber-200/90">
                          Confident miss — this is a hypercorrection target now (Butterfield &amp;
                          Metcalfe 2001). Retest it first.
                        </p>
                      )}
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950 p-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-faint">
                  Study this now
                </span>
                <p className="mt-1.5 text-sm font-semibold text-white">{candidate.target}</p>
                <p className="mt-1 text-xs text-faint">Original question: {candidate.front}</p>
              </div>
              <button
                type="button"
                onClick={submitStudy}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
              >
                <Eye className="h-4 w-4" /> I studied it — start the retest
              </button>
            </div>
          )}

          {sessionState.phase === 'retest' && (
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-status-info-text">
                  Successive relearning · {active.successfulRecalls}/{active.criterionRecalls}{' '}
                  consecutive recalls
                </span>
                <p className="mt-1.5 text-sm font-semibold text-white">{candidate.front}</p>
              </div>
              <input
                type="text"
                value={retestInput}
                onChange={(e) => setRetestInput(e.target.value)}
                placeholder="Type the answer from memory…"
                aria-label="Retest answer"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white placeholder:text-tertiary"
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    submitRetest(
                      retestInput.trim().length > 0 &&
                        retestInput.trim().toLowerCase() === candidate.target.trim().toLowerCase(),
                    )
                  }
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600/90 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
                >
                  <CheckCircle2 className="h-4 w-4" /> Correct recall
                </button>
                <button
                  type="button"
                  onClick={() => submitRetest(false)}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-rose-600/90 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-500"
                >
                  <XCircle className="h-4 w-4" /> I missed it
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
          <Brain className="mx-auto h-8 w-8 text-status-success-text" />
          <h3 className="mt-2 text-base font-bold text-white">
            {candidates.length === 0
              ? 'No pretest candidates yet'
              : 'All criteria met — session complete'}
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-faint">
            {candidates.length === 0
              ? 'Pretesting works on young, fragile cards. Review some material first — new cards will appear here ranked by fragility.'
              : `${report.cards.length} cards ran the protocol with ${Math.round(report.protocolCompliance * 100)}% full compliance.`}
          </p>
          {candidates.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500"
            >
              <RotateCcw className="h-4 w-4" /> Run again
            </button>
          )}
        </div>
      )}

      {/* Session telemetry */}
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-center">
          <span className="block text-[10px] uppercase text-faint">Compliance</span>
          <span className="font-mono text-lg font-black text-status-success-text">
            {Math.round(report.protocolCompliance * 100)}%
          </span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-center">
          <span className="block text-[10px] uppercase text-faint">Mean multiplier</span>
          <span className="font-mono text-lg font-black text-indigo-300">
            ×{report.meanPredictedMultiplier}
          </span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-center">
          <span className="block text-[10px] uppercase text-faint">HC targets</span>
          <span className="font-mono text-lg font-black text-status-warning-text">
            {report.hypercorrectionTargets.length}
          </span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-center">
          <span className="block text-[10px] uppercase text-faint">Relearn queue</span>
          <span className="font-mono text-lg font-black text-status-info-text">
            {report.relearningQueue.length}
          </span>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-faint">{report.guidance}</p>

      {report.hypercorrectionTargets.length > 0 && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            <Target className="h-4 w-4 text-status-warning-text" /> Retest these confident misses
            first
          </h3>
          <ul className="mt-2 space-y-1.5 text-xs text-secondary">
            {report.hypercorrectionTargets.map((t, i) => (
              <li key={i} className="font-mono">
                card #{t.cardId} · {Math.round(t.confidence * 100)}% confident · "
                {t.guess.slice(0, 60)}"
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
