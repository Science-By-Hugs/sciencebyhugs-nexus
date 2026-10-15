import { assertV2RuntimeOrigin, validateV2Environment } from './environment'

const environment = validateV2Environment({
  appEnv: import.meta.env.VITE_APP_ENV,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  expectedProjectRef: import.meta.env.VITE_EXPECTED_SUPABASE_REF,
  appOrigin: import.meta.env.VITE_APP_ORIGIN,
  paymentEnv: import.meta.env.VITE_PAYMENT_ENV,
  enableTestPayments: import.meta.env.VITE_ENABLE_TEST_PAYMENTS,
})

if (typeof window !== 'undefined') assertV2RuntimeOrigin(environment.appOrigin, window.location.origin)

export const SUPABASE_URL = environment.supabaseUrl
export const SUPABASE_PUBLISHABLE_KEY = environment.publishableKey
export const APP_ORIGIN = environment.appOrigin
export const ENABLE_TEST_PAYMENTS = environment.enableTestPayments

export function assertTestPaymentsEnabled() {
  if (!ENABLE_TEST_PAYMENTS) throw new Error('Test payments are disabled until staging payment configuration is verified')
}
