/**
 * Learning HUB Focus Enforcer — Background Service Worker (MV3).
 *
 * Synchronizes with the native app's loopback bridge or web server,
 * applies Declarative Net Request rules, and fail-closed guards active sessions.
 */
import { buildDnrRules } from '@learning-hub/core/focus-lock'
import {
  buildCardCreate,
  buildReaderIngest,
  captureEndpoints,
  resolveDeck,
  sendToFirst,
} from './capture'
import { buildFrictionReport, decideFriction } from './friction'
import { DEFAULT_PORT, STATE_KEYS, parseStoredState, type ExtensionState } from './state'
import { runSync } from './sync'

const ALARM_NAME = 'lh-focus-poll'

async function getState(): Promise<ExtensionState> {
  return parseStoredState(await chrome.storage.local.get(STATE_KEYS))
}

async function saveState(patch: Partial<ExtensionState>): Promise<void> {
  await chrome.storage.local.set(patch)
}

/**
 * Applies declarative dynamic rules to block all web traffic except allowed domains.
 */
async function applyRules(domains: string[]): Promise<void> {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules()
  const removeRuleIds = existingRules.map((r: chrome.declarativeNetRequest.Rule) => r.id)
  const newRules = buildDnrRules({
    domains,
    extensionBlockedPath: chrome.runtime.getURL('blocked.html'),
  })

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: newRules as unknown as chrome.declarativeNetRequest.Rule[],
  })
}

/**
 * Removes all blocking rules and restores open browsing.
 */
async function clearRules(): Promise<void> {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules()
  const removeRuleIds = existingRules.map((r: chrome.declarativeNetRequest.Rule) => r.id)
  if (removeRuleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
    })
  }
}

let syncSeq = 0

/** Queries the loopback bridge, then the verified web fallback, then the cached lock. */
async function syncLockStatus(): Promise<void> {
  const mine = ++syncSeq
  await runSync(
    {
      getState,
      saveLock: (lock) => saveState({ lastKnownLock: lock }),
      applyRules,
      clearRules,
      fetchImpl: (input, init) => fetch(input, init),
      now: () => Date.now(),
      extensionId: chrome.runtime.id,
      randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
    },
    () => mine === syncSeq,
  )
}

// ─── Event Listeners ────────────────────────────────────────────────────────

function setupContextMenus(): void {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'lh-save-reader',
        title: 'Save to Learning HUB Reader',
        contexts: ['page', 'link'],
      })
      chrome.contextMenus.create({
        id: 'lh-create-card',
        title: 'Create Flashcard from "%s"',
        contexts: ['selection'],
      })
    })
  } catch {
    // Context menus not supported in this runtime
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 })
  void syncLockStatus()
  setupContextMenus()
})

chrome.runtime.onStartup.addListener(() => {
  void syncLockStatus()
  setupContextMenus()
})

chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
  const state = await getState()
  const bases = captureEndpoints(state.loopbackPort || DEFAULT_PORT)

  if (info.menuItemId === 'lh-save-reader') {
    // A link click saves the link target, so only use the tab title for the page itself.
    const targetUrl = info.linkUrl || info.pageUrl || tab?.url
    const title = info.linkUrl ? undefined : tab?.title
    const req = buildReaderIngest(targetUrl, title)
    if (req) await sendToFirst(fetch, bases, req)
    return
  }

  if (info.menuItemId === 'lh-create-card') {
    const target = await resolveDeck(fetch, bases)
    if (!target) return // no backend reachable, or no deck to put the card in
    const req = buildCardCreate(info.selectionText, target.deckId, info.pageUrl || tab?.url)
    if (req) await sendToFirst(fetch, [target.base], req)
  }
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    void syncLockStatus()
  }
})

// Prevent disabling/tampering with extensions during active lockdown
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, _tab) => {
  if (!changeInfo.url) return
  const url = changeInfo.url.toLowerCase()

  if (
    url.startsWith('chrome://extensions') ||
    url.startsWith('edge://extensions') ||
    url.includes('chrome://settings')
  ) {
    const state = await getState()
    const now = Date.now()
    const isLocked =
      state.lastKnownLock?.active &&
      state.lastKnownLock.endsAt &&
      new Date(state.lastKnownLock.endsAt).getTime() > now

    if (isLocked) {
      chrome.tabs.update(tabId, { url: chrome.runtime.getURL('blocked.html?reason=settings') })
    }
  }
})

// ─── Friction capture (F-10) ────────────────────────────────────────────────
// onBeforeNavigate reports the ORIGINAL target before DNR rewrites it to
// blocked.html — exactly the attempt we want to record. Fire-and-forget: the
// report can never block or slow the navigation itself.
chrome.webNavigation?.onBeforeNavigate?.addListener((details) => {
  void (async () => {
    try {
      const state = await getState()
      const decision = decideFriction(state.lastKnownLock, details.url, Date.now())
      if (!decision.record || !decision.payload) return
      const req = buildFrictionReport({ ...decision, record: true, payload: decision.payload })
      await sendToFirst(fetch, captureEndpoints(state.loopbackPort || DEFAULT_PORT), req)
    } catch {
      // Telemetry must never surface as an extension error.
    }
  })()
})
