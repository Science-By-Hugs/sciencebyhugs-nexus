import { supabase } from './services/supabase'

const functionName = 'app-push'
const appName = 'nexus'

function supported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function registration() {
  if (!supported()) throw new Error('Install this app to your Home Screen on iPhone/iPad, then open it to enable notifications. This browser may not support push.')
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('The app is updating. Reopen it and try again.')), 12000)),
  ])
}

async function api(action: string, subscription?: PushSubscription) {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: { action, app: appName, subscription: subscription?.toJSON() },
  })
  if (error || data?.error) {
    let detail = data?.error
    if (!detail && error?.context instanceof Response) {
      try { detail = (await error.context.json()).error } catch {}
    }
    throw new Error(detail || error?.message || 'Could not update notifications.')
  }
  return data
}

function applicationKey(key: string) {
  const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

export async function pushEnabled() {
  if (!supported() || Notification.permission !== 'granted') return false
  const sub = await (await registration()).pushManager.getSubscription()
  if (!sub) return false
  const data = await api('status', sub)
  return Boolean(data.enabled)
}

export async function enablePush() {
  if (!supported()) await registration()
  // Permission must be requested directly in the user's click handler on iOS.
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(permission === 'denied'
    ? 'Notifications are blocked. Allow them in your browser or device notification settings.'
    : 'Notification permission was not granted.')
  const config = await api('config')
  const reg = await registration()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(config.publicKey) })
  try {
    await api('subscribe', sub)
  } catch (error) {
    // Leave a failed registration off, rather than displaying a false enabled state.
    await sub.unsubscribe()
    throw error
  }
}

export async function disablePush() {
  if (!supported()) return
  const sub = await (await registration()).pushManager.getSubscription()
  if (!sub) return
  // Delete server registration before browser unsubscription; failed deletes remain retryable.
  await api('unsubscribe', sub)
  await sub.unsubscribe()
}

export async function testPush() {
  const sub = await (await registration()).pushManager.getSubscription()
  if (!sub) throw new Error('Enable notifications on this device first.')
  const result = await api('test', sub)
  if (!result.sent) throw new Error('This subscription has expired. Turn notifications off and enable them again.')
}

export function pushPanel() {
  return `<section class="push-panel" aria-label="Push notifications">
    <strong>Push notifications</strong>
    <p>Get order, payment, and estimated delivery updates even when NEXUS is closed. On iPhone/iPad, open the app from your Home Screen first.</p>
    <p data-push-status role="status" aria-live="polite">Checking this device…</p>
    <div class="push-actions"><button type="button" data-push-toggle disabled>Enable notifications</button>
    <button type="button" data-push-test hidden>Send test notification</button></div>
  </section>`
}

export function pushPrompt() {
  return `<aside class="push-prompt push-prompt-popup" data-push-prompt hidden aria-label="Enable notifications">
    <p>We noticed you don’t have notifications enabled.</p>
    <div class="push-prompt-actions"><button type="button" data-push-enable>Enable notifications</button><button type="button" data-push-dismiss>Not now</button></div>
    <p data-push-prompt-status role="status" aria-live="polite"></p>
  </aside>`
}

let bindingVersion = 0
export async function bindPushPanel(userId = '') {
  let panel = document.querySelector<HTMLElement>('.push-panel')
  if (!panel) return
  if (panel.dataset.bound) {
    const fresh = panel.cloneNode(true) as HTMLElement
    panel.replaceWith(fresh)
    panel = fresh
  }
  panel.dataset.bound = 'true'
  const button = panel.querySelector<HTMLButtonElement>('[data-push-toggle]')!
  const test = panel.querySelector<HTMLButtonElement>('[data-push-test]')!
  const status = panel.querySelector<HTMLElement>('[data-push-status]')!
  const version = ++bindingVersion
  const prompt = document.querySelector<HTMLElement>('[data-push-prompt]')
  const promptButton = prompt?.querySelector<HTMLButtonElement>('[data-push-enable]')
  const promptStatus = prompt?.querySelector<HTMLElement>('[data-push-prompt-status]')
  if (prompt) prompt.hidden = true
  if (promptStatus) promptStatus.textContent = ''
  if (!userId) { button.disabled = true; return }
  const dismissalKey = `nexus-push-prompt-dismissed:${userId}`
  let dismissed = false
  try { dismissed = sessionStorage.getItem(dismissalKey) === 'true' } catch {}
  const dismissButton = prompt?.querySelector<HTMLButtonElement>('[data-push-dismiss]')
  if (dismissButton) dismissButton.onclick = () => {
    dismissed = true
    if (prompt) prompt.hidden = true
    try { sessionStorage.setItem(dismissalKey, 'true') } catch {}
  }
  let enabled = false
  let checked = false
  const update = () => {
    if (version !== bindingVersion) return
    if (prompt) prompt.hidden = !checked || enabled || dismissed
    if (promptButton) promptButton.disabled = false
    button.textContent = enabled ? 'Turn off on this device' : 'Enable notifications'
    button.disabled = false
    test.hidden = !enabled
    status.textContent = enabled ? 'Enabled on this device.' : 'Not enabled on this device.'
  }
  try { enabled = await pushEnabled(); checked = true; update() }
  catch (error) { update(); status.textContent = error instanceof Error ? error.message : 'Could not check notification settings.' }
  const change = async (enableOnly = false) => {
    if (version !== bindingVersion || button.disabled) return
    if (enableOnly && enabled) return
    button.disabled = true
    if (promptButton) promptButton.disabled = true
    if (promptStatus) promptStatus.textContent = ''
    try {
      if (enabled && !enableOnly) await disablePush(); else await enablePush()
      enabled = enableOnly || !enabled
      checked = true
      update()
    } catch (error) {
      update()
      status.textContent = error instanceof Error ? error.message : 'Could not update notifications.'
      if (promptStatus) promptStatus.textContent = status.textContent
    }
  }
  button.addEventListener('click', () => { void change() })
  // Keep the permission request on the original click, including on iOS.
  if (promptButton) promptButton.onclick = () => { void change(true) }

  test.addEventListener('click', async () => {
    test.disabled = true
    try { await testPush(); status.textContent = 'Test sent. Check your notifications.' }
    catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not send test notification.' }
    finally { test.disabled = false }
  })
}
