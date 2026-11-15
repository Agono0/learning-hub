'use client'

/**
 * Unified Audio Graph Singleton (Rule #2 runtime-neutral / browser-only).
 *
 * Provides a single shared AudioContext, master gain stage with soft anti-pop ramps,
 * mobile autoplay gesture-unlock, and a global stopAllAudio() hook to prevent
 * multiple audio contexts from clashing or leaking across navigation.
 */

let sharedContext: AudioContext | null = null
let masterGain: GainNode | null = null
const activeSources = new Set<() => void>()

/**
 * Retrieves the shared AudioContext, creating and unlocking it if necessary.
 */
export async function getSharedAudioContext(): Promise<AudioContext> {
  if (typeof window === 'undefined') {
    throw new Error('Web Audio is only supported in browser environments.')
  }

  if (!sharedContext) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    sharedContext = new AudioContextClass()

    masterGain = sharedContext.createGain()
    masterGain.gain.setValueAtTime(0.8, sharedContext.currentTime)
    masterGain.connect(sharedContext.destination)
  }

  if (sharedContext.state === 'suspended') {
    try {
      await sharedContext.resume()
    } catch {
      /* User gesture may still be required */
    }
  }

  return sharedContext
}

/**
 * Returns the master gain node for volume control.
 */
export async function getMasterGain(): Promise<GainNode> {
  await getSharedAudioContext()
  return masterGain!
}

/**
 * Sets master volume with a smooth 40ms audio ramp to eliminate pops and clicks.
 */
export async function setMasterVolume(volume: number, rampMs = 40): Promise<void> {
  const gain = await getMasterGain()
  const ctx = await getSharedAudioContext()
  const target = Math.max(0, Math.min(1, volume))
  const now = ctx.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(gain.gain.value, now)
  gain.gain.linearRampToValueAtTime(target, now + rampMs / 1000)
}

/**
 * Registers an active sound source so it can be stopped globally on route changes.
 * Returns an unregister cleanup function.
 */
export function registerAudioSource(stopFn: () => void): () => void {
  activeSources.add(stopFn)
  return () => {
    activeSources.delete(stopFn)
  }
}

/**
 * Stops all currently active sounds across the application and clears sources.
 */
export function stopAllAudio(): void {
  for (const stop of activeSources) {
    try {
      stop()
    } catch {
      /* Ignore individual stop errors */
    }
  }
  activeSources.clear()

  if (masterGain && sharedContext) {
    const now = sharedContext.currentTime
    masterGain.gain.cancelScheduledValues(now)
    masterGain.gain.setValueAtTime(0.8, now)
  }
}
