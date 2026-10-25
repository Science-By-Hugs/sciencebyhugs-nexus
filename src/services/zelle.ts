import { supabase } from './supabase'

export type ZelleConfig = {
  configured: boolean
  displayName: string
  contact: string
  qrUrl: string | null
}

export async function getZelleConfig(): Promise<ZelleConfig> {
  const { data, error } = await supabase.functions.invoke('zelle-config', { body: {} })
  if (error) throw error
  if (!data?.success || !data?.configured || !data?.contact) {
    throw new Error(data?.error || 'Zelle is not configured')
  }
  return data as ZelleConfig
}

export async function submitZellePayment(orderId: string, confirmation = '') {
  const { data, error } = await supabase.functions.invoke('zelle-submit-payment', {
    body: { orderId, confirmation },
  })
  if (error) throw error
  if (!data?.success) {
    throw new Error(data?.error || 'Could not submit Zelle payment')
  }
  return data
}
