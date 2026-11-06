/**
 * pomodoro-soundscape — first-party plugin: a terminal pomodoro with phase
 * chimes (procedural, no assets). Contributes the `pomodoro` CLI command.
 * (The web app has its own 3D timers; this one is for the terminal host.)
 */
import { definePlugin } from '@learning-hub/core'

function chime(kind: 'start' | 'break' | 'done'): void {
  const freq = kind === 'start' ? 660 : kind === 'break' ? 440 : 880
  // Node hosts print a bell; a proper tone needs WebAudio which the CLI lacks.
  const bells = kind === 'done' ? '\u0007\u0007' : '\u0007'
  console.log(
    `${bells} [${kind === 'start' ? 'focus' : kind === 'break' ? 'break' : 'done'} @ ${freq}Hz cue]`,
  )
}

export default definePlugin({
  name: 'pomodoro-soundscape',
  version: '1.0.0',
  description: 'CLI pomodoro timer with phase chimes (`pomodoro [minutes]`).',
  setup(ctx) {
    ctx.cliCommands.push({
      name: 'pomodoro',
      description: 'run a pomodoro in the terminal: `pomodoro [workMinutes] [breakMinutes]`',
      run: (args) => {
        const work = Math.max(1, Number(args[0]) || 25)
        const brk = Math.max(1, Number(args[1]) || 5)
        chime('start')
        console.log(`Focus for ${work} minutes. Ctrl+C to cancel.`)
        setTimeout(() => {
          chime('break')
          console.log(`Break for ${brk} minutes — rest consolidates.`)
          setTimeout(() => {
            chime('done')
            console.log('Pomodoro complete. Log it in Focus → sessions.')
          }, brk * 60_000)
        }, work * 60_000)
      },
    })
  },
})
