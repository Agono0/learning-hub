'use client'

import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  GitBranch,
  Layers,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react'
import { IconButton } from '@/ui'
import {
  CALIBRATED_CONCEPT_SCHEMAS,
  SchemaDistillationSession,
  evaluateLinkingPhrasePrecision,
  exportSchemaToFSRSCards,
  type ConceptSchemaMap,
  type ConceptSchemaNode,
  type FSRSPropositionCard,
  type PropositionType,
} from '@learning-hub/core/knowledge-graph'
import { ConceptSchemaHUD } from '../ui/ConceptSchemaHUD'
import { getSharedAudioContext } from '../lib/audio-graph'
import { hapticHeavy, hapticLight, hapticMedium, hapticWarning } from '../platform/haptics'

export type SchemaStudioTab =
  'hierarchy_web' | 'proposition_builder' | 'misconception_crucible' | 'fsrs_tree'

export interface SchemaDistillationStudioProps {
  initialSchemaId?: string
  onExportCards?: (cards: FSRSPropositionCard[]) => void
  className?: string
}

export function SchemaDistillationStudio({
  initialSchemaId = 'cognitive_memory_architecture',
  onExportCards,
  className,
}: SchemaDistillationStudioProps) {
  // Schema selection
  const [selectedSchemaId, setSelectedSchemaId] = useState<string>(initialSchemaId)
  const [activeTab, setActiveTab] = useState<SchemaStudioTab>('hierarchy_web')
  const [audioMuted, setAudioMuted] = useState(false)

  // Session reference and mirror state
  const sessionRef = useRef<SchemaDistillationSession>(
    new SchemaDistillationSession(selectedSchemaId),
  )
  const [sessionState, setSessionState] = useState(() => sessionRef.current.getState())

  // Interactive proposition builder form state
  const [builderSourceId, setBuilderSourceId] = useState<string>('')
  const [builderTargetId, setBuilderTargetId] = useState<string>('')
  const [builderPhrase, setBuilderPhrase] = useState<string>('')
  const [builderType, setBuilderType] = useState<PropositionType>('hierarchical_subsumption')
  const [builderRationale, setBuilderRationale] = useState<string>('')
  const [builderFeedback, setBuilderFeedback] = useState<{
    isSuccess: boolean
    text: string
  } | null>(null)

  // Anomaly repair input state
  const [repairPhraseMap, setRepairPhraseMap] = useState<Record<string, string>>({})

  // Current active schema
  const currentSchema: ConceptSchemaMap = useMemo(() => {
    return sessionState.schemaMap
  }, [sessionState.schemaMap])

  // Active concept details
  const activeConcept: ConceptSchemaNode | undefined = useMemo(() => {
    if (!sessionState.activeConceptId) return undefined
    return currentSchema.nodes.find((n) => n.id === sessionState.activeConceptId)
  }, [sessionState.activeConceptId, currentSchema.nodes])

  // Nodes grouped by hierarchical level
  const nodesByLevel = useMemo(() => {
    const map = new Map<number, ConceptSchemaNode[]>()
    for (const node of currentSchema.nodes) {
      const list = map.get(node.hierarchicalLevel) || []
      list.push(node)
      map.set(node.hierarchicalLevel, list)
    }
    return map
  }, [currentSchema.nodes])

  // Synthesize Web Audio Earcons
  const playAudioEarcon = useCallback(
    (type: 'success' | 'error' | 'milestone' | 'link') => {
      if (audioMuted) return
      void getSharedAudioContext()
        .then((ctx) => {
          if (!ctx) return
          if (ctx.state === 'suspended') {
            void ctx.resume()
          }

          const now = ctx.currentTime
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)

          if (type === 'success') {
            osc.type = 'sine'
            osc.frequency.setValueAtTime(523.25, now) // C5
            osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12) // G5
            gain.gain.setValueAtTime(0.12, now)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
            osc.start(now)
            osc.stop(now + 0.25)
          } else if (type === 'error') {
            osc.type = 'sawtooth'
            osc.frequency.setValueAtTime(220, now) // A3
            osc.frequency.exponentialRampToValueAtTime(146.83, now + 0.18) // D3
            gain.gain.setValueAtTime(0.14, now)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
            osc.start(now)
            osc.stop(now + 0.25)
          } else if (type === 'milestone') {
            osc.type = 'triangle'
            osc.frequency.setValueAtTime(440, now) // A4
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.22) // A5
            gain.gain.setValueAtTime(0.15, now)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
            osc.start(now)
            osc.stop(now + 0.35)
          } else if (type === 'link') {
            osc.type = 'sine'
            osc.frequency.setValueAtTime(349.23, now) // F4
            osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.12) // C5
            gain.gain.setValueAtTime(0.1, now)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
            osc.start(now)
            osc.stop(now + 0.2)
          }
        })
        .catch(() => {
          // Ignore audio failures
        })
    },
    [audioMuted],
  )

  // Switch schema
  const handleSchemaChange = (schemaId: string) => {
    setSelectedSchemaId(schemaId)
    sessionRef.current = new SchemaDistillationSession(schemaId)
    setSessionState(sessionRef.current.getState())
    setBuilderFeedback(null)
    setBuilderPhrase('')
    setBuilderRationale('')
    hapticMedium()
  }

  // Reset schema
  const handleResetSchema = () => {
    sessionRef.current = new SchemaDistillationSession(selectedSchemaId)
    setSessionState(sessionRef.current.getState())
    setBuilderFeedback(null)
    hapticMedium()
  }

  // Concept selection
  const handleSelectConcept = (conceptId: string) => {
    sessionRef.current.setActiveConcept(conceptId)
    setSessionState(sessionRef.current.getState())
    hapticLight()
  }

  // Add proposition
  const handleAddProposition = () => {
    if (!builderSourceId || !builderTargetId || !builderPhrase.trim()) {
      setBuilderFeedback({
        isSuccess: false,
        text: 'Please select source concept, target concept, and type a linking phrase.',
      })
      playAudioEarcon('error')
      hapticWarning()
      return
    }

    const result = sessionRef.current.addProposition({
      sourceId: builderSourceId,
      targetId: builderTargetId,
      linkingPhrase: builderPhrase.trim(),
      propositionType: builderType,
      semanticRationale: builderRationale.trim(),
    })

    setSessionState(sessionRef.current.getState())

    if (result.success) {
      setBuilderFeedback({ isSuccess: true, text: result.feedback })
      setBuilderPhrase('')
      setBuilderRationale('')
      playAudioEarcon('link')
      hapticLight()
    } else {
      setBuilderFeedback({ isSuccess: false, text: result.feedback })
      playAudioEarcon('error')
      hapticWarning()
    }
  }

  // Remove proposition
  const handleRemoveProposition = (linkId: string) => {
    const ok = sessionRef.current.removeProposition(linkId)
    if (ok) {
      setSessionState(sessionRef.current.getState())
      playAudioEarcon('hint' as never)
      hapticLight()
    }
  }

  // Repair anomaly
  const handleRepairAnomaly = (anomalyId: string, linkId?: string) => {
    const updatedPhrase = linkId ? repairPhraseMap[linkId] : undefined
    if (linkId && !updatedPhrase?.trim()) return

    const ok = sessionRef.current.repairAnomaly(anomalyId, {
      linkId,
      updatedPhrase: updatedPhrase?.trim(),
    })

    if (ok) {
      setSessionState(sessionRef.current.getState())
      playAudioEarcon('success')
      hapticMedium()
    }
  }

  // Export cards
  const handleExportFSRSCards = () => {
    const cards = exportSchemaToFSRSCards(currentSchema)
    if (onExportCards) {
      onExportCards(cards)
    }

    // Trigger synthetic download of JSON card deck
    const blob = new Blob([JSON.stringify(cards, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fsrs-concept-schema-${currentSchema.id}.json`
    a.click()
    URL.revokeObjectURL(url)

    playAudioEarcon('milestone')
    hapticHeavy()
  }

  // Precision check on live typing
  const livePrecision = useMemo(() => {
    if (!builderPhrase.trim()) return null
    return evaluateLinkingPhrasePrecision(builderPhrase)
  }, [builderPhrase])

  return (
    <div className={`flex flex-col gap-6 ${className || ''}`}>
      {/* Top Header Controls: Schema Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-faint">
            Schema Domain:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {Object.values(CALIBRATED_CONCEPT_SCHEMAS).map((s) => {
              const isSelected = s.id === selectedSchemaId
              return (
                <button
                  key={s.id}
                  onClick={() => handleSchemaChange(s.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'bg-white/5 text-secondary hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {s.title} ({s.domain.replace('_', ' ')})
                </button>
              )
            })}
          </div>
        </div>

        {/* Audio Mute & Reset */}
        <div className="flex items-center gap-2">
          <IconButton
            label={audioMuted ? 'Unmute audio feedback' : 'Mute audio feedback'}
            title={audioMuted ? 'Unmute Earcons' : 'Mute Earcons'}
            onClick={() => setAudioMuted(!audioMuted)}
            className="rounded-xl border border-white/10 bg-white/5 text-faint hover:bg-white/10 hover:text-white"
          >
            {audioMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </IconButton>
          <button
            onClick={handleResetSchema}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-white/10 hover:text-white transition-all"
            title="Reset Schema to Default"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Telemetry HUD */}
      <ConceptSchemaHUD
        metrics={sessionState.metrics}
        schemaTitle={currentSchema.title}
        domain={currentSchema.domain}
        activeConceptLabel={activeConcept?.label}
      />

      {/* Tab Navigation */}
      <div className="flex border-b border-white/10 text-xs font-bold overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap">
        <button
          onClick={() => {
            setActiveTab('hierarchy_web')
            hapticLight()
          }}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 transition-all ${
            activeTab === 'hierarchy_web'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-faint hover:text-slate-200'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Hierarchy & Concept Web</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('proposition_builder')
            hapticLight()
          }}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 transition-all ${
            activeTab === 'proposition_builder'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-faint hover:text-slate-200'
          }`}
        >
          <GitBranch className="h-4 w-4" />
          <span>Proposition Builder (Novak 1984)</span>
          {sessionState.customPropositionsCount > 0 && (
            <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] text-indigo-300 font-bold">
              +{sessionState.customPropositionsCount} custom
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('misconception_crucible')
            hapticLight()
          }}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 transition-all ${
            activeTab === 'misconception_crucible'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-faint hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="h-4 w-4 text-status-warning-text" />
          <span>Misconception Crucible</span>
          {sessionState.metrics.detectedAnomalies.length > 0 && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-status-warning-text font-bold">
              {sessionState.metrics.detectedAnomalies.length}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('fsrs_tree')
            hapticLight()
          }}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 transition-all ${
            activeTab === 'fsrs_tree'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-faint hover:text-slate-200'
          }`}
        >
          <Sparkles className="h-4 w-4 text-status-success-text" />
          <span>FSRS Flashcard Tree</span>
        </button>
      </div>

      {/* Tab 1: Concept Hierarchy & Web */}
      {activeTab === 'hierarchy_web' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Progressive Differentiation Hierarchy Levels */}
          <div className="lg:col-span-2 flex flex-col gap-5">
            {[1, 2, 3].map((lvl) => {
              const nodesAtLevel = nodesByLevel.get(lvl) || []
              const levelLabel =
                lvl === 1
                  ? 'Level 1: Root Anchor Schema (Ausubelian Anchor)'
                  : lvl === 2
                    ? 'Level 2: Intermediate Conceptual Subsumptions'
                    : 'Level 3: Specific Exemplars & Mechanisms'

              return (
                <div
                  key={lvl}
                  className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block mb-3">
                    {levelLabel}
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {nodesAtLevel.map((node) => {
                      const isSelected = node.id === sessionState.activeConceptId
                      const incidentLinks = currentSchema.links.filter(
                        (l) => l.sourceId === node.id || l.targetId === node.id,
                      )

                      return (
                        <div
                          key={node.id}
                          onClick={() => handleSelectConcept(node.id)}
                          className={`cursor-pointer rounded-xl border p-4 transition-all ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-500/15 shadow-lg shadow-indigo-500/20'
                              : 'border-white/5 bg-slate-950/60 hover:border-white/20 hover:bg-white/[0.03]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                              {node.isAnchor && (
                                <Sparkles className="h-3 w-3 text-status-warning-text" />
                              )}
                              <span>{node.label}</span>
                            </h4>
                            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-mono text-faint">
                              {incidentLinks.length} props
                            </span>
                          </div>

                          <p className="text-[11px] text-secondary line-clamp-2 leading-relaxed">
                            {node.definition}
                          </p>

                          <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/5 text-[10px] text-tertiary">
                            <span className="capitalize">
                              {node.subsumptionRole.replace('_', ' ')}
                            </span>
                            <span>{node.domain}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Right Column: Selected Concept Detail & Propositional Links */}
          <div className="flex flex-col gap-4">
            {activeConcept ? (
              <div className="sticky top-6 flex flex-col gap-4 rounded-2xl border border-indigo-500/30 bg-slate-900/90 p-5 shadow-2xl backdrop-blur-md">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                      Concept Inspector
                    </span>
                    <h3 className="text-sm font-bold text-white mt-0.5">{activeConcept.label}</h3>
                  </div>
                  <span className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-[10px] font-bold text-indigo-300">
                    Level {activeConcept.hierarchicalLevel}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/70 p-3 rounded-xl border border-white/5">
                  {activeConcept.definition}
                </p>

                {/* Exemplar instances */}
                {activeConcept.examples.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-faint block mb-1">
                      Concrete Exemplars:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {activeConcept.examples.map((ex, exIdx) => (
                        <span
                          key={exIdx}
                          className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-secondary"
                        >
                          {ex}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Incident Propositions */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-faint block mb-2">
                    Established Propositions:
                  </span>
                  <div className="flex flex-col gap-2">
                    {currentSchema.links
                      .filter(
                        (l) => l.sourceId === activeConcept.id || l.targetId === activeConcept.id,
                      )
                      .map((l) => {
                        const isOut = l.sourceId === activeConcept.id
                        const otherNode = currentSchema.nodes.find(
                          (n) => n.id === (isOut ? l.targetId : l.sourceId),
                        )

                        return (
                          <div
                            key={l.id}
                            className="flex items-start justify-between gap-2 rounded-xl border border-white/5 bg-slate-950/70 p-2.5 text-xs"
                          >
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] text-faint font-mono">
                                {isOut ? '→ Outbound' : '← Inbound'} (
                                {l.propositionType.replace('_', ' ')})
                              </span>
                              <p className="text-[11px] text-slate-200">
                                <strong className="text-white">{activeConcept.label}</strong>{' '}
                                <em className="text-indigo-300 font-semibold">{l.linkingPhrase}</em>{' '}
                                <strong className="text-white">
                                  {otherNode?.label || 'Target'}
                                </strong>
                              </p>
                            </div>

                            <IconButton
                              label="Delete Proposition"
                              size="sm"
                              onClick={() => handleRemoveProposition(l.id)}
                              className="rounded-lg hover:bg-white/10 hover:text-danger-text"
                            >
                              <Trash2 className="h-3 w-3" />
                            </IconButton>
                          </div>
                        )
                      })}
                  </div>
                </div>

                {/* Direct Synthesize Action */}
                <button
                  onClick={() => {
                    setBuilderSourceId(activeConcept.id)
                    setActiveTab('proposition_builder')
                    hapticLight()
                  }}
                  className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Synthesize Proposition with {activeConcept.label}</span>
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-xs text-tertiary">
                Select any concept node to inspect its subsumption links and scientific
                propositions.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Proposition Builder */}
      {activeTab === 'proposition_builder' && (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block mb-1">
              Novak (1984) Semantic Proposition Synthesizer
            </span>
            <p className="text-xs text-secondary leading-relaxed">
              Construct meaningful propositions connecting concepts via precise mechanistic linking
              verbs. Avoid vacuous words (<em>"is", "has", "related to"</em>) that fail to generate
              deep schema acquisition.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-xl">
            {/* Source and Target Concept Selectors */}
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-secondary block mb-1.5">
                  1. Source Concept (Subject):
                </label>
                <select
                  value={builderSourceId}
                  onChange={(e) => setBuilderSourceId(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">Select source concept...</option>
                  {currentSchema.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label} (Level {n.hierarchicalLevel})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-secondary block mb-1.5">
                  2. Target Concept (Object):
                </label>
                <select
                  value={builderTargetId}
                  onChange={(e) => setBuilderTargetId(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">Select target concept...</option>
                  {currentSchema.nodes
                    .filter((n) => n.id !== builderSourceId)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label} (Level {n.hierarchicalLevel})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-secondary block mb-1.5">
                  3. Proposition Type:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      'hierarchical_subsumption',
                      'cross_link_synthesis',
                      'causal_mechanism',
                      'correlative_qualification',
                      'boundary_constraint',
                    ] as PropositionType[]
                  ).map((t) => (
                    <button
                      key={t}
                      onClick={() => setBuilderType(t)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                        builderType === t
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white/5 text-faint hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {t.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Linking Phrase & Semantic Rationale */}
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-secondary block mb-1.5">
                  4. Mechanistic Linking Phrase:
                </label>
                <input
                  type="text"
                  value={builderPhrase}
                  onChange={(e) => setBuilderPhrase(e.target.value)}
                  placeholder="e.g. 'imposes hard capacity constraints upon', 'is formally guaranteed by'..."
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />

                {/* Live Semantic Precision Indicator */}
                {livePrecision && (
                  <div
                    className={`mt-2 rounded-lg p-2.5 text-[11px] font-medium flex items-center gap-2 ${
                      livePrecision.isVacuous
                        ? 'bg-amber-500/15 text-status-warning-text border border-amber-500/30'
                        : 'bg-emerald-500/15 text-status-success-text border border-emerald-500/30'
                    }`}
                  >
                    {livePrecision.isVacuous ? (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-status-warning-text" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-status-success-text" />
                    )}
                    <span>{livePrecision.rationale}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-secondary block mb-1.5">
                  5. Scientific Rationale:
                </label>
                <textarea
                  value={builderRationale}
                  onChange={(e) => setBuilderRationale(e.target.value)}
                  placeholder="Explain why this proposition is valid according to domain invariants..."
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Feedback Alert */}
              {builderFeedback && (
                <div
                  className={`rounded-xl p-3 text-xs font-semibold flex items-center gap-2 ${
                    builderFeedback.isSuccess
                      ? 'bg-emerald-500/15 text-status-success-text border border-emerald-500/30'
                      : 'bg-rose-500/15 text-danger-text border border-rose-500/30'
                  }`}
                >
                  {builderFeedback.isSuccess ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success-text" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-danger-text" />
                  )}
                  <span>{builderFeedback.text}</span>
                </div>
              )}

              {/* Synthesize Button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleAddProposition}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all"
                >
                  <Plus className="h-4 w-4" />
                  <span>Synthesize Proposition</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Misconception Crucible */}
      {activeTab === 'misconception_crucible' && (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 shadow-xl backdrop-blur-md">
            <span className="text-[10px] font-bold uppercase tracking-wider text-status-warning-text block mb-1">
              Misconception & Schema Anomaly Diagnostic Crucible
            </span>
            <p className="text-xs text-secondary leading-relaxed">
              Detects circular tautologies, inverted hierarchical subsumptions, isolated concept
              islands, and vacuous linkers. Repairing anomalies restores cognitive soundness and
              elevates the Meaningful Learning Index.
            </p>
          </div>

          {sessionState.metrics.detectedAnomalies.length > 0 ? (
            <div className="flex flex-col gap-4">
              {sessionState.metrics.detectedAnomalies.map((anomaly) => {
                const isRepaired = sessionState.repairedAnomalyIds.includes(anomaly.id)
                const targetLink = anomaly.affectedLinkIds?.[0]

                return (
                  <div
                    key={anomaly.id}
                    className={`rounded-2xl border p-5 transition-all ${
                      isRepaired
                        ? 'border-emerald-500/30 bg-emerald-950/20 opacity-75'
                        : anomaly.severity === 'high'
                          ? 'border-rose-500/40 bg-rose-950/20 shadow-lg'
                          : 'border-amber-500/40 bg-amber-950/20 shadow-md'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle
                          className={`h-4 w-4 ${
                            anomaly.severity === 'high'
                              ? 'text-danger-text'
                              : 'text-status-warning-text'
                          }`}
                        />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">
                          {anomaly.anomalyType.replace('_', ' ')}
                        </span>
                      </div>
                      <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase font-bold text-faint">
                        Severity: {anomaly.severity}
                      </span>
                    </div>

                    <p className="text-xs text-slate-200 mb-2 leading-relaxed">
                      {anomaly.description}
                    </p>

                    <div className="rounded-xl border border-white/5 bg-slate-950/70 p-3 text-xs text-slate-300 mb-3">
                      <strong>Suggested Repair:</strong> {anomaly.suggestedRepair}
                    </div>

                    {/* Interactive Repair Input if linked */}
                    {!isRepaired && targetLink && (
                      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                        <input
                          type="text"
                          value={repairPhraseMap[targetLink] || ''}
                          onChange={(e) =>
                            setRepairPhraseMap({ ...repairPhraseMap, [targetLink]: e.target.value })
                          }
                          placeholder="Type non-vacuous replacement phrase..."
                          className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                        />
                        <button
                          onClick={() => handleRepairAnomaly(anomaly.id, targetLink)}
                          className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-md shadow-emerald-600/30 hover:bg-emerald-500 transition-all"
                        >
                          Apply Repair
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-8 text-center backdrop-blur-md">
              <CheckCircle2 className="mx-auto h-12 w-12 text-status-success-text mb-2" />
              <h4 className="text-sm font-bold text-white">No Schema Anomalies Detected</h4>
              <p className="text-xs text-secondary max-w-md mx-auto mt-1">
                Your concept map exhibits strict hierarchical consistency, zero circular
                tautologies, and scientifically substantive propositions.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: FSRS Flashcard Tree */}
      {activeTab === 'fsrs_tree' && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-status-success-text block mb-1">
                FSRS v5 Relational Spaced Repetition Bridge
              </span>
              <p className="text-xs text-secondary">
                Exports propositions into bidirectional conceptual flashcards and integrative
                cross-link clozes for long-term retention.
              </p>
            </div>

            <button
              onClick={handleExportFSRSCards}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500 transition-all"
            >
              <Download className="h-4 w-4" />
              <span>Download Schema Cards (JSON)</span>
            </button>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {exportSchemaToFSRSCards(currentSchema).map((card, cIdx) => (
              <div
                key={cIdx}
                className="flex flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/90 p-5 shadow-lg backdrop-blur-md"
              >
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase text-indigo-400 font-bold">
                      {card.metadata.sourceConcept} → {card.metadata.targetConcept}
                    </span>
                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-secondary font-mono">
                      Diff: {card.suggestedDifficulty}/10 • Stab: {card.suggestedStability}d
                    </span>
                  </div>

                  <div className="rounded-xl border border-white/5 bg-slate-950/80 p-3 text-xs text-slate-300">
                    <strong>Prompt:</strong>
                    <p className="mt-1 text-[11px] text-faint line-clamp-3">{card.front}</p>
                  </div>

                  <div className="rounded-xl border border-white/5 bg-slate-950/80 p-3 text-xs text-slate-300">
                    <strong>Propositional Link:</strong>
                    <p className="mt-1 text-[11px] text-status-success-text font-semibold line-clamp-3">
                      {card.back}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between pt-3 border-t border-white/5 text-[10px] text-tertiary">
                  <div className="flex gap-1.5">
                    {card.tags.map((t, tIdx) => (
                      <span key={tIdx}>#{t}</span>
                    ))}
                  </div>
                  <span className="capitalize">
                    {card.metadata.propositionType.replace('_', ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
