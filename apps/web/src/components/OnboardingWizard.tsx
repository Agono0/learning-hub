'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  Check,
  Cloud,
  GraduationCap,
  Monitor,
  Moon,
  Sparkles,
  Sun,
  Timer,
} from 'lucide-react'
import { applyThemePreference, normalizeThemePreference, type ThemePreference } from './ThemeSync'
import { apiGet, apiSend } from '@/lib/transport'
import { Button, Sheet, useToast } from '@/ui'

const DISMISSED_KEY = 'lh-onboarding-dismissed'

interface StarterOption {
  slug: string
  title: string
  tagline: string
  lessons: string
}

const STARTER_OPTIONS: StarterOption[] = [
  {
    slug: 'learning-how-to-learn',
    title: 'Learning How to Learn',
    tagline: 'Retrieval practice, FSRS-6 spacing, interleaving & metacognition.',
    lessons: '4 lessons · 12 cards',
  },
  {
    slug: 'javascript-functions',
    title: 'JavaScript Functions & Closures',
    tagline: 'Pure functions, lexical scope & array pipelines with live code drills.',
    lessons: '3 lessons · 9 cards',
  },
  {
    slug: 'sql-essentials',
    title: 'SQL Essentials for Data Thinking',
    tagline: 'SELECT/WHERE, GROUP BY aggregates & JOINs with hands-on SQL queries.',
    lessons: '3 lessons · 9 cards',
  },
]

interface OnboardingSettings {
  theme?: string
  sessionMinutes?: number
  onboardingCompleted?: boolean
  isEmptyWorkspace?: boolean
}

export function OnboardingWizard() {
  const qc = useQueryClient()
  const { toast } = useToast()
  // Hydration-safe: constant init, persisted flag loaded after mount.
  const [localDismissed, setLocalDismissed] = useState(false)

  useEffect(() => {
    try {
      setLocalDismissed(window.localStorage.getItem(DISMISSED_KEY) === '1')
    } catch {
      // ignore
    }
  }, [])

  const { data } = useQuery<{ settings: OnboardingSettings }>({
    queryKey: ['settings'],
    queryFn: () => apiGet('/api/settings'),
    staleTime: 30_000,
  })

  const s = data?.settings
  const shouldOpen =
    !localDismissed &&
    Boolean(s) &&
    s?.onboardingCompleted === false &&
    s?.isEmptyWorkspace === true

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [theme, setTheme] = useState<ThemePreference>(() =>
    normalizeThemePreference(s?.theme ?? 'dark'),
  )
  const [sessionMinutes, setSessionMinutes] = useState<number>(s?.sessionMinutes ?? 25)
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>(['learning-how-to-learn'])
  const [seedCore, setSeedCore] = useState(true)

  const markDismissedLocally = () => {
    setLocalDismissed(true)
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // ignore
    }
  }

  const skipMutation = useMutation({
    mutationFn: () =>
      apiSend('/api/settings', 'PUT', {
        onboardingCompleted: true,
      }),
    onMutate: () => {
      markDismissedLocally()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const finishMutation = useMutation({
    mutationFn: async () => {
      await apiSend('/api/settings', 'PUT', {
        theme,
        sessionMinutes,
        onboardingCompleted: true,
      })
      if (selectedSlugs.length > 0 || seedCore) {
        await apiSend('/api/starter', 'POST', {
          courseSlugs: selectedSlugs,
          seedCore,
        })
      }
    },
    onSuccess: () => {
      markDismissedLocally()
      void qc.invalidateQueries({ queryKey: ['settings'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      void qc.invalidateQueries({ queryKey: ['courses'] })
      void qc.invalidateQueries({ queryKey: ['decks'] })
      void qc.invalidateQueries({ queryKey: ['starter-catalog'] })
      toast({
        title: 'Workspace ready!',
        description:
          selectedSlugs.length > 0
            ? `Installed ${selectedSlugs.length} starter course${selectedSlugs.length > 1 ? 's' : ''}.`
            : 'Your preferences have been saved.',
        tone: 'success',
      })
    },
    onError: (e: Error) => {
      toast({ title: e.message, tone: 'danger' })
    },
  })

  if (!shouldOpen) return null

  const toggleSlug = (slug: string) => {
    setSelectedSlugs((prev) =>
      prev.includes(slug) ? prev.filter((item) => item !== slug) : [...prev, slug],
    )
  }

  return (
    <Sheet
      open={shouldOpen}
      onClose={() => skipMutation.mutate()}
      title="Welcome to Learning HUB"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => skipMutation.mutate()}
            className="btn-ghost text-xs text-neutral-500"
          >
            Skip setup
          </button>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button
                variant="ghost"
                onClick={() => setStep((prev) => (prev === 3 ? 2 : 1))}
                disabled={finishMutation.isPending}
              >
                Back
              </Button>
            )}
            {step < 3 ? (
              <Button onClick={() => setStep((prev) => (prev === 1 ? 2 : 3))}>Continue</Button>
            ) : (
              <Button onClick={() => finishMutation.mutate()} disabled={finishMutation.isPending}>
                <Sparkles className="h-4 w-4" />
                {finishMutation.isPending ? 'Setting up…' : 'Start learning'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-1.5 text-xs text-neutral-500">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                n <= step ? 'bg-indigo-600' : 'bg-neutral-200 dark:bg-(--hub-border)'
              }`}
            />
          ))}
          <span className="ml-2 tabular-nums">Step {step}/3</span>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Everything stays private on your device — spaced repetition (FSRS-6), courses, active
              reading, notes, and focus tools. Let&apos;s set your calm defaults in under a minute.
            </p>

            <div className="space-y-2">
              <div className="label">Appearance</div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: 'dark', label: 'Dark', icon: Moon },
                    { key: 'light', label: 'Light', icon: Sun },
                    { key: 'system', label: 'System', icon: Monitor },
                  ] as const
                ).map((opt) => {
                  const Icon = opt.icon
                  const active = theme === opt.key
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        setTheme(opt.key)
                        applyThemePreference(opt.key)
                      }}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-colors ${
                        active
                          ? 'border-indigo-500 bg-indigo-600/10 text-indigo-600 dark:text-indigo-300'
                          : 'border-neutral-200 hover:bg-neutral-50 dark:border-(--hub-border) dark:hover:bg-[#1a1a1f]'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="label flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5" /> Default Focus Block
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { min: 15, label: '15 min', hint: 'Quick sprint' },
                  { min: 25, label: '25 min', hint: 'Pomodoro' },
                  { min: 45, label: '45 min', hint: 'Deep work' },
                ].map((opt) => {
                  const active = sessionMinutes === opt.min
                  return (
                    <button
                      key={opt.min}
                      type="button"
                      onClick={() => setSessionMinutes(opt.min)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        active
                          ? 'border-indigo-500 bg-indigo-600/10 text-indigo-600 dark:text-indigo-300'
                          : 'border-neutral-200 hover:bg-neutral-50 dark:border-(--hub-border) dark:hover:bg-[#1a1a1f]'
                      }`}
                    >
                      <div className="text-sm font-semibold">{opt.label}</div>
                      <div className="text-[11px] text-neutral-500">{opt.hint}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Pick optional starter courses so you can try lessons, exercises, and FSRS flashcards
              right away (100% offline, removable anytime).
            </p>
            <div className="space-y-2">
              {STARTER_OPTIONS.map((course) => {
                const checked = selectedSlugs.includes(course.slug)
                return (
                  <button
                    key={course.slug}
                    type="button"
                    onClick={() => toggleSlug(course.slug)}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                      checked
                        ? 'border-indigo-500 bg-indigo-600/10'
                        : 'border-neutral-200 hover:bg-neutral-50 dark:border-(--hub-border) dark:hover:bg-[#1a1a1f]'
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
                        checked
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-neutral-300 dark:border-neutral-600'
                      }`}
                    >
                      {checked && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="text-sm font-medium">{course.title}</span>
                        <span className="text-[11px] text-neutral-500">{course.lessons}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-500">{course.tagline}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-neutral-200 px-3 py-2.5 text-xs dark:border-(--hub-border)">
              <input
                type="checkbox"
                checked={seedCore}
                onChange={(e) => setSeedCore(e.target.checked)}
                className="accent-indigo-600"
              />
              <span>
                Load <strong>70+ curated study quotes</strong> &amp;{' '}
                <strong>Major/PAO memory tables</strong>
              </span>
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              You&apos;re all set! Learning HUB never requires a subscription or server account:
            </p>
            <div className="space-y-2.5">
              <div className="rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border)">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <GraduationCap className="h-4 w-4 text-indigo-500" />
                  AI is optional (Manual Mode + Free Tiers built in)
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  Use copy/paste prompts with any chat AI for free, or connect Google Gemini, Groq,
                  OpenRouter, or local Ollama in{' '}
                  <Link
                    href="/settings"
                    onClick={() => skipMutation.mutate()}
                    className="text-indigo-500 underline"
                  >
                    Settings
                  </Link>
                  .
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border)">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Cloud className="h-4 w-4 text-indigo-500" />
                  Free E2EE Multi-Device Sync
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  Sync non-destructively across Windows, Android, and Web via Dropbox, GitHub Gist,
                  Google Drive, or WebDAV in{' '}
                  <Link
                    href="/backup"
                    onClick={() => skipMutation.mutate()}
                    className="text-indigo-500 underline"
                  >
                    Backup &amp; Sync
                  </Link>
                  .
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border)">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <BookOpen className="h-4 w-4 text-indigo-500" />
                  Tip: Press{' '}
                  <kbd className="rounded bg-neutral-200 px-1.5 py-0.5 text-[11px] dark:bg-(--hub-border)">
                    ⌘K
                  </kbd>{' '}
                  anytime
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  Search instantly across all notes, cards, lessons, highlights, and pages.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}
