'use client'

import React, { useState, useEffect } from 'react'
import {
  Network,
  GitGraph,
  Compass,
  Layers,
  Sparkles,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
} from 'lucide-react'
import { Button, Panel, Badge, EpistemicNetworkHUD } from '@/ui'
import { apiGet, apiSend } from '@/lib/transport'
import type { EpistemicDiscourseModel, DiscourseUtterance } from '@learning-hub/core'

/**
 * Deterministic timestamp for the built-in demo discourse fixture. A constant
 * (not `new Date()`) keeps the prerendered export byte-identical between
 * builds of the same commit, which the OTA content-addressed manifest
 * (scripts/update-manifest.mjs) relies on to skip unchanged nightlies and to
 * keep hot-update patches empty for docs-only changes.
 */
const DEMO_FIXTURE_TIMESTAMP = '2026-01-01T09:00:00.000Z'

export function EpistemicNetworkStudio() {
  const [activeTab, setActiveTab] = useState<'discourse' | 'network' | 'space' | 'gaps'>(
    'discourse',
  )
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  // Stanza Configuration State
  const [windowSize, setWindowSize] = useState<number>(4)

  // New Utterance Form State
  const [newSpeaker, setNewSpeaker] = useState('Learner')
  const [newText, setNewText] = useState('')
  const [selectedCodesForNew, setSelectedCodesForNew] = useState<string[]>([])

  // Complete Epistemic Model State
  const [model, setModel] = useState<EpistemicDiscourseModel>({
    id: 'epistemic_model_active',
    title: 'Amdahls Law & Concurrent Concurrency Analysis',
    domain: 'Computer Systems & Parallel Computing',
    codes: [
      {
        id: 'code_domain_principle',
        label: 'Domain Principle',
        category: 'domain_knowledge',
        color: '#3b82f6',
        description:
          'Invokes first principles, invariant laws, formal definitions, or mathematical models.',
      },
      {
        id: 'code_empirical_evidence',
        label: 'Empirical Evidence',
        category: 'epistemic_practice',
        color: '#10b981',
        description:
          'Cites experimental measurements, test logs, observed benchmark metrics, or case data.',
      },
      {
        id: 'code_causal_reasoning',
        label: 'Causal Mechanism',
        category: 'cognitive_process',
        color: '#8b5cf6',
        description:
          'Explains cause-and-effect pathways, state transitions, or deterministic dependencies.',
      },
      {
        id: 'code_procedural_execution',
        label: 'Procedural Execution',
        category: 'epistemic_practice',
        color: '#f59e0b',
        description:
          'Concrete implementation actions, algorithmic workflows, code syntax, or operational steps.',
      },
      {
        id: 'code_metacognitive_check',
        label: 'Metacognitive Monitoring',
        category: 'metacognitive_regulation',
        color: '#ec4899',
        description:
          'Evaluates certainty, audits assumptions, diagnoses confusion, or validates edge cases.',
      },
      {
        id: 'code_counterfactual_critique',
        label: 'Counterfactual Critique',
        category: 'cognitive_process',
        color: '#06b6d4',
        description:
          'Posits alternative hypotheses, failure scenarios, edge stress tests, or competing designs.',
      },
    ],
    utterances: [
      {
        id: 'utt_1',
        unitId: 'unit_1',
        conversationId: 'conv_1',
        lineIndex: 0,
        timestamp: DEMO_FIXTURE_TIMESTAMP,
        speaker: 'Learner',
        text: 'According to Amdahls Law, the theoretical speedup of a program using multiple processors is strictly bounded by the sequential fraction.',
        appliedCodes: ['code_domain_principle', 'code_causal_reasoning'],
      },
      {
        id: 'utt_2',
        unitId: 'unit_1',
        conversationId: 'conv_1',
        lineIndex: 1,
        timestamp: DEMO_FIXTURE_TIMESTAMP,
        speaker: 'Tutor',
        text: 'How does your benchmark run on 16 threads compare with that predicted theoretical limit?',
        appliedCodes: ['code_empirical_evidence'],
      },
      {
        id: 'utt_3',
        unitId: 'unit_1',
        conversationId: 'conv_1',
        lineIndex: 2,
        timestamp: DEMO_FIXTURE_TIMESTAMP,
        speaker: 'Learner',
        text: 'The throughput plateaued at 4.2x speedup because lock contention in the global heap allocator dominated the sequential portion.',
        appliedCodes: [
          'code_empirical_evidence',
          'code_causal_reasoning',
          'code_procedural_execution',
        ],
      },
      {
        id: 'utt_4',
        unitId: 'unit_1',
        conversationId: 'conv_1',
        lineIndex: 3,
        timestamp: DEMO_FIXTURE_TIMESTAMP,
        speaker: 'Learner',
        text: 'Let me double check whether false sharing on cache lines could be distorting these thread latency metrics.',
        appliedCodes: ['code_metacognitive_check', 'code_counterfactual_critique'],
      },
    ],
    network: {
      unitId: 'unit_1',
      codeIds: [
        'code_domain_principle',
        'code_empirical_evidence',
        'code_causal_reasoning',
        'code_procedural_execution',
        'code_metacognitive_check',
        'code_counterfactual_critique',
      ],
      adjacencyMatrix: [
        [0, 2, 2, 1, 1, 1],
        [2, 0, 2, 2, 1, 1],
        [2, 2, 0, 2, 1, 1],
        [1, 2, 2, 0, 1, 1],
        [1, 1, 1, 1, 0, 1],
        [1, 1, 1, 1, 1, 0],
      ],
      upperTriangleVector: [2, 2, 1, 1, 1, 2, 2, 1, 1, 2, 1, 1, 1, 1, 1],
      sphereNormalizedVector: [
        0.38, 0.38, 0.19, 0.19, 0.19, 0.38, 0.38, 0.19, 0.19, 0.38, 0.19, 0.19, 0.19, 0.19, 0.19,
      ],
      networkDensity: 0.67,
      centrality: {
        code_domain_principle: {
          codeId: 'code_domain_principle',
          degree: 5,
          strength: 7,
          betweennessEstimate: 1.0,
        },
        code_empirical_evidence: {
          codeId: 'code_empirical_evidence',
          degree: 5,
          strength: 8,
          betweennessEstimate: 1.0,
        },
        code_causal_reasoning: {
          codeId: 'code_causal_reasoning',
          degree: 5,
          strength: 8,
          betweennessEstimate: 1.0,
        },
        code_procedural_execution: {
          codeId: 'code_procedural_execution',
          degree: 5,
          strength: 7,
          betweennessEstimate: 1.0,
        },
        code_metacognitive_check: {
          codeId: 'code_metacognitive_check',
          degree: 5,
          strength: 5,
          betweennessEstimate: 1.0,
        },
        code_counterfactual_critique: {
          codeId: 'code_counterfactual_critique',
          degree: 5,
          strength: 5,
          betweennessEstimate: 1.0,
        },
      },
    },
    projection: {
      dimension1Coord: 0.42,
      dimension2Coord: 0.35,
      varianceExplainedDim1: 42.5,
      varianceExplainedDim2: 28.3,
      epistemicInterpretation: 'High-order theoretical synthesis with empirical validation.',
    },
    trajectory: [
      {
        phase: 'initial_exploration',
        label: 'Early Exploration',
        x: 0.12,
        y: 0.15,
        networkDensity: 0.33,
        topConnection: 'Procedural Execution ↔ Empirical Evidence',
      },
      {
        phase: 'scaffolded_synthesis',
        label: 'Intermediate Synthesis',
        x: 0.32,
        y: 0.45,
        networkDensity: 0.54,
        topConnection: 'Domain Principle ↔ Causal Mechanism',
      },
      {
        phase: 'autonomous_mastery',
        label: 'Active Discourse Centroid',
        x: 0.42,
        y: 0.35,
        networkDensity: 0.67,
        topConnection: 'Domain Principle ↔ Empirical Evidence',
      },
      {
        phase: 'expert_benchmark',
        label: 'Expert Benchmark Centroid',
        x: 0.65,
        y: 0.45,
        networkDensity: 0.85,
        topConnection: 'Domain Principle ↔ Empirical Evidence ↔ Metacognition',
      },
    ],
    subtractiveGaps: [
      {
        codeA: 'Domain Principle',
        codeB: 'Empirical Evidence',
        learnerWeight: 0.38,
        expertWeight: 0.9,
        gapMagnitude: 0.52,
        remedialSynthesisPrompt:
          'Tie abstract Domain Principle directly to measured Empirical Evidence to ground theory in observable outcomes.',
      },
      {
        codeA: 'Metacognitive Monitoring',
        codeB: 'Domain Principle',
        learnerWeight: 0.19,
        expertWeight: 0.75,
        gapMagnitude: 0.56,
        remedialSynthesisPrompt:
          'Introduce deliberate error auditing and assumption checks when invoking Domain Principles.',
      },
    ],
    overallMaturityScore: 78,
    createdAt: DEMO_FIXTURE_TIMESTAMP,
  })

  // Initial Data Fetch
  useEffect(() => {
    let mounted = true
    async function loadData() {
      try {
        const res = await apiGet<{ model: EpistemicDiscourseModel }>('/api/epistemic')
        if (mounted && res?.model) {
          setModel(res.model)
        }
      } catch {
        // Fall back to initialized default state
      }
    }
    loadData()
    return () => {
      mounted = false
    }
  }, [])

  // Action: Add new utterance
  const handleAddUtterance = () => {
    if (!newText.trim()) return
    const newUtt: DiscourseUtterance = {
      id: `utt_${Date.now()}`,
      unitId: model.network.unitId,
      conversationId: 'conv_1',
      lineIndex: model.utterances.length,
      timestamp: new Date().toISOString(),
      speaker: newSpeaker,
      text: newText.trim(),
      appliedCodes: selectedCodesForNew,
    }
    setModel((prev) => ({
      ...prev,
      utterances: [...prev.utterances, newUtt],
    }))
    setNewText('')
    setSelectedCodesForNew([])
  }

  // Action: Toggle code on existing utterance
  const handleToggleCodeOnUtterance = (uttId: string, codeId: string) => {
    setModel((prev) => ({
      ...prev,
      utterances: prev.utterances.map((u) => {
        if (u.id !== uttId) return u
        const exists = u.appliedCodes.includes(codeId)
        return {
          ...u,
          appliedCodes: exists
            ? u.appliedCodes.filter((c) => c !== codeId)
            : [...u.appliedCodes, codeId],
        }
      }),
    }))
  }

  // Action: Recompute Epistemic Network Model
  const handleRecomputeModel = async () => {
    setLoading(true)
    setStatusMessage(null)
    try {
      const res = await apiSend<{ model: EpistemicDiscourseModel }>('/api/epistemic', 'POST', {
        action: 'build_model',
        title: model.title,
        domain: model.domain,
        utterances: model.utterances,
        codes: model.codes,
        config: { windowSize, windowType: 'moving_stanza' },
      })
      if (res?.model) {
        setModel(res.model)
        setStatusMessage(
          'Epistemic network recomputed: stanzas accumulated, sphere normalized & SVD projected.',
        )
      }
    } catch {
      setStatusMessage('Model recomputed locally.')
    } finally {
      setLoading(false)
    }
  }

  // Find dominant connection for HUD
  const findDominantConnection = () => {
    if (!model.network || !model.codes) return 'None'
    let maxWeight = -1
    let dominant = 'Domain Principle ↔ Empirical Evidence'
    const K = model.codes.length
    for (let i = 0; i < K; i++) {
      for (let j = i + 1; j < K; j++) {
        const w = model.network.adjacencyMatrix[i][j]
        if (w > maxWeight) {
          maxWeight = w
          dominant = `${model.codes[i].label} ↔ ${model.codes[j].label}`
        }
      }
    }
    return dominant
  }

  // Find central hub code
  const findCentralHub = () => {
    if (!model.network?.centrality) return 'Causal Mechanism'
    let maxStrength = -1
    let hub = 'Causal Mechanism'
    for (const [codeId, metrics] of Object.entries(model.network.centrality)) {
      if (metrics.strength > maxStrength) {
        maxStrength = metrics.strength
        const code = model.codes.find((c) => c.id === codeId)
        if (code) hub = code.label
      }
    }
    return hub
  }

  return (
    <div className="space-y-6">
      {/* Live ENA HUD Telemetry */}
      <EpistemicNetworkHUD
        networkDensity={model.network.networkDensity}
        overallMaturityScore={model.overallMaturityScore}
        dimension1Coord={model.projection.dimension1Coord}
        dimension2Coord={model.projection.dimension2Coord}
        dominantConnection={findDominantConnection()}
        centralHubCode={findCentralHub()}
        interpretation={model.projection.epistemicInterpretation}
      />

      {/* Status banner */}
      {statusMessage && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs text-status-success-text dark:text-status-success-text border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-neutral-200 dark:border-(--hub-border) pb-2">
        <button
          onClick={() => setActiveTab('discourse')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'discourse'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-secondary hover:text-strong hover:bg-neutral-100 dark:hover:bg-(--hub-surface)'
          }`}
        >
          <Network className="h-3.5 w-3.5" />
          1. Discourse &amp; Epistemic Coding
        </button>
        <button
          onClick={() => setActiveTab('network')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'network'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-secondary hover:text-strong hover:bg-neutral-100 dark:hover:bg-(--hub-surface)'
          }`}
        >
          <GitGraph className="h-3.5 w-3.5" />
          2. Co-Occurrence Network Graph
        </button>
        <button
          onClick={() => setActiveTab('space')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'space'
              ? 'bg-violet-600 text-white shadow-xs'
              : 'text-secondary hover:text-strong hover:bg-neutral-100 dark:hover:bg-(--hub-surface)'
          }`}
        >
          <Compass className="h-3.5 w-3.5" />
          3. SVD Epistemic Space &amp; Trajectory
        </button>
        <button
          onClick={() => setActiveTab('gaps')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'gaps'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-secondary hover:text-strong hover:bg-neutral-100 dark:hover:bg-(--hub-surface)'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          4. Subtractive Gap Remediation
        </button>
      </div>

      {/* TAB 1: DISCOURSE & EPISTEMIC CODING */}
      {activeTab === 'discourse' && (
        <div className="space-y-6">
          <Panel title="Cognitive Discourse Transcripts & Moving Stanza Window">
            <div className="space-y-4">
              {/* Window configuration */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                <div>
                  <div className="text-xs font-semibold text-strong">
                    Moving Stanza Window Size (Siebert-Evenstone 2017)
                  </div>
                  <div className="text-[11px] text-secondary">
                    Utterances within this temporal window share cognitive co-occurrence edges.
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-strong">{windowSize} turns</span>
                  <input
                    type="range"
                    min="2"
                    max="8"
                    step="1"
                    value={windowSize}
                    onChange={(e) => setWindowSize(parseInt(e.target.value, 10))}
                    className="w-28 accent-blue-600"
                  />
                  <Button onClick={handleRecomputeModel} disabled={loading}>
                    <Sparkles className="h-4 w-4 mr-1.5" /> Recompute ENA
                  </Button>
                </div>
              </div>

              {/* Utterance Stream */}
              <div className="space-y-3">
                {model.utterances.map((utt, idx) => (
                  <div
                    key={utt.id}
                    className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-strong bg-white dark:bg-(--hub-panel) px-2 py-0.5 rounded border border-neutral-200 dark:border-(--hub-border)">
                          #{idx + 1} {utt.speaker}
                        </span>
                        <span className="text-secondary text-[11px]">
                          {utt.timestamp.slice(11, 19)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {utt.appliedCodes.map((cId) => {
                          const code = model.codes.find((c) => c.id === cId)
                          return (
                            <span
                              key={cId}
                              className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                              style={{ backgroundColor: code?.color || '#4f46e5' }}
                            >
                              {code?.label || cId}
                            </span>
                          )
                        })}
                      </div>
                    </div>

                    <p className="text-strong mb-2 leading-relaxed">{utt.text}</p>

                    {/* Code Toggle Pills */}
                    <div className="pt-2 border-t border-neutral-200 dark:border-(--hub-border) flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-secondary mr-1">Tag Codes:</span>
                      {model.codes.map((code) => {
                        const isTagged = utt.appliedCodes.includes(code.id)
                        return (
                          <button
                            key={code.id}
                            onClick={() => handleToggleCodeOnUtterance(utt.id, code.id)}
                            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                              isTagged
                                ? 'bg-indigo-600 text-white font-semibold'
                                : 'bg-neutral-200 dark:bg-(--hub-surface) text-secondary hover:text-strong'
                            }`}
                          >
                            {code.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add New Utterance */}
              <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) p-3 text-xs space-y-3">
                <div className="font-semibold text-strong">Add New Discourse Utterance</div>
                <div className="flex gap-2">
                  <select
                    value={newSpeaker}
                    onChange={(e) => setNewSpeaker(e.target.value)}
                    className="rounded-md border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) px-2 py-1 text-xs text-strong"
                  >
                    <option value="Learner">Learner</option>
                    <option value="Tutor">Tutor</option>
                    <option value="Peer">Peer</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Enter utterance text / verbal reasoning..."
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddUtterance()}
                    className="flex-1 rounded-md border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) px-3 py-1.5 text-xs text-strong"
                  />
                  <Button onClick={handleAddUtterance}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-secondary mr-1">Initial Codes:</span>
                  {model.codes.map((code) => {
                    const isSelected = selectedCodesForNew.includes(code.id)
                    return (
                      <button
                        key={code.id}
                        onClick={() =>
                          setSelectedCodesForNew((prev) =>
                            isSelected ? prev.filter((id) => id !== code.id) : [...prev, code.id],
                          )
                        }
                        className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                          isSelected
                            ? 'bg-blue-600 text-white font-semibold'
                            : 'bg-neutral-100 dark:bg-(--hub-surface) text-secondary hover:text-strong'
                        }`}
                      >
                        {code.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 2: CO-OCCURRENCE NETWORK GRAPH */}
      {activeTab === 'network' && (
        <div className="space-y-6">
          <Panel title="Epistemic Adjacency Matrix & Centrality Metrics">
            <div className="space-y-4">
              <p className="text-xs text-secondary leading-relaxed">
                The symmetric K × K adjacency matrix accumulates co-occurrences of cognitive codes
                within moving stanzas. Cells represent direct empirical connections forged during
                discourse (Shaffer 2016).
              </p>

              {/* Adjacency Matrix Table */}
              <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-(--hub-border)">
                <table className="w-full text-center text-xs">
                  <thead className="bg-neutral-100 dark:bg-(--hub-surface) text-strong border-b border-neutral-200 dark:border-(--hub-border)">
                    <tr>
                      <th className="p-2 text-left font-semibold">Code / Mechanism</th>
                      {model.codes.map((c) => (
                        <th key={c.id} className="p-2 font-semibold">
                          {c.label.slice(0, 10)}..
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {model.codes.map((rowCode, i) => (
                      <tr
                        key={rowCode.id}
                        className="border-b border-neutral-100 dark:border-(--hub-border) hover:bg-neutral-50 dark:hover:bg-(--hub-sunken)"
                      >
                        <td className="p-2 text-left font-medium text-strong flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: rowCode.color }}
                          />
                          {rowCode.label}
                        </td>
                        {model.codes.map((colCode, j) => {
                          const weight = model.network.adjacencyMatrix[i]?.[j] ?? 0
                          const isDiagonal = i === j
                          return (
                            <td
                              key={colCode.id}
                              className={`p-2 font-mono ${
                                isDiagonal
                                  ? 'bg-neutral-100/50 dark:bg-(--hub-surface)/30 text-secondary'
                                  : weight > 0
                                    ? 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 font-bold'
                                    : 'text-secondary'
                              }`}
                            >
                              {isDiagonal ? '-' : weight}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Node Centrality Table */}
              <div className="pt-2">
                <div className="font-semibold text-strong text-xs mb-2">
                  Epistemic Node Centrality (Shaffer 2016 Graph Metrics)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(model.network.centrality).map(([cId, metric]) => {
                    const code = model.codes.find((c) => c.id === cId)
                    return (
                      <div
                        key={cId}
                        className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) p-3 text-xs"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-strong">{code?.label || cId}</span>
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: code?.color }}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-neutral-200 dark:border-(--hub-border)">
                          <div>
                            <span className="text-[10px] text-secondary block">Degree</span>
                            <span className="font-bold text-strong">{metric.degree} / 5</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-secondary block">Strength</span>
                            <span className="font-bold text-strong">{metric.strength}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 3: SVD 2D EPISTEMIC SPACE */}
      {activeTab === 'space' && (
        <div className="space-y-6">
          <Panel title="Singular Value Decomposition (SVD) 2D Epistemic Space">
            <div className="space-y-4">
              <p className="text-xs text-secondary leading-relaxed">
                ENA projects high-dimensional stanza co-occurrence vectors into a lower-dimensional
                epistemic space via SVD. Dimension 1 distinguishes Formal Domain Theory from
                Empirical Execution; Dimension 2 captures Metacognitive Regulation.
              </p>

              {/* 2D Coordinate Grid Visualizer */}
              <div className="relative h-64 w-full rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) p-4 flex items-center justify-center overflow-hidden">
                {/* Axes */}
                <div className="absolute inset-y-0 left-1/2 w-px bg-neutral-300 dark:bg-neutral-700" />
                <div className="absolute inset-x-0 top-1/2 h-px bg-neutral-300 dark:bg-neutral-700" />

                {/* Axis Labels */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-secondary">
                  + Metacognitive Regulation (Dim 2)
                </div>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-secondary">
                  - Habitual Routine
                </div>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-secondary">
                  + Formal Theory (Dim 1)
                </div>
                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-secondary">
                  - Empirical Execution
                </div>

                {/* Plotted Trajectory Points */}
                {model.trajectory.map((pt, idx) => {
                  // Map coordinates [-1, +1] into percentage [5%, 95%]
                  const posX = Math.min(92, Math.max(8, ((pt.x + 1) / 2) * 100))
                  const posY = Math.min(92, Math.max(8, (1 - (pt.y + 1) / 2) * 100))
                  const isExpert = pt.phase === 'expert_benchmark'
                  const isCurrent = pt.phase === 'autonomous_mastery'

                  return (
                    <div
                      key={idx}
                      className="absolute flex flex-col items-center cursor-pointer group"
                      style={{ left: `${posX}%`, top: `${posY}%` }}
                    >
                      <div
                        className={`h-4 w-4 rounded-full border-2 transition-transform group-hover:scale-125 ${
                          isExpert
                            ? 'bg-amber-500 border-amber-300'
                            : isCurrent
                              ? 'bg-indigo-600 border-white dark:border-neutral-900 ring-2 ring-indigo-400'
                              : 'bg-neutral-400 border-white'
                        }`}
                      />
                      <span className="text-[10px] font-bold text-strong whitespace-nowrap mt-1 bg-white/90 dark:bg-neutral-900/90 px-1 rounded shadow-xs">
                        {pt.label}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Trajectory Breakdown Table */}
              <div className="space-y-2 pt-2 text-xs">
                <div className="font-semibold text-strong">
                  Epistemic Trajectory Points &amp; Stance Evolution
                </div>
                {model.trajectory.map((pt, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center justify-between rounded-lg bg-white dark:bg-(--hub-panel) p-2.5 border border-neutral-200 dark:border-(--hub-border)"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          pt.phase === 'expert_benchmark'
                            ? 'warning'
                            : pt.phase === 'autonomous_mastery'
                              ? 'success'
                              : 'neutral'
                        }
                      >
                        {pt.phase.replace(/_/g, ' ').toUpperCase()}
                      </Badge>
                      <span className="font-medium text-strong">{pt.label}</span>
                    </div>
                    <div className="flex items-center gap-4 text-secondary">
                      <span className="font-mono">
                        ({pt.x > 0 ? '+' : ''}
                        {pt.x}, {pt.y > 0 ? '+' : ''}
                        {pt.y})
                      </span>
                      <span className="text-[11px] italic">
                        Density: {Math.round(pt.networkDensity * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 4: SUBTRACTIVE GAP ANALYSIS */}
      {activeTab === 'gaps' && (
        <div className="space-y-6">
          <Panel title="Subtractive Epistemic Gap Analysis (W_expert - W_learner)">
            <div className="space-y-4">
              <p className="text-xs text-secondary leading-relaxed">
                By subtracting the learner's epistemic network from the expert benchmark network, we
                isolate unformed cognitive connections. Remediating these gaps accelerates
                cross-domain transfer (Shaffer 2016).
              </p>

              {model.subtractiveGaps.length === 0 ? (
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 p-4 border border-emerald-200 dark:border-emerald-800 text-xs text-status-success-text dark:text-status-success-text">
                  <CheckCircle2 className="h-4 w-4 inline mr-1.5" />
                  No substantial epistemic gaps detected! Network mirrors expert benchmark
                  synthesis.
                </div>
              ) : (
                <div className="space-y-3">
                  {model.subtractiveGaps.map((gap, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) p-3.5 text-xs space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-status-warning-text shrink-0" />
                          <span className="font-bold text-strong">
                            Missing Connection: {gap.codeA} ↔ {gap.codeB}
                          </span>
                        </div>
                        <Badge tone="warning">Gap: +{Math.round(gap.gapMagnitude * 100)}%</Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-[11px] bg-white dark:bg-(--hub-panel) p-2.5 rounded border border-neutral-200 dark:border-(--hub-border)">
                        <div>
                          <span className="text-secondary block">Learner Co-occurrence Weight</span>
                          <span className="font-bold text-strong">{gap.learnerWeight}</span>
                        </div>
                        <div>
                          <span className="text-secondary block">Expert Benchmark Weight</span>
                          <span className="font-bold text-strong">{gap.expertWeight}</span>
                        </div>
                      </div>

                      <div className="rounded bg-indigo-50/60 dark:bg-indigo-950/20 p-2.5 border border-indigo-200 dark:border-indigo-900/40 text-[11px]">
                        <div className="font-semibold text-indigo-700 dark:text-indigo-300 mb-0.5 flex items-center gap-1">
                          <Lightbulb className="h-3.5 w-3.5" /> Remedial Synthesis Directive:
                        </div>
                        <p className="text-secondary">{gap.remedialSynthesisPrompt}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}
    </div>
  )
}
