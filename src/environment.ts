export type V2EnvironmentInput = {
  appEnv?: string
  supabaseUrl?: string
  publishableKey?: string
  expectedProjectRef?: string
  appOrigin?: string
  paymentEnv?: string
  enableTestPayments?: string
}

const productionProjects = new Set(['tkhcvmkejzaoervocnzk', 'pspiqukuhtazmkyfleii'])
const productionHosts = new Set(['nexus.sciencebyhugs.com', 'core.sciencebyhugs.com', 'pulse.sciencebyhugs.com', 'sciencebyhugs.com', 'www.sciencebyhugs.com', 'sciencebyhugs.github.io'])
const productionPublishableKey = 'sb_publishable_EcfrlkNHkSfJWgeSWjH2LA_3yDFTtBE'

function parsedUrl(value: string | undefined, label: string, allowNative = false): URL {
  if (!value?.trim()) throw new Error(label + ' is required for the 2.0 staging app')
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error(label + ' must be a valid URL') }
  if (allowNative && value?.trim() === 'capacitor://localhost') return url
  if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) {
    throw new Error(label + ' must be an HTTP(S) URL without credentials, query or fragment')
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (!local && url.protocol !== 'https:') throw new Error(label + ' must use HTTPS outside local development')
  if (url.pathname !== '/') throw new Error(label + ' must not include a path')
  return url
}

export function validateV2Environment(input: V2EnvironmentInput) {
  if (input.appEnv !== 'staging') throw new Error('2.0 development branches require VITE_APP_ENV=staging')
  const url = parsedUrl(input.supabaseUrl, 'VITE_SUPABASE_URL')
  const ref = String(input.expectedProjectRef || '').trim()
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (productionProjects.has(ref) || [...productionProjects].some(project => url.hostname === project + '.supabase.co')) {
    throw new Error('Production Supabase projects are blocked in 2.0 staging')
  }
  if (!ref || (local ? ref !== 'local' : !/^[a-z]{20}$/.test(ref) || url.hostname !== ref + '.supabase.co' || Boolean(url.port))) {
    throw new Error('VITE_SUPABASE_URL must match the explicitly approved staging project reference')
  }
  const key = String(input.publishableKey || '').trim()
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) || key === productionPublishableKey) {
    throw new Error('A staging publishable key is required; production, secret and legacy JWT keys are not accepted')
  }
  const origin = parsedUrl(input.appOrigin, 'VITE_APP_ORIGIN', true)
  if (productionHosts.has(origin.hostname)) throw new Error('Production app origins are blocked in 2.0 staging')
  if (input.paymentEnv !== 'sandbox') throw new Error('2.0 staging requires VITE_PAYMENT_ENV=sandbox')
  if (input.enableTestPayments !== undefined && !['true', 'false'].includes(input.enableTestPayments)) {
    throw new Error('VITE_ENABLE_TEST_PAYMENTS must be true or false')
  }
  return {
    appEnv: 'staging' as const,
    supabaseUrl: url.origin,
    publishableKey: key,
    projectRef: ref,
    appOrigin: origin.protocol === 'capacitor:' ? 'capacitor://localhost' : origin.origin,
    paymentEnv: 'sandbox' as const,
    enableTestPayments: input.enableTestPayments === 'true',
  }
}

export function assertV2RuntimeOrigin(expected: string, actual: string) {
  if (actual !== expected) throw new Error('This staging build is not authorized for the current app origin')
}
