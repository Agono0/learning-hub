'use client'

/**
 * Text-to-speech (Web Speech API) — per-card read-aloud on the review page.
 * Graceful everywhere: when speechSynthesis is missing every call is a no-op.
 */
export function isSpeechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** Speaks `text` in the UI language; cancels any in-flight utterance first. */
export function speak(text: string, lang?: string): void {
  if (!isSpeechAvailable() || !text.trim()) return
  try {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 600))
    utterance.lang = lang ?? navigator.language
    utterance.rate = 1
    window.speechSynthesis.speak(utterance)
  } catch {
    /* speech is a nicety, never a dependency */
  }
}

export function stopSpeaking(): void {
  if (!isSpeechAvailable()) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    /* ignore */
  }
}
