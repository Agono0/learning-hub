import type { PlannerResult } from '@learning-hub/core'
import { pct } from './types'

export function AssumptionsBlock({ r, truncated }: { r: PlannerResult; truncated: boolean }) {
  const c = r.coverage
  const t = r.timing
  const cal = r.calibration
  const when = new Date(r.asOf).toLocaleString()
  return (
    <section
      aria-labelledby="rp-assumptions"
      className="space-y-3 text-sm"
      data-testid="rp-assumptions"
    >
      <h2 id="rp-assumptions" className="text-base font-semibold">
        Assumptions
      </h2>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong>Baseline</strong> as of {when}: retention in force is {pct(r.currentRetention)} (
          {r.currentSource} setting), weights are{' '}
          {r.weights === 'custom' ? 'your stored custom weights' : 'FSRS-6 defaults'}. Nothing about
          past settings is assumed.
        </li>
        <li>
          <strong>Hypothetical</strong>: the same cards at each tested retention over{' '}
          {r.horizonDays} days, seed {r.seed}. Passes and fails are drawn from the model&apos;s
          recall probability, not from your past grades. One scenario, no confidence interval.
        </li>
        <li>
          <strong>Cards</strong>: simulated {c.simulated.toLocaleString()} of{' '}
          {c.eligible.toLocaleString()} eligible Review-state cards (
          {c.selection === 'all-eligible'
            ? 'all of them'
            : `one in every ${c.stride} by id, scaled up x${c.scaleUp.toFixed(2)}`}
          ). Not included: {c.excludedNew.toLocaleString()} new,{' '}
          {c.excludedLearning.toLocaleString()} learning, {c.excludedRelearning.toLocaleString()}{' '}
          relearning, {c.excludedSuspended.toLocaleString()} suspended.
          {truncated
            ? ' The collection is larger than the read limit, so some cards were not read.'
            : ''}
        </li>
        <li>
          <strong>Pass grades</strong>: Hard {pct(r.passMix.hard)}, Good {pct(r.passMix.good)}, Easy{' '}
          {pct(r.passMix.easy)} of passes (
          {r.passMix.source === 'history'
            ? `from ${r.passMix.n} of your passing reviews`
            : 'default, too little history'}
          ). This is an assumption.
        </li>
        <li>
          <strong>Review time</strong> ({t.source}): {t.secondsOverall.toFixed(1)} s overall.{' '}
          {t.note} Usable {t.usable} of {t.considered} ({Math.round(t.coverage * 100)}%).
        </li>
        <li>
          <strong>Left out</strong>: new-card introduction, learning-step time, easy days, fuzz,
          future new cards.
        </li>
        <li>
          <strong>Calibration</strong> (measured, not a gate): {cal.note}
          {cal.scored > 0 ? (
            <>
              {' '}
              {cal.scored} scored. Active weights log-loss {cal.activeLogLoss?.toFixed(3)}, RMSE{' '}
              {cal.activeRmse?.toFixed(3)}; default weights log-loss{' '}
              {cal.defaultLogLoss?.toFixed(3)}, RMSE {cal.defaultRmse?.toFixed(3)}.
            </>
          ) : null}
        </li>
        <li>
          <strong>Scheduler calls</strong>: {r.schedulerCalls.toLocaleString()} made, limit{' '}
          {r.maxCalls.toLocaleString()}.
        </li>
      </ul>
    </section>
  )
}
