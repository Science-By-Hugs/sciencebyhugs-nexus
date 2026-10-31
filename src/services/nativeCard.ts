import { registerPlugin } from '@capacitor/core'
import { supabase } from './supabase'
import { createPayPalOrder, getPayPalConfig } from './paypal'
import { PaymentStatusUnknownError } from './nativePayPal'

// In-app card checkout (installed iOS app only).
//
// 1. approveCard: PayPal order for the NEXUS order -> native PayPal CardPayments
//    approval (card goes device -> PayPal, incl. 3D Secure) -> card-checkout-quote
//    returns the final total, with a credit-card surcharge for CREDIT cards only.
// 2. The customer reviews that total.
// 3. confirmCardPayment: server capture (re-checks 3D Secure and the confirmed total).
// Card details are passed straight to the native plugin and never stored or logged.

export type CardDetails = {
  number: string
  expirationMonth: string
  expirationYear: string
  securityCode: string
  cardholderName?: string
  postalCode?: string
}

export type CardQuote = {
  orderId: string
  orderNumber: string
  paypalOrderId: string
  card: { brand: string; lastDigits: string; type: string }
  totals: { subtotal: number; discount: number; shipping: number; surcharge: number; tax: number; total: number }
}

type Approval = { status: 'approved'; orderId: string; threeDSecureAttempted?: boolean } | { status: 'cancelled' }

interface NexusCardPlugin {
  approve(options: CardDetails & { clientId: string; merchantId: string; environment: string; orderId: string }): Promise<Approval>
}

/** A server answer the customer can act on (wrong card, bank declined, total changed). */
export class CardPaymentError extends Error {
  constructor(message: string, readonly retry = false) {
    super(message)
    this.name = 'CardPaymentError'
  }
}

export type NativeCardDeps = {
  getConfig: typeof getPayPalConfig
  createOrder: typeof createPayPalOrder
  approve: NexusCardPlugin['approve']
  invoke: (name: string, body: Record<string, unknown>) => Promise<any>
  wait: (ms: number) => Promise<void>
}

const plugin = registerPlugin<NexusCardPlugin>('NexusCard')

/**
 * Like functions.invoke, but when the server answered with a reason (declined,
 * verification failed, total changed) it becomes a CardPaymentError, which is never
 * retried. Only a request that got no answer at all is left as a plain error.
 */
async function invokeFunction(name: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (!error && !data?.error) return data
  let detail: { error?: string; retry?: boolean } | null = data?.error ? data : null
  const context = (error as { context?: unknown } | null)?.context
  if (!detail && context instanceof Response) {
    try { detail = await context.json() } catch {}
  }
  if (detail?.error) throw new CardPaymentError(detail.error, Boolean(detail.retry))
  throw error instanceof Error ? error : new Error('Network error')
}

const defaultDeps: NativeCardDeps = {
  getConfig: getPayPalConfig,
  createOrder: createPayPalOrder,
  approve: options => plugin.approve(options),
  invoke: invokeFunction,
  wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
}

export async function approveCard(
  nexusOrderId: string,
  card: CardDetails,
  deps: NativeCardDeps = defaultDeps,
): Promise<{ status: 'cancelled' } | { status: 'quoted'; quote: CardQuote }> {
  const config = await deps.getConfig()
  if (!config.merchantId) throw new Error('Card payments are not configured for the app yet.')

  const paypalOrder = await deps.createOrder(nexusOrderId, 'Card')
  const approval = await deps.approve({
    clientId: config.clientId,
    merchantId: config.merchantId,
    environment: config.environment,
    orderId: paypalOrder.orderId,
    ...card,
  })
  if (approval.status === 'cancelled') return { status: 'cancelled' }
  if (approval.orderId !== paypalOrder.orderId) {
    throw new Error('PayPal returned a different order. Nothing was charged.')
  }

  const quote = await deps.invoke('card-checkout-quote', { orderId: nexusOrderId, paypalOrderId: paypalOrder.orderId })
  return { status: 'quoted', quote: { ...quote, paypalOrderId: paypalOrder.orderId } as CardQuote }
}

/**
 * Captures a confirmed card quote. Capture is idempotent server-side (one
 * PayPal-Request-Id per order, already-paid short circuit), so a lost response is
 * retried instead of starting a second purchase.
 */
export async function confirmCardPayment(
  quote: CardQuote,
  deps: NativeCardDeps = defaultDeps,
): Promise<{ status: 'paid'; orderNumber?: string }> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const captured = await deps.invoke('paypal-capture-order', {
        orderId: quote.orderId,
        paypalOrderId: quote.paypalOrderId,
        paymentMethod: 'Card',
      })
      return { status: 'paid', orderNumber: captured?.orderNumber || quote.orderNumber || undefined }
    } catch (error) {
      // The server answered (declined, verification failed, total changed): do not retry.
      if (error instanceof CardPaymentError) throw error
      lastError = error
      if (attempt < 2) await deps.wait(1500 * (attempt + 1))
    }
  }
  console.error('Card capture unconfirmed', lastError instanceof Error ? lastError.name : 'unknown')
  throw new PaymentStatusUnknownError()
}
