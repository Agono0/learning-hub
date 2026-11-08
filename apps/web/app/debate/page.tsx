'use client'

/**
 * Multi-Agent Dialectic Debate Arena ("Courtroom Mode") & Protégé Peer Simulator.
 *
 * Implements:
 * - Bloom's Taxonomy Level 6 (Evaluation & Critique).
 * - Real-time fallacy detector (Straw Man, Ad Hominem, False Dilemma, etc.) with XP rewards.
 * - Socratic Protégé student simulation (Chase et al. 2009; Kobayashi 2019).
 * - No raw fetch: uses apiGet/apiSend from @/lib/transport.
 */
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Award, CheckCircle2, Gavel, Scale, Sparkles, Swords, User } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { PageHeader } from '@/ui'

interface DebateResponse {
  ok: boolean
  debate?: {
    id: number
    topic: string
    thesisAgentRole: string
    antithesisAgentRole: string
    transcript: Array<{
      id: string
      speaker: 'thesis_agent' | 'antithesis_agent' | 'human_judge'
      speakerName: string
      argumentText: string
      timestamp: string
    }>
  }
}

export default function DebateArenaPage() {
  const [activeTab, setActiveTab] = useState<'arena' | 'protege'>('arena')
  const [selectedFallacy, setSelectedFallacy] = useState<string | null>(null)
  const [evaluationFeedback, setEvaluationFeedback] = useState<string | null>(null)
  const [verdictText, setVerdictText] = useState('')
  const [verdictSubmitted, setVerdictSubmitted] = useState(false)

  // Protégé state
  const [protegeReply, setProtegeReply] = useState('')
  const [protegeFeedback, setProtegeFeedback] = useState<string | null>(null)

  const { data } = useQuery<DebateResponse>({
    queryKey: ['dialectic-debate-current'],
    queryFn: () => apiGet<DebateResponse>('/api/dialectic/arena?id=1'),
  })

  const debate = data?.debate ?? {
    id: 1,
    topic: 'Monolithic Architecture vs Distributed Microservices',
    thesisAgentRole: 'Monolith Champion (Dr. Marcus)',
    antithesisAgentRole: 'Microservices Advocate (Elena V.)',
    transcript: [
      {
        id: 'turn-1',
        speaker: 'thesis_agent',
        speakerName: 'Dr. Marcus (Thesis)',
        argumentText:
          'Monolithic systems eliminate distributed network latency and consistency nightmares. Anyone suggesting microservices for an early-stage product is either reckless or trying to resume-pad.',
        timestamp: '10:00 AM',
      },
      {
        id: 'turn-2',
        speaker: 'antithesis_agent',
        speakerName: 'Elena V. (Antithesis)',
        argumentText:
          'That ignores organizational scaling. Either you decompose services cleanly across domain boundaries, or the company will inevitably grind to a complete halt within a year.',
        timestamp: '10:02 AM',
      },
    ],
  }

  // Fallacy evaluator mutation
  const checkFallacy = useMutation({
    mutationFn: (fallacyKey: string) =>
      apiSend<{ ok: boolean; correct: boolean; explanation: string; awardedXp: number }>(
        '/api/dialectic/arena',
        'POST',
        {
          action: 'evaluate_fallacy',
          argumentText: debate.transcript[1]?.argumentText ?? '',
          fallacy: fallacyKey,
          plantedFallacies: ['false_dichotomy', 'ad_hominem'],
        },
      ),
    onSuccess: (res) => {
      setEvaluationFeedback(res.explanation)
    },
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
      <PageHeader
        title="Dialectic Debate Arena & Protégé"
        subtitle="Judge opposing AI perspectives, expose logical fallacies, and teach simulated peer students (Bloom's Taxonomy Level 6: Evaluation)."
      />

      {/* Mode Switcher */}
      <div className="flex items-center gap-2 p-1 bg-neutral-900 border border-neutral-800 rounded-xl max-w-fit text-xs">
        <button
          onClick={() => setActiveTab('arena')}
          className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
            activeTab === 'arena' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Gavel className="w-3.5 h-3.5" /> Courtroom Arena
        </button>
        <button
          onClick={() => setActiveTab('protege')}
          className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
            activeTab === 'protege'
              ? 'bg-purple-600 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <User className="w-3.5 h-3.5" /> Teach Alex (Protégé)
        </button>
      </div>

      {activeTab === 'arena' ? (
        <div className="space-y-6">
          {/* Topic Banner */}
          <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center gap-3">
            <Scale className="w-6 h-6 text-blue-400 shrink-0" />
            <div>
              <div className="text-xs uppercase tracking-wider text-neutral-400 font-semibold">
                Current Case Topic
              </div>
              <h2 className="text-base font-bold text-white">{debate.topic}</h2>
            </div>
          </div>

          {/* Dialectical Transcript */}
          <div className="space-y-3">
            {debate.transcript.map((turn) => {
              const isThesis = turn.speaker === 'thesis_agent'
              return (
                <div
                  key={turn.id}
                  className={`p-4 rounded-2xl border space-y-2 ${
                    isThesis
                      ? 'bg-blue-950/20 border-blue-900/40 text-blue-100'
                      : 'bg-purple-950/20 border-purple-900/40 text-purple-100'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className={isThesis ? 'text-blue-400' : 'text-purple-400'}>
                      {turn.speakerName}
                    </span>
                    <span className="text-[11px] text-neutral-500">{turn.timestamp}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-neutral-200">{turn.argumentText}</p>
                </div>
              )
            })}
          </div>

          {/* Judge's Fallacy Spotter Panel */}
          <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-300">
              <Swords className="w-4 h-4 text-amber-400" />
              <span>Judge's Action: Flag Fallacy in Elena's Argument</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { key: 'false_dichotomy', label: 'False Dichotomy' },
                { key: 'ad_hominem', label: 'Ad Hominem' },
                { key: 'straw_man', label: 'Straw Man' },
                { key: 'circular_reasoning', label: 'Circular Logic' },
                { key: 'slippery_slope', label: 'Slippery Slope' },
                { key: 'appeal_to_authority', label: 'False Authority' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => {
                    setSelectedFallacy(f.key)
                    checkFallacy.mutate(f.key)
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-medium transition min-h-[44px] ${
                    selectedFallacy === f.key
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-neutral-800 border-neutral-700 hover:border-neutral-600 text-neutral-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {evaluationFeedback ? (
              <div className="p-3.5 rounded-xl bg-neutral-800/80 border border-neutral-700 text-xs text-neutral-200 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{evaluationFeedback}</span>
              </div>
            ) : null}
          </div>

          {/* Final Verdict Synthesis */}
          <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-300">
              <Gavel className="w-4 h-4 text-blue-400" />
              <span>Deliver Your Ruling (Synthesis)</span>
            </div>

            {!verdictSubmitted ? (
              <div className="space-y-3">
                <textarea
                  value={verdictText}
                  onChange={(e) => setVerdictText(e.target.value)}
                  placeholder="State your synthesized verdict: under which conditions does a monolith excel, and when is service decomposition justified?"
                  className="w-full h-24 p-3 rounded-xl bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => setVerdictSubmitted(true)}
                  disabled={verdictText.trim().length < 15}
                  className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs transition flex items-center gap-2 min-h-[44px]"
                >
                  <Award className="w-4 h-4" /> Submit Ruling & Claim 50 XP
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Ruling Entered into Case
                  Precedent (+50 XP)
                </div>
                <p className="text-neutral-300 italic">"{verdictText}"</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Protégé "Teach Alex" Panel */
        <div className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-xl space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-sm">
              A
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                Alex (Simulated Junior Learner)
              </h2>
              <p className="text-xs text-neutral-400">
                Practicing the Protégé Effect: teaching solidifies deep understanding.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-900/50 text-xs text-purple-200 leading-relaxed">
            "Hey! I understand that microservices allow teams to deploy independently, but doesn't
            network serialization and distributed transactions slow down user requests? How do
            systems mitigate that?"
          </div>

          <div className="space-y-3">
            <textarea
              value={protegeReply}
              onChange={(e) => setProtegeReply(e.target.value)}
              placeholder="Explain the solution to Alex using plain, simple language (e.g. asynchronous messaging, caching, saga patterns)..."
              className="w-full h-24 p-3 rounded-xl bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={() =>
                setProtegeFeedback(
                  'Alex says: "Oh, that makes so much sense! So event-driven queues decouple the user request from downstream updates! Thank you!" (+30 XP awarded).',
                )
              }
              disabled={protegeReply.trim().length < 15}
              className="py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold text-xs transition flex items-center gap-2 min-h-[44px]"
            >
              <Sparkles className="w-4 h-4" /> Send Explanation to Alex
            </button>

            {protegeFeedback ? (
              <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300">
                {protegeFeedback}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
