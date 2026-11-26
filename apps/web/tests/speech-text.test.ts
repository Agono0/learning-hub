import { describe, expect, it } from 'vitest'
import { createCueSequencer } from '../src/lib/cue-sequencer'
import { detectSpeechLang, normalizeForMatch, spokenMatchPercent } from '../src/lib/speech-text'

describe('detectSpeechLang', () => {
  it('picks the script of the text', () => {
    expect(detectSpeechLang('ما هي عاصمة مصر؟')).toBe('ar')
    expect(detectSpeechLang('שלום עולם')).toBe('he-IL')
    expect(detectSpeechLang('日本語のテスト')).toBe('ja-JP')
    expect(detectSpeechLang('Привет мир')).toBe('ru-RU')
  })
  it('falls back for Latin, empty and number-only text', () => {
    expect(detectSpeechLang('hello world')).toBe('en-US')
    expect(detectSpeechLang('')).toBe('en-US')
    expect(detectSpeechLang('123', 'fr-FR')).toBe('fr-FR')
  })
  it('uses the majority script in mixed text', () => {
    expect(detectSpeechLang('القاهرة is the capital of Egypt and a big city')).toBe('en-US')
    expect(detectSpeechLang('عاصمة مصر هي Cairo')).toBe('ar')
  })
})

describe('spokenMatchPercent', () => {
  it('scores Arabic answers instead of always returning the empty-text default', () => {
    expect(spokenMatchPercent('القاهرة عاصمة مصر', 'القاهرة عاصمة مصر')).toBe(100)
    expect(spokenMatchPercent('القاهرة عاصمة مصر', 'لا اعرف')).toBe(0)
  })
  it('ignores Arabic diacritics and punctuation', () => {
    expect(normalizeForMatch('مَصْرُ، القاهرة!')).toBe('مصر القاهرة')
  })
  it('still handles English', () => {
    expect(spokenMatchPercent('The Nile river', 'the nile')).toBe(67)
    expect(spokenMatchPercent('Nile.', '')).toBe(0)
  })
  it('returns null when the target has no words', () => {
    expect(spokenMatchPercent('?!', 'anything')).toBeNull()
  })
})

describe('createCueSequencer', () => {
  function harness() {
    const timers: { fn: () => void; ms: number; live: boolean }[] = []
    const spoken: string[] = []
    const cursor: number[] = []
    let done = 0
    const resolvers: (() => void)[] = []
    const seq = createCueSequencer({
      cues: [
        { text: 'a', pauseMs: 100 },
        { text: 'b', pauseMs: 100 },
      ],
      speak: (t) => {
        spoken.push(t)
        return new Promise<void>((r) => resolvers.push(r))
      },
      onCursor: (i) => cursor.push(i),
      onDone: () => done++,
      schedule: (fn, ms) => {
        const t = { fn, ms, live: true }
        timers.push(t)
        return () => {
          t.live = false
        }
      },
    })
    const flush = () => new Promise((r) => setTimeout(r, 0))
    return { seq, timers, spoken, cursor, resolvers, flush, done: () => done }
  }

  it('plays cues in order with pauses and finishes', async () => {
    const h = harness()
    h.seq.start()
    h.resolvers[0]!()
    await h.flush()
    expect(h.timers[0]!.ms).toBe(100)
    h.timers[0]!.fn()
    h.resolvers[1]!()
    await h.flush()
    h.timers[1]!.fn()
    expect(h.spoken).toEqual(['a', 'b'])
    expect(h.done()).toBe(1)
  })

  it('stop during the pause cancels the next cue', async () => {
    const h = harness()
    h.seq.start()
    h.resolvers[0]!()
    await h.flush()
    h.seq.stop()
    expect(h.timers[0]!.live).toBe(false)
    if (h.timers[0]!.live) h.timers[0]!.fn()
    expect(h.spoken).toEqual(['a'])
  })

  it('stop while a cue is speaking prevents scheduling the pause', async () => {
    const h = harness()
    h.seq.start()
    h.seq.stop()
    h.resolvers[0]!()
    await h.flush()
    expect(h.timers).toHaveLength(0)
    expect(h.done()).toBe(0)
  })

  it('restarting ignores the old run', async () => {
    const h = harness()
    h.seq.start()
    h.seq.start()
    h.resolvers[0]!()
    await h.flush()
    expect(h.timers).toHaveLength(0)
    h.resolvers[1]!()
    await h.flush()
    expect(h.timers).toHaveLength(1)
  })
})
