// Apple Push Notification service (token-based auth) for the NEXUS iOS app.
//
// Secrets (Supabase Edge Function secrets — never commit the .p8):
//   APNS_TEAM_ID      Apple Developer team ID (3XM6AHUVA5)
//   APNS_KEY_ID       Key ID of the APNs auth key
//   APNS_PRIVATE_KEY  Full contents of the AuthKey_XXXX.p8 file (PEM)
//   APNS_BUNDLE_ID    App bundle ID / APNs topic (com.sciencebyhugs.nexus.staging)
//
// Nothing here logs the key, the provider token or a full device token.

export type ApnsDevice = { token: string; apns_environment: string }
export type ApnsPayload = { title: string; body: string; url?: string; tag?: string }
export type ApnsResult =
  | { ok: true }
  | { ok: false; status: number; reason: string; invalidToken: boolean }

const INVALID_TOKEN_REASONS = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'])
const PROVIDER_TOKEN_REASONS = new Set(['ExpiredProviderToken', 'InvalidProviderToken'])

let cachedProviderToken: { jwt: string; issuedAt: number } | null = null
let cachedKey: CryptoKey | null = null

export function apnsConfig() {
  const teamId = Deno.env.get('APNS_TEAM_ID') || ''
  const keyId = Deno.env.get('APNS_KEY_ID') || ''
  const privateKey = Deno.env.get('APNS_PRIVATE_KEY') || ''
  const bundleId = Deno.env.get('APNS_BUNDLE_ID') || ''
  return { teamId, keyId, privateKey, bundleId, configured: Boolean(teamId && keyId && privateKey && bundleId) }
}

export function tokenHint(token: string) {
  return token.length > 8 ? `…${token.slice(-6)}` : '…'
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function signingKey(pem: string) {
  if (cachedKey) return cachedKey
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0))
  cachedKey = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  return cachedKey
}

/** ES256 provider token; Apple accepts a token for up to 60 minutes, refresh at 50. */
async function providerToken() {
  const now = Math.floor(Date.now() / 1000)
  if (cachedProviderToken && now - cachedProviderToken.issuedAt < 50 * 60) return cachedProviderToken.jwt
  const { teamId, keyId, privateKey } = apnsConfig()
  const encoder = new TextEncoder()
  const header = base64url(encoder.encode(JSON.stringify({ alg: 'ES256', kid: keyId })))
  const claims = base64url(encoder.encode(JSON.stringify({ iss: teamId, iat: now })))
  const signingInput = `${header}.${claims}`
  // WebCrypto returns the raw r||s (P1363) signature JWS expects.
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, await signingKey(privateKey), encoder.encode(signingInput)))
  cachedProviderToken = { jwt: `${signingInput}.${base64url(signature)}`, issuedAt: now }
  return cachedProviderToken.jwt
}

export async function sendApns(device: ApnsDevice, payload: ApnsPayload): Promise<ApnsResult> {
  const { configured, bundleId } = apnsConfig()
  if (!configured) return { ok: false, status: 0, reason: 'NotConfigured', invalidToken: false }
  const host = device.apns_environment === 'production' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com'
  const headers: Record<string, string> = {
    authorization: `bearer ${await providerToken()}`,
    'apns-topic': bundleId,
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'apns-expiration': String(Math.floor(Date.now() / 1000) + 24 * 60 * 60),
  }
  if (payload.tag) headers['apns-collapse-id'] = payload.tag.slice(0, 64)
  const body = JSON.stringify({
    aps: { alert: { title: payload.title, body: payload.body }, sound: 'default', ...(payload.tag ? { 'thread-id': payload.tag } : {}) },
    ...(payload.url ? { url: payload.url } : {}),
  })

  let response: Response
  try {
    response = await fetch(`${host}/3/device/${encodeURIComponent(device.token)}`, { method: 'POST', headers, body })
  } catch {
    return { ok: false, status: 0, reason: 'NetworkError', invalidToken: false }
  }
  if (response.status === 200) return { ok: true }

  let reason = 'Unknown'
  try { reason = String((await response.json())?.reason || reason) } catch {}
  if (PROVIDER_TOKEN_REASONS.has(reason)) cachedProviderToken = null
  return { ok: false, status: response.status, reason, invalidToken: response.status === 410 || INVALID_TOKEN_REASONS.has(reason) }
}
