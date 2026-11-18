'use client'

/**
 * ⌘K / Ctrl+K command palette (M5): jump to any page, run quick actions, and
 * full-text search across all 17 knowledge surfaces (FTS5 via /api/search,
 * with an honest "no results" state and the engine mode surfaced per group).
 * Recent searches are device-local (capped at 5, clearable) — loaded only
 * after mount so SSR never reads localStorage. Mounted once in the AppShell.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import {
  BellRing,
  Box,
  Boxes,
  FileCheck,
  Headphones,
  History,
  LockKeyhole,
  Mic,
  Moon,
  Radar,
  Repeat as ReviewIcon,
  Search as SearchIcon,
  Sparkles,
  Timer,
  X,
  Zap,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { NAV } from './nav'
import { apiGet } from '@/lib/transport'
import { clearRecentSearches, getRecentSearches, rememberSearch } from '@/lib/recent-searches'
import { SEARCH_KIND_LABELS, type SearchHitKind } from '@/lib/search-kinds'

interface SearchHit {
  kind: SearchHitKind
  id: number
  title: string
  snippet: string
  href: string
}

const KIND_LABEL = SEARCH_KIND_LABELS

const OPEN_PALETTE_EVENT = 'lh:open-command-palette'

/** Open the global ⌘K command palette from any button (mobile/tablet/sidebar). */
export function openCommandPalette(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT))
  }
}

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [recents, setRecents] = useState<string[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toggle = useCallback(() => setOpen((o) => !o), [])

  // global shortcut + imperative button trigger
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggle()
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen)
    }
  }, [toggle])

  // debounce the search query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebounced(query.trim()), 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // Recent searches are device-local (localStorage): never read during render —
  // load after mount / each open so SSR and the first pass stay honest ([]).
  useEffect(() => {
    if (open) setRecents(getRecentSearches())
  }, [open])

  const { data: contributions } = useQuery<{
    paletteActions: Array<{ id: string; label: string; href?: string; hud?: string }>
  }>({
    queryKey: ['plugin-contributions'],
    queryFn: () => apiGet('/api/plugins/contributions'),
    staleTime: 60_000,
  })
  const paletteActions = contributions?.paletteActions

  const { data, isFetching } = useQuery<{ hits: SearchHit[]; mode: 'fts5' | 'like' }>({
    queryKey: ['search', debounced],
    queryFn: () => apiGet(`/api/search?q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.length > 0,
  })

  const go = (href: string) => {
    setOpen(false)
    setQuery('')
    setDebounced('')
    router.push(href)
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Global command palette"
      className="fixed inset-0 z-[60]"
      shouldFilter={false} // server-side search; nav items filtered by cmdk is redundant here
    >
      <div className="fixed inset-0 bg-black/50" onMouseDown={() => setOpen(false)} aria-hidden />
      <div className="fixed inset-x-4 top-[12dvh] mx-auto max-w-xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-(--hub-border) dark:bg-(--hub-panel)">
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Search or jump to… (⌘K)"
          className="w-full border-b border-neutral-200 bg-transparent px-4 py-3 text-sm outline-none dark:border-(--hub-border)"
        />
        <Command.List className="max-h-[50dvh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-tertiary">
            {isFetching ? 'Searching…' : debounced ? 'No matches — try fewer words.' : null}
          </Command.Empty>

          {debounced && (
            <Command.Group
              heading={
                <span className="px-2 text-[10px] uppercase tracking-widest text-faint">
                  Search
                </span>
              }
            >
              <Command.Item
                value={`search everything ${debounced}`}
                onSelect={() => {
                  setRecents(rememberSearch(debounced))
                  go(`/search?q=${encodeURIComponent(debounced)}`)
                }}
                className="cursor-pointer rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-indigo-600/10 data-[selected=true]:text-indigo-600 dark:data-[selected=true]:text-indigo-300"
              >
                <SearchIcon className="h-4 w-4 shrink-0 text-faint" />
                Search everything for “{debounced}”
              </Command.Item>
            </Command.Group>
          )}

          {(data?.hits.length ?? 0) > 0 && (
            <Command.Group
              heading={
                <span className="px-2 text-[10px] uppercase tracking-widest text-faint">
                  Results · {data!.mode === 'fts5' ? 'full-text' : 'substring'}
                </span>
              }
            >
              {data!.hits.map((hit) => (
                <Command.Item
                  key={`${hit.kind}-${hit.id}`}
                  value={`${KIND_LABEL[hit.kind]} ${hit.title} ${hit.snippet}`}
                  onSelect={() => {
                    setRecents(rememberSearch(debounced))
                    go(hit.href)
                  }}
                  className="cursor-pointer rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-indigo-600/10 data-[selected=true]:text-indigo-600 dark:data-[selected=true]:text-indigo-300"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{hit.title}</span>
                    {hit.snippet && hit.snippet !== hit.title && (
                      <span className="block truncate text-xs text-tertiary">{hit.snippet}</span>
                    )}
                  </span>
                  <span className="ml-2 shrink-0 text-[10px] uppercase text-faint">
                    {KIND_LABEL[hit.kind]}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {debounced.length === 0 && recents.length > 0 && (
            <Command.Group
              heading={
                <span className="px-2 text-[10px] uppercase tracking-widest text-faint">
                  Recent
                </span>
              }
            >
              {recents.map((q, i) => (
                <Command.Item
                  key={`recent-${i}-${q}`}
                  value={`recent search ${q}`}
                  onSelect={() => {
                    setRecents(rememberSearch(q))
                    go(`/search?q=${encodeURIComponent(q)}`)
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-indigo-600/10 data-[selected=true]:text-indigo-600 dark:data-[selected=true]:text-indigo-300"
                >
                  <History className="h-4 w-4 shrink-0 text-faint" />
                  <span className="min-w-0 flex-1 truncate">{q}</span>
                </Command.Item>
              ))}
              <Command.Item
                value="clear recent searches"
                onSelect={() => {
                  clearRecentSearches()
                  setRecents([])
                }}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-tertiary data-[selected=true]:bg-indigo-600/10 data-[selected=true]:text-indigo-600 dark:data-[selected=true]:text-indigo-300"
              >
                <X className="h-3 w-3 shrink-0" /> Clear recents
              </Command.Item>
            </Command.Group>
          )}

          {debounced.length === 0 && (
            <Command.Group
              heading={
                <span className="px-2 text-[10px] uppercase tracking-widest text-faint">
                  Actions
                </span>
              }
            >
              <Command.Item
                value="action start review session"
                onSelect={() => go('/review')}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-indigo-600/10 data-[selected=true]:text-indigo-600 dark:data-[selected=true]:text-indigo-300"
              >
                <ReviewIcon className="h-4 w-4 shrink-0 text-faint" /> Start a review session
              </Command.Item>
              <Command.Item
                value="action start focus session"
                onSelect={() => go('/focus')}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-indigo-600/10 data-[selected=true]:text-indigo-600 dark:data-[selected=true]:text-indigo-300"
              >
                <Timer className="h-4 w-4 shrink-0 text-faint" /> Start a focus session
              </Command.Item>
              <Command.Item
                value="action capture a thought quick hud"
                onSelect={() => {
                  setOpen(false)
                  window.dispatchEvent(new Event('toggle-quick-hud'))
                }}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-indigo-600/10 data-[selected=true]:text-indigo-600 dark:data-[selected=true]:text-indigo-300"
              >
                <Zap className="h-4 w-4 shrink-0 text-faint" /> Capture a thought (HUD)
              </Command.Item>
              <Command.Item
                value="action start commute audio hands free"
                onSelect={() => go('/audio-commute')}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-indigo-600/10 data-[selected=true]:text-indigo-600 dark:data-[selected=true]:text-indigo-300"
              >
                <Headphones className="h-4 w-4 shrink-0 text-faint" /> Start Commute Audio
              </Command.Item>
              <Command.Item
                value="action start sleep targeted memory reactivation tmr"
                onSelect={() => go('/sleep-tmr')}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-indigo-600/10 data-[selected=true]:text-indigo-600 dark:data-[selected=true]:text-indigo-300"
              >
                <Moon className="h-4 w-4 shrink-0 text-faint" /> Start Sleep TMR
              </Command.Item>
              <Command.Item
                value="action enter 3d memory palace loci"
                onSelect={() => go('/palace-3d')}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-indigo-600/10 data-[selected=true]:text-indigo-600 dark:data-[selected=true]:text-indigo-300"
              >
                <Box className="h-4 w-4 shrink-0 text-faint" /> Enter 3D Memory Palace
              </Command.Item>
              <Command.Item
                value="action view knowledge constellation galaxy"
                onSelect={() => go('/constellation')}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-indigo-600/10 data-[selected=true]:text-indigo-600 dark:data-[selected=true]:text-indigo-300"
              >
                <Sparkles className="h-4 w-4 shrink-0 text-faint" /> Open Knowledge Constellation
              </Command.Item>
              <Command.Item
                value="action start socratic voice tutor oral exam"
                onSelect={() => go('/voice-tutor')}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-indigo-600/10 data-[selected=true]:text-indigo-600 dark:data-[selected=true]:text-indigo-300"
              >
                <Mic className="h-4 w-4 shrink-0 text-faint" /> Start Socratic Voice Tutor
              </Command.Item>
              <Command.Item
                value="action take timed mock exam simulator"
                onSelect={() => go('/exam-sim')}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-indigo-600/10 data-[selected=true]:text-indigo-600 dark:data-[selected=true]:text-indigo-300"
              >
                <FileCheck className="h-4 w-4 shrink-0 text-faint" /> Take Timed Mock Exam
              </Command.Item>
              <Command.Item
                value="action open weakness radar v2 confusion pairs"
                onSelect={() => go('/weakness')}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-indigo-600/10 data-[selected=true]:text-indigo-600 dark:data-[selected=true]:text-indigo-300"
              >
                <Radar className="h-4 w-4 shrink-0 text-faint" /> Open Weakness Radar v2
              </Command.Item>
              <Command.Item
                value="action open notification center inbox alerts"
                onSelect={() => go('/notifications')}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-indigo-600/10 data-[selected=true]:text-indigo-600 dark:data-[selected=true]:text-indigo-300"
              >
                <BellRing className="h-4 w-4 shrink-0 text-faint" /> Open Notification Center
              </Command.Item>
              <Command.Item
                value="action open permission center access"
                onSelect={() => go('/permissions')}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-indigo-600/10 data-[selected=true]:text-indigo-600 dark:data-[selected=true]:text-indigo-300"
              >
                <LockKeyhole className="h-4 w-4 shrink-0 text-faint" /> Open Permission Center
              </Command.Item>
              <Command.Item
                value="action browse all decks library"
                onSelect={() => go('/decks')}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-indigo-600/10 data-[selected=true]:text-indigo-600 dark:data-[selected=true]:text-indigo-300"
              >
                <Boxes className="h-4 w-4 shrink-0 text-faint" /> Browse all decks
              </Command.Item>
              {(paletteActions ?? []).map((a) => (
                <Command.Item
                  key={a.id}
                  value={`action plugin ${a.label}`}
                  onSelect={() => {
                    if (a.href) go(a.href)
                    else if (a.hud) {
                      setOpen(false)
                      window.dispatchEvent(new Event('toggle-quick-hud'))
                    }
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-indigo-600/10 data-[selected=true]:text-indigo-600 dark:data-[selected=true]:text-indigo-300"
                >
                  <Zap className="h-4 w-4 shrink-0 text-faint" /> {a.label}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {NAV.map((section) => (
            <Command.Group
              key={section.group}
              heading={
                <span className="px-2 text-[10px] uppercase tracking-widest text-faint">
                  {section.group}
                </span>
              }
            >
              {section.items.map((item) => {
                const Icon = item.icon
                return (
                  <Command.Item
                    key={item.href}
                    value={`${item.label} ${section.group}`}
                    onSelect={() => go(item.href)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-indigo-600/10 data-[selected=true]:text-indigo-600 dark:data-[selected=true]:text-indigo-300"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-faint" />
                    {item.label}
                  </Command.Item>
                )
              })}
            </Command.Group>
          ))}
        </Command.List>
      </div>
    </Command.Dialog>
  )
}
