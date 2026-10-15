import { supabase } from './supabase'

export type ReferralMilestone = {
  threshold: number
  title: string
  reward: string
  reached: boolean
}

export type ReferralEntry = {
  id: string
  name: string | null
  email: string | null
  status: string
  referredAt: string
  qualifiedAt: string | null
  qualifyingOrderNumber: string | null
  rewardValue: number | null
}

export type ReferralReward = {
  id: string
  title: string
  value: number
  description: string | null
  createdAt: string
}

export type ReferralDashboard = {
  success: true
  referralCode: string
  qualifiedCount: number
  pendingCount: number
  totalCount: number
  membership: string | null
  freeShippingActive: boolean
  availablePercentageRewards: ReferralReward[]
  rewards: Array<{
    id: string
    reward_type: string
    reward_value: number | null
    title: string
    description: string | null
    status: string
    milestone_threshold: number | null
    created_at: string
    redeemed_at: string | null
  }>
  milestones: ReferralMilestone[]
  nextMilestone: ReferralMilestone | null
  referrals: ReferralEntry[]
}

export async function getReferralDashboard(): Promise<ReferralDashboard> {
  const { data, error } = await supabase.functions.invoke('referral-dashboard', {
    method: 'POST',
    body: {},
  })

  if (error) throw new Error(data?.error || error.message || 'Could not load referrals.')
  if (!data?.success) throw new Error(data?.error || 'Could not load referrals.')
  return data as ReferralDashboard
}

export async function submitReferral(
  name: string,
  email: string,
  consentConfirmed: boolean,
) {
  const { data, error } = await supabase.functions.invoke('referral-submit', {
    method: 'POST',
    body: {
      name,
      email,
      consentConfirmed,
      consentVersion: 'referral-contact-consent-v1',
    },
  })

  if (error) throw new Error(data?.error || error.message || 'Could not save referral.')
  if (!data?.success) throw new Error(data?.error || 'Could not save referral.')
  return data
}

export async function claimReferral(referralCode: string) {
  const { data, error } = await supabase.functions.invoke('referral-claim', {
    method: 'POST',
    body: { referralCode },
  })

  if (error) throw new Error(data?.error || error.message || 'Could not apply referral.')
  if (!data?.success) throw new Error(data?.error || 'Could not apply referral.')
  return data
}

export function buildReferralLink(referralCode: string) {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('ref', referralCode)
  return url.toString()
}
