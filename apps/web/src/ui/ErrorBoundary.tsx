'use client'

/**
 * ErrorBoundary — crash containment for widget-sized subtrees.
 *
 * A rendering crash in one card (bad plugin data, a HUD edge case) must not
 * blank the whole page: this boundary renders the kit's Callout with the
 * classified copy from `@learning-hub/core/errors` plus a Try-again button
 * (resets the boundary; the subtree remounts cleanly). Used by the dashboard
 * renderer around every widget and available anywhere a third-party surface
 * renders.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { classifyError, type AppError } from '@learning-hub/core/errors'
import { Callout } from '@/ui/Feedback'
import { Button } from '@/ui/Button'

interface Props {
  children: ReactNode
  /** What crashed — shown so the user knows WHICH part failed. */
  label: string
  /** Called on every crash (telemetry/log seam; never throws). */
  onError?: (error: AppError, info: ErrorInfo) => void
}

interface State {
  error: AppError | null
  /** Render-cycle counter to detect repeated crashes (avoids a reset loop). */
  attempts: number
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, attempts: 0 }

  static getDerivedStateFromError(err: unknown): Partial<State> {
    return {
      error: classifyError(err, {
        online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
      }),
    }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    const classified = classifyError(err, {
      online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
    })
    // Full detail to the console (never to the headline): stack + component stack.
    console.error(`[ErrorBoundary] ${this.props.label} crashed:`, err, info.componentStack)
    try {
      this.props.onError?.(classified, info)
    } catch {
      /* telemetry must never crash the crash handler */
    }
  }

  private reset = () => {
    // After 2 quick resets of the SAME subtree, stop offering retry — a
    // persistent crash needs a reload, not a loop.
    if (this.state.attempts >= 2) return
    this.setState((s) => ({ error: null, attempts: s.attempts + 1 }))
  }

  render() {
    const { error, attempts } = this.state
    if (!error) return this.props.children

    return (
      <div role="alert" className="space-y-2">
        <Callout tone="danger" title={`${this.props.label}: ${error.title}`}>
          {error.recovery}
        </Callout>
        {error.canRetry && attempts < 2 && (
          <Button
            variant="secondary"
            icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
            onClick={this.reset}
          >
            Try again
          </Button>
        )}
        {attempts >= 2 && (
          <Button
            variant="ghost"
            icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => window.location.reload()}
          >
            Reload the page
          </Button>
        )}
        <p className="flex items-center gap-1.5 text-xs text-tertiary">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          {error.code !== 'unknown' ? `Problem code: ${error.code}` : 'Report this if it repeats.'}
        </p>
      </div>
    )
  }
}
