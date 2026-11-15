import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  applyThemePreference,
  normalizeThemePreference,
  resolveIsDark,
  THEME_STORAGE_KEY,
} from '../src/components/ThemeSync'
import {
  hapticBreathe,
  hapticHeavy,
  hapticHypercorrection,
  hapticLight,
  hapticMedium,
  hapticWarning,
  hapticsEnabled as hapticsFlag,
  setHapticsEnabled,
} from '../src/platform/haptics'

describe('Calm Sensory & E-Ink Zen Mode (Phase 3.3)', () => {
  describe('ThemeSync & E-Ink Zen Mode', () => {
    it('normalizes known theme preferences including e-ink', () => {
      expect(normalizeThemePreference('dark')).toBe('dark')
      expect(normalizeThemePreference('light')).toBe('light')
      expect(normalizeThemePreference('system')).toBe('system')
      expect(normalizeThemePreference('e-ink')).toBe('e-ink')
      expect(normalizeThemePreference('neon')).toBe('dark')
      expect(normalizeThemePreference(null)).toBe('dark')
      expect(normalizeThemePreference(undefined)).toBe('dark')
    })

    it('resolves dark status correctly for e-ink as high-contrast light base', () => {
      expect(resolveIsDark('e-ink')).toBe(false)
      expect(resolveIsDark('light')).toBe(false)
      expect(resolveIsDark('dark')).toBe(true)
    })

    it('applies e-ink theme onto html classList without crashing in DOM environments', () => {
      const classList = new Set<string>()
      const storage: Record<string, string> = {}
      const mockDocument = {
        documentElement: {
          classList: {
            add: (c: string) => classList.add(c),
            remove: (c: string) => classList.delete(c),
            toggle: (c: string, force?: boolean) => {
              if (force === undefined) {
                if (classList.has(c)) classList.delete(c)
                else classList.add(c)
              } else if (force) {
                classList.add(c)
              } else {
                classList.delete(c)
              }
            },
            contains: (c: string) => classList.has(c),
          },
          style: { colorScheme: '' },
        },
      }
      const mockWindow = {
        localStorage: {
          setItem: (k: string, v: string) => {
            storage[k] = v
          },
          getItem: (k: string) => storage[k] ?? null,
        },
        matchMedia: () => ({ matches: false }),
      }

      vi.stubGlobal('document', mockDocument)
      vi.stubGlobal('window', mockWindow)

      applyThemePreference('e-ink')
      expect(storage[THEME_STORAGE_KEY]).toBe('e-ink')
      expect(classList.has('theme-e-ink')).toBe(true)
      expect(classList.has('dark')).toBe(false)
      expect(mockDocument.documentElement.style.colorScheme).toBe('light')

      applyThemePreference('dark')
      expect(storage[THEME_STORAGE_KEY]).toBe('dark')
      expect(classList.has('theme-e-ink')).toBe(false)
      expect(classList.has('dark')).toBe(true)
      expect(mockDocument.documentElement.style.colorScheme).toBe('dark')

      vi.unstubAllGlobals()
    })
  })

  describe('Tactile Haptic Feedback & Web Vibration API Fallback', () => {
    let vibrateSpy: ReturnType<typeof vi.fn>

    beforeEach(() => {
      vibrateSpy = vi.fn().mockReturnValue(true)
      vi.stubGlobal('navigator', {
        ...globalThis.navigator,
        vibrate: vibrateSpy,
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('triggers calibrated tactile vibrations on the web for grading & alerts', () => {
      hapticLight()
      expect(vibrateSpy).toHaveBeenCalledWith(12)

      hapticMedium()
      expect(vibrateSpy).toHaveBeenCalledWith(25)

      hapticHeavy()
      expect(vibrateSpy).toHaveBeenCalledWith(50)

      hapticWarning()
      expect(vibrateSpy).toHaveBeenCalledWith([40, 60, 40])

      hapticHypercorrection()
      expect(vibrateSpy).toHaveBeenCalledWith([20, 40, 20])

      hapticBreathe()
      expect(vibrateSpy).toHaveBeenCalledWith([20, 100, 20, 100, 30])
    })

    it('opt-out invariant (F-06): disabled → every helper is a silent no-op', () => {
      setHapticsEnabled(false)
      expect(hapticsFlag()).toBe(false)

      hapticLight()
      hapticMedium()
      hapticHeavy()
      hapticWarning()
      hapticHypercorrection()
      hapticBreathe()
      expect(vibrateSpy).not.toHaveBeenCalled()

      // Re-enabling restores feedback (settings toggle round-trip).
      setHapticsEnabled(true)
      expect(hapticsFlag()).toBe(true)
      hapticLight()
      expect(vibrateSpy).toHaveBeenCalledWith(12)
    })

    afterEach(() => {
      // Leave the module default for later suites.
      setHapticsEnabled(true)
    })
  })
})
