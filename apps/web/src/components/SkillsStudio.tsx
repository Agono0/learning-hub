'use client'

/**
 * @file apps/web/src/components/SkillsStudio.tsx
 * @description Matt Pocock Agent Skills & Autonomous Engineering Studio.
 *
 * Implements:
 * - Matt Pocock idea-to-ship engineering flow: /grill-me -> /to-spec -> /to-tickets -> /code-review -> /handoff.
 * - Socratic Interviewer with clarity tracking and decision tree resolution.
 * - Atomic Ticket Decomposer with TDD command generation.
 * - AGENTS.md Architectural Linter & Invariant Gatekeeper.
 * - Deliberate Practice Drill & FSRS Flashcard synthesis.
 */

import { useId, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react'
import {
  CANONICAL_SKILLS,
  auditCodeAgainstAgentsRules,
  executeSkillSimulation,
  renderSkillMarkdown,
  type SkillCategory,
  type SkillDefinition,
  type SkillExecutionResult,
} from '@learning-hub/core/skills'
import { apiGet, apiSend } from '@/lib/transport'
import { Badge, Button, Callout, Markdown, Panel, SkillsHUD } from '@/ui'

const CATEGORIES: Array<{ id: 'all' | SkillCategory; label: string }> = [
  { id: 'all', label: 'All Skills' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'pedagogy', label: 'Pedagogy' },
  { id: 'metacognition', label: 'Metacognition' },
  { id: 'architecture', label: 'Architecture' },
]

export function SkillsStudio() {
  const [activeSkillId, setActiveSkillId] = useState<string>('grill-me')
  const [selectedCategory, setSelectedCategory] = useState<'all' | SkillCategory>('all')
  const [topic, setTopic] = useState<string>('Distributed Spaced Repetition Workload Balancer')
  const [context, setContext] = useState<string>(
    'Need to smooth out spike review loads across a 90-day forecast while strictly preserving Rule 7 FSRS stability invariants. Designated easy rest days on weekends.',
  )
  const [filepath, setFilepath] = useState<string>('apps/web/src/server/handlers/workload/route.ts')
  const [activeTab, setActiveTab] = useState<'output' | 'tickets' | 'audit' | 'cards' | 'skillmd'>(
    'output',
  )
  const [copied, setCopied] = useState<boolean>(false)
  const [cardSaveStatus, setCardSaveStatus] = useState<string | null>(null)

  const topicInputId = useId()
  const contextInputId = useId()
  const filepathInputId = useId()

  const activeSkill: SkillDefinition =
    CANONICAL_SKILLS[activeSkillId] ?? CANONICAL_SKILLS['grill-me']!

  // Fetch registered skills from backend handler (verifies API connection)
  const skillsQuery = useQuery<{ ok: boolean; skills: SkillDefinition[] }>({
    queryKey: ['skills-catalog'],
    queryFn: () => apiGet<{ ok: boolean; skills: SkillDefinition[] }>('/api/skills'),
  })

  // Skill Execution Mutation
  const executeMutation = useMutation<
    SkillExecutionResult,
    Error,
    { skillId: string; topic: string; context: string; filepath?: string }
  >({
    mutationFn: async (payload) => {
      try {
        const res = await apiSend<{ ok: boolean; result: SkillExecutionResult }>(
          '/api/skills',
          'POST',
          {
            action: 'execute',
            skillId: payload.skillId,
            topic: payload.topic,
            context: payload.context,
            parameters: { filepath: payload.filepath },
          },
        )
        if (res.ok && res.result) return res.result
      } catch {
        // Fallback to pure local core execution if backend is in offline/fallback mode
      }
      return executeSkillSimulation(payload.skillId, {
        topic: payload.topic,
        context: payload.context,
        parameters: { filepath: payload.filepath },
      })
    },
    onSuccess: (data) => {
      if (data.tickets && data.tickets.length > 0) setActiveTab('tickets')
      else if (data.ruleViolations && data.ruleViolations.length > 0) setActiveTab('audit')
      else if (data.generatedCards && data.generatedCards.length > 0) setActiveTab('cards')
      else setActiveTab('output')
    },
  })

  // Card Creation Mutation (bridge to review decks)
  const saveCardsMutation = useMutation({
    mutationFn: async (cards: Array<{ front: string; back: string; tags: string[] }>) => {
      // Fetch default deck or first available deck
      const decksRes = await apiGet<{ decks: Array<{ id: number; name: string }> }>('/api/decks')
      const targetDeckId = decksRes.decks[0]?.id ?? 1

      for (const card of cards) {
        await apiSend('/api/cards', 'POST', {
          deckId: targetDeckId,
          type: 'basic',
          content: { basic: { front: card.front, back: card.back } },
          tags: card.tags,
        })
      }
      return cards.length
    },
    onSuccess: (count) => {
      setCardSaveStatus(
        `Successfully saved ${count} deliberate practice cards to your review deck!`,
      )
      setTimeout(() => setCardSaveStatus(null), 4000)
    },
  })

  const currentResult: SkillExecutionResult =
    executeMutation.data ??
    executeSkillSimulation(activeSkillId, {
      topic,
      context,
      parameters: { filepath },
    })

  const skillCatalog = skillsQuery.data?.skills ?? Object.values(CANONICAL_SKILLS)
  const filteredSkills = skillCatalog.filter(
    (s) => selectedCategory === 'all' || s.meta.category === selectedCategory,
  )

  function handleCopy(text: string) {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownloadSkillMd() {
    const markdown = renderSkillMarkdown(activeSkill)
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `SKILL-${activeSkill.meta.name}.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Real-time Telemetry HUD */}
      <SkillsHUD
        skill={activeSkill}
        lastResult={currentResult}
        onSelectNextSkill={(nextId) => {
          if (CANONICAL_SKILLS[nextId]) {
            setActiveSkillId(nextId)
            executeMutation.mutate({ skillId: nextId, topic, context, filepath })
          }
        }}
      />

      {/* Category Filter Pills & Skill Selector */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategory(c.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  selectedCategory === c.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <span className="text-[11px] font-mono text-neutral-500">
            {filteredSkills.length} Autonomous Skills Loaded
          </span>
        </div>

        {/* Skill Cards Horizontal Carousel / Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {filteredSkills.map((s) => {
            const isSelected = s.meta.name === activeSkillId
            return (
              <button
                key={s.meta.name}
                type="button"
                onClick={() => {
                  setActiveSkillId(s.meta.name)
                  executeMutation.mutate({ skillId: s.meta.name, topic, context, filepath })
                }}
                className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-500/15 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500/30'
                    : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-white flex items-center gap-1">
                      /{s.meta.name}
                    </span>
                    <Badge tone={isSelected ? 'accent' : 'neutral'}>{s.meta.category}</Badge>
                  </div>
                  <h4 className="text-xs font-semibold text-neutral-200 line-clamp-1">
                    {s.meta.title}
                  </h4>
                  <p className="text-[11px] text-neutral-400 line-clamp-2 leading-relaxed">
                    {s.meta.description}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2 text-[10px] text-neutral-500">
                  <span>v{s.meta.version}</span>
                  <span className="flex items-center gap-1 font-semibold text-indigo-400">
                    {isSelected ? 'Active' : 'Run Skill'} <ArrowRight className="h-2.5 w-2.5" />
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Execution Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Input Parameters Panel */}
        <div className="lg:col-span-5 space-y-4">
          <Panel
            title={
              <div className="flex items-center justify-between w-full">
                <span className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-indigo-400" />
                  <span>Skill Execution Input</span>
                </span>
                <span className="font-mono text-xs text-neutral-400">/{activeSkill.meta.name}</span>
              </div>
            }
          >
            <form
              onSubmit={(e) => {
                e.preventDefault()
                executeMutation.mutate({ skillId: activeSkillId, topic, context, filepath })
              }}
              className="space-y-4"
            >
              {/* Topic / Target Name */}
              <div className="space-y-1">
                <label
                  htmlFor={topicInputId}
                  className="text-xs font-semibold text-neutral-300 block"
                >
                  Target Topic / Feature / Skill Name:
                </label>
                <input
                  id={topicInputId}
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Distributed Spaced Repetition Workload Balancer"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>

              {/* Optional Filepath (for code-review) */}
              {activeSkillId === 'code-review' && (
                <div className="space-y-1">
                  <label
                    htmlFor={filepathInputId}
                    className="text-xs font-semibold text-neutral-300 block"
                  >
                    Target Filepath:
                  </label>
                  <input
                    id={filepathInputId}
                    type="text"
                    value={filepath}
                    onChange={(e) => setFilepath(e.target.value)}
                    placeholder="apps/web/src/server/handlers/workload/route.ts"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Context / Code / Notes */}
              <div className="space-y-1">
                <label
                  htmlFor={contextInputId}
                  className="text-xs font-semibold text-neutral-300 block"
                >
                  {activeSkillId === 'code-review'
                    ? 'Code Snippet to Audit:'
                    : activeSkillId === 'concept-refactor'
                      ? 'Raw Notes to Refactor:'
                      : 'Context, Ideas & Brainstorming:'}
                </label>
                <textarea
                  id={contextInputId}
                  rows={6}
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Provide context, constraints, or code snippets..."
                  className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white font-mono placeholder-neutral-500 focus:border-indigo-500 focus:outline-none resize-none leading-relaxed"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setTopic('')
                    setContext('')
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1 text-neutral-400" />
                  Clear
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={executeMutation.isPending || !topic.trim()}
                >
                  <Play className="h-3.5 w-3.5 mr-1.5 text-amber-300" />
                  {executeMutation.isPending
                    ? 'Executing Skill...'
                    : `Run /${activeSkill.meta.name}`}
                </Button>
              </div>
            </form>
          </Panel>

          {/* Prompt Template Inspector */}
          <Panel
            title={
              <span className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-emerald-400" />
                <span>System Prompt Blueprint</span>
              </span>
            }
          >
            <div className="space-y-2 text-xs text-neutral-300">
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Instructions provided to autonomous agents executing this skill:
              </p>
              <pre className="max-h-48 overflow-y-auto rounded-lg bg-black/40 p-3 font-mono text-[10px] text-emerald-300/90 whitespace-pre-wrap leading-relaxed border border-white/5">
                {activeSkill.systemPrompt}
              </pre>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleDownloadSkillMd}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-400 hover:text-white"
                >
                  <Download className="h-3 w-3" />
                  Download SKILL.md
                </button>
              </div>
            </div>
          </Panel>
        </div>

        {/* Output & Artifacts Panel */}
        <div className="lg:col-span-7 space-y-4">
          <Panel
            title={
              <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  <span>Skill Output Artifacts</span>
                </div>

                {/* Artifact View Tabs */}
                <div className="flex rounded-lg border border-white/10 bg-black/30 p-0.5">
                  <button
                    type="button"
                    onClick={() => setActiveTab('output')}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                      activeTab === 'output'
                        ? 'bg-indigo-600 text-white'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Report
                  </button>
                  {currentResult.tickets && currentResult.tickets.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('tickets')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                        activeTab === 'tickets'
                          ? 'bg-indigo-600 text-white'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      Tickets ({currentResult.tickets.length})
                    </button>
                  )}
                  {activeSkillId === 'code-review' && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('audit')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                        activeTab === 'audit'
                          ? 'bg-indigo-600 text-white'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      Audit
                    </button>
                  )}
                  {currentResult.generatedCards && currentResult.generatedCards.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('cards')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                        activeTab === 'cards'
                          ? 'bg-indigo-600 text-white'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      Cards ({currentResult.generatedCards.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveTab('skillmd')}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                      activeTab === 'skillmd'
                        ? 'bg-indigo-600 text-white'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    SKILL.md
                  </button>
                </div>
              </div>
            }
          >
            <div className="space-y-4">
              {/* Feedback Alert for Card Saving */}
              {cardSaveStatus && (
                <Callout tone="success">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{cardSaveStatus}</span>
                  </div>
                </Callout>
              )}

              {/* Tab 1: Rendered Markdown Output */}
              {activeTab === 'output' && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-white/5 bg-black/30 p-4 min-h-[300px]">
                    <Markdown>{currentResult.rawOutput}</Markdown>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-neutral-400">
                      Generated at {new Date(currentResult.timestamp).toLocaleTimeString()}
                    </span>
                    <Button variant="ghost" onClick={() => handleCopy(currentResult.rawOutput)}>
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400 mr-1" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 mr-1" />
                      )}
                      {copied ? 'Copied' : 'Copy Output'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Tab 2: Tickets Decomposed */}
              {activeTab === 'tickets' && currentResult.tickets && (
                <div className="space-y-3">
                  {currentResult.tickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-indigo-500/20 px-2 py-0.5 font-mono text-xs font-bold text-indigo-300">
                            {ticket.id}
                          </span>
                          <h4 className="text-xs font-bold text-white">{ticket.title}</h4>
                        </div>
                        <Badge tone={ticket.priority === 'P0' ? 'danger' : 'warning'}>
                          {ticket.priority}
                        </Badge>
                      </div>

                      <p className="text-xs text-neutral-300 leading-relaxed">
                        {ticket.description}
                      </p>

                      <div className="space-y-1 text-[11px] text-neutral-400">
                        <div className="font-semibold text-neutral-300">Files Affected:</div>
                        <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px] text-sky-300">
                          {ticket.filesAffected.map((f) => (
                            <li key={f}>{f}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="rounded-lg bg-black/40 p-2 text-[10px] font-mono text-emerald-300 border border-white/5 flex items-center justify-between">
                        <span>Test: {ticket.testRecipe}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(ticket.testRecipe)}
                          className="text-neutral-400 hover:text-white"
                          title="Copy test recipe"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab 3: Code Review Audit */}
              {activeTab === 'audit' && (
                <div className="space-y-3">
                  {(() => {
                    const violations =
                      currentResult.ruleViolations ?? auditCodeAgainstAgentsRules(context, filepath)
                    return violations.length === 0 ? (
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center space-y-2">
                        <ShieldCheck className="h-8 w-8 text-emerald-400 mx-auto" />
                        <h4 className="text-sm font-bold text-white">
                          Clean Architectural Compliance
                        </h4>
                        <p className="text-xs text-neutral-300 max-w-md mx-auto">
                          Zero violations detected. Code satisfies all 18 hard engineering rules of
                          AGENTS.md (no raw fetch, runtime neutrality, Rule 7 grading invariants,
                          and untrusted markdown sanitization).
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-rose-400 text-xs font-bold">
                          <AlertTriangle className="h-4 w-4" />
                          <span>{violations.length} Hard Invariant Violation(s) Found:</span>
                        </div>
                        {violations.map((v, i) => (
                          <div
                            key={i}
                            className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 space-y-1.5 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-rose-300">
                                Rule {v.ruleId}: {v.ruleName}
                              </span>
                              <Badge tone="danger">Line {v.line ?? '?'}</Badge>
                            </div>
                            <p className="text-neutral-200">{v.message}</p>
                            <div className="rounded bg-black/40 p-2 text-[11px] font-mono text-emerald-300 border border-white/5">
                              <strong>Remedy:</strong> {v.remedy}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Tab 4: FSRS Deliberate Practice Cards */}
              {activeTab === 'cards' && currentResult.generatedCards && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-xs text-neutral-300 font-semibold">
                      {currentResult.generatedCards.length} Deliberate Practice Flashcards
                      Synthesized
                    </span>
                    <Button
                      variant="primary"
                      onClick={() => saveCardsMutation.mutate(currentResult.generatedCards!)}
                      disabled={saveCardsMutation.isPending}
                    >
                      <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                      {saveCardsMutation.isPending ? 'Saving...' : 'Add All to Review Deck'}
                    </Button>
                  </div>

                  {currentResult.generatedCards.map((card, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-2"
                    >
                      <div className="text-xs font-semibold text-neutral-200">
                        <span className="text-[10px] text-indigo-400 font-mono uppercase block">
                          Question (Front):
                        </span>
                        {card.front}
                      </div>
                      <div className="text-xs text-neutral-300 border-t border-white/5 pt-2">
                        <span className="text-[10px] text-emerald-400 font-mono uppercase block">
                          Answer (Back):
                        </span>
                        {card.back}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab 5: Raw SKILL.md Specification */}
              {activeTab === 'skillmd' && (
                <div className="space-y-3">
                  <pre className="max-h-[400px] overflow-y-auto rounded-xl bg-black/40 p-4 font-mono text-[11px] text-neutral-300 whitespace-pre-wrap leading-relaxed border border-white/5">
                    {renderSkillMarkdown(activeSkill)}
                  </pre>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => handleCopy(renderSkillMarkdown(activeSkill))}
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400 mr-1" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 mr-1" />
                      )}
                      {copied ? 'Copied' : 'Copy SKILL.md'}
                    </Button>
                    <Button variant="primary" onClick={handleDownloadSkillMd}>
                      <Download className="h-3.5 w-3.5 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
