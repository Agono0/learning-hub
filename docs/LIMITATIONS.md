# LIMITATIONS — hard platform limits and what Learning HUB does about them

> Honest boundaries of the Max Focus device lock (Epic M2) and the delta OTA
> system (Epic O1). These are OS-enforced limits, not bugs; each entry names
> what we do, what we cannot do, and the task that owns the mitigation.
> Architecture: [docs/updates.md](updates.md), [docs/max-focus.md](max-focus.md)
> (M2-28), [docs/adr/](adr/README.md).

## Windows: Ctrl+Alt+Del (and the Secure Attention Sequence) is unblockable

`Ctrl+Alt+Del` is handled by Winlogon in a secure desktop **before any
application — or any user-mode hook — ever sees it**. There is no documented,
supported way for a normal process to intercept it, and hacking it (keyboard
driver filter, injuring Winlogon) would require a kernel driver plus would
break OS security guarantees.

What Max Focus does about it, per tier (locked Phase-1 decision: admin is
optional per session, M2-08):

| Tier                | Mechanism                                                                                                     | Effect                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1 (always)          | Low-level keyboard hook (M2-06) swallows Win, Alt+Tab, Alt+F4, Ctrl+Esc                                       | The everyday escapes are gone          |
| 1 (always)          | Foreground guard (M2-07) refocuses the lock window when Task Manager or any other window takes the foreground | The lock visually wins within ~500 ms  |
| 2 (admin, optional) | `DisableTaskMgr` policy + elevated watchdog (M2-08), restored unconditionally on session end via a drop guard | Task Manager cannot be launched at all |

What remains possible for a determined user at every tier: press
`Ctrl+Alt+Del`, start Task Manager from the secure screen, kill the app. At
tier 2 this is the ONLY remaining hole; at tier 1 the refocus loop keeps the
lock in front even then. Session state is persisted (M2-24) so a killed
session is re-applied on the next boot — killing the app is not an exit, it
just makes the machine state visible.

Related unblockable keys on Windows: `Win+L` (lock workstation) and secure
desktop UAC prompts. Both are treated as safe: locking the workstation pauses
nothing (M2-24 resumes), and UAC over the lock window is expected behavior for
an admin-tier session.

## Android: no silent installs without Device Owner (Play hot-patch policy)

Android's package installation is consent-gated by design:

1. **`REQUEST_INSTALL_PACKAGES`** (sideload builds, O1-13) only makes the
   per-app "install unknown apps" grant screen available. Even with the grant,
   every `PackageInstaller.commit()` shows the **system install dialog** — the
   user presses "Install" on every update. There is no user-mode API to skip
   that dialog.
2. **Device Owner** (Tier 1, M2-10/M2-11) can create **silent** install
   sessions — but only after the owner is provisioned (ADB `dpm
set-device-owner` on a device with no accounts, by explicit user action in
   the setup wizard). That is the locked Phase-1 design: Tier 1 = Owner,
   Tier 2 = AccessibilityService fallback (M2-12) with the consent dialog.
3. **Play-distributed builds disable self-update entirely**
   (`LH_UPDATE_CHANNEL=play`, O1-12). Beyond store policy, a hot patch
   delivered outside Play's review flow is a policy violation — so Play
   builds never see the update banner, the changelog panel, or any download
   path (the gate is baked at build time and cannot be flipped at runtime).

**Hot-patch policy on Play:** no hot patches, no delta slots, no sideloaded
artifacts reach a Play build. Updates ship through the store's own review
cadence; the delta system (A/B slots, manifest, patches) applies to Windows
and Android _sideload_ only.

## Other honest limits (tracked, not solved here)

- **Windows keyboard hooks can be dropped by the OS** if a handler stalls
  (LowLevelHooksTimeout). Mitigation by construction: the M2-06 hook proc only
  touches atomics; the M2-07 loop re-asserts the lock visually regardless.
- **Focus stealing is best-effort without elevation**: `SetForegroundWindow`
  can be refused for background processes; the TOPMOST z-order re-assertion in
  M2-07 is the visual backstop. M2-08 hardens with elevation.
- **The webview origin moves when a slot is promoted** (O1-04): OPFS/localStorage
  are scoped per origin. Mitigated by the boot-confirm rollback (O1-05) and
  documented in docs/updates.md §"Slots & the webview origin".
- **Nightly artifacts are unsigned until the signing secret is configured**
  (O1-09): the client refuses unsigned manifests by design, so an unsigned
  nightly is inert, never silently trusted.
