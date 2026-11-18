'use client'

import React, { useEffect, useState, useRef } from 'react'
import { Brain, Check, Command, Eye, Inbox, Layout, Search, Sparkles, X, Zap } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { getEmbeddingEngine } from '@/lib/embeddings-client'

export type HudStyle = 'spotlight' | 'tray' | 'palette'

interface DueCard {
  id: number
  deckName?: string
  front: string
  back: string
}

interface SemanticResult {
  cardId: number
  score: number
  front: string
  back: string
}

export function QuickHudModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [hudStyle, setHudStyle] = useState<HudStyle>('spotlight')
  const [activeTab, setActiveTab] = useState<'review' | 'capture' | 'search'>('review')

  // Quick Review state
  const [dueCards, setDueCards] = useState<DueCard[]>([])
  const [cardIdx, setCardIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)

  // Quick Capture state
  const [captureText, setCaptureText] = useState('')
  const [captureUrl, setCaptureUrl] = useState('')
  const [captureSuccess, setCaptureSuccess] = useState(false)

  // Semantic Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SemanticResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchHint, setSearchHint] = useState<string | null>(null)

  const captureInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Listen for global shortcut (Ctrl+Shift+Space or CustomEvent)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    const handleCustomToggle = () => {
      setIsOpen((prev) => !prev)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('toggle-quick-hud', handleCustomToggle)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('toggle-quick-hud', handleCustomToggle)
    }
  }, [isOpen])

  // Fetch due cards when opening review tab
  useEffect(() => {
    if (isOpen && activeTab === 'review') {
      setReviewLoading(true)
      apiGet<{ ok: boolean; cards: DueCard[] }>('/api/hud/quick-review?limit=5')
        .then((res) => {
          if (res.ok) {
            setDueCards(res.cards)
            setCardIdx(0)
            setRevealed(false)
          }
        })
        .finally(() => setReviewLoading(false))
    }
  }, [isOpen, activeTab])

  // Focus input on capture or search tab open
  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'capture') {
        setTimeout(() => captureInputRef.current?.focus(), 50)
      } else if (activeTab === 'search') {
        setTimeout(() => searchInputRef.current?.focus(), 50)
      }
    }
  }, [isOpen, activeTab])

  // Keyboard navigation for review inside HUD
  useEffect(() => {
    if (!isOpen || activeTab !== 'review' || dueCards.length === 0) return

    const handleReviewKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        setRevealed(true)
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        const grade = Number(e.key)
        const currentCard = dueCards[cardIdx]
        if (currentCard) {
          void apiSend('/api/review', 'POST', {
            cardId: currentCard.id,
            grade,
            confidence: 1,
            timeMs: 2500,
            tzOffset: new Date().getTimezoneOffset(),
          })
          if (cardIdx + 1 < dueCards.length) {
            setCardIdx((i) => i + 1)
            setRevealed(false)
          } else {
            setDueCards([])
          }
        }
      }
    }

    window.addEventListener('keydown', handleReviewKey)
    return () => window.removeEventListener('keydown', handleReviewKey)
  }, [isOpen, activeTab, dueCards, cardIdx, revealed])

  const handleCaptureSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!captureText.trim()) return

    const res = await apiSend<{ ok: boolean }>('/api/hud/capture', 'POST', {
      text: captureText.trim(),
      sourceUrl: captureUrl.trim() || undefined,
    })

    if (res.ok) {
      setCaptureText('')
      setCaptureUrl('')
      setCaptureSuccess(true)
      setTimeout(() => setCaptureSuccess(false), 2000)
    }
  }

  const handleSemanticSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setSearchLoading(true)
    setSearchHint(null)

    // Real on-device embedding (MiniLM via transformers.js) — same engine the
    // Settings index builder uses.
    const engine = await getEmbeddingEngine()
    if (!engine.ready) {
      setSearchHint('Semantic model unavailable on this device — build the index from Settings.')
      setSearchLoading(false)
      return
    }
    const [queryVector] = await engine.embed([searchQuery])
    if (!queryVector) {
      setSearchHint('Embedding failed — try again.')
      setSearchLoading(false)
      return
    }
    try {
      const res = await apiSend<{ ok: boolean; matches: SemanticResult[] }>(
        '/api/embeddings/search',
        'POST',
        {
          queryVector,
          topK: 5,
          minScore: 0.1,
        },
      )
      if (res.ok) {
        setSearchResults(res.matches)
      }
    } finally {
      setSearchLoading(false)
    }
  }

  if (!isOpen) return null

  // Presentation Style Wrapper
  const containerClasses =
    hudStyle === 'spotlight'
      ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'
      : hudStyle === 'tray'
        ? 'fixed bottom-5 right-5 z-50 w-full max-w-md shadow-2xl'
        : 'fixed top-12 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl shadow-2xl'

  const cardClasses =
    'relative w-full max-w-xl rounded-2xl border border-neutral-700/60 bg-neutral-900/95 text-neutral-100 shadow-2xl backdrop-blur-md overflow-hidden flex flex-col'

  const currentCard = dueCards[cardIdx]

  return (
    <div className={containerClasses}>
      <div className={cardClasses}>
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/20 text-indigo-400">
              <Zap className="h-3.5 w-3.5" />
            </div>
            <span className="font-semibold text-xs tracking-wide uppercase text-faint">
              Learning HUB Quick-HUD
            </span>
          </div>

          {/* Style Selector & Close */}
          <div className="flex items-center gap-1.5 text-xs text-faint">
            <button
              onClick={() =>
                setHudStyle((s) =>
                  s === 'spotlight' ? 'tray' : s === 'tray' ? 'palette' : 'spotlight',
                )
              }
              title={`Switch presentation style (Current: ${hudStyle})`}
              className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-neutral-800 hover:text-white"
            >
              <Layout className="h-3 w-3" />
              <span className="capitalize text-[11px]">{hudStyle}</span>
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded p-1 hover:bg-neutral-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-neutral-800/80 bg-neutral-900/50 px-4 text-xs font-medium">
          <button
            onClick={() => setActiveTab('review')}
            className={`flex items-center gap-1.5 border-b-2 py-2.5 px-3 transition-colors ${
              activeTab === 'review'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-faint hover:text-neutral-200'
            }`}
          >
            <Brain className="h-3.5 w-3.5" />
            Quick Review {dueCards.length > 0 && `(${dueCards.length - cardIdx})`}
          </button>
          <button
            onClick={() => setActiveTab('capture')}
            className={`flex items-center gap-1.5 border-b-2 py-2.5 px-3 transition-colors ${
              activeTab === 'capture'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-faint hover:text-neutral-200'
            }`}
          >
            <Inbox className="h-3.5 w-3.5" />
            Quick Capture
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`flex items-center gap-1.5 border-b-2 py-2.5 px-3 transition-colors ${
              activeTab === 'search'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-faint hover:text-neutral-200'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            Semantic Search
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 min-h-[220px] flex flex-col justify-center">
          {activeTab === 'review' && (
            <div>
              {reviewLoading ? (
                <div className="text-center text-sm text-tertiary">Checking due cards…</div>
              ) : currentCard ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-[11px] text-faint">
                    <span>
                      Card {cardIdx + 1} of {dueCards.length}
                    </span>
                    <span className="rounded bg-neutral-800 px-2 py-0.5">
                      {currentCard.deckName || 'Default Deck'}
                    </span>
                  </div>

                  <div className="text-base font-medium text-neutral-100">{currentCard.front}</div>

                  {revealed ? (
                    <div className="space-y-3 border-t border-neutral-800 pt-3">
                      <div className="text-sm text-indigo-300">{currentCard.back}</div>
                      <div className="flex items-center justify-between pt-2">
                        <span className="text-[11px] text-tertiary">
                          Press 1 (Again) · 2 (Hard) · 3 (Good) · 4 (Easy)
                        </span>
                        <div className="flex gap-1.5">
                          {[
                            { g: 1, label: 'Again', color: 'bg-rose-600/80' },
                            { g: 2, label: 'Hard', color: 'bg-amber-600/80' },
                            { g: 3, label: 'Good', color: 'bg-indigo-600/80' },
                            { g: 4, label: 'Easy', color: 'bg-emerald-600/80' },
                          ].map((item) => (
                            <button
                              key={item.g}
                              onClick={() => {
                                void apiSend('/api/review', 'POST', {
                                  cardId: currentCard.id,
                                  grade: item.g,
                                  confidence: 1,
                                  timeMs: 2000,
                                  tzOffset: new Date().getTimezoneOffset(),
                                })
                                if (cardIdx + 1 < dueCards.length) {
                                  setCardIdx((i) => i + 1)
                                  setRevealed(false)
                                } else {
                                  setDueCards([])
                                }
                              }}
                              className={`rounded px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 ${item.color}`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 flex justify-between items-center">
                      <span className="text-[11px] text-tertiary">
                        Press Space to reveal answer
                      </span>
                      <button
                        onClick={() => setRevealed(true)}
                        className="flex items-center gap-1.5 rounded-lg bg-indigo-600/30 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-600/40"
                      >
                        <Eye className="h-3.5 w-3.5" /> Reveal Answer
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center space-y-2 py-4">
                  <Sparkles className="h-7 w-7 text-indigo-400 mx-auto" />
                  <div className="text-sm font-medium text-neutral-200">All caught up!</div>
                  <p className="text-xs text-tertiary">No cards due for micro-review right now.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'capture' && (
            <form onSubmit={handleCaptureSubmit} className="space-y-3">
              <div className="space-y-1">
                <input
                  ref={captureInputRef}
                  type="text"
                  placeholder="Capture quick thought, note, or fact…"
                  value={captureText}
                  onChange={(e) => setCaptureText(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="Source URL (optional)"
                  value={captureUrl}
                  onChange={(e) => setCaptureUrl(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700/80 bg-neutral-900/50 px-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!captureText.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  <Inbox className="h-3.5 w-3.5" /> Capture
                </button>
              </div>

              {captureSuccess && (
                <div className="flex items-center gap-1 text-xs text-status-success-text animate-fade-in">
                  <Check className="h-3.5 w-3.5" /> Saved to Learning HUB inbox!
                </div>
              )}
            </form>
          )}

          {activeTab === 'search' && (
            <div className="space-y-3">
              <form onSubmit={handleSemanticSearch} className="flex gap-2">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search cards by meaning or concept…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={searchLoading || !searchQuery.trim()}
                  className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  <Search className="h-3.5 w-3.5" /> {searchLoading ? 'Searching…' : 'Search'}
                </button>
              </form>

              {searchHint && <p className="px-2 py-1 text-xs text-faint">{searchHint}</p>}
              {searchResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {searchResults.map((m) => (
                    <div
                      key={m.cardId}
                      className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-2.5 text-xs space-y-1"
                    >
                      <div className="flex justify-between items-center text-faint">
                        <span className="font-medium text-neutral-200">{m.front}</span>
                        <span className="rounded bg-indigo-950/60 px-1.5 py-0.5 text-[10px] text-indigo-400 font-mono">
                          {Math.round(m.score * 100)}% match
                        </span>
                      </div>
                      <div className="text-faint">{m.back}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="border-t border-neutral-800 bg-neutral-900/30 px-4 py-2 text-[11px] text-neutral-500 flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <Command className="h-3 w-3" />
            <span>Shortcut: Ctrl+Shift+Space</span>
          </div>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  )
}
