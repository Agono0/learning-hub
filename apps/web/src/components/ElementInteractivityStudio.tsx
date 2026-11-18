/**
 * Learning HUB — Cognitive Load & Element Interactivity Studio
 *
 * Implements John Sweller's Cognitive Load Theory (Sweller 1988, 2011),
 * Pollock, Chandler & Sweller (2002) Isolated-Elements Effect scaffold,
 * and Fred Paas's (1992) 2D Instructional Efficiency Diagnostic Crucible.
 */

'use client'

import React, { useMemo, useState } from 'react'
import {
  analyzeElementInteractivity,
  calculateInstructionalEfficiency,
  CALIBRATED_INTERACTIVITY_SUITES,
  type ElementInteractivitySuite,
  type FSRSElementCard,
  type ScaffoldPhase,
} from '@learning-hub/core/interactivity'
import { Badge, Button, ElementInteractivityHUD, Panel } from '@/ui'
import { getSharedAudioContext } from '@/lib/audio-graph'
import { hapticHeavy, hapticLight, hapticMedium } from '../platform/haptics'
import {
  Activity,
  Brain,
  Copy,
  Gauge,
  HelpCircle,
  Layers,
  Network,
  RotateCcw,
  Zap,
} from 'lucide-react'

type StudioTab = 'topology' | 'scaffold' | 'efficiency' | 'deck'

export function ElementInteractivityStudio() {
  const [selectedSuiteId, setSelectedSuiteId] = useState<string>('raft_consensus_protocol')
  const [activeTab, setActiveTab] = useState<StudioTab>('topology')
  const [currentPhase, setCurrentPhase] = useState<ScaffoldPhase>('isolated_elements')

  // Scaffold session state
  const [isolatedAnswers, setIsolatedAnswers] = useState<Record<string, boolean>>({})
  const [pairwiseAnswers, setPairwiseAnswers] = useState<Record<string, boolean>>({})
  const [systemicAnswers, setSystemicAnswers] = useState<Record<string, boolean>>({})
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null)
  const [activePerturbationId, setActivePerturbationId] = useState<string | null>(null)

  // Paas Diagnostic state
  const [mentalEffortScore, setMentalEffortScore] = useState<number>(5)
  const [performanceScore, setPerformanceScore] = useState<number>(75)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const suite: ElementInteractivitySuite =
    CALIBRATED_INTERACTIVITY_SUITES[selectedSuiteId] ??
    CALIBRATED_INTERACTIVITY_SUITES.raft_consensus_protocol

  // Topological and cognitive load analysis
  const analysis = useMemo(() => analyzeElementInteractivity(suite, 1.0), [suite])

  // Paas Instructional Efficiency calculation
  const efficiency = useMemo(
    () => calculateInstructionalEfficiency(mentalEffortScore, performanceScore),
    [mentalEffortScore, performanceScore],
  )

  // Chunking score computation
  const chunkingProgress = useMemo(() => {
    const isoTotal = suite.elements.length
    const pairTotal = suite.edges.length
    const sysTotal = suite.cascadeScenarios.length

    const isoPassed = Object.values(isolatedAnswers).filter(Boolean).length
    const pairPassed = Object.values(pairwiseAnswers).filter(Boolean).length
    const sysPassed = Object.values(systemicAnswers).filter(Boolean).length

    const isoScore = isoTotal > 0 ? isoPassed / isoTotal : 0
    const pairScore = pairTotal > 0 ? pairPassed / pairTotal : 0
    const sysScore = sysTotal > 0 ? sysPassed / sysTotal : 0

    const score = Math.round((isoScore * 0.25 + pairScore * 0.35 + sysScore * 0.4) * 100) / 100
    const isFullyChunked = score >= 0.9

    return {
      isoScore,
      pairScore,
      sysScore,
      score,
      isFullyChunked,
    }
  }, [suite, isolatedAnswers, pairwiseAnswers, systemicAnswers])

  // Play audio tones
  const playTone = (type: 'success' | 'alert' | 'step') => {
    void getSharedAudioContext()
      .then((ctx) => {
        if (!ctx) return
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)

        const now = ctx.currentTime
        if (type === 'success') {
          osc.frequency.setValueAtTime(523.25, now) // C5
          osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1) // E5
          osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2) // G5
          gain.gain.setValueAtTime(0.15, now)
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35)
          osc.start(now)
          osc.stop(now + 0.35)
        } else if (type === 'alert') {
          osc.frequency.setValueAtTime(329.63, now) // E4
          osc.frequency.setValueAtTime(293.66, now + 0.1) // D4
          gain.gain.setValueAtTime(0.12, now)
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25)
          osc.start(now)
          osc.stop(now + 0.25)
        } else {
          osc.frequency.setValueAtTime(440, now) // A4
          gain.gain.setValueAtTime(0.1, now)
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15)
          osc.start(now)
          osc.stop(now + 0.15)
        }
      })
      .catch(() => {})
  }

  const triggerToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3200)
  }

  // Answer handler for Phase 1 Isolated Elements
  const handleIsolatedAnswer = (elementId: string, isCorrect: boolean) => {
    setIsolatedAnswers((prev) => ({ ...prev, [elementId]: isCorrect }))
    if (isCorrect) {
      hapticLight()
      playTone('success')
      triggerToast('Atomic element mastery verified! Intrinsic load isolated.')
    } else {
      hapticMedium()
      playTone('alert')
      triggerToast('Incorrect. Review the atomic definition before coupling.')
    }
  }

  // Answer handler for Phase 2 Pairwise Coupling
  const handlePairwiseAnswer = (key: string, isCorrect: boolean) => {
    setPairwiseAnswers((prev) => ({ ...prev, [key]: isCorrect }))
    if (isCorrect) {
      hapticMedium()
      playTone('success')
      triggerToast('Binary interaction coupling internalized!')
    } else {
      hapticHeavy()
      playTone('alert')
      triggerToast('Coupling misconception detected. Inspect the causal interaction description.')
    }
  }

  // Answer handler for Phase 3 Systemic Synthesis
  const handleSystemicAnswer = (scenarioId: string, isCorrect: boolean) => {
    setSystemicAnswers((prev) => ({ ...prev, [scenarioId]: isCorrect }))
    if (isCorrect) {
      hapticHeavy()
      playTone('success')
      triggerToast('Full systemic cascade invariance synthesized! Schema chunked.')
    } else {
      playTone('alert')
      triggerToast('System perturbation prediction failed. Trace transitive feedback edges.')
    }
  }

  // Reset progress
  const handleReset = () => {
    setIsolatedAnswers({})
    setPairwiseAnswers({})
    setSystemicAnswers({})
    setSelectedElementId(null)
    setSelectedEdgeKey(null)
    setActivePerturbationId(null)
    setCurrentPhase('isolated_elements')
    playTone('step')
    triggerToast('Scaffold session reset to Phase 1: Isolated Elements.')
  }

  // Export FSRS Cards
  const exportedCards = useMemo(() => {
    const cards: FSRSElementCard[] = []
    for (const el of suite.elements) {
      const isMastered = isolatedAnswers[el.id] ?? false
      cards.push({
        id: `fsrs_${suite.id}_iso_${el.id}`,
        suiteId: suite.id,
        cardType: 'isolated_element',
        prompt: `[${suite.title} - Atomic Element]\n${el.testPrompt}`,
        solution: `${el.correctSolution}\n\nIsolated Definition: ${el.isolatedDefinition}`,
        interactivityTier: 'low',
        recommendedStabilityMultiplier: isMastered ? 1.15 : 0.85,
        theoreticalCitation: 'Pollock, Chandler & Sweller (2002) Isolated-Elements Effect Phase 1',
      })
    }
    for (const edge of suite.edges) {
      const key = `${edge.sourceElementId}->${edge.targetElementId}`
      const isMastered = pairwiseAnswers[key] ?? false
      cards.push({
        id: `fsrs_${suite.id}_pair_${edge.sourceElementId}_${edge.targetElementId}`,
        suiteId: suite.id,
        cardType: 'pairwise_coupling',
        prompt: `[${suite.title} - Binary Coupling]\n${edge.diagnosticQuestion}`,
        solution: `${edge.correctCouplingAnswer}\n\nCoupling Mechanism: ${edge.causalDescription}`,
        interactivityTier: 'moderate',
        recommendedStabilityMultiplier: isMastered ? 1.25 : 0.8,
        theoreticalCitation:
          'Sweller (2011) Cognitive Load Theory: Relational Subsystem Integration',
      })
    }
    for (const scen of suite.cascadeScenarios) {
      const isMastered = systemicAnswers[scen.id] ?? false
      const correctOpt = scen.options.find((o) => o.isCorrect)?.text ?? ''
      cards.push({
        id: `fsrs_${suite.id}_sys_${scen.id}`,
        suiteId: suite.id,
        cardType: 'systemic_synthesis',
        prompt: `[${suite.title} - Systemic Invariance]\nPerturbation: ${scen.perturbationDescription}\n\nChallenge: ${scen.synthesisChallenge}`,
        solution: `${correctOpt}\n\nSystem Cascade: ${scen.expectedCascadeEffects.map((e) => `• ${e.affectedElementId} [${e.direction}]: ${e.explanation}`).join('\n')}`,
        interactivityTier: 'extreme',
        recommendedStabilityMultiplier: isMastered ? 1.4 : 0.75,
        theoreticalCitation:
          'Pollock et al. (2002) & Cowan (2001) Schema Chunking in Working Memory',
      })
    }
    return cards
  }, [suite, isolatedAnswers, pairwiseAnswers, systemicAnswers])

  // Copy FSRS cards to clipboard
  const handleCopyDeck = () => {
    navigator.clipboard?.writeText(JSON.stringify(exportedCards, null, 2))
    triggerToast('Copied decomposed FSRS deck JSON to clipboard!')
  }

  // Node position helper for SVG rendering
  const getNodePosition = (index: number, total: number) => {
    const angle = (index / total) * 2 * Math.PI - Math.PI / 2
    const radius = 120
    const cx = 175 + radius * Math.cos(angle)
    const cy = 160 + radius * Math.sin(angle)
    return { cx, cy }
  }

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg bg-foreground px-4 py-2.5 text-xs text-background shadow-lg transition-all">
          {toastMessage}
        </div>
      )}

      {/* Suite Selector & Quick Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CpuIcon className="h-6 w-6 text-primary" />
            Cognitive Load & Element Interactivity Studio
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            John Sweller (1988, 2011) CLT • Pollock et al. (2002) Isolated-Elements Scaffolding •
            Paas (1992) Efficiency
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="suite-select" className="text-xs font-medium text-muted-foreground">
            Domain Suite:
          </label>
          <select
            id="suite-select"
            value={selectedSuiteId}
            onChange={(e) => {
              setSelectedSuiteId(e.target.value)
              handleReset()
            }}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {Object.values(CALIBRATED_INTERACTIVITY_SUITES).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>

          <Button variant="ghost" onClick={handleReset} title="Reset progress">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Top HUD: Stacked Cognitive Load & Paas 2D Efficiency */}
      <ElementInteractivityHUD
        loadBreakdown={analysis.estimatedNoviceLoad}
        efficiency={efficiency}
        currentPhase={currentPhase}
        chunkingScore={chunkingProgress.score}
        isFullyChunked={chunkingProgress.isFullyChunked}
        onPhaseSelect={(p) => setCurrentPhase(p)}
      />

      {/* Navigation Tabs */}
      <div className="flex border-b border-border/80 text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('topology')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'topology'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Network className="h-4 w-4" />
          Interaction Topology & Load
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('scaffold')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'scaffold'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Layers className="h-4 w-4" />
          Isolated-Elements Crucible
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('efficiency')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'efficiency'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Gauge className="h-4 w-4" />
          Paas Efficiency Diagnostic
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('deck')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'deck'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Brain className="h-4 w-4" />
          FSRS Decomposed Deck ({exportedCards.length})
        </button>
      </div>

      {/* TAB 1: Interaction Topology & Working Memory Load */}
      {activeTab === 'topology' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Interactive Graph Canvas */}
          <div className="lg:col-span-2 rounded-xl border border-border/80 bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Topological Interactivity Graph
                </h3>
                <p className="text-xs text-muted-foreground">
                  Elements coupled via causal, feedback, and constraint edges. Click any element or
                  edge to inspect.
                </p>
              </div>
              <Badge tone="cyan">Density: {Math.round(analysis.couplingDensity * 100)}%</Badge>
            </div>

            {/* SVG Graph View */}
            <div className="relative w-full h-80 rounded-lg bg-muted/20 border border-border/40 overflow-hidden flex items-center justify-center select-none">
              <svg viewBox="0 0 350 320" className="w-full h-full">
                <defs>
                  <marker
                    id="arrow"
                    viewBox="0 0 10 10"
                    refX="18"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path
                      d="M 0 0 L 10 5 L 0 10 z"
                      fill="currentColor"
                      className="text-muted-foreground/60"
                    />
                  </marker>
                </defs>

                {/* Draw Edges */}
                {suite.edges.map((edge) => {
                  const sIdx = suite.elements.findIndex((e) => e.id === edge.sourceElementId)
                  const tIdx = suite.elements.findIndex((e) => e.id === edge.targetElementId)
                  if (sIdx === -1 || tIdx === -1) return null

                  const sPos = getNodePosition(sIdx, suite.elements.length)
                  const tPos = getNodePosition(tIdx, suite.elements.length)
                  const key = `${edge.sourceElementId}->${edge.targetElementId}`
                  const isSelected = selectedEdgeKey === key
                  const isPairMastered = pairwiseAnswers[key] ?? false

                  return (
                    <g key={key} onClick={() => setSelectedEdgeKey(key)} className="cursor-pointer">
                      <line
                        x1={sPos.cx}
                        y1={sPos.cy}
                        x2={tPos.cx}
                        y2={tPos.cy}
                        stroke={isSelected ? '#06b6d4' : isPairMastered ? '#10b981' : '#94a3b8'}
                        strokeWidth={isSelected ? 3 : Math.max(1.5, edge.couplingStrength * 2.5)}
                        strokeDasharray={
                          edge.interactionType === 'feedback_loop' ? '4 3' : undefined
                        }
                        markerEnd="url(#arrow)"
                        className="transition-all hover:stroke-primary"
                      />
                    </g>
                  )
                })}

                {/* Draw Nodes */}
                {suite.elements.map((el, idx) => {
                  const pos = getNodePosition(idx, suite.elements.length)
                  const isSelected = selectedElementId === el.id
                  const isIsoMastered = isolatedAnswers[el.id] ?? false
                  const isPerturbed = activePerturbationId === el.id

                  return (
                    <g
                      key={el.id}
                      onClick={() => {
                        setSelectedElementId(el.id)
                        setSelectedEdgeKey(null)
                      }}
                      className="cursor-pointer group"
                    >
                      {/* Pulse circle for perturbation */}
                      {isPerturbed && (
                        <circle
                          cx={pos.cx}
                          cy={pos.cy}
                          r="28"
                          className="fill-rose-500/20 animate-ping"
                        />
                      )}

                      <circle
                        cx={pos.cx}
                        cy={pos.cy}
                        r="20"
                        className={`transition-all duration-200 stroke-2 ${
                          isSelected
                            ? 'fill-cyan-500/20 stroke-cyan-500'
                            : isIsoMastered
                              ? 'fill-emerald-500/20 stroke-emerald-500'
                              : 'fill-card stroke-border hover:stroke-primary'
                        }`}
                      />
                      <text
                        x={pos.cx}
                        y={pos.cy + 4}
                        textAnchor="middle"
                        className="text-[9px] font-bold fill-foreground pointer-events-none"
                      >
                        {idx + 1}
                      </text>
                      <text
                        x={pos.cx}
                        y={pos.cy + 32}
                        textAnchor="middle"
                        className="text-[8px] font-medium fill-muted-foreground pointer-events-none max-w-[80px]"
                      >
                        {el.label.slice(0, 16)}…
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>

            {/* Perturbation Trigger Bar */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                Inject System Perturbation:
              </span>
              {suite.cascadeScenarios.map((scen) => (
                <button
                  key={scen.id}
                  type="button"
                  onClick={() => {
                    setActivePerturbationId(scen.perturbationElementId)
                    playTone('step')
                    triggerToast(
                      `Perturbation injected on ${scen.perturbationElementId}! Watch cascade ripple.`,
                    )
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    activePerturbationId === scen.perturbationElementId
                      ? 'bg-rose-500/20 text-rose-500 border border-rose-500/40'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {scen.id.replace('scenario_', '').replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Right Col: Element / Edge Inspector */}
          <div className="rounded-xl border border-border/80 bg-card p-5 space-y-4">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              Inspector & Cognitive Breakdown
            </h3>

            {selectedElementId ? (
              (() => {
                const el = suite.elements.find((e) => e.id === selectedElementId)!
                const isMastered = isolatedAnswers[el.id] ?? false
                return (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{el.label}</span>
                      <Badge tone={isMastered ? 'success' : 'neutral'}>
                        {isMastered ? 'Mastered' : 'Unmastered'}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground">{el.description}</p>
                    <div className="rounded-lg bg-muted/30 p-3 space-y-1">
                      <span className="font-medium text-foreground block">
                        Isolated Atomic Definition:
                      </span>
                      <p className="text-muted-foreground">{el.isolatedDefinition}</p>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground pt-1">
                      <span>Intrinsic Complexity:</span>
                      <span className="font-semibold text-foreground">
                        {el.intrinsicComplexity} / 5
                      </span>
                    </div>
                  </div>
                )
              })()
            ) : selectedEdgeKey ? (
              (() => {
                const edge = suite.edges.find(
                  (e) => `${e.sourceElementId}->${e.targetElementId}` === selectedEdgeKey,
                )!
                const isMastered = pairwiseAnswers[selectedEdgeKey] ?? false
                return (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">
                        {edge.sourceElementId} → {edge.targetElementId}
                      </span>
                      <Badge tone={isMastered ? 'success' : 'neutral'}>
                        {isMastered ? 'Coupled' : 'Pending'}
                      </Badge>
                    </div>
                    <Badge tone="cyan">{edge.interactionType.replace('_', ' ')}</Badge>
                    <p className="text-muted-foreground">{edge.causalDescription}</p>
                    <div className="flex items-center justify-between text-muted-foreground pt-1">
                      <span>Coupling Strength:</span>
                      <span className="font-semibold text-foreground">
                        {edge.couplingStrength * 100}%
                      </span>
                    </div>
                  </div>
                )
              })()
            ) : (
              <div className="text-xs text-muted-foreground py-10 text-center space-y-2">
                <Brain className="h-8 w-8 mx-auto text-muted-foreground/40" />
                <p>
                  Select any node or interaction edge on the left to inspect its cognitive
                  complexity.
                </p>
              </div>
            )}

            {/* Cognitive Load Comparison */}
            <div className="border-t border-border/60 pt-4 space-y-2 text-xs">
              <span className="font-semibold text-foreground block">
                Novice vs Expert Chunked Load:
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-rose-500/10 p-2.5 border border-rose-500/20">
                  <span className="font-medium text-rose-500 block">Novice Schema</span>
                  <span className="text-muted-foreground">
                    Load: {analysis.estimatedNoviceLoad.totalLoad} chunks
                  </span>
                  <span className="block text-rose-500 font-semibold mt-1">Overload: YES</span>
                </div>
                <div className="rounded-lg bg-emerald-500/10 p-2.5 border border-emerald-500/20">
                  <span className="font-medium text-emerald-500 block">Chunked Expert</span>
                  <span className="text-muted-foreground">
                    Load: {analysis.estimatedExpertChunkedLoad.totalLoad} chunks
                  </span>
                  <span className="block text-emerald-500 font-semibold mt-1">Overload: NO</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Isolated-Elements Scaffold Crucible */}
      {activeTab === 'scaffold' && (
        <div className="space-y-6">
          <Panel className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Pollock et al. (2002) 3-Phase Isolated-Elements Scaffold
                </h3>
                <p className="text-xs text-muted-foreground">
                  Novices bypass working memory limits by mastering individual elements first, then
                  binary couplings, and finally full systemic cascades.
                </p>
              </div>
              <Badge tone="accent">Current Phase: {currentPhase.replace('_', ' ')}</Badge>
            </div>

            {/* Phase 1: Isolated Elements */}
            {currentPhase === 'isolated_elements' && (
              <div className="space-y-4">
                <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/20 p-3 text-xs text-cyan-600 dark:text-cyan-400">
                  <strong>Phase 1 Goal:</strong> Master each constituent concept in pure isolation.
                  Interaction edges are temporarily decoupled to keep intrinsic load below working
                  memory capacity.
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {suite.elements.map((el) => {
                    const isAnswered = isolatedAnswers[el.id] !== undefined
                    const isCorrect = isolatedAnswers[el.id] ?? false
                    const options = [el.correctSolution, ...el.distractorSolutions].sort()

                    return (
                      <div
                        key={el.id}
                        className="rounded-lg border border-border/80 bg-card p-4 space-y-3 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">{el.label}</span>
                          {isAnswered && (
                            <Badge tone={isCorrect ? 'success' : 'danger'}>
                              {isCorrect ? 'Mastered' : 'Needs Review'}
                            </Badge>
                          )}
                        </div>

                        <p className="text-muted-foreground">{el.testPrompt}</p>

                        <div className="space-y-1.5 pt-1">
                          {options.map((opt, oIdx) => (
                            <button
                              key={oIdx}
                              type="button"
                              onClick={() =>
                                handleIsolatedAnswer(el.id, opt === el.correctSolution)
                              }
                              className={`w-full text-left rounded-md px-3 py-2 text-xs transition-colors border ${
                                isAnswered && opt === el.correctSolution
                                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-medium'
                                  : 'bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/80'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Phase 2: Pairwise Coupling */}
            {currentPhase === 'pairwise_coupling' && (
              <div className="space-y-4">
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-600 dark:text-amber-400">
                  <strong>Phase 2 Goal:</strong> Now that atomic definitions are solidified into
                  mental representations, learn binary interaction dynamics between linked elements.
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {suite.edges.map((edge) => {
                    const key = `${edge.sourceElementId}->${edge.targetElementId}`
                    const isAnswered = pairwiseAnswers[key] !== undefined
                    const isCorrect = pairwiseAnswers[key] ?? false
                    const options = [edge.correctCouplingAnswer, ...edge.distractorAnswers].sort()

                    return (
                      <div
                        key={key}
                        className="rounded-lg border border-border/80 bg-card p-4 space-y-3 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">
                            {edge.sourceElementId} ↔ {edge.targetElementId}
                          </span>
                          {isAnswered && (
                            <Badge tone={isCorrect ? 'success' : 'danger'}>
                              {isCorrect ? 'Coupled' : 'Review'}
                            </Badge>
                          )}
                        </div>

                        <p className="text-muted-foreground">{edge.diagnosticQuestion}</p>

                        <div className="space-y-1.5 pt-1">
                          {options.map((opt, oIdx) => (
                            <button
                              key={oIdx}
                              type="button"
                              onClick={() =>
                                handlePairwiseAnswer(key, opt === edge.correctCouplingAnswer)
                              }
                              className={`w-full text-left rounded-md px-3 py-2 text-xs transition-colors border ${
                                isAnswered && opt === edge.correctCouplingAnswer
                                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-medium'
                                  : 'bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/80'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Phase 3: Systemic Synthesis */}
            {currentPhase === 'systemic_synthesis' && (
              <div className="space-y-4">
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-600 dark:text-emerald-400">
                  <strong>Phase 3 Goal:</strong> Integrate all elements into a unified systemic
                  mental model. Predict cascading multi-step ripples caused by system perturbations.
                </div>

                <div className="space-y-4">
                  {suite.cascadeScenarios.map((scen) => {
                    const isAnswered = systemicAnswers[scen.id] !== undefined
                    const isCorrect = systemicAnswers[scen.id] ?? false

                    return (
                      <div
                        key={scen.id}
                        className="rounded-lg border border-border/80 bg-card p-5 space-y-4 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground text-sm">
                            Perturbation Challenge:{' '}
                            {scen.id.replace('scenario_', '').replace(/_/g, ' ')}
                          </span>
                          {isAnswered && (
                            <Badge tone={isCorrect ? 'success' : 'danger'}>
                              {isCorrect ? 'Synthesized' : 'Needs Analysis'}
                            </Badge>
                          )}
                        </div>

                        <div className="rounded-md bg-muted/40 p-3 space-y-1.5">
                          <span className="font-medium text-foreground block">
                            Perturbation Context:
                          </span>
                          <p className="text-muted-foreground">{scen.perturbationDescription}</p>
                          <span className="font-medium text-foreground block pt-1">
                            {scen.synthesisChallenge}
                          </span>
                        </div>

                        <div className="space-y-2">
                          {scen.options.map((opt, oIdx) => (
                            <button
                              key={oIdx}
                              type="button"
                              onClick={() => handleSystemicAnswer(scen.id, opt.isCorrect)}
                              className={`w-full text-left rounded-md px-3.5 py-2.5 text-xs transition-colors border ${
                                isAnswered && opt.isCorrect
                                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-medium'
                                  : 'bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/80'
                              }`}
                            >
                              {opt.text}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* TAB 3: Paas (1992) Instructional Efficiency Diagnostic */}
      {activeTab === 'efficiency' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Panel className="p-5 space-y-5">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Instructional Efficiency Simulator
              </h3>
              <p className="text-xs text-muted-foreground">
                Adjust your subjective mental effort (Paas 9-point scale) and test performance to
                calculate real-time efficiency.
              </p>
            </div>

            {/* Mental Effort Slider */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between font-medium">
                <span className="text-foreground">Subjective Mental Effort (R):</span>
                <span className="text-primary font-bold">{mentalEffortScore} / 9</span>
              </div>
              <input
                type="range"
                min="1"
                max="9"
                step="1"
                value={mentalEffortScore}
                onChange={(e) => setMentalEffortScore(Number(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>1: Minimal Effort</span>
                <span>5: Moderate Effort</span>
                <span>9: Extreme Overload</span>
              </div>
            </div>

            {/* Performance Slider */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between font-medium">
                <span className="text-foreground">Objective Task Performance (P):</span>
                <span className="text-emerald-500 font-bold">{performanceScore}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={performanceScore}
                onChange={(e) => setPerformanceScore(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0%: Complete Failure</span>
                <span>50%: Average</span>
                <span>100%: Flawless Invariance</span>
              </div>
            </div>

            {/* Calculated Values */}
            <div className="rounded-lg bg-muted/40 p-4 space-y-2 text-xs border border-border/60">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Z-Standardized Effort (Z_R):</span>
                <span className="font-semibold text-foreground">{efficiency.zEffort}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Z-Standardized Performance (Z_P):</span>
                <span className="font-semibold text-foreground">{efficiency.zPerformance}</span>
              </div>
              <div className="flex justify-between border-t border-border/60 pt-2 font-bold">
                <span className="text-foreground">Instructional Efficiency (E):</span>
                <span
                  className={efficiency.efficiency >= 0.5 ? 'text-emerald-500' : 'text-rose-500'}
                >
                  {efficiency.efficiency > 0
                    ? `+${efficiency.efficiency.toFixed(2)}`
                    : efficiency.efficiency.toFixed(2)}
                </span>
              </div>
            </div>
          </Panel>

          {/* Diagnostic Guidance Panel */}
          <Panel className="p-5 space-y-4">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Cognitive Science Diagnostic Feedback
            </h3>

            <div className="rounded-lg bg-card border border-border/80 p-4 space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">State:</span>
                <Badge
                  tone={
                    efficiency.classification === 'optimal_automation'
                      ? 'success'
                      : efficiency.classification === 'cognitive_overload'
                        ? 'danger'
                        : 'accent'
                  }
                >
                  {efficiency.classification.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>

              {efficiency.classification === 'optimal_automation' && (
                <p className="text-muted-foreground">
                  <strong>High Performance with Low Mental Effort:</strong> Excellent schema
                  automation. Constituents have been chunked into long-term memory macro-structures,
                  freeing up working memory for creative transfer.
                </p>
              )}
              {efficiency.classification === 'cognitive_overload' && (
                <p className="text-rose-500">
                  <strong>High Mental Effort with Sub-Par Performance:</strong> Working memory
                  threshold exceeded. Drop back to <strong>Phase 1: Isolated Elements</strong>{' '}
                  immediately to avoid cognitive paralysis.
                </p>
              )}
              {efficiency.classification === 'under_engaged' && (
                <p className="text-amber-500">
                  <strong>Low Effort with Low Performance:</strong> Under-engagement detected.
                  Increase challenge desirability or active generation retrieval ladder.
                </p>
              )}
              {efficiency.classification === 'effortful_mastery' && (
                <p className="text-cyan-500">
                  <strong>High Performance at High Effort:</strong> Systemic mastery achieved, but
                  schema consolidation is still in progress. Additional spaced retrieval will
                  automate the chunk.
                </p>
              )}
              {efficiency.classification === 'efficient_learning' && (
                <p className="text-muted-foreground">
                  <strong>Balanced Efficiency:</strong> Productive learning zone. Intrinsic load
                  matches current working memory headroom.
                </p>
              )}
            </div>

            <div className="border-t border-border/60 pt-3 text-xs text-muted-foreground space-y-1">
              <span className="font-semibold text-foreground block">Formal Reference:</span>
              <p>
                Paas, F. G. (1992). Training strategies for attaining transfer of problem-solving
                skill in statistics: A cognitive-load approach.{' '}
                <em>Journal of Educational Psychology</em>, 84(4), 429.
              </p>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 4: FSRS Decomposed Cards Deck */}
      {activeTab === 'deck' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                FSRS-6 Decomposed Stability Deck ({exportedCards.length} Cards)
              </h3>
              <p className="text-xs text-muted-foreground">
                Card stability S_0 is scaled by schema chunking efficiency (Pollock et al. 2002).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={handleCopyDeck}>
                <Copy className="h-4 w-4 mr-1.5" />
                Copy Deck JSON
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {exportedCards.map((card) => (
              <div
                key={card.id}
                className="rounded-lg border border-border/80 bg-card p-4 space-y-3 text-xs flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge
                      tone={
                        card.cardType === 'isolated_element'
                          ? 'neutral'
                          : card.cardType === 'pairwise_coupling'
                            ? 'accent'
                            : 'success'
                      }
                    >
                      {card.cardType.replace('_', ' ')}
                    </Badge>
                    <span className="font-bold text-foreground">
                      S₀ ×{card.recommendedStabilityMultiplier.toFixed(2)}
                    </span>
                  </div>

                  <p className="font-medium text-foreground whitespace-pre-line">{card.prompt}</p>
                </div>

                <div className="pt-2 border-t border-border/40 text-muted-foreground space-y-1">
                  <span className="font-semibold text-foreground block">Solution:</span>
                  <p className="whitespace-pre-line text-[11px]">{card.solution}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CpuIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="16" height="16" x="4" y="4" rx="2" />
      <rect width="6" height="6" x="9" y="9" rx="1" />
      <path d="M15 2v2" />
      <path d="M15 20v2" />
      <path d="M2 15h2" />
      <path d="M2 9h2" />
      <path d="M20 15h2" />
      <path d="M20 9h2" />
      <path d="M9 2v2" />
      <path d="M9 20v2" />
    </svg>
  )
}
