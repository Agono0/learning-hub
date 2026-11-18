'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { ToastProvider } from '@/ui'
import { GlobalTimerProvider } from '@/lib/use-global-timer'
import { ThemeSync } from './ThemeSync'
import { PwaRegister } from './PwaRegister'

/** Per-render instantiation (SSR-safe), per TanStack docs. */
export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: false } },
      }),
  )
  return (
    <QueryClientProvider client={qc}>
      <ThemeSync />
      <PwaRegister />
      <GlobalTimerProvider>
        <ToastProvider>{children}</ToastProvider>
      </GlobalTimerProvider>
    </QueryClientProvider>
  )
}
