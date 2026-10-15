import { supabase } from './services/supabase'
import './marketing.css'
export const disclosureVersion = '2026-10-01'
export const emailDisclosure = 'I agree to receive marketing emails from Science By Hugs about NEXUS, PULSE, products, offers, and updates. I can unsubscribe at any time.'
export const smsDisclosure = 'By checking this box and submitting, I electronically sign and agree to receive recurring marketing SMS texts from Science By Hugs at the number I provide, including texts sent using automated technology. Consent is not a condition of purchase or account creation. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help; contact legal@sciencebyhugs.com for assistance.'
export function marketingFields(prefix: string) {
 const phoneField = prefix === 'account'
   ? '<input type="hidden" data-marketing-phone><p class="communication-destination" data-marketing-phone-label></p>'
   : '<label>Mobile number for marketing texts<input type="tel" data-marketing-phone autocomplete="tel" placeholder="(702) 555-1234"></label>'
 return `<fieldset class="marketing-consent" data-marketing-fields="${prefix}"><legend>Email & text preferences</legend><label class="marketing-choice"><input type="checkbox" data-email-consent><span>${emailDisclosure}</span></label>${phoneField}<label class="marketing-choice"><input type="checkbox" data-sms-consent><span>${smsDisclosure}</span></label><p>These choices are optional and separate from device notifications. <a href="https://sbh-nexus-v2-staging.pages.dev/policies.html#privacy" target="_blank" rel="noopener">Privacy Policy</a> · <a href="https://sbh-nexus-v2-staging.pages.dev/policies.html#communications" target="_blank" rel="noopener">Messaging Terms</a></p></fieldset>`
}
export function normalizeMarketingPhone(value: string) {
 const compact = value.trim().replace(/[\s().-]/g, '')
 if (/^\d{10}$/.test(compact)) return '+1' + compact
 if (/^1\d{10}$/.test(compact)) return '+' + compact
 return compact
}
export function displayMarketingPhone(value: string) {
 return /^\+1\d{10}$/.test(value) ? value.slice(2) : value
}
export function readMarketing(root: ParentNode) {
 const email_opt_in = root.querySelector<HTMLInputElement>('[data-email-consent]')!.checked
 const sms_opt_in = root.querySelector<HTMLInputElement>('[data-sms-consent]')!.checked
 const phone = normalizeMarketingPhone(root.querySelector<HTMLInputElement>('[data-marketing-phone]')!.value)
 if (sms_opt_in && !/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('For SMS, enter a 10-digit mobile number, such as (702) 555-1234. For numbers outside the U.S., include the country code.')
 return { email_opt_in, sms_opt_in, phone: sms_opt_in ? phone : null, disclosure_version: disclosureVersion }
}
export async function saveMarketing(root: ParentNode, app: string, source='account', expectedUserId?: string) {
 const consent = readMarketing(root)
 const { data: { user }, error: authError } = await supabase.auth.getUser()
 if (authError || !user) throw new Error('Sign in to save your communication preferences.')
 if (expectedUserId && expectedUserId !== user.id) throw new Error('Your account changed. Reopen preferences before saving.')
 const { error } = await supabase.from('marketing_consent_events').insert({ ...consent, user_id: user.id, email: user.email, app, source })
 if (error) throw error
}
export function applyAccountMarketingPhone(panel: ParentNode, profilePhone: string, consentPhone: string, smsOptIn: boolean) {
 const phone = normalizeMarketingPhone(profilePhone)
 const valid = /^\+[1-9]\d{7,14}$/.test(phone)
 const field = panel.querySelector<HTMLInputElement>('[data-marketing-phone]')!
 const checkbox = panel.querySelector<HTMLInputElement>('[data-sms-consent]')!
 field.value = valid ? phone : ''
 checkbox.checked = valid && smsOptIn && phone === normalizeMarketingPhone(consentPhone)
 checkbox.disabled = !valid
 const label = panel.querySelector<HTMLElement>('[data-marketing-phone-label]')
 if (label) label.textContent = valid ? `Text updates use your saved account phone: ${profilePhone}. To change it, update and save your phone number above. A new number requires a new text opt-in.` : 'Add and save a phone number in your profile above to enable optional text updates.'
}

export function marketingPanel() {
 return `<details class="communication-preferences" data-marketing-panel><summary><span><strong>Email & text updates</strong><small>Optional news, offers and member updates</small></span><span aria-hidden="true">+</span></summary><div class="communication-content">${marketingFields('account')}<button type="button" class="auth-secondary" data-save-marketing disabled>Save preferences</button><p data-marketing-status role="status" aria-live="polite"></p></div></details>`
}
let marketingGeneration = 0
export function resetMarketingPreferences() {
 marketingGeneration++
 const panel = document.querySelector<HTMLElement>('[data-marketing-panel]')
 if (!panel) return
 panel.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(input => { input.checked = false })
 panel.querySelector<HTMLInputElement>('[data-marketing-phone]')!.value = ''
 panel.querySelector<HTMLButtonElement>('[data-save-marketing]')!.disabled = true
 panel.querySelector<HTMLElement>('[data-marketing-status]')!.textContent = ''
}
export async function bindMarketing(app: string, profilePhone = '') {
 const version = ++marketingGeneration
 const panel = document.querySelector<HTMLElement>('[data-marketing-panel]')
 if (!panel) return
 const button=panel.querySelector<HTMLButtonElement>('[data-save-marketing]')!
 const status=panel.querySelector<HTMLElement>('[data-marketing-status]')!
 button.disabled=true
 const {data:{user}}=await supabase.auth.getUser()
 if (!user || !panel.isConnected || version !== marketingGeneration) return
 const {data,error}=await supabase.from('marketing_consent_events').select('email_opt_in,sms_opt_in,phone,email').eq('user_id',user.id).eq('app',app).order('recorded_at',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle()
 if (!panel.isConnected || version !== marketingGeneration) return
 if(error){status.textContent='Could not load communication preferences. Reopen your account to retry.';return}
 panel.querySelector<HTMLInputElement>('[data-email-consent]')!.checked=!!data?.email_opt_in && data.email===user.email
 applyAccountMarketingPhone(panel, profilePhone, data?.phone || '', !!data?.sms_opt_in)
 button.disabled=false
 button.onclick=async()=>{if(version!==marketingGeneration)return;button.disabled=true;try{await saveMarketing(panel,app,'account',user.id);if(version===marketingGeneration)status.textContent='Preferences saved.'}catch(error){if(version===marketingGeneration)status.textContent=error instanceof Error?error.message:'Could not save preferences.'}finally{if(version===marketingGeneration)button.disabled=false}}
}
