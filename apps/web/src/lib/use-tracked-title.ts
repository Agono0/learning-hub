'use client'

/**
 * useTrackedTitle (S3-43) — the SP tracked window title as a hook.
 *
 * A thin effect wrapper over core {@link trackedTitle} (all the logic and
 * formatting is unit-tested there): while `currentTask` is set the tab
 * shows `12m · Task title`; idle days show `Today 1h 5m`; an empty day
 * restores the app default. The write is effect-only (never at render —
 * SSR renders no DOM side effects) and the app default is restored on
 * unmount so leaving a page never leaves a stale task in the chrome.
 *
 * Inputs are injected (day defaults to the client clock inside the effect,
 * which is the one legitimate place to read it).
 */
import { useEffect } from 'react'
import { trackedTitle, workContextTotals, type WorkContextTask } from '@learning-hub/core'
import { trackedOnDay } from '@learning-hub/core'

export interface TrackedTitleTask extends WorkContextTask {
  /** Shown in the title while this task is being tracked. */
  title: string
}

export interface UseTrackedTitleOptions {
  /** The task being tracked right now (null/undefined = idle). */
  currentTask?: Pick<TrackedTitleTask, 'title' | 'timeSpentOnDay'> | null
  /** The open tasks — feed `/api/tasks` output so the day total is live. */
  tasks?: readonly TrackedTitleTask[]
  /** ISO day for the totals (defaults to the client clock in the effect). */
  today?: string
  /** Master switch (off during Max Focus, which owns the chrome). */
  enabled?: boolean
}

export function useTrackedTitle({
  currentTask = null,
  tasks = [],
  today,
  enabled = true,
}: UseTrackedTitleOptions = {}): void {
  const currentTaskKey = currentTask?.title ?? ''
  const currentTaskMsKey = currentTask?.timeSpentOnDay ?? {}
  const taskCount = tasks.length
  const todayKey = today ?? ''

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return
    const day = todayKey !== '' ? todayKey : new Date().toISOString().slice(0, 10)
    const { todayTotalMs } = workContextTotals(tasks, day)
    const currentMs = currentTask ? trackedOnDay(currentTask, day) : 0
    document.title = trackedTitle({
      currentTaskTitle: currentTask ? currentTask.title : null,
      currentTaskMs: currentMs,
      todayTotalMs,
    })
    // Deps are the structural inputs (title/count/day/enabled) — the maps
    // are compared by identity upstream, and a changed list length or title
    // is what actually matters for the chrome.
  }, [enabled, currentTaskKey, currentTaskMsKey, taskCount, todayKey])

  // Leaving a tracking surface restores the app default (no stale task in
  // the tab bar after unmount).
  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') document.title = 'Learning HUB'
    }
  }, [])
}
