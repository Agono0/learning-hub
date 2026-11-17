'use client'

/**
 * Card miner sheet (M5): free text (note content, a highlight, pasted
 * material) → cloze card drafts, previewed and saved to a deck of the
 * learner's choice. AI when configured, the manual sentence-mining heuristic
 * otherwise — the fallback is automatic and labeled honestly.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pickaxe, Sparkles } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { Button, Sheet } from '@/ui'

interface Draft {
  sentence: string
  answer: string
  text: string
}
interface DeckInfo {
  id: number
  name: string
}

export function CardMinerSheet({
  open,
  initialText,
  onClose,
}: {
  open: boolean
  /** text to mine; empty → the sheet shows a paste area */
  initialText: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [text, setText] = useState(initialText)
  const [deckId, setDeckId] = useState<number | ''>('')
  const [picked, setPicked] = useState<Record<number, boolean>>({})

  useEffect(() => {
    if (open) {
      setText(initialText)
      setPicked({})
    }
  }, [open, initialText])

  const { data: decksData } = useQuery<{ decks: DeckInfo[] }>({
    queryKey: ['decks'],
    queryFn: () => apiGet<{ decks: DeckInfo[] }>('/api/decks'),
    enabled: open,
  })

  const mine = useMutation({
    mutationFn: (mode: 'ai' | 'manual') =>
      apiSend<{ ok: boolean; usedAI: boolean; needsSetup?: boolean; drafts: Draft[] }>(
        '/api/cards/from-text',
        'POST',
        { text, mode },
      ),
  })
  const save = useMutation({
    mutationFn: async (drafts: Draft[]) => {
      let saved = 0
      for (const d of drafts) {
        // buildCloze-equivalent: the draft text already carries {{c1::answer}}
        await apiSend('/api/cards', 'POST', {
          deckId,
          type: 'cloze',
          content: { cloze: { text: d.text, answers: [d.answer], mode: 'basic' } },
          source: 'mined',
        })
        saved += 1
      }
      return saved
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['decks'] })
      void qc.invalidateQueries({ queryKey: ['cards'] })
      onClose()
    },
  })

  const drafts = mine.data?.drafts ?? []
  const chosen = drafts.filter((_, i) => picked[i])

  return (
    <Sheet open={open} onClose={onClose} title="Mine cards from text">
      <div className="space-y-3">
        <textarea
          className="input min-h-[120px] font-mono text-xs"
          placeholder="Paste or edit the text to mine — sentences become cloze cards."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            icon={<Sparkles className="h-4 w-4" />}
            onClick={() => mine.mutate('ai')}
            disabled={!text.trim() || mine.isPending}
          >
            Suggest with AI
          </Button>
          <Button
            variant="ghost"
            icon={<Pickaxe className="h-4 w-4" />}
            onClick={() => mine.mutate('manual')}
            disabled={!text.trim() || mine.isPending}
          >
            Heuristic (no AI)
          </Button>
        </div>
        {mine.data && !mine.data.usedAI && (
          <p className="text-xs text-status-warning-text">
            {mine.data.needsSetup
              ? 'No AI provider configured — showing heuristic deletions (longest meaningful word).'
              : 'Heuristic deletions (longest meaningful word per sentence).'}
          </p>
        )}

        {drafts.length > 0 && (
          <div className="space-y-1.5">
            {drafts.map((d, i) => (
              <label
                key={i}
                className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-(--hub-panel-2)"
              >
                <input
                  type="checkbox"
                  className="mt-1 accent-indigo-500"
                  checked={picked[i] ?? true}
                  onChange={(e) => setPicked((p) => ({ ...p, [i]: e.target.checked }))}
                />
                <span className="min-w-0 flex-1">
                  {d.sentence}
                  <span className="block text-xs text-indigo-400">answer: {d.answer}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input w-52"
            value={deckId}
            onChange={(e) => setDeckId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Save to deck…</option>
            {(decksData?.decks ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <Button
            onClick={() => save.mutate(chosen)}
            disabled={deckId === '' || chosen.length === 0 || save.isPending}
          >
            Save {chosen.length || ''} card{chosen.length === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
