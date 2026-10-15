import { Capacitor } from '@capacitor/core'
import { NativeBiometric } from '@capgo/capacitor-native-biometric'

// The credential API stores a session-token JSON string, never an account password.
// No localStorage fallback is allowed on native devices if secure storage fails.
export const sessionStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) return localStorage.getItem(key)
    const marker = `nexus.staging.vault-initialized.${key}`
    if (!localStorage.getItem(marker)) {
      const legacy = localStorage.getItem(key)
      if (legacy) { await this.setItem(key, legacy); return legacy }
      // iOS Keychain may survive reinstall; never resurrect that older session.
      await NativeBiometric.deleteCredentials({ server: `nexus.staging.${key}` })
      localStorage.setItem(marker, '1')
    }
    try {
      const item = await NativeBiometric.getCredentials({ server: `nexus.staging.${key}` })
      localStorage.removeItem(key)
      return item.password
    } catch {
      const legacy = localStorage.getItem(key)
      if (!legacy) return null
      await this.setItem(key, legacy)
      return legacy
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) { localStorage.setItem(key, value); return }
    await NativeBiometric.setCredentials({ server: `nexus.staging.${key}`, username: 'session', password: value })
    localStorage.setItem(`nexus.staging.vault-initialized.${key}`, '1')
    localStorage.removeItem(key)
  },
  async removeItem(key: string): Promise<void> {
    if (Capacitor.isNativePlatform()) await NativeBiometric.deleteCredentials({ server: `nexus.staging.${key}` })
    localStorage.removeItem(key)
  },
}
