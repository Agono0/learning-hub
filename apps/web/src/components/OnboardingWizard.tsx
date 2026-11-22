'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  Check,
  Cloud,
  FileUp,
  GraduationCap,
  Monitor,
  Moon,
  Sparkles,
  Sun,
  Timer,
} from 'lucide-react'
import {
  applyProfile,
  deriveProfile,
  knobsToRecord,
  LEARNER_PRESETS,
  PROFILE_QUESTIONS,
  profileFromPreset,
  type LearnerProfile,
  type ProfileKnobChange,
} from '@learning-hub/core/learner-profile'
import { applyThemePreference, normalizeThemePreference, type ThemePreference } from './ThemeSync'
import { SpFirstRunStep } from './onboarding/SpFirstRunStep'
import { apiGet, apiSend } from '@/lib/transport'
import { Button, Sheet, useToast } from '@/ui'
import { queryKeys } from '@/lib/query-keys'

const DISMISSED_KEY = 'lh-onboarding-dismissed'

/**
 * localStorage record for the dashboard's undo banner (ProfileTunedBanner):
 * what the applied profile changed, the named archetype, and the knob values
 * to restore on Undo. Written here (onboarding finish) and by the Settings
 * "Switch preset" flow; the shape must stay in sync across both writers.
 */
interface ProfileAppliedRecord {
  changes: ProfileKnobChange[]
  archetypeLabel: string
  previous: { sessionMinutes: number; desiredRetention: number }
}

const PROFILE_APPLIED_KEY = 'lh-profile-applied'

/** Reads a File as base64 (chunked to avoid call-stack limits on big .apkg). */
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

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
  desiredRetention?: number
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
    queryKey: queryKeys.settings,
    queryFn: () => apiGet('/api/settings'),
    staleTime: 30_000,
  })

  const s = data?.settings
  const shouldOpen =
    !localDismissed &&
    Boolean(s) &&
    s?.onboardingCompleted === false &&
    s?.isEmptyWorkspace === true

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  // S3-40: the SP step's short-syntax dates resolve against the client day
  // (null until mounted — hydration-safe, same pattern as the timer page).
  const [todayIso, setTodayIso] = useState<string | null>(null)
  useEffect(() => {
    setTodayIso(new Date().toISOString().slice(0, 10))
  }, [])
  const [theme, setTheme] = useState<ThemePreference>(() =>
    normalizeThemePreference(s?.theme ?? 'dark'),
  )
  const [sessionMinutes, setSessionMinutes] = useState<number>(s?.sessionMinutes ?? 25)
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>(['learning-how-to-learn'])
  const [seedCore, setSeedCore] = useState(true)

  // Step 2 — "Make it yours": either pick a preset or answer the 8-question
  // quiz. Both are skippable ("I'll decide later" clears both selections).
  const [profileMode, setProfileMode] = useState<'presets' | 'quiz'>('presets')
  const [presetId, setPresetId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [quizIndex, setQuizIndex] = useState(0)

  // Current persisted values: the `from` side of every profile knob change and
  // the undo payload — the profile overrides the step-1 selection where it
  // touches the same knob, so Undo must restore what was stored, not the draft.
  const currentSessionMinutes = s?.sessionMinutes ?? 25
  const currentRetention = s?.desiredRetention ?? 0.9

  /** Profile computed from the step-2 selections; null = step skipped. */
  const computeProfile = (): LearnerProfile | null => {
    if (profileMode === 'presets' && presetId) return profileFromPreset(presetId) ?? null
    // deriveProfile ignores unanswered questions — a partial quiz still yields
    // an honest profile; zero answers yields nothing (skip instead).
    if (profileMode === 'quiz' && Object.keys(answers).length > 0) return deriveProfile(answers)
    return null
  }

  // "Bring your own content" — existing users can move in during first-run.
  const ankiFileRef = useRef<HTMLInputElement | null>(null)
  const courseFileRef = useRef<HTMLInputElement | null>(null)

  const importAnkiMutation = useMutation({
    mutationFn: async (file: File) => {
      const kind = file.name.toLowerCase().endsWith('.apkg') ? 'apkg' : 'txt'
      const payload = kind === 'apkg' ? await fileToBase64(file) : await file.text()
      const res = await apiSend<{
        deckId?: number
        deckName?: string
        imported?: number
        rejectedCards?: number
      }>('/api/import', 'POST', {
        kind,
        payload,
        deckName: file.name.replace(/\.(apkg|txt)$/i, ''),
      })
      return res
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: queryKeys.decks })
      toast({
        title: `Imported ${res.imported ?? 0} card${(res.imported ?? 0) === 1 ? '' : 's'}`,
        description: res.rejectedCards
          ? `${res.rejectedCards} card${res.rejectedCards === 1 ? '' : 's'} skipped.`
          : undefined,
        tone: 'success',
      })
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'danger' }),
  })

  const importCourseMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text()
      return apiSend<{ ok?: boolean; courseId?: number; title?: string }>(
        '/api/curriculum/import',
        'POST',
        { text, filename: file.name },
      )
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['courses'] })
      toast({
        title: `Imported “${res.title ?? 'course'}”`,
        description: 'Find it under Courses — progress is kept on re-import.',
        tone: 'success',
      })
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'danger' }),
  })

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
      void qc.invalidateQueries({ queryKey: queryKeys.settings })
    },
  })

  const finishMutation = useMutation({
    mutationFn: async () => {
      // Profile → knob changes (paired with current values for undo), snapshot
      // into the profile, then persist both in the same settings PUT. The PUT
      // also carries the two PUT-writable knob deltas (sessionMinutes,
      // desiredRetention); the other knobs live in appliedKnobs and are read
      // from the profile at their consumer sites (review default, quests,
      // workload, circadian studio).
      const profile = computeProfile()
      const changes = profile
        ? applyProfile(profile, {
            sessionMinutes: currentSessionMinutes,
            desiredRetention: currentRetention,
          })
        : []
      const learnerProfile = profile
        ? {
            ...profile,
            appliedKnobs: knobsToRecord(changes),
            createdAt: new Date().toISOString(),
          }
        : null
      const sessionChange = changes.find((c) => c.key === 'sessionMinutes')
      const retentionChange = changes.find((c) => c.key === 'desiredRetention')

      await apiSend('/api/settings', 'PUT', {
        theme,
        sessionMinutes: sessionChange ? Number(sessionChange.to) : sessionMinutes,
        ...(retentionChange ? { desiredRetention: Number(retentionChange.to) } : {}),
        onboardingCompleted: true,
        ...(learnerProfile ? { learnerProfile } : {}),
      })

      // Dashboard undo banner (ProfileTunedBanner reads this key on mount).
      if (learnerProfile) {
        const bannerRecord: ProfileAppliedRecord = {
          changes,
          archetypeLabel: learnerProfile.archetypeLabel,
          previous: { sessionMinutes: currentSessionMinutes, desiredRetention: currentRetention },
        }
        try {
          window.localStorage.setItem(PROFILE_APPLIED_KEY, JSON.stringify(bannerRecord))
        } catch {
          // The banner is cosmetic — the profile itself is persisted server-side.
        }
      }

      if (selectedSlugs.length > 0 || seedCore) {
        await apiSend('/api/starter', 'POST', {
          courseSlugs: selectedSlugs,
          seedCore,
        })
      }
    },
    onSuccess: () => {
      markDismissedLocally()
      void qc.invalidateQueries({ queryKey: queryKeys.settings })
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard })
      void qc.invalidateQueries({ queryKey: ['courses'] })
      void qc.invalidateQueries({ queryKey: queryKeys.decks })
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

  // Current quiz question (step 2); PROFILE_QUESTIONS is a fixed 8-item array.
  const question = PROFILE_QUESTIONS[quizIndex]

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
            className="btn-ghost text-xs text-tertiary"
          >
            Skip setup
          </button>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button
                variant="ghost"
                onClick={() => setStep((prev) => Math.max(1, prev - 1) as 1 | 2 | 3 | 4 | 5)}
                disabled={finishMutation.isPending}
              >
                Back
              </Button>
            )}
            {step < 5 ? (
              <Button onClick={() => setStep((prev) => Math.min(5, prev + 1) as 1 | 2 | 3 | 4 | 5)}>
                Continue
              </Button>
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
        <div className="flex items-center gap-1.5 text-xs text-tertiary">
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                n <= step ? 'bg-indigo-600' : 'bg-neutral-200 dark:bg-(--hub-border)'
              }`}
            />
          ))}
          <span className="ml-2 tabular-nums">Step {step}/5</span>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600 dark:text-secondary">
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
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-colors [@media(pointer:coarse)]:min-h-11 ${
                        active
                          ? 'border-indigo-500 bg-indigo-600/10 text-indigo-600 dark:text-indigo-300'
                          : 'border-neutral-200 hover:bg-neutral-50 dark:border-(--hub-border) dark:hover:bg-(--hub-panel-2)'
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
                      className={`rounded-xl border p-3 text-left transition-colors [@media(pointer:coarse)]:min-h-11 ${
                        active
                          ? 'border-indigo-500 bg-indigo-600/10 text-indigo-600 dark:text-indigo-300'
                          : 'border-neutral-200 hover:bg-neutral-50 dark:border-(--hub-border) dark:hover:bg-(--hub-panel-2)'
                      }`}
                    >
                      <div className="text-sm font-semibold">{opt.label}</div>
                      <div className="text-[11px] text-tertiary">{opt.hint}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600 dark:text-secondary">
              Tell the app how you learn — the scheduler, daily quests, and focus blocks tune
              themselves around your answer. Everything stays editable in Settings.
            </p>

            {/* Preset grid vs. questionnaire — one tap toggles the mode. */}
            <div
              role="group"
              aria-label="How to set your profile"
              className="inline-flex w-full rounded-xl border border-neutral-200 bg-neutral-100/70 p-1 dark:border-(--hub-border) dark:bg-(--hub-sunken)"
            >
              {(
                [
                  { key: 'presets', label: 'Pick a preset' },
                  { key: 'quiz', label: 'Answer 8 questions' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setProfileMode(opt.key)}
                  aria-pressed={profileMode === opt.key}
                  className={`min-h-[44px] flex-1 rounded-lg px-2.5 text-xs font-medium transition-colors ${
                    profileMode === opt.key
                      ? 'bg-white text-indigo-600 shadow-xs dark:bg-(--hub-panel-2) dark:text-indigo-300'
                      : 'text-neutral-600 hover:text-neutral-900 dark:text-faint dark:hover:text-neutral-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {profileMode === 'presets' && (
              <div className="grid gap-2 sm:grid-cols-2">
                {LEARNER_PRESETS.map((preset) => {
                  const active = presetId === preset.id
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setPresetId(preset.id)}
                      aria-pressed={active}
                      className={`min-h-[44px] rounded-xl border p-3 text-left transition-colors ${
                        active
                          ? 'border-indigo-500 bg-indigo-600/10'
                          : 'border-neutral-200 hover:bg-neutral-50 dark:border-(--hub-border) dark:hover:bg-(--hub-panel-2)'
                      }`}
                    >
                      <div className="text-sm font-medium">{preset.label}</div>
                      <div className="mt-0.5 text-xs text-tertiary">{preset.blurb}</div>
                    </button>
                  )
                })}
              </div>
            )}

            {profileMode === 'quiz' && question && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex flex-1 gap-1.5">
                    {PROFILE_QUESTIONS.map((q, i) => (
                      <span
                        key={q.id}
                        aria-hidden
                        className={`h-2 flex-1 rounded-full transition-colors ${
                          answers[q.id]
                            ? 'bg-indigo-600'
                            : i === quizIndex
                              ? 'bg-indigo-600/40'
                              : 'bg-neutral-200 dark:bg-(--hub-border)'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs tabular-nums text-tertiary">
                    {quizIndex + 1}/{PROFILE_QUESTIONS.length}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">{question.question}</div>
                  {question.helper && (
                    <div className="text-xs text-tertiary">{question.helper}</div>
                  )}
                  <div className="space-y-2">
                    {question.options.map((opt) => {
                      const active = answers[question.id] === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: opt.id }))}
                          aria-pressed={active}
                          className={`flex min-h-[44px] w-full items-center rounded-xl border p-3 text-left text-sm transition-colors ${
                            active
                              ? 'border-indigo-500 bg-indigo-600/10 text-indigo-600 dark:text-indigo-300'
                              : 'border-neutral-200 hover:bg-neutral-50 dark:border-(--hub-border) dark:hover:bg-(--hub-panel-2)'
                          }`}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <Button
                    variant="ghost"
                    onClick={() => setQuizIndex((i) => Math.max(0, i - 1))}
                    disabled={quizIndex === 0}
                  >
                    Back
                  </Button>
                  {quizIndex < PROFILE_QUESTIONS.length - 1 && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setQuizIndex((i) => Math.min(PROFILE_QUESTIONS.length - 1, i + 1))
                      }
                      disabled={!answers[question.id]}
                    >
                      Next
                    </Button>
                  )}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                // Skip without writing a profile — clear both selections.
                setPresetId(null)
                setAnswers({})
                setStep(3)
              }}
              className="btn-ghost text-xs text-tertiary"
            >
              I&apos;ll decide later
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-600 dark:text-secondary">
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
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors [@media(pointer:coarse)]:min-h-11 ${
                      checked
                        ? 'border-indigo-500 bg-indigo-600/10'
                        : 'border-neutral-200 hover:bg-neutral-50 dark:border-(--hub-border) dark:hover:bg-(--hub-panel-2)'
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
                        <span className="text-[11px] text-tertiary">{course.lessons}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-tertiary">{course.tagline}</p>
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

            {/* Bring-your-own content — works fully offline, no AI setup needed. */}
            <div className="rounded-xl border border-dashed border-neutral-300 p-3 dark:border-(--hub-border)">
              <div className="flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-secondary">
                <FileUp className="h-3.5 w-3.5 text-ac-text" /> Already have content? Bring it in.
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn-ghost justify-center text-xs"
                  disabled={importAnkiMutation.isPending}
                  onClick={() => ankiFileRef.current?.click()}
                >
                  {importAnkiMutation.isPending ? 'Importing…' : 'Anki deck (.apkg/.txt)'}
                </button>
                <button
                  type="button"
                  className="btn-ghost justify-center text-xs"
                  disabled={importCourseMutation.isPending}
                  onClick={() => courseFileRef.current?.click()}
                >
                  {importCourseMutation.isPending ? 'Importing…' : 'Course (.json/.yaml/.md)'}
                </button>
              </div>
              <input
                ref={ankiFileRef}
                type="file"
                accept=".apkg,.txt"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) importAnkiMutation.mutate(file)
                  e.target.value = ''
                }}
              />
              <input
                ref={courseFileRef}
                type="file"
                accept=".json,.yaml,.yml,.md,.markdown,.txt"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) importCourseMutation.mutate(file)
                  e.target.value = ''
                }}
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-600 dark:text-secondary">
              You&apos;re all set! Learning HUB never requires a subscription or server account:
            </p>
            <div className="space-y-2.5">
              <div className="rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border)">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <GraduationCap className="h-4 w-4 text-ac-text" />
                  AI is optional (Manual Mode + Free Tiers built in)
                </div>
                <p className="mt-1 text-xs text-tertiary">
                  Use copy/paste prompts with any chat AI for free, or connect Google Gemini, Groq,
                  OpenRouter, or local Ollama in{' '}
                  <Link
                    href="/settings"
                    onClick={() => skipMutation.mutate()}
                    className="text-ac-text underline"
                  >
                    Settings
                  </Link>
                  .
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border)">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Cloud className="h-4 w-4 text-ac-text" />
                  Free E2EE Multi-Device Sync
                </div>
                <p className="mt-1 text-xs text-tertiary">
                  Sync non-destructively across Windows, Android, and Web via Dropbox, GitHub Gist,
                  Google Drive, or WebDAV in{' '}
                  <Link
                    href="/backup"
                    onClick={() => skipMutation.mutate()}
                    className="text-ac-text underline"
                  >
                    Backup &amp; Sync
                  </Link>
                  .
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border)">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <BookOpen className="h-4 w-4 text-ac-text" />
                  Tip: Press{' '}
                  <kbd className="rounded bg-neutral-200 px-1.5 py-0.5 text-[11px] dark:bg-(--hub-border)">
                    ⌘K
                  </kbd>{' '}
                  anytime
                </div>
                <p className="mt-1 text-xs text-tertiary">
                  Search instantly across all notes, cards, lessons, highlights, and pages.
                </p>
              </div>
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-ac-text" />
                  Your first review is waiting
                </div>
                <p className="mt-1 text-xs text-tertiary">
                  Ten minutes of{' '}
                  <Link
                    href="/review"
                    onClick={() => skipMutation.mutate()}
                    className="text-ac-text underline"
                  >
                    flashcard review
                  </Link>{' '}
                  today beats an hour crammed next weekend — the scheduler spreads the rest for you.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 5 — SP first run (S3-40): project + first task via short syntax. */}
        {step === 5 && (
          <div className="space-y-4">
            <SpFirstRunStep todayIso={todayIso} />
          </div>
        )}
      </div>
    </Sheet>
  )
}
