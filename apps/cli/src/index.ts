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
 * built-in command implementation lives in ./commands/*.ts domain modules
 * (each exporting a RegisteredCommand[] group concatenated below in the
 * historical help order) — e.g. commands/{capture,today-stats,review,
 * focus-pomodoro,workload,exposure,system,goals,notes}.ts — alongside the
 * domain command modules contributed by the repo (curriculum, lifestyle,
 * learning-path, community, telemetry-audio, cognitive, advanced-learning),
 * whose registry entries are wired below. Plugins loaded from `plugins/`
 * contribute additional `cliCommands` entries at dispatch time, so
 * `learning-hub <plugin-command>` works without touching this file.
 */
import { exit } from 'node:process'
import { curriculumCommand } from './commands/curriculum'
import { habitsCommand, journalCommand, physioCommand } from './commands/lifestyle'
import { gktCommand, planCommand, readingCommand } from './commands/learning-path'
import { debateCommand, guildCommand, palaceCommand, worldCommand } from './commands/community'
import { audioCommand, gamesCommand, tmrPlanCommand } from './commands/telemetry-audio'
import {
  analogyCommand,
  difficultyCommand,
  feynmanCommand,
  flexibilityCommand,
  interactivityCommand,
  generationCommand,
  invarianceCommand,
  metacognitionCommand,
  pretestCommand,
} from './commands/cognitive'
import {
  causalCommand,
  epistemicCommand,
  relearningCommand,
  skillsCommand,
  srlCommand,
  thresholdCommand,
  zpdCommand,
  pfCommand,
  piCommand,
  inquiryCommand,
  reciprocalTeachingCommand,
  cerCommand,
  anchoredCommand,
  contrastingCommand,
  collaborativeCommand,
  systemDynamicsCommand,
  modelInquiryCommand,
} from './commands/advanced-learning'
import { captureCommands } from './commands/capture'
import { focusCommands } from './commands/focus-pomodoro'
import { exposureCommands } from './commands/exposure'
import { goalsCommands } from './commands/goals'
import { notesCommands } from './commands/notes'
import { reviewCommands } from './commands/review'
import { systemCommands } from './commands/system'
import { todayStatsCommands } from './commands/today-stats'
import { workloadCommands } from './commands/workload'
import { helpLine, type RegisteredCommand } from './commands/registry'
import { panel } from './commands/ui'
import { getPluginContributions, loadPlugins } from '@learning-hub/core'

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
  // capture / daily snapshot / review / focus (commands/*.ts groups)
  ...captureCommands,
  ...todayStatsCommands,
  ...reviewCommands,
  ...focusCommands,
  ...systemCommands, // quote, search, fsrs, starter, sync
  // domain command modules (implementations in commands/*.ts, wired here)
  {
    name: 'curriculum',
    description: 'import/list courses, print AI prompt',
    usage: 'import|list|prompt',
    run: (runArgs) => {
      process.exitCode = curriculumCommand(runArgs)
    },
  },
  ...workloadCommands,
  ...exposureCommands,
  {
    name: 'habits',
    description: 'habit loops, streaks, and check-ins',
    usage: '[list|checkin|history]',
    run: (runArgs) => habitsCommand(runArgs),
  },
  {
    name: 'journal',
    description: 'daily reflection journal and mood tracking',
    usage: '[write|show]',
    run: (runArgs) => journalCommand(runArgs),
  },
  {
    name: 'physio',
    description: 'physiology metrics and learning advice',
    usage: '[--sleep N --exercise N ...]',
    run: (runArgs) => physioCommand(runArgs),
  },
  {
    name: 'reading',
    description: 'incremental reading queue and ingestion',
    usage: '[list|add|finish]',
    run: (runArgs) => readingCommand(runArgs),
  },
  {
    name: 'plan',
    description: 'study plan agenda and weekly template',
    usage: '[today|week|set]',
    run: (runArgs) => planCommand(runArgs),
  },
  {
    name: 'gkt',
    description: 'Bayesian prerequisite DAG knowledge tracing',
    usage: '[drill]',
    run: (runArgs) => gktCommand(runArgs),
  },
  {
    name: 'debate',
    description: 'multi-agent dialectic arena and learner ruling',
    usage: '[list|open|turn|vote]',
    run: (runArgs) => debateCommand(runArgs),
  },
  {
    name: 'palace',
    description: 'spatial memory palace and loci ordering',
    usage: '[list|add]',
    run: (runArgs) => palaceCommand(runArgs),
  },
  {
    name: 'world',
    description: '3D virtual study world, coins, and forest',
    usage: '[status|market]',
    run: (runArgs) => worldCommand(runArgs),
  },
  {
    name: 'guild',
    description: 'study clans, levels, and team XP pooling',
    usage: '[list|join|leave]',
    run: (runArgs) => guildCommand(runArgs),
  },
  {
    name: 'audio',
    description: 'speakable commute review and sleep TMR earcons',
    usage: '[schedule|tmr-plan]',
    run: (runArgs) => {
      const sub = runArgs[0]
      if (sub === 'tmr-plan') return tmrPlanCommand(runArgs.slice(1))
      return audioCommand(runArgs)
    },
  },
  {
    name: 'games',
    description: 'solo RPG boss battles and mythical boss roster',
    usage: '[status]',
    run: (runArgs) => gamesCommand(runArgs),
  },
  {
    name: 'generation',
    description: 'Slamecka-Graf generation effect challenges and evaluation',
    usage: '[challenge|eval]',
    run: (runArgs) => generationCommand(runArgs),
  },
  {
    name: 'feynman',
    description: 'Feynman teach-back and IOED diagnostic evaluation',
    usage: '[eval]',
    run: (runArgs) => feynmanCommand(runArgs),
  },
  {
    name: 'metacognition',
    description: 'Koriat-Bjork calibration, Brier score, and hypercorrection crucible',
    usage: '[stats|hypercorrection]',
    run: (runArgs) => metacognitionCommand(runArgs),
  },
  {
    name: 'difficulty',
    description: 'Dunlosky (2013) desirable-difficulty audit of your technique mix',
    usage: 'audit [--testing 90 --reread 120 …]',
    run: (runArgs) => difficultyCommand(runArgs),
  },
  {
    name: 'pretest',
    description: 'Pretesting-effect questions for young, fragile cards',
    usage: 'questions [--limit 8]',
    run: (runArgs) => pretestCommand(runArgs),
  },
  {
    name: 'invariance',
    description: 'Rohrer-Taylor interleaved structural invariance practice plan',
    usage: '[--mode interleaved|blocked] [--contrast 0..1] [--spacing 0..1]',
    run: (runArgs) => invarianceCommand(runArgs),
  },
  {
    name: 'analogy',
    description: 'Gick & Holyoak analogical-transfer suite (structure mapping)',
    usage: 'plan [--suite <key>]',
    run: (runArgs) => analogyCommand(runArgs),
  },
  {
    name: 'flexibility',
    description: 'Spiro criss-crossing schedule for ill-structured cases',
    usage: 'plan [--suite <key>]',
    run: (runArgs) => flexibilityCommand(runArgs),
  },
  {
    name: 'interactivity',
    description: 'Sweller element-interactivity analysis + Paas efficiency',
    usage: 'analyze [--suite <key>] [--extraneous 1] [--effort 5 --performance 70]',
    run: (runArgs) => interactivityCommand(runArgs),
  },
  {
    name: 'skills',
    description: 'Matt Pocock agent skills catalog, execution, and AGENTS.md rule audit',
    usage: 'catalog | audit | run',
    run: (runArgs) => skillsCommand(runArgs),
  },
  {
    name: 'relearning',
    description: 'Rawson & Dunlosky successive relearning & Ebbinghaus savings diagnostic',
    usage: 'calc [--initial 600 --relearn 210 --days 7]',
    run: (runArgs) => relearningCommand(runArgs),
  },
  {
    name: 'srl',
    description: 'Zimmerman 3-phase cyclical self-regulated learning (SRL) matrix',
    usage: 'eval [--forethought 8 --performance 7 --reflection 9]',
    run: (runArgs) => srlCommand(runArgs),
  },
  {
    name: 'epistemic',
    description: 'Shaffer epistemic network analysis (ENA) & quantitative ethnography',
    usage: 'analyze [--window 4 --mastery 0.75]',
    run: (runArgs) => epistemicCommand(runArgs),
  },
  {
    name: 'causal',
    description: 'Judea Pearl structural causal models & counterfactual simulation',
    usage: 'counterfactual [--study 16 --target ExamScore]',
    run: (runArgs) => causalCommand(runArgs),
  },
  {
    name: 'threshold',
    description: 'Meyer & Land threshold concepts & liminal space navigation',
    usage: 'eval [--concept tc_pointers_memory]',
    run: (runArgs) => thresholdCommand(runArgs),
  },
  {
    name: 'zpd',
    description:
      'Vygotsky & Feuerstein dynamic assessment & zone of proximal development diagnostic',
    usage: '[eval|scenarios|prompt|deck] [--scenario algo_dynamic_programming --pre 30 --post 80]',
    run: (runArgs) => zpdCommand(runArgs),
  },
  {
    name: 'pf',
    description: 'Manu Kapur & Tanmay Sinha productive failure & canonical consolidation studio',
    usage:
      '[metrics|scenarios|eval|deck] [--scenario pf-variance-dispersion --reps 3 --affective 4]',
    run: (runArgs) => pfCommand(runArgs),
  },
  {
    name: 'pi',
    description: 'Eric Mazur & Michelle Smith peer instruction & interactive conceptest studio',
    usage: '[eval|suites|dialogue|deck] [--suite ct-thermal-expansion-plate --pre 38 --post 82]',
    run: (runArgs) => piCommand(runArgs),
  },
  {
    name: 'inquiry',
    description: 'Klahr & Dunbar dual-space scientific discovery & VOTAT inquiry simulation studio',
    usage: '[eval|labs|trial|deck] [--lab lab-pendulum-period --vri 1.0 --sdi 85]',
    run: (runArgs) => inquiryCommand(runArgs),
  },
  {
    name: 'rt',
    description:
      'Palincsar & Brown reciprocal teaching, Chi ICAP framework & King guided questioning studio',
    usage: '[eval|passages|peer|deck] [--passage passage-endosymbiosis --role questioner]',
    run: (runArgs) => reciprocalTeachingCommand(runArgs),
  },
  {
    name: 'cer',
    description:
      'McNeill & Krajcik CER, Toulmin TAP & Osborne epistemic scientific argumentation studio',
    usage: '[debates|counter|eval|deck] [--debate <id>]',
    run: (runArgs) => cerCommand(runArgs),
  },
  {
    name: 'anchored',
    description:
      'CTGV (1990, 1992) Anchored Instruction & Situated Macrocontext Problem-Solving Studio',
    usage: '[cases|sensitivity|eval|deck] [--case <id>]',
    run: (runArgs) => anchoredCommand(runArgs),
  },
  {
    name: 'contrasting',
    description:
      'Schwartz & Bransford (1998, 2004) Contrasting Cases & Inventing with Examples Studio',
    usage: '[sets|eval|deck] [--id <id>]',
    run: (runArgs) => contrastingCommand(runArgs),
  },
  {
    name: 'collaborative',
    description:
      'King (1997, 1999) & Weinberger & Fischer (2006) Collaborative Scripts & Transactive Studio',
    usage: '[scenarios|partner|eval|deck] [--id <id>]',
    run: (runArgs) => collaborativeCommand(runArgs),
  },
  {
    name: 'system-dynamics',
    description:
      'Forrester (1968), Sterman (2000) & Meadows (2008) System Dynamics & Feedback Studio',
    usage: '[scenarios|simulate|eval|deck] [--id <id>] [--steps <n>]',
    run: (runArgs) => systemDynamicsCommand(runArgs),
  },
  {
    name: 'model-inquiry',
    description:
      'Clement (2008), Nersessian (2002) & Johnson-Laird (1983) Model-Based Inquiry & Gedankenexperiment',
    usage: '[scenarios|perturb|simulate|eval|deck] [--id <id>] [--case <caseId>]',
    run: (runArgs) => modelInquiryCommand(runArgs),
  },
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
