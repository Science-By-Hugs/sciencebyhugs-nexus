export type ZelleConfig = {
  configured: boolean
  displayName: string
  contact: string
  qrUrl: string | null
}

export async function getZelleConfig(): Promise<ZelleConfig> {
  throw new Error('Real Zelle transfers are disabled in staging; a synthetic test flow is planned for Day 7')
}

export async function submitZellePayment(_orderId: string, _confirmation = '') {
  throw new Error('Real Zelle transfers are disabled in staging; a synthetic test flow is planned for Day 7')
}
