export interface AppleAuthorization { token: string; state: string; firstName?: string; lastName?: string }
export interface AppleFlowDependencies {
  authorize: (input:{nonce:string;state:string})=>Promise<AppleAuthorization>
  signIn: (input:{provider:'apple';token:string;nonce:string})=>Promise<{data:{user:{id:string}|null};error:unknown}>
  link: (input:{provider:'apple';token:string;nonce:string})=>Promise<{data:{user:{id:string}|null};error:unknown}>
  currentUser: ()=>Promise<{id:string}|null>
}
export async function performAppleAuth(deps:AppleFlowDependencies, intent:'signin'|'link', cryptoApi:Crypto=crypto) {
  const before = await deps.currentUser()
  if (intent === 'link' && !before) throw new Error('Sign in to your existing account before connecting Apple.')
  if (intent === 'signin' && before) throw new Error('Sign out first, or connect Apple from Account settings.')
  const random = () => Array.from(cryptoApi.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('')
  const nonce=random(),state=random()
  const hash=Array.from(new Uint8Array(await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(nonce))),v=>v.toString(16).padStart(2,'0')).join('')
  const authorization=await deps.authorize({nonce:hash,state})
  if (!authorization.token || authorization.state !== state) throw new Error('Apple sign-in verification failed. Please try again.')
  const now=await deps.currentUser()
  if ((now?.id || '') !== (before?.id || '')) throw new Error('Your account changed. Please start Apple sign-in again.')
  const input={provider:'apple' as const,token:authorization.token,nonce}
  const result=await (intent === 'link' ? deps.link(input) : deps.signIn(input))
  if (result.error) throw new Error('Apple sign-in could not complete. Please use email sign-in or try again later.')
  if (!result.data.user || (intent === 'link' && result.data.user.id !== before!.id)) throw new Error('Apple could not be connected to this account.')
  return {user:result.data.user,firstName:authorization.firstName?.trim() || '',lastName:authorization.lastName?.trim() || ''}
}
