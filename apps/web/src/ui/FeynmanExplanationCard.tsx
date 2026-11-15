import { useState } from 'react'
import type { FeynmanDiagnosticReport, SocraticProbe } from '@learning-hub/core'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Lightbulb,
  MessageSquare,
  Plus,
  Sparkles,
  Zap,
} from 'lucide-react'
import { Badge } from './Feedback'
import { StatCard } from './StatCard'
import { cx } from './cx'

export interface FeynmanExplanationCardProps {
  report: FeynmanDiagnosticReport
  onSelectProbe?: (probe: SocraticProbe) => void
  onSaveGapCard?: (card: { front: string; back: string; tags: string[] }) => void
  className?: string
}

export function FeynmanExplanationCard({
  report,
  onSelectProbe,
  onSaveGapCard,
  className,
}: FeynmanExplanationCardProps) {
  const [savedCardIndex, setSavedCardIndex] = useState<number | null>(null)

  const gradeTone =
    report.fleschKincaidGradeLevel <= 7.5
      ? 'success'
      : report.fleschKincaidGradeLevel <= 10
        ? 'warning'
        : 'danger'

  const scoreTone =
    report.explanatoryDepthScore >= 70
      ? 'success'
      : report.explanatoryDepthScore >= 45
        ? 'warning'
        : 'danger'

  const ioedTone = report.ioedGap >= 30 ? 'danger' : report.ioedGap >= 15 ? 'warning' : 'success'

  const verdictLabel = {
    mastery_clarity: 'Crystal Clear (12-Year-Old Accessible)',
    jargon_heavy: 'Jargon-Heavy (Needs Plain Analogy)',
    illusion_of_depth: 'Illusion of Depth Detected (Rozenblit & Keil)',
    rudimentary: 'Too Brief (Elaborate Mechanism)',
  }[report.summaryVerdict]

  return (
    <div
      className={cx(
        'panel-elevated relative overflow-hidden rounded-2xl border border-neutral-200/80 bg-white/80 p-5 backdrop-blur-md transition-all dark:border-(--hub-border) dark:bg-(--hub-panel)/90',
        className,
      )}
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-4 dark:border-(--hub-border)">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Lightbulb className="h-4 w-4" />
            </span>
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
              Feynman Teach-Back Analysis: {report.concept}
            </h3>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Flesch-Kincaid Readability & Rozenblit-Keil Explanatory Depth Breakdown
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={scoreTone} dot pulse={report.explanatoryDepthScore >= 70}>
            Depth Score: {report.explanatoryDepthScore}%
          </Badge>
          <Badge
            tone={
              report.summaryVerdict === 'mastery_clarity'
                ? 'success'
                : report.summaryVerdict === 'illusion_of_depth'
                  ? 'danger'
                  : 'warning'
            }
          >
            {verdictLabel}
          </Badge>
        </div>
      </div>

      {/* Metric tiles row */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Readability Grade"
          value={`Grade ${report.fleschKincaidGradeLevel}`}
          hint={`Flesch Ease: ${report.fleschReadingEase}/100`}
          accent={report.fleschKincaidGradeLevel <= 7.5 ? 'emerald' : 'amber'}
          icon={<BookOpen className="h-4 w-4" />}
          badge={
            <Badge tone={gradeTone}>
              {report.isTwelveYearOldAccessible ? '12-yo Ready' : 'Needs Simplicity'}
            </Badge>
          }
        />

        <StatCard
          label="Jargon Density"
          value={`${report.jargonDensity}%`}
          hint={
            report.jargonTerms.length > 0
              ? `${report.jargonTerms.length} complex word(s)`
              : 'Zero technical barriers'
          }
          accent={report.jargonTerms.length === 0 ? 'emerald' : 'rose'}
          icon={<AlertTriangle className="h-4 w-4" />}
          badge={
            <Badge tone={report.jargonTerms.length === 0 ? 'success' : 'danger'}>
              {report.jargonTerms.length === 0 ? 'Plain Words' : 'Jargon Alert'}
            </Badge>
          }
        />

        <StatCard
          label="Causal Connectors"
          value={report.causalMarkerCount}
          hint={`${report.causalDensity} markers/sentence`}
          accent={report.causalMarkerCount >= 2 ? 'emerald' : 'amber'}
          icon={<Zap className="h-4 w-4" />}
          badge={
            <Badge tone={report.causalMarkerCount >= 2 ? 'success' : 'warning'}>
              {report.causalMarkerCount >= 2 ? 'Mechanistic' : 'Descriptive'}
            </Badge>
          }
        />

        <StatCard
          label="Depth Illusion Gap"
          value={`${report.ioedGap} pts`}
          hint={`Initial Conf: ${report.initialConfidence}/5`}
          accent={report.ioedGap < 20 ? 'emerald' : 'rose'}
          icon={<HelpCircle className="h-4 w-4" />}
          badge={
            <Badge tone={ioedTone}>{report.ioedGap >= 30 ? 'Illusion Alert' : 'Calibrated'}</Badge>
          }
        />
      </div>

      {/* Jargon Words Section */}
      {report.jargonTerms.length > 0 && (
        <div className="mt-4 rounded-xl border border-rose-200/50 bg-rose-50/40 p-3.5 dark:border-rose-900/30 dark:bg-rose-950/20">
          <div className="flex items-center gap-2 text-xs font-semibold text-rose-800 dark:text-rose-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Domain Jargon Detected (A 12-year-old would hesitate):</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {report.jargonTerms.map((term) => (
              <span
                key={term}
                className="inline-flex items-center gap-1 rounded-md border border-rose-300/50 bg-white/80 px-2 py-0.5 text-xs font-medium text-rose-700 shadow-2xs dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-200"
              >
                {term}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Socratic Probes Section */}
      {report.socraticProbes.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            <MessageSquare className="h-3.5 w-3.5 text-indigo-500" />
            <span>Socratic Probes (Deepen Explanatory Grip)</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {report.socraticProbes.map((probe) => (
              <div
                key={probe.id}
                onClick={() => onSelectProbe?.(probe)}
                className="group flex cursor-pointer flex-col justify-between rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-3 text-xs transition-all hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-(--hub-border) dark:bg-(--hub-panel-2)/60 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-950/20"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-neutral-800 dark:text-neutral-200">
                    {probe.prompt}
                  </p>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-600 dark:text-neutral-500 dark:group-hover:text-indigo-400" />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-400 dark:text-neutral-500">
                  <span className="capitalize">{probe.type.replace('_', ' ')}</span>
                  <span className="font-medium text-indigo-600 opacity-0 group-hover:opacity-100 dark:text-indigo-400">
                    Click to probe
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Gap Flashcards Section */}
      {report.suggestedGapCards.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-neutral-100 pt-3 dark:border-(--hub-border)">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>Suggested Active Recall Flashcards ({report.suggestedGapCards.length})</span>
            </div>
          </div>
          <div className="space-y-2">
            {report.suggestedGapCards.map((card, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200/60 bg-white/60 p-2.5 text-xs dark:border-(--hub-border) dark:bg-(--hub-panel)/60"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-medium text-neutral-800 dark:text-neutral-200">{card.front}</p>
                  <p className="truncate text-neutral-500 dark:text-neutral-400">{card.reason}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSaveGapCard?.({ front: card.front, back: card.back, tags: card.tags })
                    setSavedCardIndex(i)
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
                >
                  {savedCardIndex === i ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Added!</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Card</span>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
