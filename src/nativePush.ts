import { PushNotifications } from '@capacitor/push-notifications'
import type { PluginListenerHandle } from '@capacitor/core'
import { supabase } from './services/supabase'

function installationId() {
  const key = 'nexus-native-installation-v1'
  let value = localStorage.getItem(key)
  if (!value) { value = crypto.randomUUID(); localStorage.setItem(key, value) }
  return value
}

async function request(action: string, token?: string) {
  const { data, error } = await supabase.functions.invoke('native-push', { body: { action, installationId: installationId(), ...(token ? { token } : {}) } })
  if (error || data?.error) {
    let message = data?.error
    if (!message && error?.context instanceof Response) {
      try { message = (await error.context.json()).error } catch { /* generic fallback */ }
    }
    throw new Error(message || 'Could not update notifications. Please try again.')
  }
  return data
}

let pending: Promise<string> | null = null
async function deviceToken(): Promise<string> {
  if (pending) return pending
  pending = new Promise<string>((resolve, reject) => {
    const listeners: PluginListenerHandle[] = []
    let settled = false
    const finish = (token?: string, error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      for (const listener of listeners) void listener.remove()
      if (error) reject(error); else resolve(token!)
    }
    const timer = setTimeout(() => finish(undefined, new Error('Apple device registration timed out. Please try again.')), 15000)
    void (async () => {
      const keep = (listener: PluginListenerHandle) => {
        if (settled) void listener.remove(); else listeners.push(listener)
      }
      keep(await PushNotifications.addListener('registration', token => finish(token.value)))
      keep(await PushNotifications.addListener('registrationError', () => finish(undefined, new Error('Apple could not register this device for notifications.'))))
      if (settled) return
      await PushNotifications.register()
    })().catch(() => finish(undefined, new Error('Could not register this device. Please try again.')))
  }).finally(() => { pending = null })
  return pending
}

export async function nativePushStatus() {
  const status = await request('status')
  const permission = await PushNotifications.checkPermissions()
  if (!status.configured) return { enabled: false, available: false }
  if (permission.receive !== 'granted') return { enabled: false, available: true }
  if (!status.enabled) return { enabled: false, available: true }
  // APNs tokens can change. Refresh only an existing, consented registration.
  await request('register', await deviceToken())
  return { enabled: true, available: true }
}

export async function enableNativePush() {
  const configuration = await request('config')
  if (!configuration.configured) throw new Error('Native notifications are being configured. Please try again later.')
  let permission = await PushNotifications.checkPermissions()
  if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') permission = await PushNotifications.requestPermissions()
  if (permission.receive !== 'granted') throw new Error('Notifications are blocked. Open iPhone Settings → Notifications → NEXUS Staging to allow them.')
  await request('register', await deviceToken())
}

export async function disableNativePush() {
  // Remove ownership server-side before unregistering, including during sign-out.
  await request('unregister')
  await PushNotifications.unregister()
  await PushNotifications.removeAllDeliveredNotifications()
}

export async function testNativePush() {
  const result = await request('test')
  if (!result.sent) throw new Error('Apple did not accept the test notification.')
}

let tapListener: PluginListenerHandle | undefined
export async function bindNativeNotificationNavigation() {
  if (tapListener) return
  tapListener = await PushNotifications.addListener('pushNotificationActionPerformed', () => {
    // Navigation remains behind the app's existing authenticated account view.
    document.querySelector<HTMLButtonElement>('#mobileAccountButton')?.click()
  })
}
