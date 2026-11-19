'use client'

import React from 'react'
import type { CategorizationEvaluation } from '@learning-hub/core'
import { Badge, Panel, ProgressBar, StatCard } from '@/ui'
import { Brain, CheckCircle2, CircleHelp, Scale, Shapes, Target, TrendingUp } from 'lucide-react'

export interface PrototypeExemplarHudProps {
  evaluation: CategorizationEvaluation
  setTitle: string
}

const BAND_CONFIG: Record<
  CategorizationEvaluation['maturityBand'],
  { label: string; tone: 'success' | 'accent' | 'warning' | 'neutral'; description: string }
> = {
  dual_model_theorist: {
    label: 'Dual-Model Theorist',
    tone: 'success',
    description:
      'Ratings, transfer and response choices are all captured by a formal representation — you can predict where prototype and exemplar accounts split and test yourself on exactly those items.',
  },
  boundary_tracer: {
    label: 'Boundary Tracer',
    tone: 'accent',
    description:
      'Consistent rule-level classification with solid generalization. What is still missing is the model-level view: why do some items betray a category average while confirming an exemplar memory?',
  },
  typicality_sensate: {
    label: 'Typicality Sensate',
    tone: 'warning',
    description:
      'You feel the graded structure of categories (Rosch 1975) but classification is inconsistent — the gradient is sensed, the boundary is not yet traced.',
  },
  featural_guesser: {
    label: 'Featural Guesser',
    tone: 'neutral',
    description:
      'Responses do not yet reflect a coherent category representation. Anchor on the most typical members first, then classify atypical ones feature by feature.',
  },
}

const REPRESENTATION_LABEL: Record<
  CategorizationEvaluation['modelComparison']['betterRepresentation'],
  { label: string; tone: 'success' | 'accent' | 'neutral' }
> = {
  prototype: { label: 'Prototype representation fits best', tone: 'accent' },
  exemplar: { label: 'Exemplar representation fits best', tone: 'success' },
  tie: { label: 'Models tie — pattern not yet diagnostic', tone: 'neutral' },
}

/** Quantitative telemetry HUD for the Prototype & Exemplar Categorization Studio. */
export function PrototypeExemplarHud({ evaluation, setTitle }: PrototypeExemplarHudProps) {
  const band = BAND_CONFIG[evaluation.maturityBand]
  const representation = REPRESENTATION_LABEL[evaluation.modelComparison.betterRepresentation]
  const { prototype, exemplar, ruleFit } = evaluation.modelComparison

  return (
    <div className="space-y-4">
      {/* Top banner: composite index & maturity band */}
      <Panel className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-tertiary">
              <Brain className="h-3.5 w-3.5 text-indigo-500" aria-hidden />
              Categorical Representation Index (CRI)
            </div>
            <h2 className="mt-0.5 text-lg font-bold text-strong sm:text-xl">{setTitle}</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl font-black text-strong">{evaluation.cri}/100</div>
              <span className="text-[11px] text-tertiary">CRI composite</span>
            </div>
            <Badge tone={band.tone}>{band.label}</Badge>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-secondary">{band.description}</p>

        {/* 3 core quantitative metrics */}
        <div className="grid grid-cols-1 gap-3 border-t border-neutral-200 pt-3 dark:border-(--hub-border) sm:grid-cols-3">
          <StatCard
            label="TSC · typicality gradient"
            value={`${evaluation.tsc}%`}
            icon={<TrendingUp className="h-4 w-4" aria-hidden />}
            accent="indigo"
            progress={{ value: evaluation.tsc / 100 }}
            hint={
              evaluation.typicalityReference === 'normative'
                ? 'vs Rosch (1975) norms'
                : evaluation.typicalityReference === 'model'
                  ? 'vs model-predicted typicality'
                  : 'rate 3+ items to measure'
            }
          />
          <StatCard
            label="CTS · transfer accuracy"
            value={`${evaluation.cts}%`}
            icon={<Target className="h-4 w-4" aria-hidden />}
            accent="emerald"
            progress={{ value: evaluation.cts / 100 }}
            hint={`overall ${evaluation.overallAccuracy}% · Posner & Keele (1970)`}
          />
          <StatCard
            label="MCD · model consistency"
            value={`${evaluation.mcd}%`}
            icon={<Scale className="h-4 w-4" aria-hidden />}
            accent="amber"
            progress={{ value: evaluation.mcd / 100 }}
            hint={
              evaluation.modelComparison.betterRepresentation === 'prototype'
                ? 'prototype model reproduces your choices'
                : evaluation.modelComparison.betterRepresentation === 'exemplar'
                  ? 'GCM (Nosofsky 1986) reproduces your choices'
                  : 'neither model dominates yet'
            }
          />
        </div>
      </Panel>

      {/* Model comparison */}
      <Panel
        title={
          <span className="flex items-center gap-1.5">
            <Shapes className="h-4 w-4 text-indigo-500" aria-hidden />
            Formal Model Comparison
          </span>
        }
        actions={<Badge tone={representation.tone}>{representation.label}</Badge>}
        className="space-y-3"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-neutral-200 p-3 dark:border-(--hub-border)">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-strong">Prototype model (Reed 1972)</span>
              <Badge tone={representation.label.startsWith('Prototype') ? 'accent' : 'neutral'}>
                k = 2
              </Badge>
            </div>
            <dl className="mt-2 space-y-1 text-[11px] text-tertiary">
              <div className="flex justify-between">
                <dt>Log-likelihood</dt>
                <dd className="text-secondary">{prototype.logLikelihood.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>AIC / BIC</dt>
                <dd className="text-secondary">
                  {prototype.aic.toFixed(1)} / {prototype.bic.toFixed(1)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Choice agreement</dt>
                <dd className="text-secondary">{Math.round(prototype.agreement * 100)}%</dd>
              </div>
              <div className="flex justify-between">
                <dt>Sensitivity c</dt>
                <dd className="text-secondary">{prototype.parameters.c}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-neutral-200 p-3 dark:border-(--hub-border)">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-strong">Exemplar GCM (Nosofsky 1986)</span>
              <Badge tone={representation.label.startsWith('Exemplar') ? 'success' : 'neutral'}>
                attention fitted
              </Badge>
            </div>
            <dl className="mt-2 space-y-1 text-[11px] text-tertiary">
              <div className="flex justify-between">
                <dt>Log-likelihood</dt>
                <dd className="text-secondary">{exemplar.logLikelihood.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>AIC / BIC</dt>
                <dd className="text-secondary">
                  {exemplar.aic.toFixed(1)} / {exemplar.bic.toFixed(1)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Choice agreement</dt>
                <dd className="text-secondary">{Math.round(exemplar.agreement * 100)}%</dd>
              </div>
              <div className="flex justify-between">
                <dt>c · r · weights</dt>
                <dd className="text-secondary">
                  {exemplar.parameters.c} · r={exemplar.parameters.r} ·{' '}
                  {exemplar.parameters.weights.map((w) => w.toFixed(2)).join('/')}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {ruleFit && (
          <div className="rounded-lg border border-neutral-200 p-3 text-xs dark:border-(--hub-border)">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-strong">
                Explicit rule (Ashby &amp; Gott 1988)
              </span>
              <span className="text-secondary">
                agreement {Math.round(ruleFit.agreement * 100)}% · 0 free parameters
              </span>
            </div>
          </div>
        )}

        <p className="text-xs leading-relaxed text-secondary">
          {evaluation.modelComparison.interpretation} ΔLL (exemplar − prototype) ={' '}
          {evaluation.modelComparison.logLikelihoodGap.toFixed(2)}.
        </p>
      </Panel>

      {/* Divergent items */}
      {evaluation.divergentItems.length > 0 && (
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <CircleHelp className="h-4 w-4 text-indigo-500" aria-hidden />
              Most Diagnostic Items (model splits)
            </span>
          }
        >
          <div className="space-y-2">
            {evaluation.divergentItems.map((item) => (
              <div
                key={item.stimulusId}
                className="rounded-lg border border-neutral-200 p-2.5 text-xs dark:border-(--hub-border)"
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-semibold text-strong">{item.label}</span>
                  <span className="text-tertiary">split {item.divergence.toFixed(2)}</span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px] text-tertiary">
                  <span>P(A | item) prototype: {item.prototypePA.toFixed(2)}</span>
                  <span>P(A | item) GCM: {item.gcmPA.toFixed(2)}</span>
                </div>
                <ProgressBar
                  value={item.divergence}
                  className="mt-1.5"
                  label={`Model divergence for ${item.label}`}
                />
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Coaching */}
      {(evaluation.strengths.length > 0 || evaluation.pedagogicalFeedback.length > 0) && (
        <Panel title="Categorization Coaching">
          {evaluation.strengths.length > 0 && (
            <div className="space-y-1.5">
              {evaluation.strengths.map((strength, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-secondary">
                  <CheckCircle2
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500"
                    aria-hidden
                  />
                  <span>{strength}</span>
                </div>
              ))}
            </div>
          )}
          {evaluation.vulnerabilities.length > 0 && (
            <div className="space-y-1.5">
              {evaluation.vulnerabilities.map((vulnerability, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-secondary">
                  <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
                  <span>{vulnerability}</span>
                </div>
              ))}
            </div>
          )}
          {evaluation.pedagogicalFeedback.length > 0 && (
            <div className="space-y-1.5 border-t border-neutral-200 pt-2 dark:border-(--hub-border)">
              {evaluation.pedagogicalFeedback.map((feedback, idx) => (
                <p key={idx} className="text-xs leading-relaxed text-secondary">
                  {feedback}
                </p>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
