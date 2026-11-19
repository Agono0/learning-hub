/**
 * `exposure` CLI command — the ambient vocabulary ledger (Krashen i+1) over
 * the shared exposure repo.
 */
import { getWordExposureSummaries } from '@learning-hub/db'
import { panel } from './ui'
import type { RegisteredCommand } from './registry'

function exposureCmd() {
  const words = getWordExposureSummaries(20)
  if (words.length === 0) {
    console.log('No ambient vocabulary encounters recorded yet.')
    return
  }
  const lines = words.map((w) => {
    const tag = w.eligibleForPromotion ? '[Ready for SRS]' : ''
    return `${w.normalized.padEnd(20)} ${String(w.encounterCount).padStart(3)}x (${w.distinctDays} days) ${tag}`
  })
  console.log(panel('Ambient Vocabulary Ledger (Krashen i+1)', lines))
}

export const exposureCommands: RegisteredCommand[] = [
  {
    name: 'exposure',
    description: 'ambient vocabulary ledger and Krashen i+1 tracking',
    usage: '[list]',
    run: () => exposureCmd(),
  },
]
