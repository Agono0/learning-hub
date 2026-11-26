'use client'

/**
 * ArenaExportButtons — download the arena record book as CSV or JSON.
 *
 * Goes through apiDownload so native shells get the save dialog. The note
 * under the buttons says what the file is: a personal practice log of
 * self-reported grades, not a verified record.
 */
import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button, useToast } from '@/ui'
import { apiDownload } from '@/lib/transport'

export type ArenaExportFormat = 'csv' | 'json'

export function arenaExportPath(format: ArenaExportFormat): string {
  return `/api/arena/export?format=${format}`
}

export function arenaExportFileName(format: ArenaExportFormat, now: Date = new Date()): string {
  return `arena-record-${now.toISOString().slice(0, 10)}.${format}`
}

export function ArenaExportButtons({ disabled }: { disabled?: boolean }): React.ReactElement {
  const [busy, setBusy] = useState<ArenaExportFormat | null>(null)
  const { toast } = useToast()

  async function run(format: ArenaExportFormat): Promise<void> {
    setBusy(format)
    try {
      await apiDownload(arenaExportPath(format), arenaExportFileName(format))
    } catch {
      toast({
        tone: 'danger',
        title: 'Export failed',
        description: 'Try again in a moment.',
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-1" data-testid="arena-export">
      <div className="flex flex-wrap items-center gap-2">
        {(['csv', 'json'] as const).map((format) => (
          <Button
            key={format}
            variant="secondary"
            data-testid={`arena-export-${format}`}
            disabled={disabled || busy !== null}
            onClick={() => void run(format)}
          >
            <Download className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            {busy === format ? 'Exporting…' : `Export ${format.toUpperCase()}`}
          </Button>
        ))}
      </div>
      <p className="text-[11px] text-faint">
        A personal practice log of self-reported grades, not a verified record.
      </p>
    </div>
  )
}
