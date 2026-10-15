// A static design fixture: no authentication, network writes, or saved acknowledgments.
import { bindVisibleViewport } from './src/viewport'
bindVisibleViewport()
import { bindSheetHeaders, openDialog } from './src/dialogNavigation'
import { buildReferralLink } from './src/appLinks'
import { bindPasswordVisibility } from './src/authControls'
bindSheetHeaders()
bindPasswordVisibility()
document.querySelector('#entryGate')?.remove()
document.querySelector('[data-push-prompt]')?.remove()
const find = (selector: string) => document.querySelector<HTMLElement>(selector)!
find('#accountButton').innerHTML = '<span class="profile-avatar" data-profile-avatar>AT</span>'
find('#accountWelcome').textContent = 'Hello, Alex.'
find('#homeGreeting').textContent = 'Hello, Alex.'
find('#latestOrderStatus').textContent = 'Preparing your order'
find('#latestOrderNumber').textContent = 'STG-ORDER-A'
find('#homeSignInButton').hidden = true
find('#accountCustomerId').textContent = 'SBH-0001'
find('#accountMembership').textContent = 'Founding Member'
find('#accountBenefits').hidden = false
find('#accountBenefits').innerHTML = ['Free Shipping','Monthly Promotional Pricing','Priority Shipping'].map(perk => `<span class="account-benefit-chip">✓ ${perk}</span>`).join('')
find('#accountStatus').textContent = 'Active'
document.querySelectorAll('[data-profile-avatar]').forEach(node => { node.textContent = 'AT' })
find('#productCount').textContent = '2 items'
const first = document.querySelector<HTMLElement>('.product-card')!
find('#homeProductPreview').innerHTML = `<button class="home-product-card" type="button"><img src="/science-by-hugs-vial-v3.png" alt="Science By Hugs research vial"><span><strong>Synthetic Research Peptide A</strong><span class="home-product-price">$40.00</span><span class="availability">Available</span></span></button>`
find('#dialogContent').innerHTML = `<div class="dialog-image">${first.querySelector('.product-image')!.innerHTML}</div><span class="category">Research peptides</span><h2>Synthetic Research Peptide A</h2><div class="dialog-price">$40.00</div><p class="dialog-description">A fictional catalog item for reviewing the product layout.</p><div class="research-notice">For research use only. Not for human or veterinary use. Educational information is not medical advice.</div><button type="button" class="request-invoice-button">Add to cart</button>`
find('#cartItems').innerHTML = `<article class="cart-row"><div class="cart-copy"><strong>Synthetic Research Peptide A</strong><span>$40.00 each</span><button class="cart-remove text-action" type="button">Remove</button></div><div class="quantity-control"><button type="button">−</button><span>1</span><button type="button">+</button></div><strong class="cart-price">$40.00</strong></article>`
for (const [id,value] of Object.entries({cartSubtotal:'$40.00',cartDiscount:'$0.00',cartShipping:'$0.00',cartTax:'$3.20',cartProcessingFee:'$0.00',cartTotal:'$43.20'})) find('#'+id).textContent=value
const history = document.querySelector('#accountHistory') || document.querySelector('.account-history')
if (history) history.innerHTML = `<article class="history-card"><div class="history-card-top"><div><strong class="history-number">STG-ORDER-A</strong><small>October 14, 2026</small></div><span class="history-status paid">Paid</span></div><div class="history-lines"><div class="history-line"><span>Synthetic Research Peptide A</span><strong>$40.00</strong></div></div><div class="history-delivery"><span>Delivery status</span><strong>Preparing your order</strong><small>Fictional preview data.</small></div><div class="history-total"><span>Total</span><strong>$40.00</strong></div></article>`
function show(screen: string) {
  find('#appleProfileSetup').hidden = screen !== 'Apple profile'
  find('#accountDialog .sheet-topbar > strong').textContent = ({Manage:'Manage Account',Membership:'Membership',Orders:'Orders','Sign in':'Account'} as Record<string,string>)[screen] || 'Account'
  if (['Home','Home signed out'].includes(screen)) {
    find('#homeSignInButton').hidden = screen !== 'Home signed out'
    find('#latestOrderButton').hidden = screen === 'Home signed out'
    find('#homeGreeting').textContent = screen === 'Home signed out' ? 'Welcome to Nexus.' : 'Hello, Alex.'
  }
  if (['Home','Home signed out','Catalog'].includes(screen)) { find('#homeScreen').hidden = !['Home','Home signed out'].includes(screen); find('#catalogScreen').hidden = screen !== 'Catalog'; document.body.dataset.screen = screen.toLowerCase(); document.querySelectorAll('.mobile-nav-item').forEach(button => button.classList.toggle('active', button.id === (screen === 'Home' ? 'mobileHomeButton' : 'mobileCatalogButton'))) }
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(dialog => dialog.close())
  find('#signedOutView').hidden = !['Sign in'].includes(screen)
  find('.auth-brand-panel').hidden = false
  find('#loginForm').hidden = false
  find('#signupForm').hidden = true
  find('#forgotPasswordForm').hidden = true
  find('#signedInView').hidden = ['Sign in'].includes(screen)
  find('#accountHubView').hidden = ['Orders','Manage','Membership'].includes(screen)
  find('#accountManageView').hidden = screen !== 'Manage'
  find('#accountMembershipView').hidden = screen !== 'Membership'
  find('#accountOrdersView').hidden = screen !== 'Orders'
  find('#cartEmpty').hidden = true
  find('#cartContent').hidden = false
  if(screen === 'Apple profile'){ find('#signedOutView').hidden = true; find('#signedInView').hidden = true }
  const mapping = { 'Apple profile':'#accountDialog', 'Sign in': '#accountDialog', Account: '#accountDialog', Orders: '#accountDialog', Cart: '#cartDialog', Product: '#productDialog', Menu: '#menuDialog', Manage: '#accountDialog', Membership: '#accountDialog', Referrals: '#referralDialog', Support: '#supportDialog', Policies: '#policyDialog' }
  const id = mapping[screen as keyof typeof mapping]
  if (id) openDialog(document.querySelector<HTMLDialogElement>(id)!)
}
document.querySelectorAll<HTMLButtonElement>('[data-preview]').forEach(button => button.onclick = () => show(button.dataset.preview!))
document.querySelectorAll<HTMLButtonElement>('.dialog-close').forEach(button => button.onclick = () => button.closest('dialog')!.close())
document.querySelectorAll<HTMLFormElement>('form').forEach(form => form.onsubmit = event => event.preventDefault())
find('#mobileHomeButton').onclick = () => show('Home')
find('#mobileCatalogButton').onclick = () => show('Catalog')
find('#mobileOrdersButton').onclick = () => show('Orders')
for (const id of ['browseCatalogButton']) find('#'+id).onclick = () => show('Catalog')
find('#homeSignInButton').onclick = () => show('Sign in')
for (const id of ['latestOrderButton']) find('#'+id).onclick = () => show('Orders')
find('#homeProductPreview').onclick = () => show('Product')
find('#mobileAccountButton').onclick = () => show('Account')
find('#cartButton').onclick = () => show('Cart')
find('#menuButton').onclick = () => show('Menu')
find('#orderActivityButton').onclick = () => show('Orders')
find('#createAccountButton').onclick = () => {
  find('.auth-brand-panel').hidden = true
  find('#loginForm').hidden = true
  find('#signupForm').hidden = false
}
find('#signupBack').onclick = () => show('Sign in')
find('#forgotPasswordButton').onclick = () => {
  find('.auth-brand-panel').hidden = true
  find('#loginForm').hidden = true
  find('#forgotPasswordForm').hidden = false
}
find('#forgotPasswordBack').onclick = () => show('Sign in')
document.querySelectorAll<HTMLElement>('.product-card').forEach(card => card.onclick = () => show('Product'))
const referralLink = buildReferralLink('SBH-0001')
find('#referralDialogContent').innerHTML = `<div class="referral-dashboard"><div class="referral-hero"><h3>Share Nexus</h3><p>Your account number is your referral code. This screen uses fictional preview data.</p></div><div class="referral-code-card"><span>Your account & referral code</span><strong>SBH-0001</strong><div class="referral-link">${referralLink}</div><div class="referral-actions"><button class="auth-primary" type="button">Copy link</button><button class="auth-secondary" type="button">Share</button></div></div><details class="referral-explainer"><summary>How referrals work</summary><ol><li>Share your personal link.</li><li>Pending means your friend has not met the qualification rules.</li><li>Qualified means a paid order has been verified for their account.</li></ol><p>Only qualified referrals count toward rewards.</p></details><div class="referral-stats"><div><span>Qualified</span><strong>2</strong></div><div><span>Pending</span><strong>1</strong></div><div><span>Total</span><strong>3</strong></div></div><div class="referral-progress-card"><div><span>Reward progress</span><strong>2 / 5</strong></div><div class="referral-progress"><i style="width:40%"></i></div><small>3 more qualified referrals until the next preview milestone.</small></div><div class="referral-milestones"><div class="referral-section-title">Reward milestones</div><div class="referral-milestone"><div class="referral-milestone-count">5</div><div><strong>Preview milestone</strong><span>Example reward description.</span></div></div></div><form class="referral-track-form"><div class="referral-section-title">Track a friend</div><p>This preview does not save or contact anyone.</p><label>Name<input placeholder="Optional"></label><label>Email<input type="email" placeholder="friend@example.com"></label><label class="referral-consent"><input type="checkbox"><span>I have permission to provide this contact for referral tracking.</span></label><button class="auth-primary" type="button">Track referral</button></form><div class="referral-empty">No other referrals in this preview.</div></div>`
find('#manageFirstName').setAttribute('value','Alex')
find('#manageLastName').setAttribute('value','Taylor')
find('#manageEmail').setAttribute('value','alex@example.invalid')
for (const id of ['closeReferralDialog','closeSupportDialog','closePolicyDialog']) find('#'+id).onclick = () => find('#'+id).closest('dialog')!.close()
for (const id of ['backReferralToMenu','backSupportToMenu','backPolicyToMenu']) find('#'+id).onclick = () => show('Menu')
find('#backFromManageAccount').onclick = () => show('Account')
find('#backFromOrderActivity').onclick = () => show('Account')
find('#manageAccountButton').onclick = () => show('Manage')
document.querySelectorAll<HTMLElement>('[data-menu-target]').forEach(button => button.onclick = () => show(({catalog:'Catalog',account:'Account',referral:'Referrals',support:'Support',policies:'Policies'} as Record<string,string>)[button.dataset.menuTarget!] || 'Menu'))
document.querySelectorAll<HTMLFormElement>('form').forEach(form => form.onsubmit = event => event.preventDefault())
show('Home')


find('#membershipContent').innerHTML = `<div class="membership-heading"><span class="eyebrow">YOUR MEMBERSHIP</span><h2>Founding Member</h2><p>SBH-0001 · Active</p></div><section class="membership-card"><h3>Member benefits</h3><ul>${['Free Shipping','Monthly Promotional Pricing','Priority Shipping'].map(perk => `<li><span>✓</span><span>${perk}</span></li>`).join('')}</ul></section>`
find('#membershipButton').onclick = () => show('Membership')
find('#backFromMembership').onclick = () => show('Account')
find('#menuDoneButton').onclick = () => show('Home')
find('[data-marketing-phone-label]').textContent = 'Text updates use your saved account phone: (702) 555-1234.'
find('#managePhone').setAttribute('value','(702) 555-1234')

find('[data-biometric-status]').textContent = 'Optional whole-app unlock · Face ID, Touch ID, Android biometrics or device passcode.'
find('[data-biometric-toggle]').textContent = 'Enable Biometric Unlock'
