'use client'

/**
 * CopyRunSummary — copies a plain-text recap of the finished run.
 *
 * Local only: the text is built in the browser from the run's own numbers
 * and handed to the clipboard. Nothing is uploaded or shared by this button.
 */
import { useState } from 'react'
import { Clipboard } from 'lucide-react'
import { formatRunShareText, type ShareRunInput } from '@learning-hub/core'
import { Button } from '@/ui'

export function CopyRunSummary({ run }: { run: ShareRunInput }): React.ReactElement {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(formatRunShareText(run))
      setState('copied')
    } catch {
      setState('failed')
    }
    window.setTimeout(() => setState('idle'), 2500)
  }

  return (
    <Button variant="secondary" data-testid="arena-copy-summary" onClick={() => void copy()}>
      <Clipboard className="mr-2 h-4 w-4" aria-hidden="true" />
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy run summary'}
    </Button>
  )
}
