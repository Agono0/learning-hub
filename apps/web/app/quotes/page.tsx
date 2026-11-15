'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Quote, Search, Star } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { PageHeader } from '@/ui'

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

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Quote className="h-6 w-6 text-indigo-400" />}
        title="Quotes"
        subtitle="One a day, with the history of who said it and why it survived."
      />

      {/* daily quote hero */}
      <div className="panel border-indigo-500/30 text-center">
        {daily.data?.quote ? (
          <>
            <p className="text-lg font-medium leading-relaxed text-neutral-100">
              “{daily.data.quote.text}”
            </p>
            <p className="mt-3 text-sm text-indigo-300">— {daily.data.quote.author}</p>
            {daily.data.quote.context && (
              <p className="mt-1 text-xs text-neutral-500">{daily.data.quote.context}</p>
            )}
            <p className="mt-2 text-[10px] uppercase tracking-widest text-neutral-600">
              quote of the day · {daily.data.date} · stable all day
            </p>
          </>
        ) : (
          <p className="text-sm text-neutral-500">
            No quotes yet — run <code>npm run db:seed</code> or add one below.
          </p>
        )}
      </div>

      {/* add quote */}
      <div className="panel space-y-2">
        <p className="label flex items-center gap-2">
          <Plus className="h-3.5 w-3.5" /> Add your own
        </p>
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
        <button
          className="btn"
          onClick={() => addQuote.mutate()}
          disabled={
            addQuote.isPending || form.text.trim().length < 3 || form.author.trim().length < 2
          }
        >
          Save quote
        </button>
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-500" />
          <input
            className="input w-56 pl-8"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          className={`rounded-full px-3 py-1 text-xs ${tag === 'all' ? 'bg-indigo-600 text-white' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-[#1e1e23]'}`}
          onClick={() => setTag('all')}
        >
          all
        </button>
        {TAGS.map((t) => (
          <button
            key={t}
            className={`rounded-full px-3 py-1 text-xs ${tag === t ? 'bg-indigo-600 text-white' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-[#1e1e23]'}`}
            onClick={() => setTag(t)}
          >
            {t}
          </button>
        ))}
        <button
          className={`ml-auto rounded-full px-3 py-1 text-xs ${showFavorites ? 'bg-amber-500/20 text-amber-400' : 'text-neutral-500'}`}
          onClick={() => setShowFavorites((v) => !v)}
        >
          <Star className="mr-1 inline h-3.5 w-3.5" /> favorites
        </button>
      </div>

      {/* library grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((q) => (
          <div key={q.id} className="panel flex flex-col justify-between gap-2">
            <p className="text-sm leading-relaxed text-neutral-200">“{q.text}”</p>
            <div>
              <p className="text-xs text-indigo-300">
                — {q.author}
                {q.isUserAdded ? ' (yours)' : ''}
              </p>
              {q.context && <p className="text-[11px] text-neutral-500">{q.context}</p>}
              <div className="mt-1 flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {(q.tags ?? []).map((t) => (
                    <span
                      key={t}
                      className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:bg-(--hub-panel-2) dark:text-neutral-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <button onClick={() => toggleFavorite.mutate(q)} aria-label="favorite">
                  <Star
                    className={`h-4 w-4 ${q.favorite ? 'fill-amber-400 text-amber-400' : 'text-neutral-600'}`}
                  />
                </button>
              </div>
            </div>
          </div>
        ))}
        {all.data && filtered.length === 0 && (
          <p className="text-sm text-neutral-500">Nothing matches — clear the filters.</p>
        )}
      </div>
    </div>
  )
}
