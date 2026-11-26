'use client'

import React, { useCallback, useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Award,
  CheckCircle2,
  Download,
  Flame,
  Gavel,
  Layers,
  MessageSquare,
  Plus,
  Scale,
  Send,
  Sparkles,
  User,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react'
import { IconButton } from '@/ui'
import {
  COMPREHENSIVE_FALLACY_CATALOG,
  DEEP_DIALECTIC_CASES,
  LAKATOS_TACTIC_DEFINITIONS,
  assessDebateVerdict,
  convertToulminToFlashcards,
  evaluateLakatosMove,
  respondAsProtege,
  type DeepDialecticCase,
  type ExpandedFallacy,
  type GeneratedToulminFlashcard,
  type LakatosTactic,
  type ToulminArgumentGraph,
  type ToulminNode,
  type ToulminNodeType,
} from '@learning-hub/core/dialectic'
import { getSharedAudioContext } from '../lib/audio-graph'
import { hapticLight, hapticMedium } from '../platform/haptics'
import { ToulminArgumentHUD } from '../ui/ToulminArgumentHUD'
import { cx } from '../ui/cx'

export interface SocraticDialecticStudioProps {
  initialCaseSlug?: string
  onSaveVerdict?: (caseSlug: string, verdict: string, score: number, xp: number) => void
  onExportToDeck?: (cards: GeneratedToulminFlashcard[]) => void
  className?: string
}

export function SocraticDialecticStudio({
  initialCaseSlug = 'ai-alignment-orthogonality',
  onSaveVerdict,
  onExportToDeck,
  className,
}: SocraticDialecticStudioProps) {
  // Case selection
  const [selectedCaseSlug, setSelectedCaseSlug] = useState<string>(initialCaseSlug)
  const activeCase: DeepDialecticCase = useMemo(() => {
    return DEEP_DIALECTIC_CASES.find((c) => c.slug === selectedCaseSlug) || DEEP_DIALECTIC_CASES[0]!
  }, [selectedCaseSlug])

  // Active workspace tab
  const [activeTab, setActiveTab] = useState<'arena' | 'toulmin' | 'lakatos' | 'protege'>('arena')
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Toulmin argument graph state
  const [graph, setGraph] = useState<ToulminArgumentGraph>(() => activeCase.defaultGraph)

  // Reset graph when switching case
  const handleCaseChange = (slug: string) => {
    setSelectedCaseSlug(slug)
    const nextCase = DEEP_DIALECTIC_CASES.find((c) => c.slug === slug) || DEEP_DIALECTIC_CASES[0]!
    setGraph(nextCase.defaultGraph)
    setSelectedTurnIndex(0)
    setFallacyFlagFeedback(null)
    setLakatosRefinement('')
    setLakatosFeedback(null)
    setProtegeText('')
    setProtegeReply(null)
    setLearnerVerdict('')
    setVerdictResult(null)
    hapticMedium()
  }

  // Audio Earcon synthesis
  const playDialecticEarcon = useCallback(
    (type: 'correct' | 'counter' | 'advance' | 'chime') => {
      if (!soundEnabled) return
      void getSharedAudioContext()
        .then((audioCtx) => {
          const now = audioCtx.currentTime
          const osc = audioCtx.createOscillator()
          const gain = audioCtx.createGain()

          osc.type = 'sine'
          gain.gain.setValueAtTime(0.001, now)

          if (type === 'correct') {
            osc.frequency.setValueAtTime(587.33, now) // D5
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.12) // A5
            gain.gain.exponentialRampToValueAtTime(0.15, now + 0.03)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
            osc.start(now)
            osc.stop(now + 0.38)
          } else if (type === 'counter') {
            osc.frequency.setValueAtTime(329.63, now) // E4
            osc.frequency.exponentialRampToValueAtTime(220, now + 0.15) // A3
            gain.gain.exponentialRampToValueAtTime(0.15, now + 0.03)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
            osc.start(now)
            osc.stop(now + 0.38)
          } else {
            osc.frequency.setValueAtTime(523.25, now) // C5
            gain.gain.exponentialRampToValueAtTime(0.12, now + 0.03)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
            osc.start(now)
            osc.stop(now + 0.28)
          }

          osc.connect(gain)
          gain.connect(audioCtx.destination)
        })
        .catch(() => {})
    },
    [soundEnabled],
  )

  // ─── 1. Arena Transcript & Fallacy Spotting ──────────────────────────────
  const [selectedTurnIndex, setSelectedTurnIndex] = useState(0)
  const [flaggedFallacyKey, setFlaggedFallacyKey] = useState<ExpandedFallacy | ''>('')
  const [fallacyFlagFeedback, setFallacyFlagFeedback] = useState<{
    correct: boolean
    explanation: string
    awardedXp: number
  } | null>(null)
  const [userXp, setUserXp] = useState(120)

  const activeTurn =
    activeCase.plantedFallacies[selectedTurnIndex] || activeCase.plantedFallacies[0]!

  const handleEvaluateFallacyFlag = () => {
    if (!flaggedFallacyKey) return
    const isCorrect = activeTurn.fallacy === flaggedFallacyKey
    const meta = COMPREHENSIVE_FALLACY_CATALOG[flaggedFallacyKey]

    if (isCorrect) {
      const xp = 35
      setUserXp((x) => x + xp)
      setFallacyFlagFeedback({
        correct: true,
        explanation: `Bullseye! You identified ${meta.label}: ${meta.description}`,
        awardedXp: xp,
      })
      playDialecticEarcon('correct')
      hapticMedium()
    } else {
      const xp = 5
      setUserXp((x) => x + xp)
      setFallacyFlagFeedback({
        correct: false,
        explanation: `Not quite. ${meta.label} involves: ${meta.description}. Re-examine the speaker's warrant.`,
        awardedXp: xp,
      })
      playDialecticEarcon('counter')
      hapticLight()
    }
  }

  // ─── 2. Toulmin Dissection Graph ──────────────────────────────────────────
  const [newNodeText, setNewNodeText] = useState('')
  const [newNodeType, setNewNodeType] = useState<ToulminNodeType>('ground')

  const handleAddGraphNode = () => {
    if (!newNodeText.trim()) return
    const id = `node-${Date.now()}`
    const newNode: ToulminNode = {
      id,
      type: newNodeType,
      text: newNodeText.trim(),
      authorRole: 'learner',
      confidence: 0.85,
      verified: true,
    }

    setGraph((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
      edges: [
        ...prev.edges,
        {
          id: `edge-${Date.now()}`,
          source: id,
          target: prev.primaryClaimId,
          relation:
            newNodeType === 'ground'
              ? 'supports'
              : newNodeType === 'warrant'
                ? 'warrants'
                : newNodeType === 'rebuttal'
                  ? 'rebuts'
                  : 'supports',
          strength: 0.9,
        },
      ],
    }))
    setNewNodeText('')
    playDialecticEarcon('advance')
    hapticMedium()
  }

  // ─── 3. Lakatos Socratic Heuristic Lab ─────────────────────────────────────
  const [chosenLakatosTactic, setChosenLakatosTactic] =
    useState<LakatosTactic>('lemma_incorporation')
  const [lakatosRefinement, setLakatosRefinement] = useState('')
  const [lakatosFeedback, setLakatosFeedback] = useState<{
    valid: boolean
    score: number
    feedback: string
    awardedXp: number
  } | null>(null)

  const handleEvaluateLakatos = () => {
    const res = evaluateLakatosMove(
      activeCase.lakatosChallenge.primitiveConjecture,
      activeCase.lakatosChallenge.counterexample,
      chosenLakatosTactic,
      lakatosRefinement,
    )
    setLakatosFeedback(res)
    setUserXp((x) => x + res.awardedXp)
    if (res.valid) {
      playDialecticEarcon('correct')
      hapticMedium()
    } else {
      playDialecticEarcon('counter')
      hapticLight()
    }
  }

  // ─── 4. Protégé Peer Simulator (Alex) ──────────────────────────────────────
  const [protegeText, setProtegeText] = useState('')
  const [protegeReply, setProtegeReply] = useState<{
    reply: string
    coverage: number
    missingConcepts: string[]
    understood: boolean
  } | null>(null)

  const handleSendToProtege = () => {
    if (!protegeText.trim()) return
    const res = respondAsProtege(protegeText, activeCase.title, activeCase.coreConcepts)
    setProtegeReply(res)
    if (res.understood) {
      setUserXp((x) => x + 40)
      playDialecticEarcon('correct')
    } else {
      playDialecticEarcon('counter')
    }
    hapticMedium()
  }

  // ─── 5. Closing Synthesis Verdict & Flashcards ─────────────────────────────
  const [learnerVerdict, setLearnerVerdict] = useState('')
  const [verdictResult, setVerdictResult] = useState<{
    score: number
    feedback: string
    coveredConcepts: string[]
    missingConcepts: string[]
    isConditional: boolean
  } | null>(null)
  const [exportNotice, setExportNotice] = useState<string | null>(null)

  const handleAssessVerdict = () => {
    const res = assessDebateVerdict(learnerVerdict, activeCase.coreConcepts)
    setVerdictResult(res)
    const xp = Math.round(res.score * 0.5)
    setUserXp((x) => x + xp)
    if (onSaveVerdict) {
      onSaveVerdict(activeCase.slug, learnerVerdict, res.score, xp)
    }
    playDialecticEarcon('correct')
    hapticMedium()
  }

  const handleExportFlashcards = () => {
    const cards = convertToulminToFlashcards(graph)
    if (onExportToDeck) {
      onExportToDeck(cards)
    }
    setExportNotice(`Exported ${cards.length} high-yield Toulmin retrieval cards to your deck!`)
    playDialecticEarcon('chime')
    hapticMedium()
    setTimeout(() => setExportNotice(null), 4000)
  }

  return (
    <div
      className={cx(
        'relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl transition-all',
        className,
      )}
    >
      {/* Studio Header */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-900/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Scale className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-tight">{activeCase.title}</h2>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-secondary">
                {activeCase.domain}
              </span>
            </div>
            <p className="text-[11px] text-faint">
              Socratic Dialectic Arena & Toulmin Argumentation Model (Lakatos Heuristic Lifecycle)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Case Selector */}
          <select
            value={selectedCaseSlug}
            onChange={(e) => handleCaseChange(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 outline-none"
          >
            {DEEP_DIALECTIC_CASES.map((c) => (
              <option key={c.slug} value={c.slug} className="bg-slate-900">
                {c.title}
              </option>
            ))}
          </select>

          {/* XP Pill */}
          <div className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-status-warning-text">
            <Award className="h-3.5 w-3.5 text-status-warning-text" />
            <span>{userXp} XP</span>
          </div>

          {/* Sound Toggle */}
          <IconButton
            label="Toggle Audio Cues"
            size="sm"
            onClick={() => setSoundEnabled((p) => !p)}
            className="rounded-xl border border-white/10 bg-white/5 text-faint hover:text-white"
          >
            {soundEnabled ? (
              <Volume2 className="h-4 w-4 text-indigo-400" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </IconButton>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-white/10 bg-slate-900/40 px-6 text-xs font-semibold text-tertiary overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap">
        <button
          type="button"
          onClick={() => setActiveTab('arena')}
          className={cx(
            'flex items-center gap-2 border-b-2 px-4 py-3 transition-all',
            activeTab === 'arena'
              ? 'border-indigo-500 text-white'
              : 'border-transparent hover:text-slate-200',
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span>Arena Transcript & Fallacy Spotter</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('toulmin')}
          className={cx(
            'flex items-center gap-2 border-b-2 px-4 py-3 transition-all',
            activeTab === 'toulmin'
              ? 'border-indigo-500 text-white'
              : 'border-transparent hover:text-slate-200',
          )}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Toulmin Argument HUD & Graph</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('lakatos')}
          className={cx(
            'flex items-center gap-2 border-b-2 px-4 py-3 transition-all',
            activeTab === 'lakatos'
              ? 'border-indigo-500 text-white'
              : 'border-transparent hover:text-slate-200',
          )}
        >
          <Flame className="h-3.5 w-3.5" />
          <span>Lakatos Socratic Lab</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('protege')}
          className={cx(
            'flex items-center gap-2 border-b-2 px-4 py-3 transition-all',
            activeTab === 'protege'
              ? 'border-indigo-500 text-white'
              : 'border-transparent hover:text-slate-200',
          )}
        >
          <User className="h-3.5 w-3.5" />
          <span>Protégé Peer (Alex)</span>
        </button>
      </div>

      {/* Main Workspace Body */}
      <div className="p-6 space-y-6">
        {/* TAB 1: Arena Transcript & Fallacy Spotting */}
        {activeTab === 'arena' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left 2 Cols: Transcript */}
            <div className="space-y-4 lg:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-faint">
                  Dialectic Turns ({activeCase.plantedFallacies.length})
                </span>
                <span className="text-[11px] text-tertiary">
                  Select a turn to inspect argumentation warrants and flag logical fallacies
                </span>
              </div>

              <div className="space-y-3">
                {activeCase.plantedFallacies.map((turn, i) => {
                  const isSelected = selectedTurnIndex === i
                  const isThesis = turn.speaker === 'thesis'
                  return (
                    <div
                      key={turn.turnId}
                      onClick={() => {
                        setSelectedTurnIndex(i)
                        setFallacyFlagFeedback(null)
                        setFlaggedFallacyKey('')
                        hapticLight()
                      }}
                      className={cx(
                        'cursor-pointer rounded-2xl border p-4 transition-all',
                        isSelected
                          ? 'border-indigo-500 bg-indigo-500/10 shadow-lg ring-1 ring-indigo-500/30'
                          : 'border-white/5 bg-slate-900/60 hover:border-white/15 hover:bg-slate-900',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={cx(
                              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                              isThesis
                                ? 'bg-sky-500/20 text-status-info-text border border-sky-500/30'
                                : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
                            )}
                          >
                            {isThesis
                              ? activeCase.thesisAgent.name
                              : activeCase.antithesisAgent.name}
                          </span>
                          <span className="text-[11px] text-faint font-medium">
                            {isThesis
                              ? activeCase.thesisAgent.role
                              : activeCase.antithesisAgent.role}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-tertiary">Turn #{i + 1}</span>
                      </div>

                      <p className="text-sm font-medium text-slate-200 leading-relaxed">
                        {turn.text}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right Col: Fallacy Spotter Radar */}
            <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/80 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-status-warning-text" />
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    Fallacy Spotter Radar
                  </h3>
                </div>
                <span className="text-[10px] font-semibold text-faint">12 Formal Types</span>
              </div>

              <p className="text-xs text-secondary">
                Identify the logical fallacy embedded in Turn #{selectedTurnIndex + 1}:
              </p>

              <select
                value={flaggedFallacyKey}
                onChange={(e) => setFlaggedFallacyKey(e.target.value as ExpandedFallacy)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 p-2.5 text-xs font-semibold text-slate-200 outline-none"
              >
                <option value="">Select suspected fallacy...</option>
                {Object.values(COMPREHENSIVE_FALLACY_CATALOG).map((def) => (
                  <option key={def.key} value={def.key}>
                    {def.label} {def.latinName ? `(${def.latinName})` : ''}
                  </option>
                ))}
              </select>

              {flaggedFallacyKey && (
                <div className="rounded-xl border border-white/5 bg-slate-950/70 p-3 text-xs space-y-1.5 animate-fade-in">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">
                    Fallacy Definition
                  </span>
                  <p className="text-secondary">
                    {COMPREHENSIVE_FALLACY_CATALOG[flaggedFallacyKey].description}
                  </p>
                  <p className="text-[11px] text-faint italic">
                    Trap: {COMPREHENSIVE_FALLACY_CATALOG[flaggedFallacyKey].cognitiveTrap}
                  </p>
                </div>
              )}

              <button
                type="button"
                disabled={!flaggedFallacyKey}
                onClick={handleEvaluateFallacyFlag}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-600/30 py-2.5 text-xs font-bold text-white hover:bg-indigo-600/50 disabled:opacity-40 transition-all shadow-sm"
              >
                <Gavel className="h-4 w-4 text-indigo-300" />
                <span>Flag Fallacy & Score (+35 XP)</span>
              </button>

              {fallacyFlagFeedback && (
                <div
                  className={cx(
                    'rounded-xl border p-3.5 text-xs space-y-1 animate-fade-in',
                    fallacyFlagFeedback.correct
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                      : 'border-rose-500/30 bg-rose-500/10 text-rose-200',
                  )}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    {fallacyFlagFeedback.correct ? (
                      <CheckCircle2 className="h-4 w-4 text-status-success-text" />
                    ) : (
                      <XCircle className="h-4 w-4 text-danger-text" />
                    )}
                    <span>
                      {fallacyFlagFeedback.correct ? 'Correct Diagnosis!' : 'Diagnosis Disputed'} (+
                      {fallacyFlagFeedback.awardedXp} XP)
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed opacity-90">
                    {fallacyFlagFeedback.explanation}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Toulmin Dissection Graph */}
        {activeTab === 'toulmin' && (
          <div className="space-y-6">
            <ToulminArgumentHUD
              graph={graph}
              onAddNode={(type) => setNewNodeType(type)}
              onChallengeNode={(id) => {
                const node = graph.nodes.find((n) => n.id === id)
                if (node) {
                  setActiveTab('lakatos')
                  setLakatosRefinement(`Refining ${node.type}: `)
                }
              }}
              onExportCards={handleExportFlashcards}
            />

            {/* Quick Add Node Form */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-secondary">
                Attach New Toulmin Element
              </span>

              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={newNodeType}
                  onChange={(e) => setNewNodeType(e.target.value as ToulminNodeType)}
                  className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 outline-none"
                >
                  <option value="ground">Grounds (Empirical Evidence)</option>
                  <option value="warrant">Warrant (Inferential Bridge)</option>
                  <option value="backing">Backing (Scientific Theory)</option>
                  <option value="qualifier">Qualifier (Certainty Bounds)</option>
                  <option value="rebuttal">Rebuttal (Boundary Exception)</option>
                </select>

                <input
                  type="text"
                  placeholder="Articulate the element text..."
                  value={newNodeText}
                  onChange={(e) => setNewNodeText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddGraphNode()
                  }}
                  className="flex-1 min-w-[240px] rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none"
                />

                <button
                  type="button"
                  onClick={handleAddGraphNode}
                  className="flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-600/30 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-600/50 transition-all shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Attach Node</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Lakatos Socratic Lab */}
        {activeTab === 'lakatos' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-status-warning-text" />
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Imre Lakatos Proofs & Refutations Crucible (1976)
                </h3>
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                When a conjecture faces a counterexample, dogmatic thinkers surrender or dodge.
                Lakatosian dialecticians systematically refine theorems via{' '}
                <strong className="text-status-warning-text">Monster-Barring</strong>,{' '}
                <strong className="text-status-warning-text">Exception-Incorporation</strong>, or{' '}
                <strong className="text-status-warning-text">Lemma-Incorporation</strong>.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Challenge Box */}
              <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-faint block">
                  Step 1: Primitive Conjecture
                </span>
                <div className="rounded-xl border border-white/5 bg-slate-950 p-4 text-xs font-semibold text-slate-200">
                  "{activeCase.lakatosChallenge.primitiveConjecture}"
                </div>

                <span className="text-[10px] font-bold uppercase tracking-wider text-danger-text block">
                  Step 2: The Socratic Refutation (Counterexample)
                </span>
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-200 leading-relaxed">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-danger-text shrink-0 mt-0.5" />
                    <span>{activeCase.lakatosChallenge.counterexample}</span>
                  </div>
                </div>

                <div className="rounded-xl border border-white/5 bg-white/5 p-3 text-[11px] text-faint space-y-1">
                  <span className="font-bold text-secondary">Implicit Target Lemmas:</span>
                  <ul className="list-disc list-inside space-y-0.5 text-faint">
                    {activeCase.lakatosChallenge.targetLemmas.map((l, idx) => (
                      <li key={idx}>{l}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Tactic & Refinement Box */}
              <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-faint block">
                  Step 3: Select Your Dialectical Tactic
                </span>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(
                    [
                      'lemma_incorporation',
                      'exception_incorporation',
                      'monster_barring',
                    ] as LakatosTactic[]
                  ).map((tactic) => {
                    const meta = LAKATOS_TACTIC_DEFINITIONS[tactic]
                    const isSelected = chosenLakatosTactic === tactic
                    return (
                      <button
                        type="button"
                        key={tactic}
                        onClick={() => {
                          setChosenLakatosTactic(tactic)
                          hapticLight()
                        }}
                        className={cx(
                          'rounded-xl border p-2.5 text-left transition-all',
                          isSelected
                            ? 'border-indigo-500 bg-indigo-500/20 text-white shadow-md'
                            : 'border-white/5 bg-slate-950 text-tertiary hover:text-slate-200',
                        )}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider block mb-1">
                          {meta.label.split(' ')[0]}
                        </span>
                        <p className="text-[10px] line-clamp-2">{meta.heuristicValue}</p>
                      </button>
                    )
                  })}
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-faint block">
                    Step 4: Formulate Your Refined Conjecture
                  </span>
                  <textarea
                    rows={3}
                    placeholder="Provided that... / Except when... / By strict definition of..."
                    value={lakatosRefinement}
                    onChange={(e) => setLakatosRefinement(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-xs text-white placeholder-slate-500 outline-none"
                  />
                </div>

                <button
                  type="button"
                  disabled={!lakatosRefinement.trim()}
                  onClick={handleEvaluateLakatos}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-600/30 py-2.5 text-xs font-bold text-amber-200 hover:bg-amber-600/50 disabled:opacity-40 transition-all shadow-sm"
                >
                  <Award className="h-4 w-4" />
                  <span>Submit Heuristic Refinement (+XP)</span>
                </button>

                {lakatosFeedback && (
                  <div
                    className={cx(
                      'rounded-xl border p-3.5 text-xs space-y-1 animate-fade-in',
                      lakatosFeedback.valid
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-200',
                    )}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span>Score: {lakatosFeedback.score}%</span>
                      <span>+{lakatosFeedback.awardedXp} XP</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">{lakatosFeedback.feedback}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Protégé Peer (Alex) */}
        {activeTab === 'protege' && (
          <div className="max-w-2xl mx-auto space-y-5">
            <div className="flex items-center gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/10 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-status-info-text border border-sky-500/30">
                <User className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Teach Alex (The Protégé Effect, Chase et al. 2009)
                </h3>
                <p className="text-xs text-secondary">
                  Alex is your curious study partner. When you explain a concept to teach someone
                  else, your own neural consolidation increases by up to 34%.
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-faint block">
                Alex's Inquiry:
              </span>
              <div className="rounded-xl border border-white/5 bg-slate-950 p-4 text-xs font-semibold text-status-info-text leading-relaxed">
                "Hey! I'm trying to prepare for our dialectics exam on '{activeCase.title}'. Can you
                explain the core mechanism and why the opposing side pushes back?"
              </div>

              <div className="space-y-1.5 pt-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-faint block">
                  Your Explanation to Alex:
                </span>
                <textarea
                  rows={4}
                  placeholder="Explain clearly in plain English, touching on key concepts..."
                  value={protegeText}
                  onChange={(e) => setProtegeText(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-xs text-white placeholder-slate-500 outline-none"
                />
              </div>

              <button
                type="button"
                disabled={!protegeText.trim()}
                onClick={handleSendToProtege}
                className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-600/30 px-5 py-2.5 text-xs font-bold text-sky-200 hover:bg-sky-600/50 disabled:opacity-40 transition-all shadow-sm"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Teach Alex</span>
              </button>

              {protegeReply && (
                <div className="mt-4 rounded-xl border border-sky-500/30 bg-slate-950 p-4 space-y-2 animate-fade-in text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-status-info-text">Alex's Reaction:</span>
                    <span className="font-mono text-[11px] text-faint">
                      Concept Coverage: {Math.round(protegeReply.coverage * 100)}%
                    </span>
                  </div>
                  <p className="text-slate-200 leading-relaxed">"{protegeReply.reply}"</p>
                  {protegeReply.missingConcepts.length > 0 && (
                    <p className="text-[11px] text-faint">
                      Unaddressed core ideas: {protegeReply.missingConcepts.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Synthesis & Export Footer Bar */}
        <div className="mt-8 border-t border-white/10 pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gavel className="h-4 w-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white tracking-tight">
                Learner Closing Verdict (Bloom Level 6 Synthesis)
              </h3>
            </div>
            {exportNotice && (
              <span className="text-xs font-semibold text-status-success-text animate-fade-in">
                {exportNotice}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <textarea
              rows={2}
              placeholder="State the conditional synthesis under which each side is right (e.g. 'Thesis holds when..., whereas Antithesis holds unless...')"
              value={learnerVerdict}
              onChange={(e) => setLearnerVerdict(e.target.value)}
              className="flex-1 rounded-xl border border-white/10 bg-slate-900/80 p-3 text-xs text-white placeholder-slate-500 outline-none"
            />
            <div className="flex sm:flex-col gap-2 shrink-0">
              <button
                type="button"
                disabled={!learnerVerdict.trim()}
                onClick={handleAssessVerdict}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-600/30 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-600/50 disabled:opacity-40 transition-all shadow-sm"
              >
                <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
                <span>Evaluate Verdict</span>
              </button>

              <button
                type="button"
                onClick={handleExportFlashcards}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 transition-all"
                title="Convert into FSRS Spaced Repetition Cards"
              >
                <Download className="h-3.5 w-3.5 text-status-success-text" />
                <span>Deck Bridge</span>
              </button>
            </div>
          </div>

          {verdictResult && (
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 text-xs space-y-1.5 animate-fade-in">
              <div className="flex items-center justify-between font-bold text-indigo-300">
                <span>Epistemic Synthesis Score: {verdictResult.score}/100</span>
                <span>
                  {verdictResult.isConditional
                    ? 'Conditional Synthesis (+20)'
                    : 'One-Sided Verdict'}
                </span>
              </div>
              <p className="text-slate-200">{verdictResult.feedback}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
