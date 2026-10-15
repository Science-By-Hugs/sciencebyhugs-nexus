export const BIOMETRIC_TIMEOUT_MS = 60_000
export class BiometricLockState {
  enabled = false
  locked = false
  backgroundAt: number | null = null
  authenticatePending = false
  configure(enabled: boolean) { this.enabled = enabled; this.locked = enabled; this.backgroundAt = null }
  background(now: number) { if (this.enabled && this.backgroundAt === null) this.backgroundAt = now }
  foreground(now: number) {
    if (this.enabled && this.backgroundAt !== null && now - this.backgroundAt >= BIOMETRIC_TIMEOUT_MS) this.locked = true
    this.backgroundAt = null
    return this.locked
  }
  async authenticate(verify: () => Promise<void>) {
    if (this.authenticatePending) return false
    this.authenticatePending = true
    try { await verify(); this.locked = false; return true }
    finally { this.authenticatePending = false }
  }
  reset() { this.enabled = false; this.locked = false; this.backgroundAt = null }
}
