/**
 * Plays a list of spoken cues one after another with a pause between them. `stop()` (or a new
 * `start()`) cancels everything pending, including the next cue that is waiting out its pause;
 * without that, pressing Stop during a pause let the following cue start speaking anyway.
 */
export interface CueLike {
  text: string
  pauseMs: number
}

export interface CueSequencerOptions {
  cues: readonly CueLike[]
  speak: (text: string) => Promise<void>
  onCursor: (index: number) => void
  onDone: () => void
  /** Injectable for tests. Returns a cancel function. */
  schedule?: (fn: () => void, ms: number) => () => void
  maxPauseMs?: number
}

export function createCueSequencer(opts: CueSequencerOptions) {
  const schedule =
    opts.schedule ??
    ((fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms)
      return () => clearTimeout(id)
    })
  const maxPause = opts.maxPauseMs ?? 4000
  let token = 0
  let cancelTimer: (() => void) | null = null

  const run = (index: number, mine: number): void => {
    if (mine !== token) return
    if (index >= opts.cues.length) {
      opts.onDone()
      return
    }
    opts.onCursor(index)
    const cue = opts.cues[index]!
    void opts.speak(cue.text).then(() => {
      if (mine !== token) return
      const pause = Math.max(0, Math.min(maxPause, Number.isFinite(cue.pauseMs) ? cue.pauseMs : 0))
      cancelTimer = schedule(() => run(index + 1, mine), pause)
    })
  }

  const stop = (): void => {
    token++
    cancelTimer?.()
    cancelTimer = null
  }

  return {
    start(from = 0): void {
      stop()
      run(from, token)
    },
    stop,
  }
}
