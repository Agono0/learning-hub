'use client'

/**
 * Metacognitive Calibration & Fluency-Illusion Diagnostic Studio.
 *
 * Implements Glenn Brier (1950) probability verification, Koriat & Bjork (2005)
 * fluency illusion diagnostics, and Bjork & Bjork (2011) desirable difficulties.
 *
 * Features an interactive SVG calibration curve plotting Subjective Confidence (JOL)
 * against Empirical Accuracy, real-time Brier score calculations, and an interactive
 * mini-drill to test and calibrate learner intuition.
 */
import React, { useId, useMemo, useState } from 'react'
import {
  Brain,
  CheckCircle,
  Compass,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import {
  calculateMetacognitiveReport,
  type JudgmentOfLearning,
  type MetacognitiveReport,
} from '@learning-hub/core/metacognition'
import { Badge } from './Feedback'
import { cx } from './cx'
import { hapticLight, hapticMedium, hapticWarning } from '@/platform/haptics'

export interface MetacognitiveCalibrationCardProps {
  initialJudgments?: JudgmentOfLearning[]
  onJudgmentAdded?: (item: JudgmentOfLearning) => void
  className?: string
  deckName?: string
}

const SAMPLE_BENCHMARKS = [
  { confidence: 0.9, outcome: 0, latencyMs: 1200 }, // Fluency illusion
  { confidence: 0.8, outcome: 1, latencyMs: 1800 },
  { confidence: 0.3, outcome: 0, latencyMs: 3400 },
  { confidence: 0.6, outcome: 1, latencyMs: 2100 },
  { confidence: 0.95, outcome: 0, latencyMs: 950 }, // Overconfidence slip
  { confidence: 0.5, outcome: 1, latencyMs: 2500 },
]

export function MetacognitiveCalibrationCard({
  initialJudgments = SAMPLE_BENCHMARKS,
  onJudgmentAdded,
  className,
  deckName,
}: MetacognitiveCalibrationCardProps) {
  const gradientId = useId()
  const [trials, setTrials] = useState<JudgmentOfLearning[]>(initialJudgments)

  // Interactive Mini-Drill State
  const [drillConfidence, setDrillConfidence] = useState<number>(0.8)
  const [drillRevealed, setDrillRevealed] = useState<boolean>(false)
  const [currentPromptIdx, setCurrentPromptIdx] = useState<number>(0)

  const DRILL_PROMPTS = [
    {
      concept: 'Bayesian Knowledge Tracing (BKT)',
      prompt: 'What are the 4 core parameters that govern BKT state transitions?',
      answer:
        'Initial mastery P(L0), Transition P(T), Slip probability P(S), Guess probability P(G).',
    },
    {
      concept: 'Desirable Difficulties (Bjork 2011)',
      prompt:
        'Why does massed practice create a rapid feeling of fluency that degrades in delayed tests?',
      answer:
        'Working memory accessibility is mistaken for long-term storage strength (Koriat-Bjork fluency illusion).',
    },
    {
      concept: 'FSRS Stability Metric',
      prompt: 'How is FSRS Stability (S) mathematically defined in relation to retrievability (R)?',
      answer:
        'Stability is the interval duration (in days) required for retrievability R to decay from 100% to 90%.',
    },
    {
      concept: 'Generation Effect (Slamecka & Graf)',
      prompt:
        'What primary cognitive mechanism explains why self-generating words yields higher retention than reading?',
      answer:
        'Active semantic cue generation engages deeper levels of processing and idiosyncratic associative networks.',
    },
  ]

  const activePrompt = DRILL_PROMPTS[currentPromptIdx % DRILL_PROMPTS.length]!

  // Compute report dynamically
  const report: MetacognitiveReport = useMemo(() => {
    return calculateMetacognitiveReport(trials)
  }, [trials])

  // Aggregate trials into 5 confidence buckets (0-20%, 20-40%, 40-60%, 60-80%, 80-100%)
  const calibrationBins = useMemo(() => {
    const bins = [
      { label: '0-20%', center: 0.1, trials: [] as JudgmentOfLearning[] },
      { label: '20-40%', center: 0.3, trials: [] as JudgmentOfLearning[] },
      { label: '40-60%', center: 0.5, trials: [] as JudgmentOfLearning[] },
      { label: '60-80%', center: 0.7, trials: [] as JudgmentOfLearning[] },
      { label: '80-100%', center: 0.9, trials: [] as JudgmentOfLearning[] },
    ]

    for (const t of trials) {
      const idx = Math.min(4, Math.max(0, Math.floor(t.confidence * 5)))
      bins[idx]!.trials.push(t)
    }

    return bins.map((b) => {
      const count = b.trials.length
      const avgConfidence =
        count > 0 ? b.trials.reduce((s, x) => s + x.confidence, 0) / count : b.center
      const avgAccuracy = count > 0 ? b.trials.reduce((s, x) => s + x.outcome, 0) / count : null
      return {
        ...b,
        count,
        avgConfidence,
        avgAccuracy,
      }
    })
  }, [trials])

  const handleGradeDrill = (outcome: 0 | 1) => {
    if (outcome === 1) {
      hapticMedium()
    } else {
      hapticWarning()
    }

    const newTrial: JudgmentOfLearning = {
      confidence: drillConfidence,
      outcome,
      latencyMs: 1500,
    }

    setTrials((prev) => [...prev, newTrial])
    if (onJudgmentAdded) onJudgmentAdded(newTrial)

    // Reset drill for next prompt
    setDrillRevealed(false)
    setDrillConfidence(0.7)
    setCurrentPromptIdx((prev) => prev + 1)
  }

  const handleResetTrials = () => {
    hapticLight()
    setTrials([])
  }

  // Visual status formatting
  const statusConfig = {
    expertly_calibrated: {
      tone: 'success' as const,
      icon: Sparkles,
      title: 'Expert Calibration',
      color: 'text-status-success-text',
    },
    mild_overconfidence: {
      tone: 'warning' as const,
      icon: TrendingUp,
      title: 'Mild Overconfidence',
      color: 'text-status-warning-text',
    },
    fluency_illusion: {
      tone: 'danger' as const,
      icon: ShieldAlert,
      title: 'Fluency Illusion (Dunning-Kruger)',
      color: 'text-danger-text',
    },
    underconfident: {
      tone: 'cyan' as const,
      icon: TrendingDown,
      title: 'Underconfidence Bias',
      color: 'text-status-info-text',
    },
  }[report.status]

  return (
    <div
      className={cx(
        'rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 shadow-sm space-y-6',
        className,
      )}
    >
      {/* Studio Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Metacognitive Calibration Studio
              </h3>
              <Badge tone={statusConfig.tone} pulse={report.status === 'fluency_illusion'}>
                {statusConfig.title}
              </Badge>
            </div>
            <p className="text-xs text-tertiary dark:text-faint">
              Koriat &amp; Bjork (2005) · {report.sampleSize} Judgments of Learning evaluated{' '}
              {deckName && `in ${deckName}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetTrials}
            className="text-xs text-tertiary hover:text-neutral-700 dark:hover:text-secondary flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Cohort</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Brier Score */}
        <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/70 dark:border-neutral-700/50">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-tertiary dark:text-faint flex items-center justify-between">
            <span>Brier Score</span>
            <span className="text-[10px] text-faint">0.0 = Perfect</span>
          </div>
          <div className="mt-1 text-2xl font-mono font-bold text-neutral-900 dark:text-neutral-100">
            {report.brierScore.toFixed(3)}
          </div>
          <div className="mt-0.5 text-xs text-tertiary">
            {report.brierScore <= 0.15 ? 'Superior accuracy' : 'Calibration drift'}
          </div>
        </div>

        {/* Metacognitive Bias */}
        <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/70 dark:border-neutral-700/50">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-tertiary dark:text-faint">
            Introspection Bias
          </div>
          <div
            className={cx(
              'mt-1 text-2xl font-mono font-bold',
              report.bias > 0.08
                ? 'text-danger-text'
                : report.bias < -0.08
                  ? 'text-status-info-text'
                  : 'text-status-success-text',
            )}
          >
            {report.bias > 0
              ? `+${(report.bias * 100).toFixed(1)}%`
              : `${(report.bias * 100).toFixed(1)}%`}
          </div>
          <div className="mt-0.5 text-xs text-tertiary">
            {report.bias > 0.08
              ? 'Overconfident'
              : report.bias < -0.08
                ? 'Underconfident'
                : 'Well calibrated'}
          </div>
        </div>

        {/* Average Confidence */}
        <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/70 dark:border-neutral-700/50">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-tertiary dark:text-faint">
            Mean JOL Estimate
          </div>
          <div className="mt-1 text-2xl font-mono font-bold text-indigo-600 dark:text-indigo-400">
            {Math.round(report.averageConfidence * 100)}%
          </div>
          <div className="mt-0.5 text-xs text-tertiary">Predicted retention</div>
        </div>

        {/* Actual Recall */}
        <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/70 dark:border-neutral-700/50">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-tertiary dark:text-faint">
            Empirical Recall
          </div>
          <div className="mt-1 text-2xl font-mono font-bold text-status-success-text dark:text-status-success-text">
            {Math.round(report.accuracy * 100)}%
          </div>
          <div className="mt-0.5 text-xs text-tertiary">Actual score</div>
        </div>
      </div>

      {/* Calibration Graph & Friction Guidance Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* SVG Calibration Curve */}
        <div className="rounded-xl p-4 bg-neutral-50/70 dark:bg-neutral-800/30 border border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-secondary">
              Calibration Curve (Confidence vs. Recall)
            </h4>
            <span className="text-[11px] text-faint">Ideal = 45° Dashed Line</span>
          </div>

          <div className="relative aspect-4/3 w-full">
            <svg viewBox="0 0 320 240" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id={`overconf-${gradientId}`} x1="0%" y1="100%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.15" />
                </linearGradient>
                <linearGradient id={`underconf-${gradientId}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.05" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1.0].map((step, i) => {
                const x = 40 + step * 250
                const y = 200 - step * 170
                return (
                  <g key={`grid-${i}`}>
                    {/* Horizontal */}
                    <line
                      x1="40"
                      y1={y}
                      x2="290"
                      y2={y}
                      stroke="currentColor"
                      strokeDasharray="2 3"
                      className="text-neutral-200 dark:text-neutral-700/60"
                      strokeWidth="1"
                    />
                    {/* Vertical */}
                    <line
                      x1={x}
                      y1="30"
                      x2={x}
                      y2="200"
                      stroke="currentColor"
                      strokeDasharray="2 3"
                      className="text-neutral-200 dark:text-neutral-700/60"
                      strokeWidth="1"
                    />
                    {/* Axis Labels */}
                    <text
                      x="32"
                      y={y + 3}
                      textAnchor="end"
                      className="text-[9px] fill-neutral-400 font-mono"
                    >
                      {Math.round(step * 100)}%
                    </text>
                    <text
                      x={x}
                      y="214"
                      textAnchor="middle"
                      className="text-[9px] fill-neutral-400 font-mono"
                    >
                      {Math.round(step * 100)}%
                    </text>
                  </g>
                )
              })}

              {/* Overconfidence Shaded Polygon (Below Diagonal) */}
              <polygon points="40,200 290,30 290,200" fill={`url(#overconf-${gradientId})`} />

              {/* Underconfidence Shaded Polygon (Above Diagonal) */}
              <polygon points="40,200 40,30 290,30" fill={`url(#underconf-${gradientId})`} />

              {/* Labels for Regions */}
              <text
                x="220"
                y="170"
                className="text-[9px] fill-rose-500/70 font-semibold"
                textAnchor="middle"
              >
                Overconfident (Fluency Illusion)
              </text>
              <text
                x="110"
                y="65"
                className="text-[9px] fill-sky-500/70 font-semibold"
                textAnchor="middle"
              >
                Underconfident (Hidden Mastery)
              </text>

              {/* 45-degree Perfect Calibration Line */}
              <line
                x1="40"
                y1="200"
                x2="290"
                y2="30"
                stroke="#6366f1"
                strokeWidth="2"
                strokeDasharray="4 4"
                className="opacity-70"
              />

              {/* Plotted Binned Points */}
              {calibrationBins.map((b, i) => {
                if (b.avgAccuracy === null) return null
                const px = 40 + b.avgConfidence * 250
                const py = 200 - b.avgAccuracy * 170

                return (
                  <g key={`bin-${i}`}>
                    {/* Drop line */}
                    <line
                      x1={px}
                      y1="200"
                      x2={px}
                      y2={py}
                      stroke="currentColor"
                      strokeDasharray="2 2"
                      className="text-secondary dark:text-neutral-700"
                      strokeWidth="1"
                    />
                    {/* Circle */}
                    <circle
                      cx={px}
                      cy={py}
                      r="6"
                      className="fill-indigo-600 dark:fill-indigo-400 stroke-white dark:stroke-neutral-900"
                      strokeWidth="2"
                    />
                    <text
                      x={px}
                      y={py - 10}
                      textAnchor="middle"
                      className="text-[9px] font-bold fill-neutral-800 dark:fill-neutral-200 font-mono"
                    >
                      {Math.round(b.avgAccuracy * 100)}%
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>

          <div className="flex items-center justify-between text-[11px] text-tertiary mt-2 px-1">
            <span>X: Predicted Confidence (JOL)</span>
            <span>Y: Actual Recall Accuracy</span>
          </div>
        </div>

        {/* Science Guidance & Interactive Calibration Drill */}
        <div className="space-y-4">
          {/* Scientific Guidance Card */}
          <div
            className={cx(
              'p-4 rounded-xl border',
              report.status === 'fluency_illusion'
                ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 text-rose-900 dark:text-rose-100'
                : report.status === 'expertly_calibrated'
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-900 dark:text-emerald-100'
                  : 'bg-indigo-50/70 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/40 text-indigo-900 dark:text-indigo-100',
            )}
          >
            <div className="flex items-start gap-2.5">
              <Brain className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider">
                  Desirable Difficulty Protocol
                </h4>
                <p className="mt-1 text-xs leading-relaxed opacity-90">{report.guidance}</p>
                <div className="mt-2 text-[11px] font-mono">
                  Recommended Mode:{' '}
                  <span className="font-semibold">{report.difficultyAdjustment}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Mini Calibration Challenge */}
          <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-faint flex items-center gap-1.5">
                <Play className="h-3.5 w-3.5 text-indigo-500 fill-indigo-500" />
                Live Calibration Check
              </span>
              <span className="text-[11px] text-faint font-mono">Card #{currentPromptIdx + 1}</span>
            </div>

            <div>
              <div className="text-xs font-semibold text-tertiary dark:text-faint">
                {activePrompt.concept}
              </div>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 mt-0.5">
                {activePrompt.prompt}
              </p>
            </div>

            {!drillRevealed ? (
              <div className="space-y-3 pt-1">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-neutral-600 dark:text-faint">
                      Pre-Recall Confidence (JOL):
                    </span>
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {Math.round(drillConfidence * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={drillConfidence}
                    onChange={(e) => setDrillConfidence(parseFloat(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-faint font-mono">
                    <span>0% Guess</span>
                    <span>50% Probable</span>
                    <span>100% Certain</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    hapticLight()
                    setDrillRevealed(true)
                  }}
                  className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-neutral-300 dark:border-neutral-700 hover:border-indigo-500 transition shadow-2xs"
                >
                  Reveal Canon Answer &amp; Calibrate
                </button>
              </div>
            ) : (
              <div className="space-y-3 pt-1 animate-fade-in">
                <div className="p-3 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700">
                  {activePrompt.answer}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-tertiary">How did you perform?</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleGradeDrill(0)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-danger-text border border-rose-200 dark:border-rose-900/50 flex items-center gap-1 transition"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      <span>Missed (0)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGradeDrill(1)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-status-success-text border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-1 transition"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      <span>Recalled (1)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
