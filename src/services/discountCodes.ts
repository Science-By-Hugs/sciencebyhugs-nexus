import { supabase } from './supabase'

export type DiscountValidation = {
  id: string
  code: string
  kind: 'free_shipping' | 'referral_bonus' | 'new_customer' | 'group_buy' | 'custom'
  oneTime: boolean
  permanent: boolean
  discountPercent: number | null
  merchandiseDiscount: number
  shippingDiscount: number
  description: string
}

export async function validateDiscountCode(
  code: string,
  subtotal: number,
  shipping: number,
): Promise<DiscountValidation> {
  const { data, error } = await supabase.functions.invoke('discount-code', {
    body: { code, subtotal, shipping },
  })

  if (error) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : error.message || 'Could not validate discount code.',
    )
  }

  if (!data?.success || !data?.discount?.valid) {
    throw new Error(data?.error || data?.discount?.error || 'Discount code is not valid.')
  }

  return data.discount as DiscountValidation
}
