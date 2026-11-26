'use client'

import React, { useState } from 'react'
import { Button } from '@/ui'

/** Copy or download text the page already shows. */
export function ActionHelpers({ text, filename }: { text: string; filename: string }) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null)
  if (!text) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied('yes')
    } catch {
      setCopied('no')
    }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={copy}>
        Copy review as Markdown
      </Button>
      <Button variant="ghost" onClick={download}>
        Download .md
      </Button>
      {copied === 'yes' && (
        <span role="status" className="text-xs">
          Copied.
        </span>
      )}
      {copied === 'no' && (
        <span role="status" className="text-xs">
          Could not copy. Use download instead.
        </span>
      )}
    </div>
  )
}
