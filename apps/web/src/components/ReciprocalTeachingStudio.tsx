/**
 * @file apps/web/src/components/ReciprocalTeachingStudio.tsx
 * @description Reciprocal Teaching & Dialogic Questioning Studio.
 *
 * Implements:
 * - Ann L. Brown & Annemarie Palincsar (1984) Reciprocal Teaching
 * - Michelene T. H. Chi & Ruth Wylie (2014) The ICAP Framework
 * - Alison King (1990, 1999) Guided Reciprocal Peer Questioning
 * - Socratic peer dialogic co-construction and calibrated FSRS-6 deck synthesis
 *
 * Strictly follows UI Design Signature: zero ghost classes, mode-aware tokens.
 */

'use client'

import React, { useMemo, useState } from 'react'
import {
  CANONICAL_TEXT_PASSAGES,
  type CalibratedReciprocalDeck,
  type DialogueTurn,
  type ReciprocalEvaluation,
  type ReciprocalRole,
  type TextPassage,
  classifyICAPEngagement,
  evaluateReciprocalSession,
  generatePeerDialogicTurn,
  generateReciprocalFSRSDeck,
} from '@learning-hub/core/reciprocal-teaching'
import { apiSend } from '@/lib/transport'
import { Badge, Button, Panel, ReciprocalTeachingHUD, Tabs } from '@/ui'
import {
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Layers,
  Lightbulb,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  User,
  Users,
  Wrench,
} from 'lucide-react'

export function ReciprocalTeachingStudio() {
  const passages = CANONICAL_TEXT_PASSAGES
  const [selectedPassageId, setSelectedPassageId] = useState<string>(passages[0]!.id)
  const currentPassage: TextPassage =
    passages.find((p) => p.id === selectedPassageId) ?? passages[0]!

  // Active Tab
  const [activeTab, setActiveTab] = useState<'passage' | 'stems' | 'dialogue' | 'synthesis'>(
    'passage',
  )

  // User's current reciprocal role
  const [currentRole, setCurrentRole] = useState<ReciprocalRole>('questioner')

  // Dialogue Turns
  const [dialogueTurns, setDialogueTurns] = useState<DialogueTurn[]>(() => [
    {
      id: 'init-turn-1',
      speaker: 'peer_agent',
      role: 'questioner',
      turnIndex: 0,
      text: `Welcome to our reciprocal dialogue on "${passages[0]!.title}". As your peer, I invite you to take the lead. You can start by asking a probing question using King's stems, clarify an ambiguous mechanism, summarize the thesis, or predict what follows!`,
      timestamp: Date.now() - 30000,
      icapLevel: 'constructive',
      elaborationScore: 60,
    },
  ])

  // Input workbench state
  const [inputText, setInputText] = useState('')
  const [selectedStemId, setSelectedStemId] = useState<string | undefined>()
  const [selectedMisconceptionId, setSelectedMisconceptionId] = useState<string | undefined>()

  // FSRS Deck state
  const [calibratedDeck, setCalibratedDeck] = useState<CalibratedReciprocalDeck | null>(null)
  const [isGeneratingDeck, setIsGeneratingDeck] = useState(false)

  // Real-time evaluation
  const evaluation: ReciprocalEvaluation = useMemo(() => {
    return evaluateReciprocalSession(dialogueTurns, currentPassage)
  }, [dialogueTurns, currentPassage])

  // Handle Passage Switch
  const handlePassageChange = (newPassageId: string) => {
    setSelectedPassageId(newPassageId)
    const newPassage = passages.find((p) => p.id === newPassageId) ?? passages[0]!
    setDialogueTurns([
      {
        id: `init-turn-${Date.now()}`,
        speaker: 'peer_agent',
        role: 'questioner',
        turnIndex: 0,
        text: `Switched to "${newPassage.title}". Let's examine its core causal thesis together. Which reciprocal role would you like to begin with?`,
        timestamp: Date.now(),
        icapLevel: 'constructive',
        elaborationScore: 60,
      },
    ])
    setInputText('')
    setSelectedStemId(undefined)
    setSelectedMisconceptionId(undefined)
    setCalibratedDeck(null)
  }

  // Handle Submitting User Turn
  const handleSendTurn = () => {
    if (!inputText.trim()) return

    const previousTurn = dialogueTurns[dialogueTurns.length - 1]
    const isResponsive = previousTurn ? previousTurn.speaker !== 'user' : false

    const { icapLevel, causalScore } = classifyICAPEngagement(inputText, isResponsive, previousTurn)

    const userTurn: DialogueTurn = {
      id: `turn-user-${Date.now()}`,
      speaker: 'user',
      role: currentRole,
      turnIndex: dialogueTurns.length,
      text: inputText.trim(),
      stemId: selectedStemId,
      timestamp: Date.now(),
      targetTurnId: previousTurn?.id,
      icapLevel,
      elaborationScore: causalScore,
      resolvedMisconceptionId: selectedMisconceptionId,
    }

    const updatedTurns = [...dialogueTurns, userTurn]
    setDialogueTurns(updatedTurns)
    setInputText('')
    setSelectedStemId(undefined)
    setSelectedMisconceptionId(undefined)

    // Trigger deterministic Socratic peer reply after brief simulation delay
    setTimeout(() => {
      const peer = generatePeerDialogicTurn(currentPassage, updatedTurns)
      const peerTurn: DialogueTurn = {
        id: `turn-peer-${Date.now()}`,
        speaker: 'peer_agent',
        role: peer.role,
        turnIndex: updatedTurns.length,
        text: peer.text,
        stemId: peer.stemId,
        timestamp: Date.now(),
        targetTurnId: userTurn.id,
        icapLevel: peer.icapLevel,
        elaborationScore: 70,
      }
      setDialogueTurns((prev) => [...prev, peerTurn])
    }, 450)
  }

  // Handle Asking Socratic Peer to Speak Directly
  const handleTriggerPeerResponse = (forcedRole?: ReciprocalRole) => {
    const peer = generatePeerDialogicTurn(currentPassage, dialogueTurns, forcedRole)
    const peerTurn: DialogueTurn = {
      id: `turn-peer-${Date.now()}`,
      speaker: 'peer_agent',
      role: peer.role,
      turnIndex: dialogueTurns.length,
      text: peer.text,
      stemId: peer.stemId,
      timestamp: Date.now(),
      targetTurnId: dialogueTurns[dialogueTurns.length - 1]?.id,
      icapLevel: peer.icapLevel,
      elaborationScore: 75,
    }
    setDialogueTurns((prev) => [...prev, peerTurn])
  }

  // Generate Calibrated FSRS Deck
  const handleGenerateDeck = async () => {
    setIsGeneratingDeck(true)
    try {
      // Attempt backend handler via apiSend; fallback to deterministic client generator
      const res = await apiSend<CalibratedReciprocalDeck>('/api/reciprocal-teaching', 'POST', {
        action: 'generate_deck',
        passageId: currentPassage.id,
        turns: dialogueTurns,
      }).catch(() => null)

      if (res && res.cards) {
        setCalibratedDeck(res)
      } else {
        const localDeck = generateReciprocalFSRSDeck(currentPassage, dialogueTurns, evaluation)
        setCalibratedDeck(localDeck)
      }
      setActiveTab('synthesis')
    } catch {
      const localDeck = generateReciprocalFSRSDeck(currentPassage, dialogueTurns, evaluation)
      setCalibratedDeck(localDeck)
      setActiveTab('synthesis')
    } finally {
      setIsGeneratingDeck(false)
    }
  }

  // Role metadata descriptions
  const roleDescriptions: Record<
    ReciprocalRole,
    { title: string; mission: string; icon: React.ReactNode; color: string }
  > = {
    questioner: {
      title: 'Questioner (Inquisitor)',
      mission:
        'Generate thought-provoking causal questions targeting central mechanisms rather than superficial facts (King 1999).',
      icon: <HelpCircle className="h-4 w-4" />,
      color: 'text-blue-500',
    },
    clarifier: {
      title: 'Clarifier (Debugger)',
      mission:
        'Identify friction points, ambiguous terms, and actively resolve misconceptions against empirical evidence (Palincsar & Brown 1984).',
      icon: <Wrench className="h-4 w-4" />,
      color: 'text-emerald-500',
    },
    summarizer: {
      title: 'Summarizer (Synthesizer)',
      mission:
        'Condense the passage and ongoing dialogue into its core causal thesis and necessary conditions.',
      icon: <BookOpen className="h-4 w-4" />,
      color: 'text-purple-500',
    },
    predictor: {
      title: 'Predictor (Oracle)',
      mission:
        'Forecast downstream implications, experimental falsification criteria, or cross-domain transfers (Chi 2014).',
      icon: <Lightbulb className="h-4 w-4" />,
      color: 'text-amber-500',
    },
  }

  return (
    <div className="space-y-6">
      {/* Real-time Telemetry HUD */}
      <ReciprocalTeachingHUD evaluation={evaluation} activePassageTitle={currentPassage.title} />

      {/* Studio Navigation Tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          label="Reciprocal Teaching Phases"
          value={activeTab}
          onChange={(val) => setActiveTab(val as 'passage' | 'stems' | 'dialogue' | 'synthesis')}
          items={[
            {
              key: 'passage',
              label: '1. Text & Role Allocation',
            },
            {
              key: 'stems',
              label: '2. Cognitive Stems',
            },
            {
              key: 'dialogue',
              label: `3. Dialogue Arena (${dialogueTurns.length})`,
            },
            {
              key: 'synthesis',
              label: '4. Synthesis & FSRS Deck',
            },
          ]}
        />

        {/* Global Quick Action */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => handlePassageChange(currentPassage.id)}
            className="flex items-center gap-1.5 text-xs py-1.5 px-3"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset Session
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

      {/* TAB 1: Text Passage & Role Allocation */}
      {activeTab === 'passage' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left 2 Cols: Text Passage Viewer */}
          <div className="space-y-4 lg:col-span-2">
            <Panel className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
                <div>
                  <h3 className="text-base font-semibold text-strong">{currentPassage.title}</h3>
                  <p className="text-xs text-secondary capitalize">
                    Discipline: {currentPassage.discipline.replace('_', ' ')} • Difficulty:{' '}
                    {currentPassage.difficulty} • {currentPassage.wordCount} words
                  </p>
                </div>

                {/* Passage Switcher */}
                <select
                  aria-label="Select Text Passage"
                  value={selectedPassageId}
                  onChange={(e) => handlePassageChange(e.target.value)}
                  className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface px-3 py-1.5 text-xs text-strong focus:outline-none focus:ring-2 focus:ring-(--hub-primary)"
                >
                  {passages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Passage Prose */}
              <div className="prose prose-sm dark:prose-invert max-w-none text-secondary leading-relaxed whitespace-pre-line text-xs sm:text-sm">
                {currentPassage.content}
              </div>

              {/* Core Thesis Card */}
              <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface/60 p-3.5 space-y-1.5">
                <div className="text-xs font-semibold text-strong flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-(--hub-primary,#2563eb)" />
                  Core Causal Thesis
                </div>
                <p className="text-xs text-secondary leading-relaxed">
                  {currentPassage.coreThesis}
                </p>
              </div>

              {/* Key Mechanisms Checklist */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-strong">
                  Constituent Mechanisms (Palincsar Cognitive Pillars):
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {currentPassage.keyMechanisms.map((mech, i) => (
                    <div
                      key={`mech-${i}`}
                      className="flex items-start gap-2 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-2.5 text-xs text-secondary"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                      <span>{mech}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </div>

          {/* Right Col: Reciprocal Role Selection */}
          <div className="space-y-4">
            <Panel className="space-y-4">
              <div className="border-b border-neutral-200 dark:border-(--hub-border) pb-3">
                <h4 className="text-sm font-semibold text-strong flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-(--hub-primary,#2563eb)" />
                  Select Your Reciprocal Role
                </h4>
                <p className="text-xs text-secondary mt-1">
                  Rotate across all 4 roles to maximize the Strategy Balance Score (RSBS).
                </p>
              </div>

              <div className="space-y-2.5">
                {(['questioner', 'clarifier', 'summarizer', 'predictor'] as const).map((role) => {
                  const meta = roleDescriptions[role]
                  const isSelected = currentRole === role
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setCurrentRole(role)}
                      className={`w-full text-left rounded-lg border p-3 transition-all ${
                        isSelected
                          ? 'border-(--hub-primary,#2563eb) bg-(--hub-primary-soft,rgba(59,130,246,0.08)) ring-1 ring-(--hub-primary)'
                          : 'border-neutral-200 dark:border-(--hub-border) bg-surface hover:bg-surface-elevated'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={meta.color}>{meta.icon}</span>
                          <span className="text-xs font-semibold text-strong">{meta.title}</span>
                        </div>
                        {isSelected && <Badge tone="accent">Active</Badge>}
                      </div>
                      <p className="text-[11px] text-secondary mt-1.5 leading-snug">
                        {meta.mission}
                      </p>
                    </button>
                  )
                })}
              </div>

              <Button variant="primary" className="w-full" onClick={() => setActiveTab('dialogue')}>
                Proceed to Dialogue Arena
              </Button>
            </Panel>
          </div>
        </div>
      )}

      {/* TAB 2: Cognitive Stems & Question Generation */}
      {activeTab === 'stems' && (
        <div className="space-y-4">
          <Panel className="space-y-4">
            <div className="border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <h3 className="text-sm font-semibold text-strong flex items-center gap-1.5">
                <Lightbulb className="h-4 w-4 text-(--hub-primary,#2563eb)" />
                Alison King (1990, 1999) Guided Thought-Provoking Stems
              </h3>
              <p className="text-xs text-secondary mt-1">
                Select a stem to preload into your dialogic response workbench. These stems scaffold
                Constructive and Interactive cognitive engagement.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {currentPassage.stems.map((stem) => (
                <div
                  key={stem.id}
                  className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3.5 space-y-2 flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <Badge tone="neutral" className="capitalize">
                        {stem.role}
                      </Badge>
                      <Badge tone="accent" className="uppercase">
                        Target: {stem.icapTarget}
                      </Badge>
                    </div>
                    <p className="text-xs font-medium text-strong leading-snug">"{stem.stem}"</p>
                    <p className="text-[11px] text-secondary">{stem.rationale}</p>
                  </div>

                  <Button
                    variant="secondary"
                    className="w-full flex items-center justify-center gap-1.5 mt-2 text-xs py-1 px-2"
                    onClick={() => {
                      setInputText(stem.stem)
                      setSelectedStemId(stem.id)
                      setCurrentRole(stem.role)
                      setActiveTab('dialogue')
                    }}
                  >
                    <Plus className="h-3 w-3" /> Adopt Stem into Dialogue
                  </Button>
                </div>
              ))}
            </div>
          </Panel>

          {/* Common Misconceptions to Clarify */}
          <Panel className="space-y-4">
            <div className="border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <h4 className="text-sm font-semibold text-strong flex items-center gap-1.5">
                <Wrench className="h-4 w-4 text-emerald-500" />
                Target Misconceptions (Metacognitive Repair)
              </h4>
              <p className="text-xs text-secondary mt-1">
                Addressing these misconceptions increases your Metacognitive Repair Ratio (MRR).
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {currentPassage.commonMisconceptions.map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2"
                >
                  <div className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    Misconception: "{m.misconception}"
                  </div>
                  <div className="text-xs text-secondary">
                    <span className="font-medium text-strong">Clarification: </span>
                    {m.clarification}
                  </div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                    <span className="font-medium">Evidence: </span>
                    {m.evidence}
                  </div>
                  <Button
                    variant="ghost"
                    className="w-full text-xs text-(--hub-primary,#2563eb) py-1"
                    onClick={() => {
                      setInputText(
                        `Regarding the misconception that "${m.misconception}", the text clarifies that ${m.clarification} because ${m.evidence}.`,
                      )
                      setSelectedMisconceptionId(m.id)
                      setCurrentRole('clarifier')
                      setActiveTab('dialogue')
                    }}
                  >
                    Clarify in Dialogue
                  </Button>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 3: Dialogue Arena */}
      {activeTab === 'dialogue' && (
        <div className="space-y-4">
          <Panel className="space-y-4">
            {/* Conversation Stream Header */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-(--hub-primary,#2563eb)" />
                <h3 className="text-sm font-semibold text-strong">
                  Socratic Reciprocal Dialogue Arena
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  onClick={() => handleTriggerPeerResponse()}
                  className="text-xs py-1 px-2.5"
                >
                  Prompt Peer Response
                </Button>
              </div>
            </div>

            {/* Chat Messages Log */}
            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {dialogueTurns.map((turn) => {
                const isUser = turn.speaker === 'user'
                return (
                  <div
                    key={turn.id}
                    className={`flex flex-col rounded-lg p-3.5 space-y-2 border transition-all ${
                      isUser
                        ? 'border-(--hub-primary-soft,rgba(59,130,246,0.3)) bg-(--hub-primary-soft,rgba(59,130,246,0.04)) ml-4 sm:ml-12'
                        : 'border-neutral-200 dark:border-(--hub-border) bg-surface mr-4 sm:mr-12'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-strong">
                        {isUser ? (
                          <User className="h-3.5 w-3.5 text-(--hub-primary,#2563eb)" />
                        ) : (
                          <Users className="h-3.5 w-3.5 text-emerald-500" />
                        )}
                        <span>{isUser ? 'You' : 'Socratic Peer Agent'}</span>
                        <Badge tone="neutral" className="capitalize">
                          {turn.role}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Badge
                          tone={
                            turn.icapLevel === 'interactive'
                              ? 'success'
                              : turn.icapLevel === 'constructive'
                                ? 'accent'
                                : 'neutral'
                          }
                          className="uppercase font-mono text-[10px]"
                        >
                          ICAP: {turn.icapLevel}
                        </Badge>
                        <span className="text-[10px] text-secondary">
                          Score: {turn.elaborationScore}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-secondary leading-relaxed whitespace-pre-line">
                      {turn.text}
                    </p>

                    {turn.resolvedMisconceptionId && (
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Resolved Domain Misconception
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Input Workbench */}
            <div className="space-y-3 border-t border-neutral-200 dark:border-(--hub-border) pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-secondary font-medium">Your Role:</span>
                  <div className="flex items-center gap-1">
                    {(['questioner', 'clarifier', 'summarizer', 'predictor'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setCurrentRole(r)}
                        className={`rounded px-2 py-0.5 text-[11px] font-medium capitalize transition-all ${
                          currentRole === r
                            ? 'bg-(--hub-primary,#2563eb) text-white'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-secondary hover:text-strong'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedMisconceptionId && <Badge tone="warning">Misconception Link Active</Badge>}
              </div>

              <div className="relative">
                <textarea
                  rows={3}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={`Contribute as ${roleDescriptions[currentRole].title}... (Use causal markers like 'because', 'consequently', or challenge peer ideas to reach Interactive ICAP level)`}
                  className="w-full rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 text-xs sm:text-sm text-strong placeholder:text-secondary/60 focus:outline-none focus:ring-2 focus:ring-(--hub-primary)"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleSendTurn()
                    }
                  }}
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-[11px] text-secondary">
                  Press <kbd className="rounded border px-1">Ctrl+Enter</kbd> to send
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setActiveTab('stems')}
                    className="text-xs py-1 px-2.5"
                  >
                    Browse Stems
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSendTurn}
                    disabled={!inputText.trim()}
                    className="flex items-center gap-1.5 text-xs py-1.5 px-3"
                  >
                    <Send className="h-3.5 w-3.5" /> Send Turn
                  </Button>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 4: Synthesis & Calibrated FSRS Deck */}
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
                  Synthesized directly from your reciprocal dialogue. Card stability and difficulty
                  parameters are calibrated against your dialogue maturity score (RDMS{' '}
                  {evaluation.rdms}/100).
                </p>
              </div>

              <Button
                variant="primary"
                onClick={handleGenerateDeck}
                disabled={isGeneratingDeck}
                className="flex items-center gap-1.5 text-xs py-1.5 px-3"
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
                          {card.role}
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
                  Engage in the reciprocal dialogue across Questioner, Clarifier, Summarizer, and
                  Predictor roles, then click below to generate your FSRS-6 review deck.
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
