'use client'

/**
 * GlobalErrorBoundary — top-level crash containment and diagnostic reporter.
 *
 * Catches unhandled render crashes in the React tree, reports the error and
 * component stack to the telemetry service (`reportError`), initializes the
 * global unhandled error handlers, and renders a calm, accessible fallback UI
 * so the user can retry rendering or reload the page without data loss.
 */
import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react'
import { Button, Callout } from '@/ui'
import { initGlobalErrorHandlers, reportError } from '@/lib/telemetry'

export interface GlobalErrorBoundaryProps {
  children: ReactNode
  /** Optional custom fallback element or render function. */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode)
  /** Optional observer callback invoked whenever an error is caught. */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

export interface GlobalErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class GlobalErrorBoundary extends Component<
  GlobalErrorBoundaryProps,
  GlobalErrorBoundaryState
> {
  state: GlobalErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  }

  static getDerivedStateFromError(error: unknown): Partial<GlobalErrorBoundaryState> {
    const normalized = error instanceof Error ? error : new Error(String(error))
    return { hasError: true, error: normalized }
  }

  componentDidMount(): void {
    initGlobalErrorHandlers()
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    void reportError(error, {
      component: 'GlobalErrorBoundary',
      componentStack: errorInfo.componentStack,
    })

    try {
      this.props.onError?.(error, errorInfo)
    } catch {
      // Telemetry / observer callback must never crash the boundary
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    if (this.props.fallback) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error ?? new Error('Unknown error'), this.reset)
      }
      return this.props.fallback
    }

    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center"
      >
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-(--hub-border) dark:bg-(--hub-panel)">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
            <AlertTriangle className="h-6 w-6" aria-hidden />
          </div>

          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Something unexpected happened
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Learning HUB ran into an issue displaying this view. Your progress and study data are
              safely saved.
            </p>
          </div>

          {this.state.error?.message ? (
            <div className="text-left">
              <Callout tone="warning" title="Error Details">
                {this.state.error.message}
              </Callout>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              variant="secondary"
              icon={<RotateCcw className="h-4 w-4" aria-hidden />}
              onClick={this.reset}
            >
              Try again
            </Button>
            <Button
              variant="ghost"
              icon={<RefreshCw className="h-4 w-4" aria-hidden />}
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.reload()
                }
              }}
            >
              Reload application
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
