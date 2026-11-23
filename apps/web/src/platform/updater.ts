'use client'

/**
 * Native update bridge — the webview-side wrappers around the Rust update
 * commands and the official Windows updater plugin. Mirrors `platform/sideload.ts`
 * and `platform/haptics.ts`: dynamic `@tauri-apps/api` imports behind `isTauri`,
 * null/no-op on plain web, and every native error resolves to a calm sentinel so
 * the update controller renders an honest retry state instead of crashing.
 *
 * Three host paths (docs/updates.md §"Platform matrix"):
 * - **Android sideload:** fetch the signature-verified manifest, pick the APK
 *   for the device ABI, download it sha256-checked through the Rust downloader,
 *   then hand it to `installSideloadApk` (PackageInstaller consent flow).
 * - **Windows:** the official `tauri-plugin-updater` consumes the signed
 *   `latest.json` and runs the NSIS installer (passive) — the shell updates
 *   itself; the web payload ships inside the new installer.
 * - **Web (browser):** none of this applies — reload is the update. Every
 *   function here is a no-op off the native shell.
 *
 * A/B web-slot promotion is deliberately NOT wired here: serving a slot changes
 * the webview origin and would relocate the OPFS database (docs/updates.md
 * §"Slots & the webview origin", rule 10 adjacency). Until an origin-independent
 * storage path or a first-boot migration lands, full-package updates are the
 * only safe apply path on both native hosts.
 */
import { isTauri } from '@/lib/transport'
import { getDeviceIdentity } from '@/lib/device'
import { sideloadSupported } from '@/platform/sideload'
import { reportError } from '@/lib/telemetry'
import type { UpdateAndroidPackage, UpdateManifest } from '@learning-hub/core/update'

/**
 * Fetch the channel manifest through the Rust layer, which verifies its Ed25519
 * minisign signature against the committed public key BEFORE returning it
 * (design law: an unsigned/tampered manifest is treated as hostile, never used).
 * Returns `null` off-Tauri, on a bad URL, or on any native/verification failure.
 */
export async function fetchVerifiedManifest(
  manifestUrl: string | null,
): Promise<UpdateManifest | null> {
  if (!isTauri || !manifestUrl) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<UpdateManifest>('update_fetch_verified_manifest', { manifestUrl })
  } catch (err) {
    void reportError(err, { action: 'fetch_verified_manifest', url: manifestUrl })
    return null
  }
}

/**
 * Download a full Android APK through the Rust resumable downloader (sha256 +
 * size verified, confined to the updates dir, progress on `update://download-
 * progress`). Resolves to the absolute on-disk path for `installSideloadApk`,
 * or `null` off-Android / on failure.
 */
export async function downloadAndroidApk(pkg: UpdateAndroidPackage): Promise<string | null> {
  if (!sideloadSupported()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('update_download_android_apk', {
      url: pkg.url,
      expectedSha256: pkg.sha256,
      total: pkg.size,
    })
  } catch (err) {
    void reportError(err, { action: 'download_android_apk', url: pkg.url })
    return null
  }
}

/** Outcome of a Windows shell-update attempt (honest union, never throws). */
export type WindowsUpdateResult = 'installed' | 'no-update' | 'unsupported' | 'failed'

/** Live progress for the Windows installer download (banner bar). */
export interface WindowsUpdateProgress {
  downloaded: number
  total: number
}

/**
 * Run the official Windows updater: `check()` reads the signed `latest.json`
 * from the configured endpoint and compares it against the installed shell
 * version; on a newer build `downloadAndInstall()` verifies the artifact
 * signature and runs the NSIS installer (passive — the shell relaunches into
 * the new version). `onProgress` feeds the banner's live bar.
 *
 * Returns `unsupported` off-Windows-Tauri, `no-update` when the shell is already
 * current, `failed` on any network/verify/install error (controller shows retry).
 */
export async function installWindowsUpdate(
  onProgress?: (progress: WindowsUpdateProgress) => void,
): Promise<WindowsUpdateResult> {
  if (!isTauri || getDeviceIdentity().platform !== 'windows') return 'unsupported'
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    if (!update) return 'no-update'
    let downloaded = 0
    let total = 0
    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        total = event.data.contentLength ?? 0
        onProgress?.({ downloaded: 0, total })
      } else if (event.event === 'Progress') {
        downloaded += event.data.chunkLength
        onProgress?.({ downloaded, total })
      } else if (event.event === 'Finished') {
        onProgress?.({ downloaded: total, total })
      }
    })
    return 'installed'
  } catch (err) {
    void reportError(err, { action: 'install_windows_update' })
    return 'failed'
  }
}
