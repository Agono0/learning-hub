'use client'

/**
 * Universal Multi-Modal Ingest — turn a lecture transcript, a paper or source code
 * into review cards.
 *
 * Generation is a preview (nothing is stored); "Save to deck" sends the kept cards
 * through the normal validated bulk path (`PUT /api/cards?bulk=1`), so ingested
 * cards obey the same content rules as hand-made ones.
 * No raw fetch: uses apiGet/apiSend from @/lib/transport.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, Code2, FileText, Save, Sparkles, Video } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { Button, Callout, PageHeader, Panel, SelectField, Tabs, TextArea, TextField } from '@/ui'

type Media = 'youtube' | 'pdf' | 'code'

interface IngestedCard {
  front: string
  back: string
  format: string
  sourceReference?: string
}

interface IngestResponse {
  ok: boolean
  cardCount: number
  segmentCount?: number
  cards: IngestedCard[]
  items: Array<{ type: string; content: unknown }>
}

const KIND: Record<Media, 'youtube_transcript' | 'academic_paper' | 'code_files'> = {
  youtube: 'youtube_transcript',
  pdf: 'academic_paper',
  code: 'code_files',
}

const PLACEHOLDER: Record<Media, string> = {
  youtube: '00:01:15.000\nThis is where we introduce gradient descent…',
  pdf: 'Definition 1.1: An invariant subspace is …\n$$E = mc^2$$',
  code: 'export function velocity(distance: number, time: number) {\n  return distance / time\n}',
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')

export default function UniversalIngestPage() {
  const [media, setMedia] = useState<Media>('youtube')
  const [title, setTitle] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [filename, setFilename] = useState('main.ts')
  const [rawText, setRawText] = useState('')
  const [deckId, setDeckId] = useState<number | ''>('')

  const decks = useQuery<{ decks: Array<{ id: number; name: string }> }>({
    queryKey: ['decks-for-ingest'],
    queryFn: () => apiGet('/api/decks'),
  })
  useEffect(() => {
    if (deckId === '' && decks.data?.decks[0]) setDeckId(decks.data.decks[0].id)
  }, [decks.data, deckId])

  const ingest = useMutation({
    mutationFn: () =>
      apiSend<IngestResponse>('/api/ingest/multimodal', 'POST', {
        kind: KIND[media],
        rawContent: rawText,
        title: title.trim() || 'Ingested Source',
        sourceUrl: media === 'youtube' && sourceUrl.trim() ? sourceUrl.trim() : undefined,
        filename: media === 'code' ? filename.trim() || 'main.ts' : undefined,
      }),
  })

  const save = useMutation({
    mutationFn: (items: IngestResponse['items']) =>
      apiSend<{ ok?: boolean; created: number; cardIds: number[]; rejected: unknown[] }>(
        '/api/cards?bulk=1',
        'PUT',
        {
          deckId: Number(deckId),
          items: items.map((i) => ({ ...i, tags: ['ingest', media], source: 'ingest' })),
        },
      ),
  })

  const switchMedia = (m: Media) => {
    setMedia(m)
    ingest.reset()
    save.reset()
  }

  const result = ingest.data
  const urlInvalid =
    media === 'youtube' && sourceUrl.trim() !== '' && !/^https?:\/\//i.test(sourceUrl.trim())

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <PageHeader
        title="Universal Ingest"
        subtitle="Turn a lecture transcript, a paper or source code into review cards. Preview first, then save the cards to a deck."
        icon={<Sparkles className="h-5 w-5" />}
      />

      <Tabs
        label="Source type"
        value={media}
        onChange={switchMedia}
        items={[
          { key: 'youtube', label: 'Lecture transcript', icon: <Video className="h-4 w-4" /> },
          { key: 'pdf', label: 'Paper', icon: <FileText className="h-4 w-4" /> },
          { key: 'code', label: 'Code', icon: <Code2 className="h-4 w-4" /> },
        ]}
      />

      <Panel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label="Title"
            value={title}
            maxLength={200}
            placeholder={media === 'code' ? 'e.g. Physics helpers' : 'e.g. CS229 Lecture 1'}
            onChange={(e) => setTitle(e.target.value)}
          />
          {media === 'youtube' ? (
            <TextField
              label="Video URL (optional)"
              hint="Cards link back to the exact moment."
              type="url"
              value={sourceUrl}
              error={urlInvalid ? 'Use an http(s) link' : undefined}
              placeholder="https://youtube.com/watch?v=…"
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          ) : media === 'code' ? (
            <TextField
              label="File name"
              hint="Sets the code language of the cards."
              value={filename}
              maxLength={200}
              onChange={(e) => setFilename(e.target.value)}
            />
          ) : null}
        </div>
        <TextArea
          label={
            media === 'youtube'
              ? 'Transcript (VTT, SRT or timestamped lines)'
              : media === 'pdf'
                ? 'Paper text'
                : 'Source code'
          }
          className="font-mono"
          value={rawText}
          rows={8}
          placeholder={PLACEHOLDER[media]}
          onChange={(e) => setRawText(e.target.value)}
        />
        <Button
          className="w-full"
          icon={<Sparkles className="h-4 w-4" />}
          loading={ingest.isPending}
          disabled={rawText.trim().length < 10 || urlInvalid}
          onClick={() => {
            save.reset()
            ingest.mutate()
          }}
        >
          Generate cards
        </Button>
        {ingest.isError ? <p className="text-xs text-rose-600">{errorText(ingest.error)}</p> : null}
      </Panel>

      {result ? (
        result.cards.length === 0 ? (
          <Callout tone="warning" title="No cards found">
            {media === 'youtube'
              ? 'Put each timestamp on its own line, followed by what was said.'
              : media === 'pdf'
                ? 'Cards come from $$display equations$$ and lines starting with “Definition”, “Theorem”, “Lemma”…'
                : 'Cards come from declarations: function, class, interface, type, enum, const, let, def.'}
          </Callout>
        ) : (
          <Panel title={`Preview (${result.cards.length} cards)`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <SelectField
                label="Save to deck"
                className="flex-1"
                value={deckId}
                onChange={(e) => setDeckId(e.target.value ? Number(e.target.value) : '')}
              >
                {(decks.data?.decks ?? []).length === 0 ? (
                  <option value="">No decks yet</option>
                ) : null}
                {(decks.data?.decks ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </SelectField>
              <Button
                icon={<Save className="h-4 w-4" />}
                loading={save.isPending}
                disabled={deckId === '' || save.isSuccess}
                onClick={() => save.mutate(result.items)}
              >
                Save {result.cards.length} cards
              </Button>
            </div>
            {save.isError ? <p className="text-xs text-rose-600">{errorText(save.error)}</p> : null}
            {save.data ? (
              <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                {save.data.created} cards saved — they are in your review queue now.
                {save.data.rejected.length > 0
                  ? ` ${save.data.rejected.length} skipped (invalid content).`
                  : ''}
              </p>
            ) : null}
            <ul className="space-y-2">
              {result.cards.map((card, idx) => (
                <li
                  key={idx}
                  className="space-y-2 rounded-xl border border-neutral-200 p-3 text-xs dark:border-(--hub-border)"
                >
                  <div className="whitespace-pre-wrap break-words font-medium">{card.front}</div>
                  <div className="whitespace-pre-wrap break-words rounded-lg bg-emerald-600/10 p-2 font-mono text-emerald-700 dark:text-emerald-300">
                    {card.back}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )
      ) : null}
    </div>
  )
}
