/**
 * `capture` CLI command — quick-capture an idea into the inbox via the
 * shared ideas repository (repos/ideas).
 */
import { createIdea } from '@learning-hub/db'
import { exit } from 'node:process'
import type { RegisteredCommand } from './registry'

async function capture(text: string) {
  if (!text.trim()) {
    console.error('Usage: learning-hub capture "idea text"')
    exit(1)
  }
  // Shared ideas repo (repos/ideas) — the canonical inbox capture path.
  const idea = createIdea({ title: text.trim().slice(0, 120), content: text })
  console.log(`💡 Captured idea #${idea.id} → inbox (stage: seed)\n   ${idea.title}`)
}

export const captureCommands: RegisteredCommand[] = [
  {
    name: 'capture',
    description: 'quick-capture an idea',
    usage: '"text"',
    run: (runArgs) => capture(runArgs.join(' ')),
  },
]
