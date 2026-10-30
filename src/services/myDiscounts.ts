import { supabase } from './supabase'

export type MyDiscountCode = {
  code: string
  description: string
  discount_percent: number | null
  shipping_discount: number | null
  one_time: boolean
  expires_at: string | null
}

/** Codes Science By Hugs assigned to the signed-in customer that they can still use. */
export async function loadMyDiscountCodes(): Promise<MyDiscountCode[]> {
  const { data, error } = await supabase.rpc('my_discount_codes')
  if (error) throw error
  return (data ?? []) as MyDiscountCode[]
}
