// Public customer links never inherit the WebView or local development address.
// This staging build must link to staging, never to the production application.
export const PUBLIC_APP_URL = 'https://sbh-nexus-v2-staging.pages.dev/'

export function buildReferralLink(referralCode: string) {
  const code = referralCode.trim()
  if (!code) throw new Error('A referral code is required')
  const url = new URL(PUBLIC_APP_URL)
  url.searchParams.set('ref', code)
  return url.toString()
}

export function buildAuthReturnUrl(mode?: 'recovery') {
  const url = new URL(PUBLIC_APP_URL)
  if (mode) url.searchParams.set('mode', mode)
  return url.toString()
}
