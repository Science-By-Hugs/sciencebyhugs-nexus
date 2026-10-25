import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type NexusProfile = {
  id: string
  customer_number: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  preferred_contact_method: string | null
  account_status: string | null
  membership_id: string | null
  memberships: {
    name: string
    benefits: string[]
  } | null
}

const normalizeMembershipBenefit = (value: string) =>
  value.trim().toLowerCase()

export function getMembershipBenefits(
  profile: NexusProfile | null | undefined,
): string[] {
  return Array.isArray(profile?.memberships?.benefits)
    ? profile.memberships.benefits.filter(
        (benefit): benefit is string => typeof benefit === 'string' && benefit.trim().length > 0,
      )
    : []
}

export function hasMembershipBenefit(
  profile: NexusProfile | null | undefined,
  benefitName: string,
): boolean {
  const normalizedBenefitName = normalizeMembershipBenefit(benefitName)
  if (!normalizedBenefitName) return false

  return getMembershipBenefits(profile).some(
    benefit => normalizeMembershipBenefit(benefit) === normalizedBenefitName,
  )
}

const NEXUS_SIGNUP_REDIRECT_URL = 'https://nexus.sciencebyhugs.com/'

export async function signUp(input: {
  firstName: string
  lastName: string
  email: string
  password: string
}) {
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  const email = input.email.trim().toLowerCase()

  if (!firstName || !lastName) throw new Error('First and last name are required.')
  if (!email) throw new Error('Email is required.')
  if (input.password.length < 8) throw new Error('Use at least 8 characters for your password.')

  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      emailRedirectTo: NEXUS_SIGNUP_REDIRECT_URL,
      data: {
        first_name: firstName,
        last_name: lastName,
      },
    },
  })

  if (error) throw error

  if (data.session) await claimExistingProfile()

  return {
    ...data,
    confirmationRequired: !data.session,
  }
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })

  if (error) throw error

  await claimExistingProfile()

  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}


const NEXUS_RECOVERY_URL = 'https://nexus.sciencebyhugs.com/?mode=recovery'

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: NEXUS_RECOVERY_URL,
  })
  if (error) throw error
}

export async function updatePassword(newPassword: string) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  })
  if (error) throw error
  return data
}

export async function updateAccountDetails(input: {
  firstName: string
  lastName: string
  phone: string
  email: string
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('You must be signed in to update your account.')

  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  const phone = input.phone.trim()
  const email = input.email.trim().toLowerCase()

  if (!firstName || !lastName) throw new Error('First and last name are required.')
  if (!email) throw new Error('Email is required.')

  const currentEmail = String(user.email || '').trim().toLowerCase()
  let emailConfirmationRequired = false
  let profileEmail = currentEmail || email

  if (email !== currentEmail) {
    const { data: authData, error: authError } = await supabase.auth.updateUser({ email })
    if (authError) throw authError

    const activeAuthEmail = String(authData.user?.email || '').trim().toLowerCase()
    emailConfirmationRequired = activeAuthEmail !== email

    // Do not make checkout/invoice contact data use an unconfirmed address.
    // Once Supabase promotes the new address to user.email, getMyProfile()
    // synchronizes it into the customer profile.
    if (!emailConfirmationRequired) profileEmail = email
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      first_name: firstName,
      last_name: lastName,
      phone,
      email: profileEmail,
      updated_at: new Date().toISOString(),
    })
    .eq('auth_user_id', user.id)

  if (profileError) throw profileError

  return { emailConfirmationRequired }
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
) {
  const user = await getCurrentUser()
  if (!user?.email) throw new Error('Signed-in email could not be loaded.')

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })

  if (verifyError) {
    throw new Error('Current password is incorrect.')
  }

  return updatePassword(newPassword)
}

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user
}

export async function claimExistingProfile() {
  const { data, error } = await supabase.functions.invoke('claim-existing-profile', {
    method: 'POST',
    body: {},
  })

  if (error) throw error
  return data
}

export async function getMyProfile(): Promise<NexusProfile | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('id,customer_number,first_name,last_name,email,phone,preferred_contact_method,account_status,membership_id,memberships(name,benefits)')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const verifiedEmail = String(user.email || '').trim()
  const profileEmail = String(data.email || '').trim()

  if (verifiedEmail && verifiedEmail.toLowerCase() !== profileEmail.toLowerCase()) {
    const { error: syncError } = await supabase
      .from('profiles')
      .update({
        email: verifiedEmail,
        updated_at: new Date().toISOString(),
      })
      .eq('auth_user_id', user.id)

    if (!syncError) data.email = verifiedEmail
  }

  return data as unknown as NexusProfile
}

export function onAuthChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session)
  })
}
