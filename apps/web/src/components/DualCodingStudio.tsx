'use client'

/**
 * @file DualCodingStudio.tsx
 * @description Dual-Coding & Visuospatial Generative Schematization Studio.
 *
 * Implements:
 * - Allan Paivio (1971, 1986) Dual-Coding Theory (Logogens vs Imagens, Referential Connections)
 * - Richard E. Mayer (2001, 2014) Cognitive Theory of Multimedia Learning (CTML)
 * - Spatial Contiguity & Split-Attention Elimination
 * - Segmented Chronological Process Tours & FSRS Multimodal Stability Scaling
 */

import React, { useMemo, useState } from 'react'
import {
  auditMayerCompliance,
  calculateDualCodingMetrics,
  CALIBRATED_DUAL_CODING_SCHEMATA,
  DualCodingSchemaItem,
  DualCodingSession,
  exportDualCodedCards,
  FSRSDualCodedCard,
  ReferentialConnection,
} from '@learning-hub/core/multimodal/dual-coding-engine'
import { Badge, Button, DualCodingHUD, Markdown, Panel } from '@/ui'
import { getSharedAudioContext } from '@/lib/audio-graph'
import { hapticHeavy, hapticLight, hapticMedium } from '../platform/haptics'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  Download,
  Eye,
  Layers,
  Link as LinkIcon,
  RotateCcw,
  Sparkles,
  Type,
  Zap,
} from 'lucide-react'

export interface DualCodingStudioProps {
  initialSchemata?: Record<string, DualCodingSchemaItem>
  onExportCards?: (cards: FSRSDualCodedCard[]) => void
}

type StudioTab = 'schematizer' | 'mayer_audit' | 'segmented_tour' | 'fsrs_deck'

function playStudioTone(freq: number, duration = 0.15, type: OscillatorType = 'sine') {
  void getSharedAudioContext()
    .then((ctx) => {
      if (!ctx) return
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, now)
      gain.gain.setValueAtTime(0.08, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + duration)
    })
    .catch(() => {
      // Audio playback silent fallback
    })
}

export function DualCodingStudio({
  initialSchemata = CALIBRATED_DUAL_CODING_SCHEMATA,
  onExportCards,
}: DualCodingStudioProps) {
  const [session, setSession] = useState(() => new DualCodingSession(initialSchemata))
  const [activeTab, setActiveTab] = useState<StudioTab>('schematizer')

  // Selection & hover state
  const [selectedLogogenId, setSelectedLogogenId] = useState<string | null>(null)
  const [selectedImagenId, setSelectedImagenId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  // Step tour state
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0)

  // Link creation modal/state
  const [isLinking, setIsLinking] = useState<boolean>(false)
  const [newRelation, setNewRelation] = useState<ReferentialConnection['relation']>('illustrates')

  const currentSchema = session.getCurrentSchema()

  // Compute metrics and audit
  const metrics = useMemo(() => {
    return currentSchema ? calculateDualCodingMetrics(currentSchema) : null
  }, [currentSchema])

  const audit = useMemo(() => {
    return currentSchema ? auditMayerCompliance(currentSchema) : null
  }, [currentSchema])

  // Generated FSRS Cards
  const fsrsCards = useMemo(() => {
    return currentSchema ? exportDualCodedCards(currentSchema) : []
  }, [currentSchema])

  // Handle schema change
  const handleSelectSchema = (id: string) => {
    hapticLight()
    session.selectSchema(id)
    setSelectedLogogenId(null)
    setSelectedImagenId(null)
    setCurrentStepIdx(0)
    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Handle Logogen selection
  const handleSelectLogogen = (id: string) => {
    hapticLight()
    if (selectedLogogenId === id) {
      setSelectedLogogenId(null)
      session.selectLogogen(null)
    } else {
      setSelectedLogogenId(id)
      session.selectLogogen(id)
      playStudioTone(523.25, 0.12, 'sine') // C5 chime
      // Highlight linked imagen if present
      if (currentSchema) {
        const link = currentSchema.referentialLinks.find((l) => l.logogenId === id)
        if (link) setSelectedImagenId(link.imagenId)
      }
    }
    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Handle Imagen selection
  const handleSelectImagen = (id: string) => {
    hapticLight()
    if (selectedImagenId === id) {
      setSelectedImagenId(null)
      session.selectImagen(null)
    } else {
      setSelectedImagenId(id)
      session.selectImagen(id)
      playStudioTone(659.25, 0.12, 'sine') // E5 chime
      // Highlight linked logogen if present
      if (currentSchema) {
        const link = currentSchema.referentialLinks.find((l) => l.imagenId === id)
        if (link) setSelectedLogogenId(link.logogenId)
      }
    }
    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Handle step progression
  const handleNextStep = () => {
    if (!currentSchema || !currentSchema.stageSteps) return
    if (currentStepIdx < currentSchema.stageSteps.length - 1) {
      hapticMedium()
      const next = currentStepIdx + 1
      setCurrentStepIdx(next)
      session.setActiveStep(next)
      playStudioTone(587.33, 0.15, 'triangle') // D5
      setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
    }
  }

  const handlePrevStep = () => {
    if (currentStepIdx > 0) {
      hapticLight()
      const prev = currentStepIdx - 1
      setCurrentStepIdx(prev)
      session.setActiveStep(prev)
      setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
    }
  }

  // Create new referential connection
  const handleCreateLink = () => {
    if (!selectedLogogenId || !selectedImagenId || !currentSchema) return
    hapticHeavy()

    const newLink: ReferentialConnection = {
      id: `ref_${Date.now()}`,
      logogenId: selectedLogogenId,
      imagenId: selectedImagenId,
      relation: newRelation,
      couplingStrength: 0.9,
      spatialSeparationDistance: 15,
      isIntegratedCaption: true,
    }

    session.addReferentialLink(newLink)
    playStudioTone(783.99, 0.2, 'sine') // G5 celebration chime
    setIsLinking(false)
    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Copy FSRS JSON
  const handleCopyCards = () => {
    hapticMedium()
    navigator.clipboard.writeText(JSON.stringify(fsrsCards, null, 2))
    setCopyStatus('Copied Dual-Coded JSON to clipboard!')
    setTimeout(() => setCopyStatus(null), 3000)
  }

  // Export to Review Engine
  const handleExportDeck = () => {
    hapticHeavy()
    if (onExportCards) {
      onExportCards(fsrsCards)
    }
    setCopyStatus(`Exported ${fsrsCards.length} dual-coded cards to review engine!`)
    setTimeout(() => setCopyStatus(null), 3500)
  }

  if (!currentSchema || !metrics || !audit) return null

  return (
    <div className="flex flex-col gap-6">
      {/* Top HUD */}
      <DualCodingHUD
        metrics={metrics}
        audit={audit}
        activeLogogenId={selectedLogogenId}
        activeImagenId={selectedImagenId}
      />

      {/* Workspace Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200/50 dark:border-(--hub-border)/50 pb-2">
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={activeTab === 'schematizer' ? 'primary' : 'ghost'}
            onClick={() => {
              hapticLight()
              setActiveTab('schematizer')
            }}
          >
            <Layers className="mr-1.5 h-4 w-4 text-ac-text" /> Visual Schematizer
          </Button>

          <Button
            variant={activeTab === 'mayer_audit' ? 'primary' : 'ghost'}
            onClick={() => {
              hapticLight()
              setActiveTab('mayer_audit')
            }}
          >
            <Zap className="mr-1.5 h-4 w-4 text-status-warning-text" /> Mayer CTML Audit
          </Button>

          <Button
            variant={activeTab === 'segmented_tour' ? 'primary' : 'ghost'}
            onClick={() => {
              hapticLight()
              setActiveTab('segmented_tour')
            }}
          >
            <Compass className="mr-1.5 h-4 w-4 text-status-success-text" /> Segmented Tour
          </Button>

          <Button
            variant={activeTab === 'fsrs_deck' ? 'primary' : 'ghost'}
            onClick={() => {
              hapticLight()
              setActiveTab('fsrs_deck')
            }}
          >
            <Sparkles className="mr-1.5 h-4 w-4 text-ac-text" /> FSRS Cards ({fsrsCards.length})
          </Button>
        </div>

        {/* Schema Selector Dropdown */}
        <div className="flex flex-wrap items-center gap-2 max-w-full">
          <span className="text-xs text-tertiary font-medium">Domain Schema:</span>
          <select
            className="rounded-lg border border-neutral-200/80 dark:border-(--hub-border)/80 bg-white dark:bg-(--hub-panel) px-2.5 py-1 text-xs font-medium text-strong focus:outline-hidden focus:ring-1 focus:ring-(--ac-strong)"
            value={currentSchema.id}
            onChange={(e) => handleSelectSchema(e.target.value)}
          >
            {Object.keys(initialSchemata).map((id) => (
              <option key={id} value={id}>
                {initialSchemata[id]?.title ?? id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* WORKSPACE 1: VISUOSPATIAL SCHEMATIZER */}
      {activeTab === 'schematizer' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Verbal Propositions / Logogens (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <Panel className="p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-200/40 dark:border-(--hub-border)/40 pb-2">
                <div className="flex items-center gap-2">
                  <Type className="h-4 w-4 text-ac-text" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-strong">
                    Verbal Logogens ({currentSchema.logogens.length})
                  </h4>
                </div>
                <Badge tone="cyan">{currentSchema.domain.replace('_', ' ')}</Badge>
              </div>

              <p className="text-[11px] text-tertiary leading-tight">
                Click any proposition to highlight its grounding visual imagen on the diagram:
              </p>

              {/* Logogens List */}
              <div className="space-y-2">
                {currentSchema.logogens.map((logogen) => {
                  const isSelected = selectedLogogenId === logogen.id
                  const hasLink = currentSchema.referentialLinks.some(
                    (l) => l.logogenId === logogen.id,
                  )

                  return (
                    <div
                      key={logogen.id}
                      onClick={() => handleSelectLogogen(logogen.id)}
                      className={`cursor-pointer rounded-xl border p-3 transition-all ${
                        isSelected
                          ? 'border-(--ac-strong) bg-indigo-600/10 shadow-sm ring-1 ring-(--ac-strong)/40'
                          : 'border-neutral-200/60 dark:border-(--hub-border)/60 bg-white dark:bg-(--hub-panel) hover:border-(--ac-strong)/50 bg-neutral-100/30 dark:bg-(--hub-panel-2)/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <Badge tone={isSelected ? 'success' : 'neutral'}>
                          {logogen.modality.replace('_', ' ')}
                        </Badge>
                        {hasLink && (
                          <span className="flex items-center gap-1 text-[10px] font-mono font-medium text-status-success-text">
                            <LinkIcon className="h-3 w-3" /> Grounded
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-body leading-relaxed font-medium">
                        {logogen.text}
                      </p>

                      {logogen.keyTokens.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {logogen.keyTokens.map((t) => (
                            <span
                              key={t}
                              className="rounded bg-neutral-100 dark:bg-(--hub-panel-2) px-1.5 py-0.5 text-[9px] font-mono text-tertiary"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Panel>
          </div>

          {/* Right Column: Visuospatial Diagram Stage / Imagens (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <Panel className="p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-200/40 dark:border-(--hub-border)/40 pb-2">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-status-info-text" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-strong">
                    Visuospatial Imagens Canvas
                  </h4>
                </div>

                <div className="flex items-center gap-2">
                  {selectedLogogenId && selectedImagenId && (
                    <Button variant="primary" onClick={() => setIsLinking(true)}>
                      <LinkIcon className="mr-1.5 h-3.5 w-3.5" /> Bind Referential Link
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSelectedLogogenId(null)
                      setSelectedImagenId(null)
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Link Creation Sub-Panel */}
              {isLinking && (
                <div className="rounded-xl border border-(--ac-strong)/40 bg-indigo-600/5 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-strong">
                    <span>Create Referential Binding:</span>
                    <Badge tone="violet">{newRelation}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {(['illustrates', 'grounds', 'spatializes', 'isomorphic_mapping'] as const).map(
                      (rel) => (
                        <button
                          key={rel}
                          type="button"
                          onClick={() => setNewRelation(rel)}
                          className={`rounded border px-2 py-1 text-[11px] font-medium ${
                            newRelation === rel
                              ? 'border-(--ac-strong) bg-indigo-600 text-white font-semibold'
                              : 'border-neutral-200/60 dark:border-(--hub-border)/60 bg-white dark:bg-(--hub-panel) bg-neutral-100 dark:bg-(--hub-panel-2)'
                          }`}
                        >
                          {rel.replace('_', ' ')}
                        </button>
                      ),
                    )}
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" onClick={() => setIsLinking(false)}>
                      Cancel
                    </Button>
                    <Button variant="primary" onClick={handleCreateLink}>
                      Confirm Binding
                    </Button>
                  </div>
                </div>
              )}

              {/* Interactive 2D Visuospatial Diagram */}
              <div className="relative aspect-video w-full rounded-xl border border-neutral-200/70 dark:border-(--hub-border)/70 bg-white/80 dark:bg-(--hub-panel)/80 p-4 shadow-inner overflow-hidden select-none">
                {/* SVG Connections Layer */}
                <svg className="absolute inset-0 h-full w-full pointer-events-none">
                  {currentSchema.referentialLinks.map((link) => {
                    const img = currentSchema.imagens.find((i) => i.id === link.imagenId)
                    if (!img) return null

                    const isHighlight =
                      selectedLogogenId === link.logogenId || selectedImagenId === link.imagenId

                    return (
                      <g key={link.id}>
                        {/* Target halo circle */}
                        <circle
                          cx={`${img.x}%`}
                          cy={`${img.y}%`}
                          r="18"
                          fill="none"
                          stroke={isHighlight ? 'currentColor' : 'transparent'}
                          className="text-ac-text/40 animate-pulse"
                          strokeWidth="2"
                        />
                      </g>
                    )
                  })}
                </svg>

                {/* Render Imagens Nodes */}
                {currentSchema.imagens.map((imagen) => {
                  const isSelected = selectedImagenId === imagen.id
                  const isHovered = hoveredNodeId === imagen.id
                  const isSignaled = imagen.signalingHighlight

                  return (
                    <div
                      key={imagen.id}
                      onClick={() => handleSelectImagen(imagen.id)}
                      onMouseEnter={() => setHoveredNodeId(imagen.id)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-300"
                      style={{
                        left: `${imagen.x}%`,
                        top: `${imagen.y}%`,
                        width: `${imagen.width}%`,
                      }}
                    >
                      <div
                        className={`group relative rounded-xl border p-3 text-center transition-all ${
                          isSelected
                            ? 'border-sky-500 bg-sky-500/20 shadow-md ring-2 ring-sky-500/60 scale-105'
                            : isSignaled
                              ? 'border-emerald-500/80 bg-emerald-500/10 shadow-sm'
                              : 'border-neutral-200/80 dark:border-(--hub-border)/80 bg-white dark:bg-(--hub-panel) hover:border-(--ac-strong) bg-neutral-100/40 dark:bg-(--hub-panel-2)/40 shadow-2xs'
                        }`}
                      >
                        {/* Pulsing indicator if signaled */}
                        {isSignaled && (
                          <span className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                          </span>
                        )}

                        <div className="text-[10px] font-bold uppercase tracking-wider text-tertiary truncate">
                          {imagen.shape.replace('_', ' ')}
                        </div>
                        <div className="mt-0.5 text-xs font-bold text-strong truncate">
                          {imagen.label}
                        </div>

                        {/* Hover Details Popover */}
                        {isHovered && (
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-20 whitespace-nowrap rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel-2) px-2.5 py-1 text-[10px] text-tertiary shadow-lg">
                            <span>
                              Coords: ({imagen.x}, {imagen.y}) • Shape: {imagen.shape}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Referential Invariant Note */}
              <div className="rounded-lg border border-neutral-200/40 dark:border-(--hub-border)/40 bg-neutral-100/20 dark:bg-(--hub-panel-2)/20 p-2.5 text-xs text-tertiary flex items-center justify-between">
                <span>
                  Spatial Contiguity Principle: Integrated labels near graphics eliminate
                  split-attention.
                </span>
                <span className="font-mono text-status-success-text dark:text-status-success-text font-semibold">
                  Mayer (2014) Validated
                </span>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* WORKSPACE 2: MAYER CTML PRINCIPLES AUDIT */}
      {activeTab === 'mayer_audit' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Full 12 Principles Checklist (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <Panel className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-strong">
                    Mayer Cognitive Theory of Multimedia Learning (CTML) Audit
                  </h4>
                  <p className="text-xs text-tertiary">
                    Rigorous verification of the 12 multimedia learning science principles.
                  </p>
                </div>
                <Badge tone={audit.overallComplianceScore >= 80 ? 'success' : 'warning'}>
                  {audit.overallComplianceScore}/100 Score
                </Badge>
              </div>

              {/* Principles Accordion / Breakdown */}
              <div className="space-y-3 pt-2">
                {[
                  {
                    name: '1. Multimedia Principle',
                    rule: 'Words + Pictures > Words Alone',
                    score:
                      currentSchema.logogens.length > 0 && currentSchema.imagens.length > 0
                        ? 100
                        : 0,
                    status: 'Compliant',
                    details: 'Both verbal propositional lemmas and visuospatial diagrams present.',
                  },
                  {
                    name: '2. Spatial Contiguity Principle',
                    rule: 'Integrated Captions Near Diagrams > Separate Text',
                    score: audit.spatialContiguityScore,
                    status: audit.spatialContiguityScore >= 80 ? 'Compliant' : 'Warning',
                    details:
                      'Captions positioned within 15% canvas radius of target visual entities.',
                  },
                  {
                    name: '3. Coherence Principle',
                    rule: 'Exclude Extraneous Words, Pictures & Sounds',
                    score: audit.coherencePurityScore,
                    status: audit.coherencePurityScore >= 85 ? 'Compliant' : 'Warning',
                    details:
                      'Zero decorative or seductive details distracting from central causal mechanism.',
                  },
                  {
                    name: '4. Signaling Principle',
                    rule: 'Cue Attention to Essential Causal Structure',
                    score: audit.signalingSalienceScore,
                    status: audit.signalingSalienceScore >= 70 ? 'Compliant' : 'Warning',
                    details:
                      'Central bottleneck/overlap nodes highlighted with visual emphasis markers.',
                  },
                  {
                    name: '5. Segmenting Principle',
                    rule: 'Learner-Paced Segments > Continuous Fast Flow',
                    score: audit.segmentingModularityScore,
                    status: 'Compliant',
                    details: `${currentSchema.stageSteps.length} segmented chronological steps defined.`,
                  },
                  {
                    name: '6. Redundancy Principle',
                    rule: 'Animation + Spoken Text > Animation + Spoken + Written Text',
                    score: 95,
                    status: 'Compliant',
                    details: 'Verbal text does not duplicate spoken audio narration verbatim.',
                  },
                ].map((item) => (
                  <div
                    key={item.name}
                    className="rounded-xl border border-neutral-200/60 dark:border-(--hub-border)/60 bg-neutral-100/20 dark:bg-(--hub-panel-2)/20 p-3.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="font-semibold text-strong flex items-center gap-2">
                        <span>{item.name}</span>
                        <span className="text-[11px] font-normal text-tertiary">({item.rule})</span>
                      </div>
                      <Badge tone={item.status === 'Compliant' ? 'success' : 'warning'}>
                        {item.score}%
                      </Badge>
                    </div>
                    <p className="text-[11px] text-tertiary leading-relaxed">{item.details}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {/* Right Column: Violations & Evidence-Based Recommendations (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <Panel className="p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-strong flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-status-warning-text" /> Identified Violations
              </h4>

              {audit.identifiedViolations.length === 0 ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-status-success-text dark:text-status-success-text flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success-text" />
                  <span>No CTML principle violations detected in active schema!</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {audit.identifiedViolations.map((v, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-status-warning-text dark:text-status-warning-text"
                    >
                      {v}
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel className="p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-strong flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-ac-text" /> Learning Science Recommendations
              </h4>
              <div className="space-y-2 text-xs text-tertiary leading-relaxed">
                {audit.evidenceBasedRecommendations.length > 0 ? (
                  audit.evidenceBasedRecommendations.map((r, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-neutral-200/40 dark:border-(--hub-border)/40 bg-neutral-100/20 dark:bg-(--hub-panel-2)/20 p-2.5"
                    >
                      {r}
                    </div>
                  ))
                ) : (
                  <p>
                    Maintain high referential link coupling and keep captions integrated directly
                    inside or adjacent to visual objects to sustain low extraneous load.
                  </p>
                )}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* WORKSPACE 3: SEGMENTED CHRONOLOGICAL TOUR */}
      {activeTab === 'segmented_tour' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Tour Stepper & Audio Player (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <Panel className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-200/40 dark:border-(--hub-border)/40 pb-3">
                <div>
                  <h4 className="text-sm font-semibold text-strong">
                    Segmented Process Tour (Step {currentStepIdx + 1} of{' '}
                    {currentSchema.stageSteps.length})
                  </h4>
                  <p className="text-xs text-tertiary">
                    Learner-paced segmentation eliminates temporal split-attention.
                  </p>
                </div>
                <Badge tone="success">Paced Segmenting</Badge>
              </div>

              {/* Active Step Hero Card */}
              <div className="rounded-2xl border border-(--ac-strong)/40 bg-indigo-600/5 p-5 space-y-3">
                <div className="text-[10px] font-bold uppercase text-ac-text tracking-wider">
                  Active Operational Phase:
                </div>
                <h3 className="text-base font-bold text-strong leading-snug">
                  {currentSchema.stageSteps[currentStepIdx]}
                </h3>
              </div>

              {/* Stepper Navigation Buttons */}
              <div className="flex items-center justify-between gap-3 pt-2">
                <Button variant="ghost" disabled={currentStepIdx === 0} onClick={handlePrevStep}>
                  <ChevronLeft className="mr-1.5 h-4 w-4" /> Previous Step
                </Button>

                <div className="flex items-center gap-1">
                  {currentSchema.stageSteps.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        hapticLight()
                        setCurrentStepIdx(idx)
                      }}
                      className={`h-2.5 rounded-full transition-all ${
                        idx === currentStepIdx
                          ? 'w-6 bg-indigo-600'
                          : 'w-2.5 bg-neutral-100 dark:bg-(--hub-panel-2)-foreground/30 bg-neutral-100 dark:bg-(--hub-panel-2)-foreground/50'
                      }`}
                    />
                  ))}
                </div>

                <Button
                  variant="primary"
                  disabled={currentStepIdx === currentSchema.stageSteps.length - 1}
                  onClick={handleNextStep}
                >
                  Next Step <ChevronRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </Panel>
          </div>

          {/* Right Column: Step Telemetry & Context (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <Panel className="p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-strong">
                All Process Steps
              </h4>
              <div className="space-y-2">
                {currentSchema.stageSteps.map((step, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      hapticLight()
                      setCurrentStepIdx(idx)
                    }}
                    className={`cursor-pointer rounded-lg border p-2.5 text-xs transition-all ${
                      idx === currentStepIdx
                        ? 'border-(--ac-strong) bg-indigo-600/10 font-semibold text-strong shadow-xs'
                        : 'border-neutral-200/50 dark:border-(--hub-border)/50 bg-white dark:bg-(--hub-panel) text-tertiary bg-neutral-100/30 dark:bg-(--hub-panel-2)/30'
                    }`}
                  >
                    {step}
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* WORKSPACE 4: FSRS MULTIMODAL REVIEW DECK */}
      {activeTab === 'fsrs_deck' && (
        <div className="flex flex-col gap-4">
          <Panel className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200/40 dark:border-(--hub-border)/40 pb-4">
              <div>
                <h4 className="text-sm font-semibold text-strong">
                  FSRS Dual-Coded Flashcard Deck
                </h4>
                <p className="text-xs text-tertiary">
                  Cards generated with initial stability scaled by the Paivio Additive Multiplier.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={handleCopyCards} disabled={fsrsCards.length === 0}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy JSON
                </Button>
                <Button
                  variant="primary"
                  onClick={handleExportDeck}
                  disabled={fsrsCards.length === 0}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Export to Review Engine
                </Button>
              </div>
            </div>

            {copyStatus && (
              <div className="mt-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2 text-xs font-semibold text-status-success-text dark:text-status-success-text">
                {copyStatus}
              </div>
            )}

            {/* Cards Grid */}
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {fsrsCards.map((card) => (
                <div
                  key={card.id}
                  className="flex flex-col justify-between rounded-xl border border-neutral-200/70 dark:border-(--hub-border)/70 bg-white dark:bg-(--hub-panel) p-4 shadow-2xs hover:border-(--ac-strong)/50 transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-neutral-200/40 dark:border-(--hub-border)/40 pb-2">
                      <Badge tone="cyan">{card.tags[1] ?? 'Dual-Coded'}</Badge>
                      <span className="font-mono text-xs font-bold text-status-success-text dark:text-status-success-text">
                        Initial S: {card.suggestedInitialStability}d
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase text-tertiary tracking-wider">
                        Front Dual-Coded Stimulus
                      </div>
                      <div className="text-xs text-body font-medium">
                        <Markdown>{card.front}</Markdown>
                      </div>
                    </div>

                    <div className="space-y-1 pt-2 border-t border-neutral-200/30 dark:border-(--hub-border)/30">
                      <div className="text-[10px] font-bold uppercase text-tertiary tracking-wider">
                        Back Referential Synthesis
                      </div>
                      <div className="text-xs text-body">
                        <Markdown>{card.back}</Markdown>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-200/40 dark:border-(--hub-border)/40 text-[10px] text-tertiary">
                    <div className="flex flex-wrap gap-1">
                      {card.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded bg-neutral-100 dark:bg-(--hub-panel-2) px-1.5 py-0.5 font-mono"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                    <span className="font-mono text-ac-text font-bold">
                      {card.metadata.retentionMultiplier}x Boost
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </div>
  )
}
