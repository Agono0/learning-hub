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

interface ExtensionState {
  pairingToken?: string
  loopbackPort?: number
  lastKnownLock?: {
    active: boolean
    endsAt: string | null
    domains: string[]
  } | null
  lastCheckedAt?: number
}

const DEFAULT_PORT = 47615
const ALARM_NAME = 'lh-focus-poll'

async function getState(): Promise<ExtensionState> {
  const data = await chrome.storage.local.get(['pairingToken', 'loopbackPort', 'lastKnownLock'])
  return {
    pairingToken: data.pairingToken,
    loopbackPort: data.loopbackPort || DEFAULT_PORT,
    lastKnownLock: data.lastKnownLock || null,
  }
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

/**
 * Queries loopback server or local web app for current lock status.
 */
async function syncLockStatus(): Promise<void> {
  const state = await getState()
  const now = Date.now()

  let fetchedLock: { active: boolean; endsAt: string | null; domains: string[] } | null = null

  // 1. Try loopback bridge first if token available
  if (state.pairingToken) {
    try {
      const resp = await fetch(`http://127.0.0.1:${state.loopbackPort}/v1/lock`, {
        headers: {
          Authorization: `Bearer ${state.pairingToken}`,
        },
      })
      if (resp.ok) {
        const json = await resp.json()
        fetchedLock = {
          active: Boolean(json.active),
          endsAt: json.endsAt ?? null,
          domains: Array.isArray(json.domains) ? json.domains : [],
        }

        // Send periodic heartbeat
        void fetch(`http://127.0.0.1:${state.loopbackPort}/v1/heartbeat`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${state.pairingToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ extensionId: chrome.runtime.id }),
        }).catch(() => {})
      }
    } catch {
      // Loopback offline or native app closed
    }
  }

  // 2. Try web endpoint fallback if loopback gave no response
  if (!fetchedLock) {
    try {
      const webResp = await fetch('http://localhost:3000/api/focus/max', {
        headers: { Accept: 'application/json' },
      })
      if (webResp.ok) {
        const json = await webResp.json()
        if (json.lock) {
          fetchedLock = {
            active: Boolean(json.lock.active),
            endsAt: json.lock.endsAt ?? null,
            domains: json.lock.allowlist?.domains ?? [],
          }
        }
      }
    } catch {
      // Local web app not running
    }
  }

  // 3. Fail-closed logic: evaluate cached lock if fetch failed
  if (fetchedLock) {
    await saveState({ lastKnownLock: fetchedLock })
    if (fetchedLock.active && fetchedLock.endsAt && new Date(fetchedLock.endsAt).getTime() > now) {
      await applyRules(fetchedLock.domains)
    } else {
      await clearRules()
    }
  } else if (state.lastKnownLock) {
    const cached = state.lastKnownLock
    if (cached.active && cached.endsAt && new Date(cached.endsAt).getTime() > now) {
      // Still within committed focus window: preserve lockdown!
      await applyRules(cached.domains)
    } else {
      await clearRules()
    }
  } else {
    await clearRules()
  }
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
