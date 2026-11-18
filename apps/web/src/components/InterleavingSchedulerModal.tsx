'use client'

/**
 * Interleaving Practice Scheduler & Category Discrimination Studio.
 *
 * Grounded in:
 * - Doug Rohrer & Kelli Taylor (2007) The Shuffling of Mathematics Problems
 *   Improves Learning. Instructional Science, 35(6), 481-498.
 * - Carvalho & Goldstone (2014) Putting Category Learning in Order: Category
 *   Structure and the Effects of Sequential Practice.
 *
 * Resolves blocked massed practice by shuffling cross-domain candidate items,
 * maximizing category entropy, and injecting contrastive discrimination cues.
 */
import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Layers, Play, Shuffle, Sparkles, X } from 'lucide-react'
import {
  computeInterleavingSchedule,
  type InterleavingItem,
  type InterleavingResult,
} from '@learning-hub/core/interleaving'
import { apiGet } from '@/lib/transport'
import { hapticLight, hapticMedium } from '@/platform/haptics'
import { Badge } from '@/ui/Feedback'

export interface InterleavingSchedulerModalProps {
  isOpen: boolean
  onClose: () => void
  onStartSession?: (itemIds: string[]) => void
}

interface DeckSummary {
  id: number
  name: string
  due: number
  total: number
}

const DOMAIN_COLORS = [
  {
    bg: 'bg-indigo-500',
    text: 'text-indigo-600 dark:text-indigo-400',
    pill: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800',
  },
  {
    bg: 'bg-emerald-500',
    text: 'text-status-success-text dark:text-status-success-text',
    pill: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
  },
  {
    bg: 'bg-amber-500',
    text: 'text-status-warning-text dark:text-status-warning-text',
    pill: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
  },
  {
    bg: 'bg-rose-500',
    text: 'text-danger-text dark:text-danger-text',
    pill: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',
  },
  {
    bg: 'bg-sky-500',
    text: 'text-status-info-text dark:text-status-info-text',
    pill: 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800',
  },
  {
    bg: 'bg-indigo-500',
    text: 'text-indigo-600 dark:text-indigo-400',
    pill: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800',
  },
]

export function InterleavingSchedulerModal({
  isOpen,
  onClose,
  onStartSession,
}: InterleavingSchedulerModalProps) {
  const router = useRouter()
  const [selectedDeckIds, setSelectedDeckIds] = useState<number[]>([])
  const [maxConsecutive, setMaxConsecutive] = useState<number>(1)
  const [sessionSize, setSessionSize] = useState<number>(18)
  const urgencyWeight = 0.6
  const [strategy, setStrategy] = useState<'interleaved' | 'blocked'>('interleaved')

  // Fetch available decks
  const { data: decksData } = useQuery<{ decks: DeckSummary[] }>({
    queryKey: ['decks-for-interleaving'],
    queryFn: () => apiGet<{ decks: DeckSummary[] }>('/api/decks'),
    enabled: isOpen,
  })

  // Pre-select first 3 decks if none selected
  React.useEffect(() => {
    if (decksData?.decks && selectedDeckIds.length === 0 && decksData.decks.length > 0) {
      setSelectedDeckIds(
        decksData.decks.slice(0, Math.min(3, decksData.decks.length)).map((d) => d.id),
      )
    }
  }, [decksData, selectedDeckIds.length])

  // Toggle deck selection
  const handleToggleDeck = (id: number) => {
    hapticLight()
    setSelectedDeckIds((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id],
    )
  }

  // Construct mock candidate pool based on selected decks
  const candidateItems: InterleavingItem[] = useMemo(() => {
    const decks = decksData?.decks?.filter((d) => selectedDeckIds.includes(d.id)) ?? []
    if (decks.length === 0) return []

    const items: InterleavingItem[] = []
    decks.forEach((deck, dIdx) => {
      const count = Math.max(4, Math.floor(sessionSize / decks.length) + 2)
      for (let i = 1; i <= count; i++) {
        items.push({
          id: `card-${deck.id}-${i}`,
          categoryId: deck.name,
          title: `${deck.name} Prompt #${i}`,
          difficulty: 0.3 + ((i * 17) % 70) / 100,
          urgency: 0.4 + ((i * 23 + dIdx * 19) % 60) / 100,
        })
      }
    })
    return items
  }, [decksData, selectedDeckIds, sessionSize])

  // Compute interleaving schedule
  const interleavingResult: InterleavingResult = useMemo(() => {
    if (strategy === 'blocked') {
      // Sort strictly by category to simulate blocked massed practice
      const blocked = [...candidateItems]
        .sort((a, b) => a.categoryId.localeCompare(b.categoryId))
        .slice(0, sessionSize)
      return {
        schedule: blocked,
        categoryEntropy: 0.25,
        blockingFactor: 0.85,
        transitionCount: Math.max(0, selectedDeckIds.length - 1),
        discriminationPrompts: [],
      }
    }

    return computeInterleavingSchedule(candidateItems, {
      maxConsecutiveCategory: maxConsecutive,
      targetCount: sessionSize,
      urgencyWeight,
    })
  }, [candidateItems, strategy, maxConsecutive, sessionSize, urgencyWeight, selectedDeckIds.length])

  // Color mapping per category
  const categoryColorMap = useMemo(() => {
    const map = new Map<string, (typeof DOMAIN_COLORS)[0]>()
    const activeCategories = Array.from(new Set(candidateItems.map((c) => c.categoryId)))
    activeCategories.forEach((cat, idx) => {
      map.set(cat, DOMAIN_COLORS[idx % DOMAIN_COLORS.length]!)
    })
    return map
  }, [candidateItems])

  // Handle launch review
  const handleLaunch = () => {
    hapticMedium()
    if (onStartSession) {
      onStartSession(interleavingResult.schedule.map((s) => s.id))
      onClose()
    } else {
      const deckParam = selectedDeckIds.join(',')
      onClose()
      router.push(`/review?interleave=1&deckIds=${deckParam}&count=${sessionSize}`)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="interleaving-modal-title"
    >
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/80">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <Shuffle className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="interleaving-modal-title"
                className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2"
              >
                Rohrer-Taylor Interleaving Studio
                <Badge tone={strategy === 'interleaved' ? 'success' : 'danger'}>
                  {strategy === 'interleaved' ? '+43% Delayed Retention' : 'Blocked Practice'}
                </Badge>
              </h2>
              <p className="text-xs text-tertiary dark:text-faint">
                Rohrer &amp; Taylor (2007) · Carvalho &amp; Goldstone (2014) Category Discrimination
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-tertiary hover:text-neutral-700 dark:text-faint dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Blocked Practice Warning Alert if active */}
          {strategy === 'blocked' && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-rose-900 dark:text-rose-100 flex items-start gap-3 text-xs">
              <AlertTriangle className="h-4 w-4 text-danger-text shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Warning: Blocked Practice Illusion.</span>
                <p className="mt-0.5 opacity-90 leading-relaxed">
                  Grouping identical topics (AAAA-BBBB-CCCC) creates high perceptual fluency during
                  study, but students routinely forget 43% more on delayed recall compared to
                  randomized category interleaving (Rohrer &amp; Taylor 2007).
                </p>
              </div>
            </div>
          )}

          {/* Decks Selection Strip */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-neutral-700 dark:text-secondary">
              <span className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-ac-text" />
                Select Domains to Interleave (Select 2+):
              </span>
              <span className="text-[11px] text-faint">
                {selectedDeckIds.length} domains chosen
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {decksData?.decks?.map((deck) => {
                const isSelected = selectedDeckIds.includes(deck.id)
                const col = categoryColorMap.get(deck.name)
                return (
                  <button
                    key={deck.id}
                    type="button"
                    onClick={() => handleToggleDeck(deck.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl text-xs font-medium border text-left transition ${
                      isSelected
                        ? 'bg-neutral-50 dark:bg-neutral-800/80 border-indigo-500/60 shadow-xs'
                        : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                          isSelected && col ? col.bg : 'bg-neutral-300 dark:bg-neutral-700'
                        }`}
                      />
                      <span className="truncate text-neutral-900 dark:text-neutral-100">
                        {deck.name}
                      </span>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Strategy Controls & Sliders */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/70 dark:border-neutral-700/50">
            {/* Strategy Toggle */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-tertiary">
                Sequencing Model
              </label>
              <div className="flex rounded-lg bg-neutral-200/70 dark:bg-neutral-700/60 p-1">
                <button
                  type="button"
                  onClick={() => setStrategy('interleaved')}
                  className={`flex-1 py-1 px-2 text-xs font-medium rounded-md transition ${
                    strategy === 'interleaved'
                      ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-xs'
                      : 'text-neutral-600 dark:text-faint'
                  }`}
                >
                  Interleaved
                </button>
                <button
                  type="button"
                  onClick={() => setStrategy('blocked')}
                  className={`flex-1 py-1 px-2 text-xs font-medium rounded-md transition ${
                    strategy === 'blocked'
                      ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-xs'
                      : 'text-neutral-600 dark:text-faint'
                  }`}
                >
                  Blocked
                </button>
              </div>
            </div>

            {/* Session Size */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wider text-tertiary">
                <span>Session Length</span>
                <span className="font-mono text-neutral-700 dark:text-secondary">
                  {sessionSize} cards
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="36"
                step="2"
                value={sessionSize}
                onChange={(e) => setSessionSize(parseInt(e.target.value, 10))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>

            {/* Max Consecutive Repetition */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wider text-tertiary">
                <span>Max Consecutive Repeat</span>
                <span className="font-mono text-neutral-700 dark:text-secondary">
                  {maxConsecutive}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="3"
                step="1"
                disabled={strategy === 'blocked'}
                value={maxConsecutive}
                onChange={(e) => setMaxConsecutive(parseInt(e.target.value, 10))}
                className="w-full accent-indigo-600 cursor-pointer disabled:opacity-40"
              />
            </div>
          </div>

          {/* Sequence Simulation Visual Timeline */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-neutral-700 dark:text-secondary">
                Interleaved Sequence Simulation ({interleavingResult.schedule.length} trials):
              </span>
              <div className="flex items-center gap-3 text-[11px] font-mono text-tertiary">
                <span>Entropy: {(interleavingResult.categoryEntropy * 100).toFixed(0)}%</span>
                <span>Switches: {interleavingResult.transitionCount}</span>
                <span>
                  Blocking Factor: {(interleavingResult.blockingFactor * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-neutral-100/70 dark:bg-neutral-800/30 border border-neutral-200/80 dark:border-neutral-700/60 min-h-[60px] items-center">
              {interleavingResult.schedule.map((item, idx) => {
                const col = categoryColorMap.get(item.categoryId)

                return (
                  <div
                    key={`seq-${item.id}-${idx}`}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border shadow-2xs transition animate-scale-in ${
                      col ? col.pill : 'bg-white text-neutral-800'
                    }`}
                    title={`${item.title} (Urgency: ${Math.round(item.urgency * 100)}%)`}
                  >
                    <span className={`h-2 w-2 rounded-full ${col ? col.bg : 'bg-neutral-400'}`} />
                    <span className="truncate max-w-[120px]">{item.categoryId}</span>
                    <span className="text-[10px] text-faint font-mono">#{idx + 1}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Contrastive Discrimination Prompts */}
          {interleavingResult.discriminationPrompts.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-tertiary dark:text-faint flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-ac-text" />
                Category Boundary Discrimination Cues (Carvalho &amp; Goldstone 2014):
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {interleavingResult.discriminationPrompts.slice(0, 4).map((prompt, idx) => (
                  <div
                    key={`disc-${idx}`}
                    className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700/60 text-xs space-y-1"
                  >
                    <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                      {prompt.reflectionPrompt}
                    </div>
                    <div className="text-neutral-600 dark:text-faint text-[11px] leading-relaxed">
                      {prompt.discriminationQuestion}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-neutral-700 dark:text-secondary hover:bg-neutral-200/60 dark:hover:bg-neutral-800 rounded-lg transition"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleLaunch}
            disabled={selectedDeckIds.length === 0}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-xs flex items-center gap-1.5 transition"
          >
            <Play className="h-3.5 w-3.5 fill-white" />
            <span>Launch Interleaved Session ({interleavingResult.schedule.length} Cards)</span>
          </button>
        </div>
      </div>
    </div>
  )
}
