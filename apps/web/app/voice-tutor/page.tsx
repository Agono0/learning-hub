'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { HelpCircle, Mic, MicOff, RefreshCw, Send, Volume2, VolumeX } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { hapticLight, hapticWarning } from '@/platform/haptics'
import { listenForSpeech, playChime, speakText, stopSpeaking } from '@/lib/audio-engine'
import { Button, Callout, Markdown, PageHeader, Panel, useToast } from '@/ui'

interface DialogueTurn {
  role: 'user' | 'assistant'
  text: string
  timestamp: string
}

const RUNGS = [
  { rung: 1, name: 'Nudge', desc: 'Attention reorientation' },
  { rung: 2, name: 'Hint', desc: 'Conceptual clues' },
  { rung: 3, name: 'Worked Example', desc: 'Analogous scaffolding' },
  { rung: 4, name: 'Full Solution', desc: 'Synthesis & re-derivation' },
]

function VoiceTutorContent() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const queryTopic = searchParams.get('topic')
  const queryCardId = searchParams.get('cardId') ? Number(searchParams.get('cardId')) : null

  const [topic, setTopic] = useState(queryTopic || 'Photosynthesis light reactions')
  const [selectedCardId, setSelectedCardId] = useState<number | null>(queryCardId)
  const [sessionActive, setSessionActive] = useState(false)
  const [currentRung, setCurrentRung] = useState(1)
  const [turns, setTurns] = useState<DialogueTurn[]>([])
  const [textInput, setTextInput] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speechEnabled, setSpeechEnabled] = useState(true)
  const [isPending, setIsPending] = useState(false)

  const { data: cardsData } = useQuery<{
    cards: Array<{ id: number; front?: string; back?: string; content?: Record<string, unknown> }>
  }>({
    queryKey: ['tutor-cards'],
    queryFn: () => apiGet('/api/cards?limit=50'),
  })

  const transcriptEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopSpeaking()
    }
  }, [])

  const startSession = async () => {
    if (!topic.trim()) return
    setIsPending(true)
    try {
      const res = await apiSend<{
        ok: boolean
        spokenReply: string
        nextRung: number
      }>('/api/tutor/voice-session', 'POST', {
        action: 'start',
        topic: topic.trim(),
        cardId: selectedCardId ?? undefined,
        userTranscript: '',
        currentRung: 1,
        attemptCount: 0,
        history: [],
      })

      const initialTurn: DialogueTurn = {
        role: 'assistant',
        text: res.spokenReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setTurns([initialTurn])
      setCurrentRung(res.nextRung)
      setSessionActive(true)

      if (speechEnabled) {
        setIsSpeaking(true)
        await speakText(res.spokenReply)
        setIsSpeaking(false)
      }
    } catch (err) {
      toast({
        title: 'Failed to start session',
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      })
    } finally {
      setIsPending(false)
    }
  }

  const sendTurn = async (userText: string) => {
    if (!userText.trim() || isPending) return

    const userTurn: DialogueTurn = {
      role: 'user',
      text: userText.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    const updatedTurns = [...turns, userTurn]
    setTurns(updatedTurns)
    setTextInput('')
    setIsPending(true)

    try {
      const res = await apiSend<{
        ok: boolean
        spokenReply: string
        nextRung: number
        isHintRequest: boolean
      }>('/api/tutor/voice-session', 'POST', {
        action: 'turn',
        topic: topic.trim(),
        cardId: selectedCardId ?? undefined,
        userTranscript: userText.trim(),
        currentRung,
        attemptCount: updatedTurns.filter((t) => t.role === 'user').length,
        history: updatedTurns.map((t) => ({ role: t.role, text: t.text })),
      })

      const assistantTurn: DialogueTurn = {
        role: 'assistant',
        text: res.spokenReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setTurns([...updatedTurns, assistantTurn])
      setCurrentRung(res.nextRung)
      // Haptic texture on the turn boundary: the tutor's reply arrived (F-06
      // wiring parity with the review page's grading feedback).
      hapticLight()

      if (speechEnabled) {
        setIsSpeaking(true)
        await speakText(res.spokenReply)
        setIsSpeaking(false)
      }
    } catch (err) {
      hapticWarning()
      toast({
        title: 'Tutor connection error',
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      })
    } finally {
      setIsPending(false)
    }
  }

  const triggerMic = async () => {
    if (isListening) return
    setIsListening(true)
    playChime('listen')

    try {
      const transcript = await listenForSpeech(7000)
      setIsListening(false)
      if (transcript) {
        playChime('success')
        await sendTurn(transcript)
      } else {
        toast({
          title: 'No speech recognized',
          description: 'Try speaking closer to your microphone or use the text box below.',
          tone: 'warning',
        })
      }
    } catch {
      setIsListening(false)
    }
  }

  const askForHint = () => {
    void sendTurn("I'm not completely sure, could you give me a hint?")
  }

  return (
    <div className="container max-w-3xl space-y-6 py-6">
      <PageHeader
        title="Socratic Voice Tutor"
        subtitle="Oral retrieval practice and voice dialogue guided by the 4-rung Socratic escalation ladder."
      />

      {!sessionActive ? (
        <Panel className="p-6 space-y-6">
          <Callout tone="accent" title="The Generation Effect & Oral Retrieval">
            Speaking an explanation aloud engages distinct motor and linguistic retrieval pathways
            compared to silent recognition. The Socratic ladder never gives answers away
            prematurely: it guides you step-by-step through verbal prompts.
          </Callout>

          <div className="space-y-4">
            {cardsData?.cards && cardsData.cards.length > 0 && (
              <div>
                <label className="label mb-1.5 block">
                  Ground from Your Due Deck Cards (Optional)
                </label>
                <select
                  className="input w-full"
                  value={selectedCardId ?? ''}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : null
                    setSelectedCardId(id)
                    if (id) {
                      const c = cardsData.cards.find((card) => card.id === id)
                      if (c) {
                        const front = c.front || (c.content?.front as string) || ''
                        setTopic(front.slice(0, 100))
                      }
                    }
                  }}
                >
                  <option value="">— Choose a flashcard or enter a custom topic below —</option>
                  {cardsData.cards.map((c) => {
                    const front = c.front || (c.content?.front as string) || `Card #${c.id}`
                    return (
                      <option key={c.id} value={c.id}>
                        #{c.id}: {front.slice(0, 80)}
                      </option>
                    )
                  })}
                </select>
              </div>
            )}

            <div>
              <label className="label mb-1.5 block">Examination Topic / Concept</label>
              <input
                className="input w-full"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Hebbian Learning, Central Limit Theorem, Mitosis..."
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {[
                'Active Transport',
                'Newtonian Mechanics',
                'Bayesian Probability',
                'Photosynthesis',
              ].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTopic(t)}
                  className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  {t}
                </button>
              ))}
            </div>

            <Button
              className="w-full sm:w-auto"
              onClick={() => void startSession()}
              disabled={isPending || !topic.trim()}
            >
              <Mic className="h-4 w-4 mr-1.5" />
              Begin Oral Examination
            </Button>
          </div>
        </Panel>
      ) : (
        <div className="space-y-4">
          {/* Socratic Ladder Tracker Header */}
          <Panel className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3 dark:border-(--hub-border)">
              <div>
                <span className="text-xs text-neutral-400">Exam Topic</span>
                <h2 className="text-base font-bold">{topic}</h2>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setSpeechEnabled(!speechEnabled)}
                  title={speechEnabled ? 'Mute vocal output' : 'Enable vocal output'}
                >
                  {speechEnabled ? (
                    <Volume2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <VolumeX className="h-4 w-4 text-neutral-400" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    stopSpeaking()
                    setSessionActive(false)
                    setTurns([])
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  New Topic
                </Button>
              </div>
            </div>

            {/* 4 Rungs */}
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
              {RUNGS.map((r) => {
                const isActive = currentRung === r.rung
                const isPassed = currentRung > r.rung
                return (
                  <div
                    key={r.rung}
                    className={`rounded-lg p-2 transition-colors ${
                      isActive
                        ? 'border border-indigo-500/50 bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                        : isPassed
                          ? 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                          : 'bg-neutral-50 text-neutral-400 dark:bg-neutral-900/50 dark:text-neutral-500'
                    }`}
                  >
                    <div className="text-[10px] uppercase">Rung {r.rung}</div>
                    <div className="truncate">{r.name}</div>
                  </div>
                )
              })}
            </div>
          </Panel>

          {/* Visualizer & Mic Pulse */}
          <div className="flex flex-col items-center justify-center py-4">
            <div
              className={`relative flex h-28 w-28 items-center justify-center rounded-full transition-all duration-300 ${
                isListening
                  ? 'bg-rose-500/20 ring-4 ring-rose-500 animate-pulse'
                  : isSpeaking
                    ? 'bg-emerald-500/20 ring-4 ring-emerald-500 animate-bounce'
                    : 'bg-indigo-500/10'
              }`}
            >
              <button
                type="button"
                onClick={() => void triggerMic()}
                disabled={isPending || isSpeaking}
                className={`flex h-20 w-20 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 ${
                  isListening
                    ? 'bg-rose-500 text-white'
                    : isSpeaking
                      ? 'bg-emerald-500 text-white'
                      : 'bg-indigo-600 text-white hover:bg-indigo-500'
                }`}
                title="Click to speak your answer"
              >
                {isListening ? (
                  <MicOff className="h-8 w-8 animate-pulse" />
                ) : (
                  <Mic className="h-8 w-8" />
                )}
              </button>
            </div>
            <div className="mt-2 text-xs font-medium text-neutral-500">
              {isListening
                ? 'Listening to your answer...'
                : isSpeaking
                  ? 'Tutor speaking...'
                  : 'Tap microphone to speak your answer'}
            </div>
          </div>

          {/* Transcript Scroll Area */}
          <Panel className="max-h-80 overflow-y-auto p-4 space-y-3">
            {turns.map((t, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${t.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-xs ${
                    t.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'border border-neutral-200 bg-neutral-50 text-neutral-900 dark:border-(--hub-border) dark:bg-neutral-900/60 dark:text-neutral-100'
                  }`}
                >
                  {t.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{t.text}</p>
                  ) : (
                    <Markdown>{t.text}</Markdown>
                  )}
                  <span className="mt-1 block text-[10px] opacity-70 text-right">
                    {t.timestamp}
                  </span>
                </div>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </Panel>

          {/* Fallback Text Input & Quick Actions */}
          <div className="flex items-center gap-2">
            <input
              className="input flex-1"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void sendTurn(textInput)
              }}
              placeholder="Or type your spoken answer here..."
            />
            <Button
              onClick={() => void sendTurn(textInput)}
              disabled={isPending || !textInput.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              onClick={askForHint}
              disabled={isPending || isSpeaking}
              title="Request next Socratic clue"
            >
              <HelpCircle className="h-4 w-4 mr-1 text-amber-500" />
              Hint
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function VoiceTutorPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl py-6 text-sm text-neutral-400">
          Loading Voice Tutor...
        </div>
      }
    >
      <VoiceTutorContent />
    </Suspense>
  )
}
