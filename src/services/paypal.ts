import { supabase } from './supabase'

type PayPalConfig = {
  configured: boolean
  environment: 'sandbox' | 'live' | string
  clientId: string
}

declare global {
  interface Window {
    paypal?: {
      createInstance(options: {
        clientId: string
        components?: string[]
        pageType?: string
      }): Promise<any>
    }
    __sbhPayPalScriptPromise?: Promise<void>
    __sbhApplePayScriptPromise?: Promise<void>
  }
}

let sdkPromise: Promise<any> | null = null

export async function getPayPalConfig(): Promise<PayPalConfig> {
  const { data, error } = await supabase.functions.invoke('paypal-config', {
    body: {},
  })

  if (error) throw error
  if (!data?.success || !data?.configured || !data?.clientId) {
    throw new Error(data?.error || 'PayPal is not configured')
  }

  return data as PayPalConfig
}

function loadApplePayScript() {
  if ((window as any).ApplePaySession && customElements.get('apple-pay-button')) {
    return Promise.resolve()
  }
  if (window.__sbhApplePayScriptPromise) return window.__sbhApplePayScriptPromise

  window.__sbhApplePayScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.async = true
    script.src = 'https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load Apple Pay checkout'))
    document.head.appendChild(script)
  })

  return window.__sbhApplePayScriptPromise
}

function loadPayPalScript(environment: string) {
  if (window.paypal) return Promise.resolve()
  if (window.__sbhPayPalScriptPromise) return window.__sbhPayPalScriptPromise

  window.__sbhPayPalScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.async = true
    script.src =
      environment === 'live'
        ? 'https://www.paypal.com/web-sdk/v6/core'
        : 'https://www.sandbox.paypal.com/web-sdk/v6/core'

    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load PayPal checkout'))
    document.head.appendChild(script)
  })

  return window.__sbhPayPalScriptPromise
}

export async function getPayPalSdk() {
  if (sdkPromise) return sdkPromise

  sdkPromise = (async () => {
    const config = await getPayPalConfig()
    await Promise.all([
      loadPayPalScript(config.environment),
      loadApplePayScript().catch(() => undefined),
    ])

    if (!window.paypal) throw new Error('PayPal checkout did not initialize')

    return window.paypal.createInstance({
      clientId: config.clientId,
      components: ['paypal-payments', 'venmo-payments', 'applepay-payments'],
      pageType: 'checkout',
    })
  })()

  try {
    return await sdkPromise
  } catch (error) {
    sdkPromise = null
    throw error
  }
}

export async function createPayPalOrder(
  orderId: string,
  paymentMethod: 'PayPal' | 'Venmo' | 'Apple Pay' = 'PayPal',
) {
  const { data, error } = await supabase.functions.invoke('paypal-create-order', {
    body: { orderId, paymentMethod },
  })

  if (error) throw error
  if (!data?.success || !data?.orderId) {
    throw new Error(data?.error || 'Could not start PayPal checkout')
  }

  return data as {
    success: true
    orderId: string
    reused?: boolean
  }
}

export async function capturePayPalOrder(
  orderId: string,
  paypalOrderId: string,
  paymentMethod: 'PayPal' | 'Venmo' | 'Apple Pay' = 'PayPal',
) {
  const { data, error } = await supabase.functions.invoke('paypal-capture-order', {
    body: { orderId, paypalOrderId, paymentMethod },
  })

  if (error) throw error
  if (!data?.success) {
    throw new Error(data?.error || 'PayPal payment could not be completed')
  }

  return data
}
