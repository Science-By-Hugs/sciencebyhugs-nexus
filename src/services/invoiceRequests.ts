import { supabase } from './supabase'
import type { CartItem } from './cart'

export type InvoiceRequestResult = {
  success: boolean
  orderId?: string
  invoiceId?: string
  invoiceNumber?: string
  status?: string
  totals?: {
    subtotal: number
    discount: number
    shipping: number
    tax: number
    total: number
  }
  queuedInSupabase?: boolean
  error?: string
}

export async function requestInvoice(
  cart: CartItem[],
  options: {
    policyAcknowledged: boolean
    contactMethod?: string
    customerNotes?: string
    discountCode?: string
  },
): Promise<InvoiceRequestResult> {
  const { data, error } = await supabase.functions.invoke('request-invoice', {
    method: 'POST',
    body: {
      items: cart.map(item => ({
        productId: item.id,
        quantity: item.quantity,
      })),
      policyAcknowledged: options.policyAcknowledged,
      contactMethod: options.contactMethod || null,
      customerNotes: options.customerNotes || null,
      discountCode: options.discountCode || null,
    },
  })

  if (error) {
    const message =
      typeof data?.error === 'string'
        ? data.error
        : error.message || 'Invoice request failed.'
    throw new Error(message)
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Invoice request failed.')
  }

  return data as InvoiceRequestResult
}
