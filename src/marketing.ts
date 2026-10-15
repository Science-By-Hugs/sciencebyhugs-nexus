import { supabase } from './services/supabase'
import './marketing.css'
export const disclosureVersion = '2026-10-01'
export const emailDisclosure = 'I agree to receive marketing emails from Science By Hugs about NEXUS, PULSE, products, offers, and updates. I can unsubscribe at any time.'
export const smsDisclosure = 'By checking this box and submitting, I electronically sign and agree to receive recurring marketing SMS texts from Science By Hugs at the number I provide, including texts sent using automated technology. Consent is not a condition of purchase or account creation. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help; contact legal@sciencebyhugs.com for assistance.'
export function marketingFields(prefix: string) {
 return `<fieldset class="marketing-consent" data-marketing-fields="${prefix}"><legend>Stay connected (optional)</legend><label class="marketing-choice"><input type="checkbox" data-email-consent><span>${emailDisclosure}</span></label><label>Mobile number for marketing texts<input type="tel" data-marketing-phone autocomplete="tel" placeholder="(702) 555-1234"></label><label class="marketing-choice"><input type="checkbox" data-sms-consent><span>${smsDisclosure}</span></label><p>Neither choice is required. Push notifications are separate. <a href="https://nexus.sciencebyhugs.com/policies.html#privacy" target="_blank" rel="noopener">Privacy Policy</a> · <a href="https://nexus.sciencebyhugs.com/policies.html#communications" target="_blank" rel="noopener">Messaging Terms</a></p></fieldset>`
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
export async function saveMarketing(root: ParentNode, app: string, source='account') {
 const consent = readMarketing(root)
 const { data: { user }, error: authError } = await supabase.auth.getUser()
 if (authError || !user) throw new Error('Sign in to save your communication preferences.')
 const { error } = await supabase.from('marketing_consent_events').insert({ ...consent, user_id: user.id, email: user.email, app, source })
 if (error) throw error
}
export function marketingPanel() {
 return `<section data-marketing-panel>${marketingFields('account')}<button type="button" class="ghost" data-save-marketing disabled>Save communication preferences</button><p data-marketing-status role="status"></p></section>`
}
export async function bindMarketing(app: string) {
 const panel = document.querySelector<HTMLElement>('[data-marketing-panel]')
 if (!panel) return
 const button=panel.querySelector<HTMLButtonElement>('[data-save-marketing]')!
 const status=panel.querySelector<HTMLElement>('[data-marketing-status]')!
 button.disabled=true
 const {data:{user}}=await supabase.auth.getUser()
 if (!user || !panel.isConnected) return
 const {data,error}=await supabase.from('marketing_consent_events').select('email_opt_in,sms_opt_in,phone,email').eq('user_id',user.id).eq('app',app).order('recorded_at',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle()
 if (!panel.isConnected) return
 if(error){status.textContent='Could not load communication preferences. Reopen your account to retry.';return}
 panel.querySelector<HTMLInputElement>('[data-email-consent]')!.checked=!!data?.email_opt_in && data.email===user.email
 panel.querySelector<HTMLInputElement>('[data-sms-consent]')!.checked=!!data?.sms_opt_in
 panel.querySelector<HTMLInputElement>('[data-marketing-phone]')!.value=displayMarketingPhone(data?.phone||'')
 button.disabled=false
 button.onclick=async()=>{button.disabled=true;try{await saveMarketing(panel,app);status.textContent='Communication preferences saved.'}catch(error){status.textContent=error instanceof Error?error.message:'Could not save preferences.'}finally{button.disabled=false}}
}
