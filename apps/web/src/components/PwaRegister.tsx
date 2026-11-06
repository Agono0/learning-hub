'use client'

import { useEffect } from 'react'
import { registerServiceWorker } from '@/platform/pwa'

/** Mounts once; registers the offline service worker in production builds. */
export function PwaRegister() {
  useEffect(() => {
    registerServiceWorker()
  }, [])
  return null
}
