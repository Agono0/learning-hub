'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Quote, Search, Star } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { Button, Callout, EmptyState, IconButton, PageHeader, Skeleton } from '@/ui'
import { ClayIn, Stagger, StaggerItem } from '@/lib/motion'
import { ChipPicker } from '@/components/ui/chip-picker'
import { SectionHeader } from '@/components/ui/section-header'
import { useGsapReveal } from '@/lib/useGsapReveal'

interface QuoteRow {
  id: number
  text: string
  author: string
  context: string | null
  tags: string[]
  favorite: boolean
  isUserAdded: boolean
}

const TAGS = ['discipline', 'learning', 'persistence', 'focus', 'mastery', 'curiosity'] as const

export default function QuotesPage() {
  const qc = useQueryClient()
  const [tag, setTag] = useState<string | 'all'>('all')
  const [search, setSearch] = useState('')
  const [showFavorites, setShowFavorites] = useState(false)
  const [form, setForm] = useState({ text: '', author: '', context: '', tags: '' })

  const daily = useQuery({
    queryKey: ['quotes', 'daily'],
    queryFn: () => apiGet<{ quote: QuoteRow | null; date: string }>('/api/quotes?mode=daily'),
  })
  const all = useQuery({
    queryKey: ['quotes', 'all'],
    queryFn: () => apiGet<{ quotes: QuoteRow[] }>('/api/quotes?mode=all'),
  })

  const addQuote = useMutation({
    mutationFn: () =>
      apiSend('/api/quotes', 'POST', {
        ...form,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      setForm({ text: '', author: '', context: '', tags: '' })
      void qc.invalidateQueries({ queryKey: ['quotes'] })
    },
  })

  const toggleFavorite = useMutation({
    mutationFn: (q: QuoteRow) =>
      apiSend('/api/quotes', 'PATCH', { id: q.id, favorite: !q.favorite }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['quotes'] }),
  })

  const filtered = useMemo(() => {
    const rows = all.data?.quotes ?? []
    return rows.filter((q) => {
      if (showFavorites && !q.favorite) return false
      if (tag !== 'all' && !(q.tags ?? []).includes(tag)) return false
      if (search && !`${q.text} ${q.author}`.toLowerCase().includes(search.toLowerCase()))
        return false
      return true
    })
  }, [all.data, tag, search, showFavorites])

  // GSAP reveal (per-page motion mandate): the daily-quote hero's lines rise in
  // on scroll — motionOK-gated; SSR/tests keep the static content.
  const heroRef = useGsapReveal<HTMLDivElement>()

  return (
    <ClayIn as="div" className="space-y-5">
      <PageHeader
        icon={<Quote className="h-6 w-6 text-indigo-400" />}
        title="Quotes"
        subtitle="One a day, with the history of who said it and why it survived."
      />

      {/* daily quote hero */}
      <div ref={heroRef} className="panel border-indigo-500/30 text-center">
        {daily.isLoading ? (
          <Skeleton className="mx-auto h-24 w-full max-w-md" />
        ) : daily.data?.quote ? (
          <>
            <p className="text-lg font-medium leading-relaxed text-strong">
              “{daily.data.quote.text}”
            </p>
            <p className="mt-3 text-sm text-indigo-300">— {daily.data.quote.author}</p>
            {daily.data.quote.context && (
              <p className="mt-1 text-xs text-tertiary">{daily.data.quote.context}</p>
            )}
            <p className="mt-2 text-xs uppercase tracking-widest text-faint">
              quote of the day · {daily.data.date} · stable all day
            </p>
          </>
        ) : (
          <p className="text-sm text-tertiary">
            No quotes yet — run <code>npm run db:seed</code> or add one below.
          </p>
        )}
      </div>

      {/* add quote */}
      <div className="panel space-y-2">
        <SectionHeader icon={Plus} title="Add your own" />
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="input sm:col-span-2"
            placeholder="The quote"
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
          />
          <input
            className="input"
            placeholder="Author"
            value={form.author}
            onChange={(e) => setForm({ ...form, author: e.target.value })}
          />
          <input
            className="input"
            placeholder="Context (where/when/why)"
            value={form.context}
            onChange={(e) => setForm({ ...form, context: e.target.value })}
          />
          <input
            className="input sm:col-span-2"
            placeholder="Tags (comma-separated: focus, discipline…)"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
          />
        </div>
        <Button
          variant="primary"
          onClick={() => addQuote.mutate()}
          disabled={
            addQuote.isPending || form.text.trim().length < 3 || form.author.trim().length < 2
          }
        >
          Save quote
        </Button>
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-tertiary" />
          <input
            className="input w-56 pl-8"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          aria-pressed={showFavorites}
          className={`ml-auto inline-flex min-h-11 items-center rounded-full px-3 text-xs font-medium transition-colors [@media(pointer:coarse)]:min-h-11 ${
            showFavorites
              ? 'bg-amber-500/20 text-status-warning-text ring-2 ring-(--ac-strong)'
              : 'text-tertiary hover:text-body'
          }`}
          onClick={() => setShowFavorites((v) => !v)}
        >
          <Star className="mr-1 inline h-3.5 w-3.5" /> favorites
        </button>
      </div>
      <ChipPicker
        label="Filter quotes by tag"
        items={[{ value: 'all', label: 'All' }, ...TAGS.map((t) => ({ value: t, label: t }))]}
        value={tag}
        onChange={setTag}
      />

      {/* library grid */}
      {all.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : all.isError ? (
        <Callout tone="danger" title="Couldn't load your quote library">
          {(all.error as Error | null)?.message ?? 'Please try again in a moment.'}
        </Callout>
      ) : (
        <Stagger className="grid gap-3 sm:grid-cols-2">
          {filtered.map((q) => (
            <StaggerItem key={q.id} className="panel flex flex-col justify-between gap-2">
              <p className="text-sm leading-relaxed text-body">“{q.text}”</p>
              <div>
                <p className="text-xs text-indigo-300">
                  — {q.author}
                  {q.isUserAdded ? ' (yours)' : ''}
                </p>
                {q.context && <p className="text-xs text-tertiary">{q.context}</p>}
                <div className="mt-1 flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    {(q.tags ?? []).map((t) => (
                      <span
                        key={t}
                        className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs text-secondary dark:bg-(--hub-panel-2) dark:text-faint"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <IconButton label="favorite" onClick={() => toggleFavorite.mutate(q)}>
                    <Star
                      className={`h-4 w-4 ${q.favorite ? 'fill-amber-400 text-status-warning-text' : 'text-faint'}`}
                    />
                  </IconButton>
                </div>
              </div>
            </StaggerItem>
          ))}
          {all.data && filtered.length === 0 && (
            <div className="sm:col-span-2">
              <EmptyState icon={<Quote className="h-6 w-6" aria-hidden />} title="Nothing matches">
                No quotes match the current filters — clear the search, tag or favorites toggle.
              </EmptyState>
            </div>
          )}
        </Stagger>
      )}
    </ClayIn>
  )
}
