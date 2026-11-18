/**
 * @file apps/web/src/components/ArgumentationStudio.tsx
 * @description Claim-Evidence-Reasoning (CER) & Epistemic Argumentation Studio.
 *
 * Implements:
 * - Katherine L. McNeill & Joseph Krajcik (2012) CER Framework
 * - Jonathan Osborne, Sibel Erduran, & Shirley Simon (2004) TAP 5-Level Rubric
 * - Deanna Kuhn (1991, 2010) Epistemic Argumentation & Rebuttal Skills
 * - Calibrated FSRS-6 Spaced Repetition Deck Synthesis
 *
 * Strictly follows UI Design Signature: zero ghost classes, mode-aware tokens.
 */

'use client'

import React, { useMemo, useState } from 'react'
import {
  CANONICAL_SCIENTIFIC_DEBATES,
  type CERArgumentSubmission,
  type CEREvaluation,
  type CalibratedCERDeck,
  type ScientificDebateCase,
  evaluateCERArgument,
  generateAdversarialCounterArgument,
  generateCERFSRSDeck,
} from '@learning-hub/core/argumentation'
import { apiSend } from '@/lib/transport'
import { ArgumentationHUD, Badge, Button, Panel, Tabs } from '@/ui'
import { FileCheck, Flame, Layers, RotateCcw, Scale, Sparkles, Swords, Target } from 'lucide-react'

export function ArgumentationStudio() {
  const debates = CANONICAL_SCIENTIFIC_DEBATES
  const [selectedDebateId, setSelectedDebateId] = useState<string>(debates[0]!.id)
  const currentDebate: ScientificDebateCase =
    debates.find((d) => d.id === selectedDebateId) ?? debates[0]!

  // Active Tab
  const [activeTab, setActiveTab] = useState<'phenomenon' | 'evidence' | 'reasoning' | 'synthesis'>(
    'phenomenon',
  )

  // User Argumentation State
  const [selectedClaimId, setSelectedClaimId] = useState<string>(
    currentDebate.competingClaims[0]!.id,
  )
  const [claimStatement, setClaimStatement] = useState<string>(
    currentDebate.competingClaims[0]!.claim,
  )
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<string[]>([
    currentDebate.evidencePool[0]!.id,
  ])
  const [userEvidenceSynthesis, setUserEvidenceSynthesis] = useState<string>(
    'Subpolar North Atlantic SST fingerprints exhibit critical slowing down with increased variance, indicating loss of dynamic resilience.',
  )
  const [selectedPrincipleIds, setSelectedPrincipleIds] = useState<string[]>([
    currentDebate.scientificPrinciples[0]!.id,
  ])
  const [userReasoningStatement, setUserReasoningStatement] = useState<string>(
    'According to Stommel salt-advection feedback, high-latitude freshening lowers surface density; consequently, deep convection decelerates, creating runaway positive feedback.',
  )
  const [userRebuttalStatement, setUserRebuttalStatement] = useState<string>(
    'Opponents cite the 2004–2022 RAPID-MOCHA mooring array as evidence of stability; however, this rebuttal is flawed because 18 years of instrumental data is statistically insufficient to disentangle multi-decadal variability from long-term centennial deceleration.',
  )

  // Calibrated Deck State
  const [calibratedDeck, setCalibratedDeck] = useState<CalibratedCERDeck | null>(null)
  const [isGeneratingDeck, setIsGeneratingDeck] = useState(false)

  // Current Submission Object
  const currentSubmission: CERArgumentSubmission = useMemo(
    () => ({
      debateId: currentDebate.id,
      selectedClaimId,
      claimStatement,
      selectedEvidenceIds,
      userEvidenceSynthesis,
      selectedPrincipleIds,
      userReasoningStatement,
      userRebuttalStatement,
      targetedCounterArgumentId: currentDebate.counterArguments[0]?.id,
    }),
    [
      currentDebate,
      selectedClaimId,
      claimStatement,
      selectedEvidenceIds,
      userEvidenceSynthesis,
      selectedPrincipleIds,
      userReasoningStatement,
      userRebuttalStatement,
    ],
  )

  // Real-time Evaluation
  const evaluation: CEREvaluation = useMemo(() => {
    return evaluateCERArgument(currentDebate, currentSubmission)
  }, [currentDebate, currentSubmission])

  // Adversarial Counter-Argument
  const counterArg = useMemo(() => {
    return generateAdversarialCounterArgument(currentDebate, selectedClaimId)
  }, [currentDebate, selectedClaimId])

  // Handle Debate Switch
  const handleDebateChange = (newDebateId: string) => {
    setSelectedDebateId(newDebateId)
    const newDebate = debates.find((d) => d.id === newDebateId) ?? debates[0]!
    setSelectedClaimId(newDebate.competingClaims[0]!.id)
    setClaimStatement(newDebate.competingClaims[0]!.claim)
    setSelectedEvidenceIds([newDebate.evidencePool[0]!.id])
    setUserEvidenceSynthesis('')
    setSelectedPrincipleIds([newDebate.scientificPrinciples[0]!.id])
    setUserReasoningStatement('')
    setUserRebuttalStatement('')
    setCalibratedDeck(null)
  }

  // Toggle Evidence Selection
  const toggleEvidence = (evId: string) => {
    setSelectedEvidenceIds((prev) =>
      prev.includes(evId) ? prev.filter((id) => id !== evId) : [...prev, evId],
    )
  }

  // Toggle Principle Selection
  const togglePrinciple = (prId: string) => {
    setSelectedPrincipleIds((prev) =>
      prev.includes(prId) ? prev.filter((id) => id !== prId) : [...prev, prId],
    )
  }

  // Insert Causal Connector
  const insertConnector = (connector: string) => {
    setUserReasoningStatement((prev) => `${prev} ${connector} `)
  }

  // Generate Deck Action
  const handleGenerateDeck = async () => {
    setIsGeneratingDeck(true)
    try {
      const res = await apiSend<CalibratedCERDeck>('/api/argumentation', 'POST', {
        action: 'generate_deck',
        debateId: currentDebate.id,
        submission: currentSubmission,
      }).catch(() => null)

      if (res && res.cards) {
        setCalibratedDeck(res)
      } else {
        const localDeck = generateCERFSRSDeck(currentDebate, currentSubmission, evaluation)
        setCalibratedDeck(localDeck)
      }
      setActiveTab('synthesis')
    } catch {
      const localDeck = generateCERFSRSDeck(currentDebate, currentSubmission, evaluation)
      setCalibratedDeck(localDeck)
      setActiveTab('synthesis')
    } finally {
      setIsGeneratingDeck(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Telemetry HUD */}
      <ArgumentationHUD evaluation={evaluation} activeDebateTitle={currentDebate.title} />

      {/* Studio Navigation Tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          label="Scientific Argumentation Phases"
          value={activeTab}
          onChange={(val) =>
            setActiveTab(val as 'phenomenon' | 'evidence' | 'reasoning' | 'synthesis')
          }
          items={[
            {
              key: 'phenomenon',
              label: '1. Phenomenon & Claims',
            },
            {
              key: 'evidence',
              label: `2. Evidence Pool (${selectedEvidenceIds.length})`,
            },
            {
              key: 'reasoning',
              label: '3. Reasoning & Rebuttal',
            },
            {
              key: 'synthesis',
              label: '4. Dialectic Synthesis',
            },
          ]}
        />

        {/* Global Action Bar */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => handleDebateChange(currentDebate.id)}
            className="flex items-center gap-1.5 text-xs py-1.5 px-3"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset Case
          </Button>
          <Button
            variant="primary"
            onClick={handleGenerateDeck}
            disabled={isGeneratingDeck}
            className="flex items-center gap-1.5 text-xs py-1.5 px-3"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {isGeneratingDeck ? 'Calibrating...' : 'Generate FSRS Deck'}
          </Button>
        </div>
      </div>

      {/* TAB 1: Phenomenon & Competing Claims */}
      {activeTab === 'phenomenon' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left 2 Cols: Debate Case Overview */}
          <div className="space-y-4 lg:col-span-2">
            <Panel className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
                <div>
                  <h3 className="text-base font-semibold text-strong">{currentDebate.title}</h3>
                  <p className="text-xs text-secondary capitalize">
                    Domain: {currentDebate.domain.replace('_', ' ')} • Difficulty:{' '}
                    {currentDebate.difficulty}
                  </p>
                </div>

                {/* Case Switcher */}
                <select
                  aria-label="Select Scientific Debate Case"
                  value={selectedDebateId}
                  onChange={(e) => handleDebateChange(e.target.value)}
                  className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface px-3 py-1.5 text-xs text-strong focus:outline-none focus:ring-2 focus:ring-(--hub-primary)"
                >
                  {debates.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Focal Question Banner */}
              <div className="rounded-lg border border-(--hub-primary-soft,rgba(59,130,246,0.3)) bg-(--hub-primary-soft,rgba(59,130,246,0.06)) p-3.5 space-y-1">
                <div className="text-xs font-semibold text-strong flex items-center gap-1.5">
                  <Scale className="h-4 w-4 text-(--hub-primary,#2563eb)" />
                  Focal Scientific Question
                </div>
                <p className="text-xs sm:text-sm font-medium text-strong">
                  "{currentDebate.focalQuestion}"
                </p>
              </div>

              {/* Empirical Context */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-medium text-strong">Phenomenon Context:</h4>
                <p className="text-xs sm:text-sm text-secondary leading-relaxed whitespace-pre-line">
                  {currentDebate.phenomenonContext}
                </p>
              </div>

              {/* Competing Claims Selector */}
              <div className="space-y-3 pt-2 border-t border-neutral-200 dark:border-(--hub-border)">
                <h4 className="text-xs font-semibold text-strong">
                  Select Theoretical Position to Champion:
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {currentDebate.competingClaims.map((claim) => {
                    const isSelected = selectedClaimId === claim.id
                    return (
                      <div
                        key={claim.id}
                        onClick={() => {
                          setSelectedClaimId(claim.id)
                          setClaimStatement(claim.claim)
                        }}
                        className={`cursor-pointer rounded-lg border p-3.5 space-y-2 transition-all ${
                          isSelected
                            ? 'border-(--hub-primary,#2563eb) bg-(--hub-primary-soft,rgba(59,130,246,0.06)) ring-1 ring-(--hub-primary)'
                            : 'border-neutral-200 dark:border-(--hub-border) bg-surface hover:bg-surface-elevated'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-strong">{claim.theorist}</span>
                          {isSelected && <Badge tone="accent">Selected</Badge>}
                        </div>
                        <p className="text-xs text-strong leading-snug">"{claim.claim}"</p>
                        <p className="text-[11px] text-secondary">{claim.summary}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Panel>
          </div>

          {/* Right Col: Claim Workbench */}
          <div className="space-y-4">
            <Panel className="space-y-4">
              <div className="border-b border-neutral-200 dark:border-(--hub-border) pb-3">
                <h4 className="text-sm font-semibold text-strong flex items-center gap-1.5">
                  <FileCheck className="h-4 w-4 text-(--hub-primary,#2563eb)" />
                  Claim Articulation (McNeill CER Step 1)
                </h4>
                <p className="text-xs text-secondary mt-1">
                  Ensure your claim directly answers the focal scientific question without vague
                  assertions.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-strong">
                  Your Focal Claim Statement:
                </label>
                <textarea
                  rows={4}
                  value={claimStatement}
                  onChange={(e) => setClaimStatement(e.target.value)}
                  placeholder="Articulate your precise scientific claim..."
                  className="w-full rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 text-xs sm:text-sm text-strong focus:outline-none focus:ring-2 focus:ring-(--hub-primary)"
                />
              </div>

              <Button
                variant="primary"
                className="w-full text-xs py-2"
                onClick={() => setActiveTab('evidence')}
              >
                Proceed to Evidence Pool
              </Button>
            </Panel>
          </div>
        </div>
      )}

      {/* TAB 2: Evidence Pool & Discrimination Workbench */}
      {activeTab === 'evidence' && (
        <div className="space-y-4">
          <Panel className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <div>
                <h3 className="text-sm font-semibold text-strong flex items-center gap-1.5">
                  <Target className="h-4 w-4 text-(--hub-primary,#2563eb)" />
                  Evidence Pool & Epistemic Discrimination (Kuhn 1991)
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Select genuine empirical and statistical evidence to support your claim. Avoid
                  anecdotal assertions or pseudo-evidence that degrade your Evidence Quality Index
                  (EQI).
                </p>
              </div>
              <Badge tone={selectedEvidenceIds.length > 0 ? 'success' : 'warning'}>
                {selectedEvidenceIds.length} Selected
              </Badge>
            </div>

            {/* Evidence Cards Grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {currentDebate.evidencePool.map((ev) => {
                const isSelected = selectedEvidenceIds.includes(ev.id)
                return (
                  <div
                    key={ev.id}
                    onClick={() => toggleEvidence(ev.id)}
                    className={`cursor-pointer rounded-lg border p-3.5 space-y-2.5 transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-(--hub-primary,#2563eb) bg-(--hub-primary-soft,rgba(59,130,246,0.06)) ring-1 ring-(--hub-primary)'
                        : 'border-neutral-200 dark:border-(--hub-border) bg-surface hover:bg-surface-elevated'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <Badge
                          tone={
                            ev.isGenuine
                              ? ev.type === 'experimental_measurement'
                                ? 'success'
                                : 'accent'
                              : 'danger'
                          }
                          className="capitalize"
                        >
                          {ev.type.replace('_', ' ')}
                        </Badge>
                        <span className="font-mono text-[11px] text-secondary">
                          Reliability: {ev.reliabilityScore}%
                        </span>
                      </div>
                      <p className="text-xs text-strong leading-snug">{ev.description}</p>
                      <p className="text-[11px] text-secondary italic">
                        Methodology: {ev.methodologicalNote}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-neutral-200 dark:border-(--hub-border) text-[11px]">
                      <span
                        className={
                          ev.isGenuine
                            ? 'text-status-success-text dark:text-status-success-text'
                            : 'text-danger-text font-medium'
                        }
                      >
                        {ev.isGenuine
                          ? '✓ Genuine Empirical Data'
                          : '⚠ Pseudo-Evidence / Anecdotal'}
                      </span>
                      <span className="font-medium text-(--hub-primary,#2563eb)">
                        {isSelected ? 'Deselect' : 'Select'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Evidence Synthesis Textarea */}
            <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-(--hub-border)">
              <label className="text-xs font-medium text-strong">
                Evidence Synthesis & Multi-Source Triangulation:
              </label>
              <textarea
                rows={3}
                value={userEvidenceSynthesis}
                onChange={(e) => setUserEvidenceSynthesis(e.target.value)}
                placeholder="Synthesize how your selected evidence sources triangulate and substantiate the claim..."
                className="w-full rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 text-xs sm:text-sm text-strong focus:outline-none focus:ring-2 focus:ring-(--hub-primary)"
              />
            </div>

            <div className="flex justify-end">
              <Button
                variant="primary"
                className="text-xs py-1.5 px-4"
                onClick={() => setActiveTab('reasoning')}
              >
                Proceed to Causal Reasoning & Rebuttal
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 3: Mechanistic Reasoning & Rebuttal */}
      {activeTab === 'reasoning' && (
        <div className="space-y-4">
          <Panel className="space-y-4">
            <div className="border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <h3 className="text-sm font-semibold text-strong flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-(--hub-warning,#f59e0b)" />
                Mechanistic Reasoning & Scientific Warrants (McNeill CER Step 3)
              </h3>
              <p className="text-xs text-secondary mt-0.5">
                Connect your empirical evidence to the claim by explicitly invoking governing
                scientific principles and causal laws.
              </p>
            </div>

            {/* Scientific Principles Selector */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-strong">
                Select Scientific Principles / Warrants:
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {currentDebate.scientificPrinciples.map((pr) => {
                  const isSelected = selectedPrincipleIds.includes(pr.id)
                  return (
                    <div
                      key={pr.id}
                      onClick={() => togglePrinciple(pr.id)}
                      className={`cursor-pointer rounded-lg border p-3.5 space-y-1.5 transition-all ${
                        isSelected
                          ? 'border-(--hub-primary,#2563eb) bg-(--hub-primary-soft,rgba(59,130,246,0.06)) ring-1 ring-(--hub-primary)'
                          : 'border-neutral-200 dark:border-(--hub-border) bg-surface hover:bg-surface-elevated'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-semibold text-strong">
                        <span>{pr.principle}</span>
                        {isSelected && <Badge tone="accent">Active Warrant</Badge>}
                      </div>
                      <p className="text-xs text-secondary font-mono">{pr.domainAxiom}</p>
                      <p className="text-[11px] text-secondary">
                        <span className="font-medium text-strong">Mechanism: </span>
                        {pr.connectsMechanism}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Causal Connector Toolbar */}
            <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-(--hub-border)">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-strong">Causal Connectors:</span>
                <span className="text-secondary text-[11px]">
                  Click to insert into your reasoning statement
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'because',
                  'consequently',
                  'therefore',
                  'mechanistically',
                  'furthermore',
                  'whereas',
                  'leads to',
                ].map((conn) => (
                  <button
                    key={conn}
                    type="button"
                    onClick={() => insertConnector(conn)}
                    className="rounded bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 text-xs text-secondary hover:text-strong hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-all font-mono"
                  >
                    +{conn}
                  </button>
                ))}
              </div>
            </div>

            {/* Reasoning Textarea */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-strong">
                Your Mechanistic Reasoning Statement:
              </label>
              <textarea
                rows={3}
                value={userReasoningStatement}
                onChange={(e) => setUserReasoningStatement(e.target.value)}
                placeholder="Explain the causal mechanism linking your evidence to the claim..."
                className="w-full rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 text-xs sm:text-sm text-strong focus:outline-none focus:ring-2 focus:ring-(--hub-primary)"
              />
            </div>

            {/* Socratic Counter-Argument Crucible (TAP Level 4/5) */}
            <div className="rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50/30 dark:bg-amber-950/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Swords className="h-4 w-4 text-status-warning-text dark:text-status-warning-text" />
                <h4 className="text-xs sm:text-sm font-semibold text-strong">
                  Adversarial Rebuttal Crucible (Level 4/5 TAP Requirement)
                </h4>
              </div>

              <div className="text-xs text-secondary space-y-1">
                <p className="font-medium text-strong">
                  Opposing Position ({counterArg.counterTheorist}):
                </p>
                <p className="italic bg-surface/80 p-2.5 rounded border border-neutral-200 dark:border-(--hub-border)">
                  "{counterArg.rebuttalChallenge}"
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-strong">
                  Your Dialectic Rebuttal Statement:
                </label>
                <textarea
                  rows={3}
                  value={userRebuttalStatement}
                  onChange={(e) => setUserRebuttalStatement(e.target.value)}
                  placeholder="Dismantle the counter-argument by explaining why their evidence is flawed, limited, or explained by an alternate mechanism..."
                  className="w-full rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 text-xs sm:text-sm text-strong focus:outline-none focus:ring-2 focus:ring-(--hub-primary)"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="primary"
                className="text-xs py-1.5 px-4"
                onClick={handleGenerateDeck}
              >
                Evaluate Argument & View Deck
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 4: Dialectic Synthesis & FSRS Deck */}
      {activeTab === 'synthesis' && (
        <div className="space-y-4">
          <Panel className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <div>
                <h3 className="text-sm font-semibold text-strong flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-(--hub-primary,#2563eb)" />
                  Calibrated FSRS-6 Spaced Repetition Deck
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Synthesized directly from your epistemic argument submission. Card retrieval
                  stability and difficulty are calibrated against your Epistemic Rigor Score (ERS{' '}
                  {evaluation.ers}/100 • TAP Level {evaluation.tapLevel}/5).
                </p>
              </div>

              <Button
                variant="primary"
                onClick={handleGenerateDeck}
                disabled={isGeneratingDeck}
                className="text-xs py-1.5 px-3 flex items-center gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {calibratedDeck ? 'Regenerate Deck' : 'Generate Cards'}
              </Button>
            </div>

            {calibratedDeck ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {calibratedDeck.cards.map((card) => (
                  <div
                    key={card.id}
                    className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-4 space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <Badge tone="accent" className="capitalize">
                          {card.cardType.replace('_', ' ')}
                        </Badge>
                        <span className="font-mono text-[10px] text-secondary">
                          S: {card.fsrsParameters.stability}d • D: {card.fsrsParameters.difficulty}
                        </span>
                      </div>

                      <div className="rounded bg-neutral-100 dark:bg-neutral-800/50 p-2.5 text-xs text-strong font-medium whitespace-pre-line">
                        {card.front}
                      </div>

                      <div className="rounded bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 p-2.5 text-xs text-secondary whitespace-pre-line">
                        {card.back}
                      </div>
                    </div>

                    <div className="text-[11px] text-secondary italic">{card.rationale}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center space-y-3">
                <Layers className="h-8 w-8 text-secondary mx-auto" />
                <div className="text-sm font-semibold text-strong">
                  No Calibrated Cards Generated Yet
                </div>
                <p className="text-xs text-secondary max-w-md mx-auto">
                  Complete your Claim, Evidence, Reasoning, and Rebuttal articulation, then click
                  below to generate your calibrated FSRS-6 review deck.
                </p>
                <Button
                  variant="primary"
                  onClick={handleGenerateDeck}
                  disabled={isGeneratingDeck}
                  className="text-xs py-1.5 px-3 mx-auto"
                >
                  Generate FSRS Deck Now
                </Button>
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}
