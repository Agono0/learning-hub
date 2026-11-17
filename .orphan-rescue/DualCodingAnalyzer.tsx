'use client'

/**
 * Dual-coding analyzer for /canvas — wires the previously-orphaned
 * `/api/cognitive/dual-coding` endpoint (Paivio viability analysis) into the
 * canvas page: paste a concept's text, get the verbal/visual channel verdict,
 * composite retention forecast, and the concrete modality suggestion.
 */
import { useMutation, useQuery } from '@tanstack/react-query'
import { Eye, ImageIcon, ScanText, Sparkles } from 'lucide-react'
import { useState } from 'react'
import type { DualCodingAnalysis } from '@learning-hub/core'
import { apiGet, apiSend } from '@/lib/transport'
import { cx } from '@/ui/cx'

export interface DualCodingAnalyzerProps {
  className?: string
}

/**
 * Analyze-a-text card. GET handles quick reads of pasted text; POST adds the
 * has-image/has-diagram flags and optional measured retentions for the
 * composite forecast.
 */
export function DualCodingAnalyzer({ className }: DualCodingAnalyzerProps) {
  const [text, setText] = useState('')
  const [hasImage, setHasImage] = useState(false)
  const [hasDiagram, setHasDiagram] = useState(false)

  const quick = useQuery({
    queryKey: ['cognitive-dual-coding', text],
    enabled: false, // run on demand via refetch
    queryFn: () =>
      apiGet<{ ok: boolean; analysis: Analysis }>(
        `/api/cognitive/dual-coding?text=${encodeURIComponent(text.slice(0, 400))}`,
      ),
  })

  const deep = useMutation({
    mutationFn: () =>
      apiSend<{ ok: boolean; analysis: Analysis }>('/api/cognitive/dual-coding', 'POST', {
        text: text.slice(0, 2000),
        hasImage,
        hasDiagram,
      }),
  })

  const analysis = deep.data?.analysis ?? (quick.data?.ok ? quick.data.analysis : null)

  return (
    <div className={cx('panel space-y-3', className)} data-testid="dual-coding-analyzer">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
        <Eye className="h-4 w-4 text-indigo-500" />
        Dual-coding analyzer
      </h3>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Paivio (1971/1986): verbal + visual traces are additive in recall. Score a concept&apos;s
        text for dual-coding viability before you draw it.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Paste the concept text to analyze…"
        aria-label="Text to analyze for dual-coding viability"
        className="w-full rounded-xl border border-neutral-300 bg-transparent p-3 text-sm text-neutral-800 dark:border-(--hub-border) dark:text-neutral-100"
      />
      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600 dark:text-neutral-300">
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={hasImage}
            onChange={(e) => setHasImage(e.target.checked)}
            className="accent-indigo-500"
          />
          <ImageIcon className="h-3.5 w-3.5" /> has image
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={hasDiagram}
            onChange={(e) => setHasDiagram(e.target.checked)}
            className="accent-indigo-500"
          />
          <ScanText className="h-3.5 w-3.5" /> has diagram
        </label>
        <button
          type="button"
          disabled={text.trim().length < 8 || deep.isPending}
          onClick={() => deep.mutate()}
          className={cx(
            'inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
            text.trim().length >= 8 && !deep.isPending
              ? 'bg-indigo-600 text-white hover:bg-indigo-500'
              : 'cursor-not-allowed bg-neutral-200 text-neutral-500 dark:bg-neutral-800',
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {deep.isPending ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>

      {analysis ? (
        <div className="space-y-2 rounded-xl border border-neutral-200 p-3 text-xs dark:border-(--hub-border)">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500 dark:text-neutral-400">Dual-coded</span>
            <span
              className={cx(
                'font-mono font-bold',
                analysis.isDualCoded
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400',
              )}
            >
              {analysis.isDualCoded ? 'yes' : 'verbal only'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-500 dark:text-neutral-400">
              Verbal / visual retention
            </span>
            <span className="font-mono font-bold text-neutral-700 dark:text-neutral-200">
              {Math.round(analysis.verbalRetention * 100)}% /{' '}
              {Math.round(analysis.visualRetention * 100)}%
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-500 dark:text-neutral-400">Composite retention</span>
            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
              {Math.round(analysis.compositeRetention * 100)}%
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-500 dark:text-neutral-400">Forgetting reduction</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
              ×{analysis.forgettingReductionFactor.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-500 dark:text-neutral-400">Recommended modality</span>
            <span className="font-mono font-bold text-white">{analysis.recommendedModality}</span>
          </div>
          <p className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-2 leading-relaxed text-neutral-600 dark:text-neutral-300">
            {analysis.visualPromptSuggestion}
          </p>
        </div>
      ) : quick.isFetching || deep.isPending ? (
        <div className="h-12 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
      ) : null}
    </div>
  )
}
