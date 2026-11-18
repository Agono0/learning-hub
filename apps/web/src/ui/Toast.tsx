'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cx } from './cx'

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger'

export interface ToastInput {
  title: string
  description?: string
  tone?: ToastTone
  durationMs?: number
}

interface ToastRecord extends ToastInput {
  id: number
  tone: ToastTone
}

interface ToastContextValue {
  toast: (input: ToastInput | string) => void
  dismiss: (id: number) => void
}

const noopContext: ToastContextValue = {
  toast: () => undefined,
  dismiss: () => undefined,
}

const ToastContext = createContext<ToastContextValue>(noopContext)

const TONE_STYLES: Record<ToastTone, string> = {
  neutral:
    'border-neutral-200 bg-white text-neutral-900 dark:border-(--hub-border) dark:bg-(--hub-panel) dark:text-neutral-100',
  success:
    'border-emerald-500/30 bg-white text-neutral-900 dark:border-emerald-500/30 dark:bg-(--hub-panel-2) dark:text-emerald-100',
  warning:
    'border-amber-500/30 bg-white text-neutral-900 dark:border-amber-500/30 dark:bg-(--hub-panel-2) dark:text-amber-100',
  danger:
    'border-rose-500/35 bg-white text-neutral-900 dark:border-rose-500/35 dark:bg-(--hub-panel-2) dark:text-rose-100',
}

function ToneIcon({ tone }: { tone: ToastTone }) {
  if (tone === 'success')
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success-text" />
  if (tone === 'danger' || tone === 'warning')
    return (
      <AlertCircle
        className={cx(
          'h-4 w-4 shrink-0',
          tone === 'danger' ? 'text-danger-text' : 'text-status-warning-text',
        )}
      />
    )
  return <Info className="h-4 w-4 shrink-0 text-ac-text" />
}

/**
 * Calm, mobile-safe toast notifications replacing browser `window.alert()`.
 * Clears the phone bottom tab bar automatically via bottom offset.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastRecord[]>([])
  const seqRef = useRef(1)

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    (input: ToastInput | string) => {
      const normalized: ToastInput = typeof input === 'string' ? { title: input } : input
      const id = seqRef.current++
      const record: ToastRecord = {
        id,
        title: normalized.title,
        description: normalized.description,
        tone: normalized.tone ?? 'neutral',
        durationMs: normalized.durationMs ?? 4200,
      }
      setItems((prev) => [...prev.slice(-3), record])
      if ((record.durationMs ?? 4200) > 0) {
        setTimeout(() => dismiss(id), record.durationMs ?? 4200)
      }
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[70] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 md:bottom-5 print:hidden"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'danger' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm shadow-lg backdrop-blur transition-all',
              TONE_STYLES[item.tone],
            )}
          >
            <div className="mt-0.5">
              <ToneIcon tone={item.tone} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium leading-snug">{item.title}</div>
              {item.description && (
                <div className="mt-0.5 text-xs text-tertiary dark:text-faint">
                  {item.description}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss notification"
              className="rounded-md p-1 text-faint hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-(--hub-panel-2) dark:hover:text-neutral-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
