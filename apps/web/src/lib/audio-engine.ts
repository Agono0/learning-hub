/**
 * Learning HUB — Client-side Web Audio & Speech Synthesis/Recognition Engine.
 *
 * Provides hands-free audio playback, microphone speech recognition,
 * screen wake-lock, and audio feedback beeps.
 */
import { getMasterGain, getSharedAudioContext } from './audio-graph'
import { detectSpeechLang } from './speech-text'

export interface SpeechSynthesisOptions {
  rate?: number
  pitch?: number
  lang?: string
}

/**
 * Speaks text using the browser SpeechSynthesis API.
 */
export function speakText(text: string, options?: SpeechSynthesisOptions): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve()
      return
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = options?.rate ?? 1.0
    utterance.pitch = options?.pitch ?? 1.0
    utterance.lang = options?.lang ?? detectSpeechLang(text)

    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()

    window.speechSynthesis.speak(utterance)
  })
}

/**
 * Stops any active speech synthesis.
 */
export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

/**
 * Listens for user spoken answer via SpeechRecognition API.
 */
/** The subset of the Web Speech API recognizer used here (not in TS's DOM lib). */
interface SpeechRecognizer {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}

interface SpeechResultEvent {
  results?: ArrayLike<ArrayLike<{ transcript: string }>>
}

type SpeechRecognizerCtor = new () => SpeechRecognizer

/** The standard or WebKit-prefixed recognizer constructor, if the browser has one. */
function speechRecognizerCtor(): SpeechRecognizerCtor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognizerCtor
    webkitSpeechRecognition?: SpeechRecognizerCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function listenForSpeech(timeoutMs = 6000): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve('')
      return
    }

    const SpeechRecognition = speechRecognizerCtor()

    if (!SpeechRecognition) {
      resolve('')
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.lang = 'en-US'
      recognition.continuous = false
      recognition.interimResults = false

      let resolved = false
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true
          recognition.abort()
          resolve('')
        }
      }, timeoutMs)

      recognition.onresult = (event) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          const transcript = event.results?.[0]?.[0]?.transcript ?? ''
          resolve(transcript)
        }
      }

      recognition.onerror = () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          resolve('')
        }
      }

      recognition.onend = () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          resolve('')
        }
      }

      recognition.start()
    } catch {
      resolve('')
    }
  })
}

/**
 * Plays a pleasant synthesizer tone (chime / beep) via Web Audio API.
 */
export function playChime(
  freqOrCue: number | 'listen' | 'success' | 'fail' = 520,
  durationMs = 200,
): void {
  if (typeof window === 'undefined') return
  // One shared AudioContext (audio-graph singleton): browsers cap concurrent
  // contexts, so creating one per chime made cues go silent after a few.
  void playChimeOnSharedGraph(freqOrCue, durationMs)
}

async function playChimeOnSharedGraph(
  freqOrCue: number | 'listen' | 'success' | 'fail',
  durationMs: number,
): Promise<void> {
  try {
    let freq = 520
    if (typeof freqOrCue === 'number') {
      freq = freqOrCue
    } else if (freqOrCue === 'listen') {
      freq = 660
    } else if (freqOrCue === 'success') {
      freq = 880
    } else if (freqOrCue === 'fail') {
      freq = 280
    }

    const ctx = await getSharedAudioContext()
    const master = await getMasterGain()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, ctx.currentTime)

    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000)

    osc.connect(gain)
    gain.connect(master)
    osc.onended = () => {
      osc.disconnect()
      gain.disconnect()
    }

    osc.start()
    osc.stop(ctx.currentTime + durationMs / 1000)
  } catch {
    // Ignore audio context autoplay policy blocks
  }
}

/**
 * Requests a screen wake lock so the phone screen stays awake during audio commute sessions.
 */
export async function acquireWakeLock(): Promise<WakeLockSentinel | null> {
  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
    try {
      return await navigator.wakeLock.request('screen')
    } catch {
      return null
    }
  }
  return null
}
