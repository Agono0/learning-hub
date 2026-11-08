import { STATE_KEYS, isLockActive, normalizePort, parseStoredState } from './state'

document.addEventListener('DOMContentLoaded', async () => {
  const tokenInput = document.getElementById('pairing-token') as HTMLInputElement
  const portInput = document.getElementById('loopback-port') as HTMLInputElement
  const form = document.getElementById('pairing-form') as HTMLFormElement
  const savedMsg = document.getElementById('saved-msg') as HTMLDivElement
  const statusBadge = document.getElementById('status-badge') as HTMLSpanElement
  const frictionBadge = document.getElementById('friction-badge') as HTMLSpanElement | null
  const activeInfo = document.getElementById('active-info') as HTMLDivElement
  const endsAtSpan = document.getElementById('ends-at') as HTMLSpanElement

  const state = parseStoredState(await chrome.storage.local.get(STATE_KEYS))
  if (state.pairingToken) tokenInput.value = state.pairingToken
  portInput.value = String(state.loopbackPort)

  const lock = state.lastKnownLock
  if (lock && isLockActive(lock, Date.now())) {
    statusBadge.textContent = 'Active Lockdown'
    statusBadge.className = 'status-badge status-active'
    if (frictionBadge) {
      frictionBadge.textContent = 'active'
      frictionBadge.style.color = '#34d399'
    }
    activeInfo.style.display = 'block'
    endsAtSpan.textContent = new Date(lock.endsAt!).toLocaleTimeString()
  } else {
    statusBadge.textContent = 'Idle'
    statusBadge.className = 'status-badge status-idle'
    if (frictionBadge) {
      frictionBadge.textContent = 'off'
      frictionBadge.style.color = 'var(--muted)'
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const token = tokenInput.value.trim()
    const port = normalizePort(portInput.value)
    portInput.value = String(port)
    await chrome.storage.local.set({
      pairingToken: token,
      loopbackPort: port,
    })
    savedMsg.style.display = 'block'
    setTimeout(() => {
      savedMsg.style.display = 'none'
    }, 2000)
  })
})
