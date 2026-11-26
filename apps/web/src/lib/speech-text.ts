/**
 * Language-aware helpers for the hands-free audio studios. Cards are often Arabic (or Hebrew,
 * Chinese, ...): speaking them with an English voice and scoring a spoken answer against the
 * card with an ASCII-only filter both break for any non-Latin text.
 */

/** BCP-47 tag for the script the text is mostly written in; `fallback` for Latin or empty text. */
export function detectSpeechLang(text: string, fallback = 'en-US'): string {
  const counts = { ar: 0, he: 0, ja: 0, zh: 0, ko: 0, ru: 0, hi: 0, latin: 0 }
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0
    if (
      (c >= 0x0600 && c <= 0x06ff) ||
      (c >= 0x0750 && c <= 0x077f) ||
      (c >= 0xfb50 && c <= 0xfdff) ||
      (c >= 0xfe70 && c <= 0xfeff)
    )
      counts.ar++
    else if (c >= 0x0590 && c <= 0x05ff) counts.he++
    else if (c >= 0x3040 && c <= 0x30ff) counts.ja++
    else if (c >= 0x4e00 && c <= 0x9fff) counts.zh++
    else if (c >= 0xac00 && c <= 0xd7af) counts.ko++
    else if (c >= 0x0400 && c <= 0x04ff) counts.ru++
    else if (c >= 0x0900 && c <= 0x097f) counts.hi++
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) counts.latin++
  }
  const tags: Record<string, string> = {
    ar: 'ar',
    he: 'he-IL',
    ja: 'ja-JP',
    zh: 'zh-CN',
    ko: 'ko-KR',
    ru: 'ru-RU',
    hi: 'hi-IN',
  }
  let best: string | null = null
  let bestCount = counts.latin
  for (const key of Object.keys(tags)) {
    const n = counts[key as keyof typeof counts]
    if (n > bestCount) {
      best = key
      bestCount = n
    }
  }
  return best ? tags[best]! : fallback
}

/** Lower-case, strip diacritics and punctuation; keeps letters and digits of every script. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\p{M}\u0640]/gu, '') // combining marks (incl. Arabic harakat) and tatweel
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Percent (0-100) of the target's words that appear in the spoken transcript. */
export function spokenMatchPercent(target: string, transcript: string): number | null {
  const words = normalizeForMatch(target).split(' ').filter(Boolean)
  if (words.length === 0) return null
  const spoken = normalizeForMatch(transcript)
  if (spoken === '') return 0
  const matched = words.filter((w) => spoken.includes(w))
  return Math.round((matched.length / words.length) * 100)
}
