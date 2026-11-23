'use client'

/**
 * UpdateController — the missing last mile of the OTA system (O1-15/O1-25 glue).
 *
 * Mounted once in the app shell. On the native shell it:
 * 1. confirms boot to the Rust layer (`update_confirm_boot_ready`) so a healthy
 *    active slot never accumulates toward the rollback budget (O1-05);
 * 2. starts the background check scheduler (`startUpdateCheckScheduler`, which
 *    honors the Play gate, interval and Wi-Fi policy itself);
 * 3. on an offer, fetches the SIGNATURE-VERIFIED manifest through Rust and turns
 *    it into a concrete {@link UpdateOffer} with an honest size for THIS host;
 * 4. renders the ask-first {@link UpdateBanner} and, on consent, drives the
 *    host's apply path: Android sideload (download APK → PackageInstaller
 *    consent) or Windows shell updater (signed latest.json → NSIS passive).
 *
 * Calm by default: renders nothing until there is a real, applicable offer;
 * "Not now" is session-local (the next check re-offers); every failure surfaces
 * an honest notice, never a crash or a silent install. When a web delta update
 * is available (`requiresNative: false`), it is applied into the inactive A/B
 * slot and activated on restart without moving the webview origin or OPFS data.
 * Full-package native updates (APK sideload or Windows installer) are only used
 * when native shell changes require them.
 *
 * SSR-safe: all native work lives in effects; `renderToString` yields null.
 */
import React, { useEffect, useRef, useState } from 'react'
import { pickAndroidPackage, pickPatch, type UpdateManifest } from '@learning-hub/core/update'
import { isTauri } from '@/lib/transport'
import { getDeviceIdentity } from '@/lib/device'
import {
  APP_VERSION,
  onUpdateOffer,
  startUpdateCheckScheduler,
  type UpdateOfferInfo,
} from '@/lib/updates'
import { UpdateBanner, type UpdateOffer } from '@/components/UpdateBanner'
import { useUpdateDownloadProgress, type UpdateDownloadProgress } from '@/platform/update-progress'
import { androidDeviceInfo, installSideloadApk } from '@/platform/sideload'
import {
  applyDeltaPatch,
  downloadAndroidApk,
  fetchVerifiedManifest,
  getSlotStatus,
  installWindowsUpdate,
} from '@/platform/updater'
import { reportError } from '@/lib/telemetry'
import { Callout } from '@/ui'

/** An honest, transient status line shown under the banner (consent / errors). */
interface Notice {
  tone: 'info' | 'warning'
  text: string
}

export function UpdateController(): React.ReactElement | null {
  const [offer, setOffer] = useState<UpdateOffer | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [applying, setApplying] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [winProgress, setWinProgress] = useState<UpdateDownloadProgress | null>(null)
  const rustProgress = useUpdateDownloadProgress()

  // Apply-path data resolved from the verified manifest (kept out of render).
  const manifestRef = useRef<UpdateManifest | null>(null)
  const applyingRef = useRef(false)

  const platform = typeof navigator !== 'undefined' ? getDeviceIdentity().platform : 'other'
  const progress = platform === 'windows' ? winProgress : rustProgress

  /** Resolve the active version: prefers the native slot version, falls back to APP_VERSION. */
  async function getInstalledVersion(): Promise<string> {
    try {
      const slot = await getSlotStatus()
      if (slot?.activeVersion) return slot.activeVersion
    } catch {
      // ignore
    }
    return APP_VERSION
  }

  /** Turn a pointer offer into a host-specific, sized, applicable offer. */
  async function enrich(info: UpdateOfferInfo): Promise<void> {
    try {
      const manifest = await fetchVerifiedManifest(info.manifestUrl)
      if (!manifest) return // unverifiable manifest → never offer (design law)
      manifestRef.current = manifest
      const host = getDeviceIdentity().platform

      const currentVersion = await getInstalledVersion()
      const patch = currentVersion ? pickPatch(manifest, currentVersion) : null
      const isDeltaAvailable = !manifest.requiresNative && patch !== null

      if (isDeltaAvailable) {
        // Delta hot-update path (A/B slots): download patch into inactive slot,
        // promote, restart to apply. No full APK, no PackageInstaller dialog!
        let fullSize = manifest.fullPackageSize ?? 0
        if (host === 'android') {
          const device = await androidDeviceInfo()
          const pkg = pickAndroidPackage(manifest, device?.abi)
          if (pkg?.size) fullSize = pkg.size
        }
        setOffer({
          version: info.version,
          notes: info.notes ?? undefined,
          patchSize: patch.size,
          fullSize,
          requiresNative: false,
        })
        setDismissed(false)
        setNotice(null)
      } else if (host === 'android') {
        const device = await androidDeviceInfo()
        const pkg = pickAndroidPackage(manifest, device?.abi)
        if (!pkg) return // no APK for this device → nothing safe to apply
        setOffer({
          version: info.version,
          notes: info.notes ?? undefined,
          fullSize: pkg.size,
          requiresNative: true,
        })
        setDismissed(false)
        setNotice(null)
      } else if (host === 'windows') {
        setOffer({
          version: info.version,
          notes: info.notes ?? undefined,
          fullSize: manifest.fullPackageSize ?? 0,
          requiresNative: true,
        })
        setDismissed(false)
        setNotice(null)
      }
      // Other hosts (plain web): no native apply path — the banner stays hidden.
    } catch (err) {
      void reportError(err, {
        component: 'UpdateController',
        action: 'enrich',
        version: info.version,
      })
    }
  }

  useEffect(() => {
    if (!isTauri) return
    // O1-05: tell the Rust layer this boot is healthy (reset the rollback
    // counter). Independent of the update flavor — slot health always matters.
    void (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('update_confirm_boot_ready')
      } catch {
        // Shell predates the command — nothing to confirm.
      }
    })()
    const unsub = onUpdateOffer((info) => void enrich(info))
    const stop = startUpdateCheckScheduler({ onOffer: (info) => void enrich(info) })
    return () => {
      unsub()
      stop()
    }
  }, [])

  /** Android: download the verified APK, then run the consent-first install. */
  async function applyAndroid(): Promise<void> {
    try {
      const manifest = manifestRef.current
      const device = await androidDeviceInfo()
      const pkg = manifest ? pickAndroidPackage(manifest, device?.abi) : null
      if (!pkg) {
        setNotice({ tone: 'warning', text: 'No installer is available for this device yet.' })
        return
      }
      const path = await downloadAndroidApk(pkg)
      if (!path) {
        setNotice({
          tone: 'warning',
          text: 'The download failed — check your connection and try again.',
        })
        return
      }
      const result = await installSideloadApk(path)
      if (result?.consentRequired) {
        setNotice({
          tone: 'info',
          text: 'Allow “install unknown apps” for Learning HUB, then tap Download update again.',
        })
      } else if (result?.committed) {
        setNotice({
          tone: 'info',
          text: 'Installer opened — confirm on the system dialog to finish.',
        })
      } else {
        void reportError(new Error('Sideload install was not committed'), {
          component: 'UpdateController',
          action: 'installSideloadApk',
        })
        setNotice({ tone: 'warning', text: 'The installer could not start — please try again.' })
      }
    } catch (err) {
      void reportError(err, { component: 'UpdateController', action: 'applyAndroid' })
      setNotice({ tone: 'warning', text: 'The installer could not start — please try again.' })
    }
  }

  /** Windows: the official plugin verifies latest.json and runs the installer. */
  async function applyWindows(): Promise<void> {
    try {
      setWinProgress(null)
      const result = await installWindowsUpdate((p) => setWinProgress(p))
      if (result === 'no-update') {
        setOffer(null)
        setNotice({ tone: 'info', text: 'This device is already on the latest build.' })
      } else if (result === 'failed') {
        void reportError(new Error('Windows update install failed'), {
          component: 'UpdateController',
          action: 'applyWindows',
        })
        setNotice({
          tone: 'warning',
          text: 'The update could not be installed — please try again.',
        })
      } else if (result === 'unsupported') {
        setNotice({ tone: 'warning', text: 'Updates are not available on this device.' })
      }
      // 'installed': the shell relaunches into the new version — nothing to do.
    } catch (err) {
      void reportError(err, { component: 'UpdateController', action: 'applyWindows' })
      setNotice({ tone: 'warning', text: 'The update could not be installed — please try again.' })
    }
  }

  /** Delta update: download patch into inactive slot, promote, restart to apply. */
  async function applyDelta(): Promise<void> {
    try {
      const manifest = manifestRef.current
      if (!manifest) return
      const currentVersion = await getInstalledVersion()
      const patch = currentVersion ? pickPatch(manifest, currentVersion) : null
      if (!patch) {
        setNotice({
          tone: 'warning',
          text: 'Delta patch is not available for this version.',
        })
        return
      }
      const ok = await applyDeltaPatch(manifest, patch)
      if (ok) {
        setNotice({
          tone: 'info',
          text: 'Update installed! Restart Learning HUB to switch to the new version.',
        })
      } else {
        setNotice({
          tone: 'warning',
          text: 'The update download failed — check your connection and try again.',
        })
      }
    } catch (err) {
      void reportError(err, { component: 'UpdateController', action: 'applyDelta' })
      setNotice({
        tone: 'warning',
        text: 'The update could not be applied — please try again.',
      })
    }
  }

  async function onApply(): Promise<void> {
    if (applyingRef.current) return
    applyingRef.current = true
    setApplying(true)
    setNotice(null)
    try {
      if (offer?.requiresNative) {
        const host = getDeviceIdentity().platform
        if (host === 'android') await applyAndroid()
        else if (host === 'windows') await applyWindows()
      } else {
        await applyDelta()
      }
    } catch (err) {
      void reportError(err, { component: 'UpdateController', action: 'onApply' })
      setNotice({
        tone: 'warning',
        text: 'An unexpected error occurred while applying the update.',
      })
    } finally {
      applyingRef.current = false
      setApplying(false)
    }
  }

  if (!isTauri) return null

  return (
    <>
      <UpdateBanner
        offer={dismissed ? null : offer}
        applying={applying}
        progress={progress}
        onApply={() => void onApply()}
        onDismiss={() => setDismissed(true)}
      />
      {notice && !dismissed ? (
        <div className="mt-2">
          <Callout tone={notice.tone === 'warning' ? 'warning' : 'cyan'}>{notice.text}</Callout>
        </div>
      ) : null}
    </>
  )
}
