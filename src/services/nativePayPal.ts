import { registerPlugin } from '@capacitor/core'
import { capturePayPalOrder, createPayPalOrder, getPayPalConfig } from './paypal'

// Installed iOS app only. Buyer approval happens in the native PayPal iOS SDK
// (ios/App/App/NexusPayPal.swift); order creation, capture and amount checks stay
// in the existing Supabase functions. The app never marks an order paid itself.

type NativeApproval =
  | { status: 'approved'; orderId: string; payerId: string }
  | { status: 'cancelled' }

interface NexusPayPalPlugin {
  checkout(options: { clientId: string; merchantId: string; environment: string; orderId: string }): Promise<NativeApproval>
}

export type NativePayPalResult =
  | { status: 'paid'; orderNumber?: string }
  | { status: 'cancelled' }

export type NativePayPalDeps = {
  getConfig: typeof getPayPalConfig
  createOrder: typeof createPayPalOrder
  capture: typeof capturePayPalOrder
  checkout: NexusPayPalPlugin['checkout']
  wait: (ms: number) => Promise<void>
}

const plugin = registerPlugin<NexusPayPalPlugin>('NexusPayPal')

const defaultDeps: NativePayPalDeps = {
  getConfig: getPayPalConfig,
  createOrder: createPayPalOrder,
  capture: capturePayPalOrder,
  checkout: options => plugin.checkout(options),
  wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
}

export class PaymentStatusUnknownError extends Error {
  constructor() {
    super('We could not confirm this payment yet. Do not pay again — check My Account → Order Activity in a minute.')
    this.name = 'PaymentStatusUnknownError'
  }
}

/**
 * Pays an existing NEXUS order (already created and priced on the server) with
 * native PayPal. Capture is idempotent server-side (PayPal-Request-Id per order
 * and an already-paid short circuit), so a lost response is retried rather than
 * starting a second purchase.
 */
export async function payWithNativePayPal(nexusOrderId: string, deps: NativePayPalDeps = defaultDeps): Promise<NativePayPalResult> {
  const config = await deps.getConfig()
  if (!config.merchantId) throw new Error('PayPal is not configured for the app yet.')

  const paypalOrder = await deps.createOrder(nexusOrderId, 'PayPal')
  const approval = await deps.checkout({
    clientId: config.clientId,
    merchantId: config.merchantId,
    environment: config.environment,
    orderId: paypalOrder.orderId,
  })
  if (approval.status === 'cancelled') return { status: 'cancelled' }
  if (approval.orderId !== paypalOrder.orderId) {
    throw new Error('PayPal returned a different order. No payment was captured.')
  }

  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const captured = await deps.capture(nexusOrderId, paypalOrder.orderId, 'PayPal')
      return { status: 'paid', orderNumber: captured?.orderNumber }
    } catch (error) {
      lastError = error
      // A business rejection (amount mismatch, wrong order) will not change on retry.
      if (error instanceof Error && /does not match|did not match|not found/i.test(error.message)) throw error
      if (attempt < 2) await deps.wait(1500 * (attempt + 1))
    }
  }
  console.error('Native PayPal capture unconfirmed', lastError instanceof Error ? lastError.message : 'unknown')
  throw new PaymentStatusUnknownError()
}
