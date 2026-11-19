/**
 * Learning HUB CLI — thin adapter over packages/core + packages/db. Agent C.
 *
 *   learning-hub capture "idea text"   # quick-capture into idea inbox
 *   learning-hub today                 # due cards, quests, quote
 *   learning-hub stats                 # retention, streak, XP, focus
 *   learning-hub review [limit]        # terminal review session
 *   learning-hub focus 25              # start a focus session
 *   learning-hub quote                 # random quote
 *
 * This file is ONLY the argv parser, the plugin merge, and dispatch. Every
 * command lives in ./commands/*.ts domain modules, each exporting a
 * RegisteredCommand[] group; the concatenation below preserves the
 * historical help-panel order 1:1. Plugins loaded from `plugins/` contribute
 * additional `cliCommands` entries at dispatch time, so
 * `learning-hub <plugin-command>` works without touching this file.
 */
import { exit } from 'node:process'
import { getPluginContributions, loadPlugins } from '@learning-hub/core'
import { helpLine, type RegisteredCommand } from './commands/registry'
import { panel } from './commands/ui'
import { captureCommands } from './commands/capture'
import { focusCommands } from './commands/focus-pomodoro'
import { exposureCommands } from './commands/exposure'
import { goalsCommands } from './commands/goals'
import { notesCommands } from './commands/notes'
import { reviewCommands } from './commands/review'
import { systemCommands } from './commands/system'
import { todayStatsCommands } from './commands/today-stats'
import { workloadCommands } from './commands/workload'
import { curriculumCommands } from './commands/curriculum'
import { habitsCommands, journalCommands, physioCommands } from './commands/lifestyle'
import { gktCommands, planCommands, readingCommands } from './commands/learning-path'
import { debateCommands, guildCommands, palaceCommands, worldCommands } from './commands/community'
import { audioCommands, gamesCommands } from './commands/telemetry-audio'
import {
  analogyCommands,
  difficultyCommands,
  feynmanCommands,
  flexibilityCommands,
  generationCommands,
  interactivityCommands,
  invarianceCommands,
  metacognitionCommands,
  pretestCommands,
} from './commands/cognitive'
import {
  anchoredCommands,
  causalCommands,
  cerCommands,
  collaborativeCommands,
  contrastingCommands,
  epistemicCommands,
  inquiryCommands,
  knowledgeSpaceCommands,
  modelInquiryCommands,
  pfCommands,
  piCommands,
  relearningCommands,
  rtCommands,
  skillsCommands,
  srlCommands,
  systemDynamicsCommands,
  thresholdCommands,
  zpdCommands,
} from './commands/advanced-learning'
import { prototypeExemplarCommands } from './commands/prototype-exemplar'

const rawArgs = process.argv.slice(2)
const scriptArgs =
  rawArgs[0] &&
  (rawArgs[0].endsWith('.ts') || rawArgs[0].endsWith('.js') || rawArgs[0].includes('index.'))
    ? rawArgs.slice(1)
    : rawArgs
const [cmd, ...args] = scriptArgs

// ─── Command registry ───────────────────────────────────────────────────────
//
// Built-ins as data + plugin contributions merged at dispatch time. With zero
// plugins the registry is exactly the historical switch: same commands, same
// order, same help panel (the group concatenation below preserves it 1:1).

const builtinCommands: RegisteredCommand[] = [
  ...captureCommands,
  ...todayStatsCommands,
  ...reviewCommands,
  ...focusCommands,
  ...systemCommands,
  ...curriculumCommands,
  ...workloadCommands,
  ...exposureCommands,
  ...habitsCommands,
  ...journalCommands,
  ...physioCommands,
  ...readingCommands,
  ...planCommands,
  ...gktCommands,
  ...debateCommands,
  ...palaceCommands,
  ...worldCommands,
  ...guildCommands,
  ...audioCommands,
  ...gamesCommands,
  ...generationCommands,
  ...feynmanCommands,
  ...metacognitionCommands,
  ...difficultyCommands,
  ...pretestCommands,
  ...invarianceCommands,
  ...analogyCommands,
  ...flexibilityCommands,
  ...interactivityCommands,
  ...skillsCommands,
  ...relearningCommands,
  ...srlCommands,
  ...epistemicCommands,
  ...causalCommands,
  ...thresholdCommands,
  ...zpdCommands,
  ...pfCommands,
  ...piCommands,
  ...inquiryCommands,
  ...rtCommands,
  ...cerCommands,
  ...anchoredCommands,
  ...contrastingCommands,
  ...collaborativeCommands,
  ...systemDynamicsCommands,
  ...modelInquiryCommands,
  ...prototypeExemplarCommands,
  ...knowledgeSpaceCommands,
  // New domain commands over the shared repos (commands/goals.ts, commands/notes.ts)
  ...goalsCommands,
  ...notesCommands,
]

async function main() {
  // Plugins first: their commands join the registry before dispatch.
  const plugins = await loadPlugins(['plugins'])
  const { cliCommands: pluginCommands } = getPluginContributions()
  if (plugins.length > 0) {
    console.error(
      `Loaded ${plugins.length} plugin(s): ${plugins.map((p) => `${p.plugin.name}@${p.plugin.version}`).join(', ')}`,
    )
  }
  const commands: RegisteredCommand[] = [...builtinCommands, ...pluginCommands]

  const selected = commands.find((c) => c.name === cmd)
  if (selected) {
    await selected.run(args)
    return
  }
  console.log(
    panel(
      'learning-hub',
      commands.map((p) => helpLine(p)),
    ),
  )
}

main()
  .catch((err) => {
    console.error(err)
    exit(1)
  })
  .then(() => {
    // keep long-running commands (focus) alive; exit otherwise
    if (cmd !== 'focus' || args[0] === 'load') exit(process.exitCode ?? 0)
  })
