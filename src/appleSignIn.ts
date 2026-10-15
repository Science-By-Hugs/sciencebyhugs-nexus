import { Capacitor, registerPlugin } from '@capacitor/core'
import { supabase } from './services/supabase'
import { performAppleAuth, type AppleAuthorization } from './appleAuthFlow'
// Enable only after App ID capability, provisioning and Supabase provider/linking are verified.
export const APPLE_SIGN_IN_CONFIGURED = true
const AppleSignIn=registerPlugin<{authorize(input:{nonce:string;state:string}):Promise<AppleAuthorization>}>('NexusAppleSignIn')
export function appleSignInAvailable(){return APPLE_SIGN_IN_CONFIGURED && Capacitor.getPlatform()==='ios'}
export function appleButton(intent:'signin'|'link'='signin') {
 return `<button class="apple-signin-button" type="button" data-apple-intent="${intent}" disabled><svg aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d="M16.4 1.5c.1 1.2-.4 2.4-1.1 3.2-.8.9-1.9 1.4-3 1.3-.1-1.1.4-2.3 1.1-3.1.8-.9 2-1.4 3-1.4M20.5 17.2c-.5 1.2-.8 1.7-1.5 2.8-.9 1.4-2.2 3.1-3.8 3.1-1.4 0-1.8-.9-3.7-.9-1.8 0-2.3.9-3.7.9-1.5 0-2.7-1.5-3.6-2.9C1.6 16.3 1 10.8 3 7.9c1.4-2.1 3.6-2.4 5-2.4 1.6 0 2.6.9 3.9.9 1.3 0 2.1-.9 3.9-.9 1.2 0 3.3.6 4.7 2.4-4 2.2-3.3 7.9 0 9.3"/></svg><span>${intent==='link'?'Connect Apple':'Continue with Apple'}</span></button>`
}
export function bindAppleButtons(){document.querySelectorAll<HTMLButtonElement>('[data-apple-intent]').forEach(b=>{b.disabled=!appleSignInAvailable() || b.dataset.appleConnected==='true';b.title=appleSignInAvailable()?'':'Apple sign-in is being configured for the iPhone app.'})}
export async function authenticateWithApple(intent:'signin'|'link') {
 if(!appleSignInAvailable())throw new Error('Apple sign-in is being configured for the iPhone app.')
 return performAppleAuth({authorize:input=>AppleSignIn.authorize(input),currentUser:async()=>{const{data,error}=await supabase.auth.getUser();return error?null:data.user},signIn:input=>supabase.auth.signInWithIdToken(input),link:async input=>{const{error}=await supabase.auth.linkIdentity(input);if(error)return{data:{user:null},error};return supabase.auth.getUser()}},intent)
}
