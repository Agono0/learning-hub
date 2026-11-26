'use client'

/**
 * ArenaCoachMarks — first-visit orientation for the 3D Review Arena.
 *
 * Five short steps explain what the arena is (the real review queue dressed
 * as a duel) and how its combat feedback reads (strikes, crits, shields,
 * bosses, the daily modifier). Dismissal persists in localStorage; a
 * "How the arena works" button on the setup gate reopens the card anytime.
 *
 * Honesty rule: every step describes the arena as a presentation layer over
 * real reviews — never as a separate game with its own economy.
 */
import { useEffect, useState } from 'react'
import { Heart, Shield, Swords, Trophy, Zap } from 'lucide-react'
import { Badge, Button, Panel } from '@/ui'

const DISMISSED_KEY = 'lh-arena-coach-dismissed'

interface CoachStep {
  title: string
  body: string
  icon: 'duel' | 'guardian' | 'crit' | 'shield' | 'boss'
}

const STEPS: CoachStep[] = [
  {
    title: 'Your review queue, as a duel',
    body: 'The arena deals the same due cards your normal review session would. Every grade you give here is a real review: scheduling, streaks and mastery update exactly as usual.',
    icon: 'duel',
  },
  {
    title: 'The guardian is your queue',
    body: 'Its health bar is the cards left in this run. Clear every card and you win — the guardian never ends your session early, and you always review the whole queue.',
    icon: 'guardian',
  },
  {
    title: 'Strikes and criticals',
    body: 'A correct answer strikes. Fast, confident and correct lands a critical for bonus score. Score is only feedback: coins and XP always come from honest retrieval.',
    icon: 'crit',
  },
  {
    title: 'Shields and counters',
    body: 'Again and Hard answers let the guardian counter. Your shield soaks the first hits, and correct-answer combos repair it. If your HP runs out the run ends in defeat — the reviews still count.',
    icon: 'shield',
  },
  {
    title: 'Bosses and the daily twist',
    body: 'Runs of 15+ challenges face a boss that escalates through three phases as its HP falls. A daily modifier reshapes the rules every day — the gate banner always shows the active twist.',
    icon: 'boss',
  },
]

function StepIcon({ icon }: { icon: CoachStep['icon'] }) {
  const cls = 'h-5 w-5'
  switch (icon) {
    case 'duel':
      return <Swords className={cls} aria-hidden="true" />
    case 'guardian':
      return <Heart className={cls} aria-hidden="true" />
    case 'crit':
      return <Zap className={cls} aria-hidden="true" />
    case 'shield':
      return <Shield className={cls} aria-hidden="true" />
    case 'boss':
      return <Trophy className={cls} aria-hidden="true" />
  }
}

/** Read the dismissal flag once on mount (SSR-safe: effect only). */
function useCoachDismissed(): [boolean | null, () => void] {
  const [dismissed, setDismissed] = useState<boolean | null>(null)
  useEffect(() => {
    setDismissed(window.localStorage.getItem(DISMISSED_KEY) === '1')
  }, [])
  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }
  return [dismissed, dismiss]
}

/** Reopenable trigger for the setup gate. */
export function ArenaCoachReopenButton({ onOpen }: { onOpen: () => void }) {
  return (
    <Button variant="ghost" onClick={onOpen} data-testid="arena-coach-reopen">
      How the arena works
    </Button>
  )
}

export function ArenaCoachMarks({
  forceOpen = false,
  onClose,
}: {
  /** Reopened from the gate button: show even after dismissal. */
  forceOpen?: boolean
  onClose?: () => void
}) {
  const [dismissed, dismiss] = useCoachDismissed()
  const [step, setStep] = useState(0)

  // null = not yet read (SSR/first paint): render nothing rather than flash.
  if (dismissed === null) return null
  if (dismissed && !forceOpen) return null

  const current = STEPS[step]!
  const last = step === STEPS.length - 1

  const close = () => {
    dismiss()
    setStep(0)
    onClose?.()
  }

  return (
    <Panel className="p-4" data-testid="arena-coach">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <StepIcon icon={current.icon} />
          <p className="text-sm font-semibold" data-testid="arena-coach-step-title">
            {current.title}
          </p>
        </div>
        <Badge tone="neutral" data-testid="arena-coach-progress">
          {step + 1} of {STEPS.length}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-secondary" data-testid="arena-coach-step-body">
        {current.body}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex gap-1" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span
              key={s.title}
              className={`h-1.5 w-4 rounded-full ${
                i === step ? 'bg-indigo-500' : 'bg-neutral-200 dark:bg-(--hub-border)'
              }`}
            />
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : null}
          {last ? (
            <Button onClick={close} data-testid="arena-coach-finish">
              Enter the arena
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close} data-testid="arena-coach-skip">
                Skip
              </Button>
              <Button onClick={() => setStep(step + 1)} data-testid="arena-coach-next">
                Next
              </Button>
            </>
          )}
        </div>
      </div>
    </Panel>
  )
}
