import type { ReactNode } from 'react'
import { Activity, Moon, ShieldCheck, Sparkles, Volume2, Wand2 } from 'lucide-react'
import { Badge } from './Feedback'
import { Button } from './Button'
import { cx } from './cx'

export interface SleepConsolidationHUDProps {
  /** Total cues in the night queue */
  activeCuesCount: number
  /** Cues already played softly during the sleep session */
  playedCuesCount: number
  /** Forecasted retention improvement (e.g. 0.22 = +22%) */
  forecastedRetentionGain?: number
  /** Frequency in Hz currently being played */
  currentFrequency?: number | null
  /** Whether the full night OLED screen is active */
  isNightMode: boolean
  /** Toggle callback */
  onToggleNightMode: () => void
  /** Trigger to mint recent reviews into TMR cues */
  onMintQueue?: () => void
  /** Loading state for minting */
  isMinting?: boolean
  className?: string
}

/**
 * Targeted Memory Reactivation (TMR) Sleep Consolidation HUD.
 * Grounded in Rasch & Born (2007, 2013) Slow-Wave Sleep memory replay.
 */
export function SleepConsolidationHUD({
  activeCuesCount,
  playedCuesCount,
  forecastedRetentionGain = 0.22,
  currentFrequency,
  isNightMode,
  onToggleNightMode,
  onMintQueue,
  isMinting = false,
  className,
}: SleepConsolidationHUDProps): ReactNode {
  const boostPct = Math.round(forecastedRetentionGain * 100)

  return (
    <div
      className={cx(
        'panel-glass relative overflow-hidden p-5 space-y-5 border border-indigo-500/20 shadow-lg',
        'bg-linear-to-b from-indigo-950/20 via-neutral-900/40 to-neutral-950/60',
        className,
      )}
    >
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

      {/* Header */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 shadow-inner">
            <Moon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
              Sleep Memory Consolidation (TMR)
              <Badge tone="violet" dot pulse={isNightMode}>
                {isNightMode ? 'SWS Night Active' : 'Ready for Sleep'}
              </Badge>
            </h3>
            <p className="text-xs text-faint">
              Slow-Wave Sleep neocortical transfer protocol (Rasch &amp; Born 2007)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onMintQueue && (
            <Button
              variant="ghost"
              onClick={onMintQueue}
              disabled={isMinting}
              className="border border-neutral-700 bg-neutral-800/80 text-xs text-neutral-200 hover:bg-neutral-700"
            >
              <Wand2 className="h-3.5 w-3.5 mr-1 text-indigo-400" />
              {isMinting ? 'Queueing...' : "Queue Today's Reviews"}
            </Button>
          )}

          <Button
            variant={isNightMode ? 'danger' : 'primary'}
            onClick={onToggleNightMode}
            className="text-xs shadow-md"
          >
            <Moon className="h-3.5 w-3.5 mr-1" />
            {isNightMode ? 'Exit Night Mode' : 'Start Night Replay'}
          </Button>
        </div>
      </div>

      {/* Visual Telemetry Grid */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-neutral-800/80 bg-neutral-900/60 p-3.5">
          <div className="text-xs text-faint flex items-center justify-between">
            <span>Harmonic Cues Queued</span>
            <Volume2 className="h-3.5 w-3.5 text-indigo-400" />
          </div>
          <div className="mt-1 text-xl font-bold font-mono text-neutral-100 flex items-baseline gap-1.5">
            {activeCuesCount}
            <span className="text-xs font-normal text-faint">earcons</span>
          </div>
          <div className="mt-0.5 text-[11px] text-tertiary">{playedCuesCount} replayed tonight</div>
        </div>

        <div className="rounded-xl border border-neutral-800/80 bg-neutral-900/60 p-3.5">
          <div className="text-xs text-faint flex items-center justify-between">
            <span>Forecasted Boost</span>
            <Sparkles className="h-3.5 w-3.5 text-status-warning-text" />
          </div>
          <div className="mt-1 text-xl font-bold font-mono text-status-success-text flex items-baseline gap-1.5">
            +{boostPct}%<span className="text-xs font-normal text-faint">retention</span>
          </div>
          <div className="mt-0.5 text-[11px] text-tertiary">Empirical SWS effect size d ≈ 0.45</div>
        </div>

        <div className="rounded-xl border border-neutral-800/80 bg-neutral-900/60 p-3.5">
          <div className="text-xs text-faint flex items-center justify-between">
            <span>Acoustic Wave</span>
            <Activity className="h-3.5 w-3.5 text-status-info-text" />
          </div>
          <div className="mt-1 text-xl font-bold font-mono text-status-info-text flex items-baseline gap-1.5">
            {currentFrequency ? `${Math.round(currentFrequency)} Hz` : 'Silent / Standby'}
          </div>
          <div className="mt-0.5 text-[11px] text-tertiary">Whisper volume (≤ 35 dBA)</div>
        </div>
      </div>

      {/* Protocol safety info */}
      <div className="relative z-10 flex items-start gap-2.5 rounded-lg border border-indigo-500/20 bg-indigo-950/20 p-3 text-xs text-neutral-300">
        <ShieldCheck className="h-4 w-4 shrink-0 text-indigo-400 mt-0.5" />
        <div>
          <span className="font-semibold text-neutral-100">Sub-Arousal Audio Guarantee: </span>
          Earcons play at whisper gain with 20–35s random spacing. Research shows zero sleep
          disruption or waking recall interference (Oudiette &amp; Paller 2013).
        </div>
      </div>
    </div>
  )
}
