import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { PrivacyScreen } from '@capacitor/privacy-screen'
import { NativeBiometric, BiometryType } from '@capgo/capacitor-native-biometric'
import { BiometricLockState } from './biometricLockState'

const preferenceKey = 'nexus.staging.biometric-owner'
const state = new BiometricLockState()
let owner = ''
let backgrounded = false
let available = false
let ready: Promise<void>
let signOutInstead: () => Promise<void>
let overlay: HTMLDialogElement
let status: HTMLElement
let toggle: HTMLButtonElement
let message: HTMLElement
const verify = () => NativeBiometric.verifyIdentity({
  reason: 'Unlock your NEXUS app', title: 'Unlock Nexus', subtitle: 'Biometric Unlock',
  useFallback: true,
  allowedBiometryTypes: [BiometryType.FACE_ID, BiometryType.TOUCH_ID, BiometryType.FINGERPRINT, BiometryType.FACE_AUTHENTICATION, BiometryType.IRIS_AUTHENTICATION, BiometryType.DEVICE_CREDENTIAL],
})
function persistOwner(value: string) { value ? localStorage.setItem(preferenceKey, value) : localStorage.removeItem(preferenceKey) }
function paint() {
  document.documentElement.classList.toggle('biometric-locked', state.locked)
  document.documentElement.classList.toggle('biometric-private', state.enabled && backgrounded)
  const app = document.querySelector<HTMLElement>('#app')
  if (app) app.inert = state.locked || (state.enabled && backgrounded)
  if (state.locked) {
    document.querySelectorAll<HTMLDialogElement>('#app dialog[open]').forEach(dialog => dialog.close())
    if (!overlay.open) overlay.showModal()
  } else if (overlay.open) overlay.close()
  toggle.disabled = !available || !owner || state.authenticatePending
  toggle.textContent = state.enabled ? 'Turn off Biometric Unlock' : 'Enable Biometric Unlock'
  status.textContent = !Capacitor.isNativePlatform() ? 'Available in the iPhone and Android apps.' : !available ? 'Set up biometrics or a secure device passcode in device settings.' : !owner ? 'Sign in to enable Biometric Unlock.' : state.enabled ? 'On · locks the whole app after one minute away.' : 'Off · use your device biometrics or passcode to protect the whole app.'
}
export function biometricPanel() {
  return `<section class="biometric-settings"><h3>Biometric Unlock</h3><p data-biometric-status>Checking device support…</p><button data-biometric-toggle type="button" class="auth-secondary" disabled>Enable Biometric Unlock</button><p data-biometric-message role="status" aria-live="polite"></p></section>`
}
export function initBiometricUnlock(onSignOut: () => Promise<void>) {
  signOutInstead = onSignOut
  status = document.querySelector('[data-biometric-status]')!
  toggle = document.querySelector('[data-biometric-toggle]')!
  message = document.querySelector('[data-biometric-message]')!
  overlay = document.createElement('dialog')
  overlay.className = 'biometric-lock'
  overlay.dataset.lockGuard = 'true'
  overlay.setAttribute('aria-labelledby', 'biometricLockTitle')
  overlay.innerHTML = `<div class="biometric-lock-content"><span class="minimal-wordmark">nexus<span class="wordmark-dot">.</span></span><h1 id="biometricLockTitle">Nexus is locked</h1><p>Use your device biometrics or passcode to continue.</p><button data-unlock class="auth-primary" type="button">Unlock Nexus</button><button data-signout class="auth-secondary" type="button">Sign out and use account sign-in</button><p data-unlock-message role="status" aria-live="polite"></p></div>`
  overlay.addEventListener('cancel', event => event.preventDefault())
  document.body.append(overlay)
  const unlockMessage = overlay.querySelector<HTMLElement>('[data-unlock-message]')!
  const unlockButton = overlay.querySelector<HTMLButtonElement>('[data-unlock]')!
  const signOutButton = overlay.querySelector<HTMLButtonElement>('[data-signout]')!
  unlockButton.onclick = async () => {
    unlockMessage.textContent = ''; unlockButton.disabled = signOutButton.disabled = true
    try { await state.authenticate(verify) }
    catch { unlockMessage.textContent = 'Nexus stays locked. Try again or sign out to use account sign-in.' }
    finally { unlockButton.disabled = signOutButton.disabled = false; paint() }
  }
  signOutButton.onclick = async () => {
    unlockButton.disabled = signOutButton.disabled = true
    try { await signOutInstead(); persistOwner(''); state.reset(); owner = ''; paint() }
    catch { unlockMessage.textContent = 'Could not finish signing out. Nexus stays locked; please try again.' }
    finally { unlockButton.disabled = signOutButton.disabled = false }
  }
  toggle.onclick = async () => {
    message.textContent = ''; toggle.disabled = true
    const requestOwner = owner
    try {
      const success = await state.authenticate(verify)
      if (!success || owner !== requestOwner || !owner) return
      state.enabled = !state.enabled
      persistOwner(state.enabled ? owner : '')
      message.textContent = state.enabled ? 'Biometric Unlock enabled on this device.' : 'Biometric Unlock turned off.'
    } catch { message.textContent = 'Device verification was not completed. Your setting has not changed.' }
    finally { paint() }
  }
  ready = (async () => {
    if (!Capacitor.isNativePlatform()) { paint(); return }
    // A persisted opt-in blocks content synchronously before native/plugin calls.
    state.configure(Boolean(localStorage.getItem(preferenceKey))); paint()
    try {
      const privacy = await PrivacyScreen.enable({ios:{blurEffect:'dark'},android:{privacyModeOnActivityHidden:'none'}})
      if (!privacy.success) throw new Error('Privacy screen unavailable')
      available = (await NativeBiometric.isAvailable({ useFallback: true })).isAvailable
      await App.addListener('appStateChange', ({isActive}) => {
        backgrounded = !isActive
        if (!isActive) {
          state.background(Date.now())
          if (state.enabled) {
            document.documentElement.classList.add('biometric-private')
            const app = document.querySelector<HTMLElement>('#app'); if (app) app.inert = true
          }
        }
        else { state.foreground(Date.now()); paint() }
      })
    } catch { available = false }
    paint()
  })()
  return ready
}
export async function setBiometricAccount(userId: string) {
  await ready
  const previous = owner
  owner = userId
  const stored = localStorage.getItem(preferenceKey)
  if (!userId || (stored && stored !== userId)) { persistOwner(''); state.reset() }
  else if (previous !== userId) state.configure(stored === userId)
  paint()
}
