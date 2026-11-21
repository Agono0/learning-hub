import type { Metadata, Viewport } from 'next'
import { Fredoka, Nunito } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/Providers'
import { AppShell } from '@/components/AppShell'

/**
 * Playful clay identity (ui-ux-pro-max recipe: "Soft Rounded" + "Playful
 * Creative" pairings): Fredoka for headings, Nunito for body. next/font
 * self-hosts both at build time — no runtime fetch, offline-safe.
 */
const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-heading',
  display: 'swap',
})
const nunito = Nunito({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Learning HUB',
  description: 'The research-backed self-learning system',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
}

/** Edge-to-edge on Android/notched devices; the shell pads with safe-area insets. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0b' },
  ],
}

/** Applies mode + palette before first paint (no flash). Mirrors ThemeSync. */
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('lh-theme')||'dark';var e=t==='e-ink';var d=!e&&(t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches));document.documentElement.classList.toggle('dark',d);document.documentElement.classList.toggle('theme-e-ink',e);document.documentElement.style.colorScheme=e?'light':(d?'dark':'light');var p=localStorage.getItem('lh-palette');document.documentElement.dataset.theme=p||'calm';}catch(e){}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${fredoka.variable} ${nunito.variable}`}
      data-theme="calm"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
