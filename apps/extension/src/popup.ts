document.addEventListener('DOMContentLoaded', async () => {
  const tokenInput = document.getElementById('pairing-token') as HTMLInputElement
  const portInput = document.getElementById('loopback-port') as HTMLInputElement
  const form = document.getElementById('pairing-form') as HTMLFormElement
  const savedMsg = document.getElementById('saved-msg') as HTMLDivElement
  const statusBadge = document.getElementById('status-badge') as HTMLSpanElement
  const activeInfo = document.getElementById('active-info') as HTMLDivElement
  const endsAtSpan = document.getElementById('ends-at') as HTMLSpanElement

  const data = await chrome.storage.local.get(['pairingToken', 'loopbackPort', 'lastKnownLock'])
  if (data.pairingToken) tokenInput.value = data.pairingToken
  if (data.loopbackPort) portInput.value = String(data.loopbackPort)

  const lock = data.lastKnownLock
  const now = Date.now()
  if (lock && lock.active && lock.endsAt && new Date(lock.endsAt).getTime() > now) {
    statusBadge.textContent = 'Active Lockdown'
    statusBadge.className = 'status-badge status-active'
    activeInfo.style.display = 'block'
    endsAtSpan.textContent = new Date(lock.endsAt).toLocaleTimeString()
  } else {
    statusBadge.textContent = 'Idle'
    statusBadge.className = 'status-badge status-idle'
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const token = tokenInput.value.trim()
    const port = Number(portInput.value) || 47615
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
