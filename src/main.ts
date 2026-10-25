import { marketingFields, marketingPanel, bindMarketing, saveMarketing, readMarketing } from './marketing'
import { avatarMarkup, avatarPanel, bindAvatars } from './avatar'
import { pushPanel, pushPrompt, bindPushPanel, disablePush } from './push'
import './styles.css'
import './brand.css'
import { registerSW } from 'virtual:pwa-register'
import { fetchCatalog, type CatalogProduct } from './services/catalog'
import {
  claimExistingProfile,
  getCurrentUser,
  getMyProfile,
  onAuthChange,
  requestPasswordReset,
  changePassword,
  updatePassword,
  updateAccountDetails,
  signIn,
  signUp,
  signOut,
  getMembershipBenefits,
  hasMembershipBenefit,
  type NexusProfile,
} from './services/auth'
import {
  addProduct,
  calculateCart,
  cartQuantity,
  changeQuantity,
  clearCart,
  loadCart,
  saveCart,
  type CartItem,
} from './services/cart'
import { validateDiscountCode, type DiscountValidation } from './services/discountCodes'
import { requestInvoice } from './services/invoiceRequests'
import { createCheckoutOrder, type CheckoutOrderResult } from './services/checkout'
import { getMyOrderHistory, type NexusOrderHistory } from './services/accountHistory'
import { capturePayPalOrder, createPayPalOrder, getPayPalSdk } from './services/paypal'
import { getZelleConfig, submitZellePayment } from './services/zelle'
import { getInvoicePdfLink } from './services/invoicePdf'
import { nexusPolicies } from './policies'
import {
  buildReferralLink,
  claimReferral,
  getReferralDashboard,
  submitReferral,
  type ReferralDashboard,
} from './services/referrals'

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    // Check once at startup. A newly downloaded worker waits until the
    // current Nexus session is closed before taking control.
    void registration.update()
  },
})

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('App root not found')

let products: CatalogProduct[] = []
let selectedCategory = 'All'
let query = ''
let currentProfile: NexusProfile | null = null
let accountHistory: NexusOrderHistory[] = []
let cart: CartItem[] = loadCart()
let activeCheckoutOrder: CheckoutOrderResult | null = null
let activeCheckoutPaymentMethod: 'PayPal' | 'Venmo' | 'Apple Pay' | 'Zelle' | null = null
let appliedDiscount: DiscountValidation | null = null
let appliedDiscountCartSignature = ''
const initialMode = new URLSearchParams(window.location.search).get('mode')
let recoveryMode = initialMode === 'recovery'
let inviteMode = initialMode === 'invite'
let referralDashboard: ReferralDashboard | null = null

const incomingReferralCode = new URLSearchParams(window.location.search).get('ref')
if (incomingReferralCode) {
  window.localStorage.setItem('sbh_referral_code', incomingReferralCode.trim())
}

const nexusLogoUrl = `${import.meta.env.BASE_URL}brand/nexus.svg`
const defaultProductImageUrl = `${import.meta.env.BASE_URL}default-product-vial-photo.webp?v=2`

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char] as string))


const researchUsePolicy = nexusPolicies.find(policy => policy.id === 'research-use')
if (!researchUsePolicy) throw new Error('Research Use Only Policy not found')

const ENTRY_GATE_STORAGE_KEY = 'sbh_nexus_entry_ack'
const ENTRY_GATE_DAYS = 30
const ENTRY_GATE_VERSION = `research-use:${researchUsePolicy.effectiveDate}`

type EntryGateAcknowledgment = {
  version: string
  acknowledgedAt: string
  expiresAt: string
  age21: true
  researchUse: true
}

function hasValidEntryAcknowledgment() {
  try {
    const raw = window.localStorage.getItem(ENTRY_GATE_STORAGE_KEY)
    if (!raw) return false
    const acknowledgment = JSON.parse(raw) as Partial<EntryGateAcknowledgment>
    return (
      acknowledgment.version === ENTRY_GATE_VERSION &&
      acknowledgment.age21 === true &&
      acknowledgment.researchUse === true &&
      typeof acknowledgment.expiresAt === 'string' &&
      new Date(acknowledgment.expiresAt).getTime() > Date.now()
    )
  } catch {
    return false
  }
}

const policyCardsMarkup = nexusPolicies.map(policy => `
  <details class="policy-card">
    <summary>
      <div>
        <span class="policy-kicker">LEGAL POLICY</span>
        <strong>${escapeHtml(policy.title)}</strong>
        <small>Effective ${escapeHtml(policy.effectiveDate)}</small>
      </div>
      <span class="policy-chevron" aria-hidden="true">⌄</span>
    </summary>
    <div class="policy-content">${escapeHtml(policy.text)}</div>
  </details>
`).join('')


app.innerHTML = `
  <section id="entryGate" class="entry-gate" aria-labelledby="entryGateTitle" style="--entry-vial:url('${defaultProductImageUrl}')" ${hasValidEntryAcknowledgment() ? 'hidden' : ''}>
    <div class="entry-gate-backdrop" aria-hidden="true"></div>
    <div class="entry-gate-card">
      <img class="entry-gate-logo" src="${nexusLogoUrl}" alt="Nexus — Science By Hugs" />
      <div class="entry-gate-atom" aria-hidden="true">⚛</div>
      <span class="entry-gate-kicker">RESEARCH ACCESS CONFIRMATION</span>
      <h1 id="entryGateTitle">Before entering <em>Nexus.</em></h1>
      <p class="entry-gate-intro">
        Science By Hugs products are offered for research use only and are not intended for human or veterinary use.
      </p>

      <div class="entry-gate-notice">
        <strong>Research Use Only</strong>
        <p>
          Products are not intended for human consumption, human administration, veterinary use,
          diagnosis, treatment, mitigation, cure, or prevention of disease or any medical condition.
        </p>
      </div>

      <details class="entry-policy-details">
        <summary>Read the Research Use Only Policy</summary>
        <div class="entry-policy-copy">
          <div class="entry-policy-meta">Effective ${escapeHtml(researchUsePolicy.effectiveDate)}</div>
          <pre>${escapeHtml(researchUsePolicy.text)}</pre>
        </div>
      </details>

      <div class="entry-gate-confirmations">
        <label class="entry-gate-check">
          <input id="entryAge21" type="checkbox" />
          <span>I confirm that I am 21 years of age or older.</span>
        </label>
        <label class="entry-gate-check">
          <input id="entryResearchUse" type="checkbox" />
          <span>I have read, understand, and agree to the Science By Hugs Research Use Only Policy.</span>
        </label>
      </div>

      <button id="enterNexusButton" class="entry-gate-enter" type="button" disabled>
        Enter Nexus
      </button>
      <button id="exitNexusButton" class="entry-gate-exit" type="button">
        Leave Site
      </button>

      <p class="entry-gate-footnote">
        Your acknowledgment is remembered on this device for 30 days. You will be asked again if the policy is updated.
      </p>
    </div>
  </section>

  <div class="stars" aria-hidden="true"></div>

  <header class="topbar">
    <a class="brand" href="#" aria-label="Science By Hugs Nexus home">
      <img class="nexus-header-logo" src="${nexusLogoUrl}" alt="Nexus — Science By Hugs" />
    </a>

    <div class="top-actions">
      <span class="system-status"><i></i> CATALOG LIVE</span>
      <button id="menuButton" class="account-button menu-button" type="button">${avatarMarkup()}<span>Menu</span></button>
      <button id="cartButton" class="cart-button" type="button">
        Cart <span id="cartCount">0</span>
      </button>
      <button id="accountButton" class="account-button" type="button">Account</button>
    </div>
  </header>

  ${pushPrompt()}
  <main class="shell">
    <section class="hero">
      <div class="eyebrow">SCIENCE • RESEARCH • DISCOVERY</div>
      <h1>Enter the <em>Nexus.</em></h1>
      <p>Explore the live Science By Hugs catalog, powered by our continuously synced research database.</p>
    </section>

    <section class="catalog-shell">
      <div class="toolbar">
        <label class="search">
          <span>⌕</span>
          <input id="searchInput" type="search" placeholder="Search the catalog…" autocomplete="off" />
        </label>
        <div id="categoryChips" class="chips" aria-label="Catalog categories"></div>
      </div>

      <div class="section-heading">
        <div>
          <span class="eyebrow">LIVE DATABASE</span>
          <h2>Research Catalog</h2>
        </div>
        <span id="productCount" class="count"></span>
      </div>

      <div id="catalogGrid" class="grid">
        <div class="state"><div class="loader"></div><p>Connecting to Nexus…</p></div>
      </div>
    </section>
  </main>

  <nav class="mobile-bottom-nav" aria-label="Mobile navigation">
    <button id="mobileHomeButton" class="mobile-nav-item active" type="button">
      <span class="mobile-nav-icon">⌂</span>
      <span>Home</span>
    </button>
    <button id="mobileAccountButton" class="mobile-nav-item" type="button">
      <span class="mobile-nav-icon">◉</span>
      <span>Account</span>
    </button>
    <button id="mobileSupportButton" class="mobile-nav-item" type="button">
      <span class="mobile-nav-icon">?</span>
      <span>Support</span>
    </button>
    <button id="mobileCartButton" class="mobile-nav-item" type="button">
      <span class="mobile-nav-icon">◇</span>
      <span>Cart</span>
      <b id="mobileCartCount">0</b>
    </button>
  </nav>

  <div id="toast" class="toast" role="status" aria-live="polite"></div>


  <dialog id="menuDialog" class="menu-dialog">
    <button id="closeMenuDialog" class="dialog-close" aria-label="Close">×</button>
    <div class="menu-head">
      <span class="eyebrow">NEXUS NAVIGATION</span>
      <h2>Explore Nexus.</h2>
      <p>Everything connected to your Science By Hugs account in one place.</p>
    </div>
    <nav class="menu-grid" aria-label="Nexus menu">
      <button class="menu-card" type="button" data-menu-target="catalog">
        <span>CATALOG</span><strong>Research Catalog</strong><small>Browse available products.</small>
      </button>
      <button class="menu-card" type="button" data-menu-target="account">
        <span>ACCOUNT</span><strong>My Account</strong><small>Orders, invoices, profile, and security.</small>
      </button>
      <button class="menu-card" type="button" data-menu-target="referral">
        <span>REFERRALS</span><strong>Refer a Friend</strong><small>Referral rewards and progress.</small>
      </button>
      <button class="menu-card" type="button" data-menu-target="support">
        <span>SUPPORT</span><strong>Get Support</strong><small>Order, payment, and account help.</small>
      </button>
      <button class="menu-card" type="button" data-menu-target="policies">
        <span>POLICIES</span><strong>Policy Library</strong><small>Terms, privacy, shipping, and research policies.</small>
      </button>
    </nav>
  </dialog>

  <dialog id="supportDialog" class="support-dialog">
    <div class="subpage-header">
      <button id="backSupportToMenu" class="subpage-back-button" type="button">← Back to Menu</button>
      <button id="closeSupportDialog" class="referral-close-button" aria-label="Close">×</button>
    </div>
    <div class="support-page">
      <div class="support-hero">
        <span class="eyebrow">NEXUS SUPPORT</span>
        <h2>How can we help?</h2>
        <p>Reach Science By Hugs support or save our contact card directly to your phone.</p>
      </div>

      <div class="support-grid">
        <a class="support-action-card" href="mailto:support@sciencebyhugs.com">
          <div class="support-action-icon">✉</div>
          <div>
            <span>EMAIL SUPPORT</span>
            <strong>support@sciencebyhugs.com</strong>
            <small>Open your email app with our support address ready.</small>
          </div>
        </a>

        <a class="support-action-card" href="sms:+17253107502">
          <div class="support-action-icon">💬</div>
          <div>
            <span>TEXT SUPPORT</span>
            <strong>(725) 310-7502</strong>
            <small>Open your messaging app and text the Science By Hugs support line.</small>
          </div>
        </a>


      </div>

      <div class="support-info-card">
        <span class="eyebrow">SCIENCE BY HUGs</span>
        <strong>Customer Support</strong>
        <p>For account, order, invoice, payment, or general questions, include your customer ID or order number when available.</p>
      </div>
    </div>
  </dialog>

  <dialog id="policyDialog" class="policy-dialog">
    <div class="policy-dialog-header">
      <div class="subpage-header-main">
        <button id="backPolicyToMenu" class="subpage-back-button" type="button">← Back to Menu</button>
        <div>
          <span class="eyebrow">POLICY LIBRARY</span>
          <strong>Science By Hugs Policies</strong>
        </div>
      </div>
      <button id="closePolicyDialog" class="referral-close-button" aria-label="Close">×</button>
    </div>

    <div class="policy-dialog-content">
      <div class="policy-page-intro">
        <h2>Policies & Legal</h2>
        <p>Review the policies that apply to orders, research-use products, privacy, refunds, shipping, and delivery.</p>
      </div>

      <div class="policy-library">
        ${policyCardsMarkup}
      </div>

      <div class="policy-legal-contact">
        <span class="eyebrow">LEGAL CONTACT</span>
        <strong>Questions about these policies?</strong>
        <a href="mailto:legal@sciencebyhugs.com">legal@sciencebyhugs.com</a>
      </div>
    </div>
  </dialog>

  <dialog id="referralDialog" class="referral-dialog">
    <div class="referral-dialog-header">
      <div class="subpage-header-main">
        <button id="backReferralToMenu" class="subpage-back-button" type="button">← Back to Menu</button>
        <div>
          <span class="eyebrow">REFERRAL LAB</span>
          <strong>Refer a Friend</strong>
        </div>
      </div>
      <button id="closeReferralDialog" class="referral-close-button" aria-label="Close">×</button>
    </div>
    <div id="referralDialogContent" class="referral-dialog-content"></div>
  </dialog>

  <dialog id="productDialog" class="product-dialog">
    <button id="closeDialog" class="dialog-close" aria-label="Close">×</button>
    <div id="dialogContent"></div>
  </dialog>

  <dialog id="cartDialog" class="cart-dialog">
    <button id="closeCartDialog" class="dialog-close" aria-label="Close">×</button>

    <div class="cart-heading">
      <span class="eyebrow">NEXUS CHECKOUT</span>
      <h2>Your research cart.</h2>
      <p>Review your items, acknowledge the policies, then pay now or request an invoice by email.</p>
    </div>

    <div id="cartEmpty" class="cart-empty">
      <div class="cart-empty-icon">◇</div>
      <strong>Your cart is empty.</strong>
      <p>Add products from the catalog to get started.</p>
    </div>

    <div id="cartContent" hidden>
      <div id="cartItems" class="cart-items"></div>

      <section class="checkout-panel">
        <div class="checkout-title">Order Summary</div>
        <div class="summary-row"><span>Subtotal</span><strong id="cartSubtotal">$0.00</strong></div>
        <div class="summary-row"><span id="cartDiscountLabel">Discounts</span><strong id="cartDiscount">-$0.00</strong></div>
        <div class="summary-row"><span>Shipping</span><strong id="cartShipping">$0.00</strong></div>
        <div class="summary-row"><span>Sales Tax (8%)</span><strong id="cartTax">$0.00</strong></div>
        <div class="summary-row"><span>PayPal/Venmo/Apple Pay Processing Fee (5%)</span><strong id="cartProcessingFee">$0.00</strong></div>
        <div class="summary-row total-row"><span>Total</span><strong id="cartTotal">$0.00</strong></div>
        <div class="server-note">Final pricing is revalidated securely when the request is submitted.</div>
      </section>

      <section id="customerPreview" class="checkout-panel customer-preview">
        <div class="checkout-title">Checkout Customer</div>
        <div id="customerSignedOut" class="customer-signed-out">
          <p>Sign in before checking out. Nexus will fill your customer information automatically.</p>
          <button id="cartSignInButton" class="auth-secondary" type="button">Sign In</button>
        </div>

        <div id="customerSignedIn" hidden>
          <div class="customer-name" id="checkoutCustomerName">—</div>
          <div class="customer-detail" id="checkoutCustomerId">—</div>
          <div class="customer-detail" id="checkoutCustomerEmail">—</div>
          <div class="customer-detail" id="checkoutCustomerPhone">—</div>

          <label class="checkout-field">
            Preferred Contact
            <select id="contactMethod">
              <option value="">Choose one</option>
              <option value="Text">Text</option>
              <option value="Email">Email</option>
              <option value="Phone">Phone</option>
            </select>
          </label>

          <label class="checkout-field">
            Notes for this order
            <textarea id="customerNotes" rows="3" maxlength="500" placeholder="Optional"></textarea>
          </label>
        </div>
      </section>

      <section class="checkout-panel discount-code-panel">
        <div class="discount-code-heading">
          <div>
            <span class="eyebrow">PROMOTIONS</span>
            <div class="checkout-title">Discount Code</div>
          </div>
          <span class="discount-code-badge">OPTIONAL</span>
        </div>
        <div class="discount-code-row">
          <label class="discount-code-field" for="discountCode">
            <span class="sr-only">Discount code</span>
            <input
              id="discountCode"
              type="text"
              inputmode="text"
              autocomplete="off"
              autocapitalize="characters"
              maxlength="40"
              placeholder="Enter code"
            />
          </label>
          <button id="applyDiscountCodeButton" class="discount-code-apply" type="button">Apply</button>
        </div>
        <div id="discountCodeMessage" class="discount-code-message" aria-live="polite"></div>
      </section>

      <section class="policy-panel">
        <label class="policy-check">
          <input id="policyAcknowledgment" type="checkbox" />
          <span>
            I have read, acknowledged, and agree to comply with all Science By Hugs policies.
          </span>
        </label>
      </section>

      <section class="checkout-choice">
        <button id="payNowButton" class="request-invoice-button" type="button">
          Pay Now
        </button>
        <button id="requestInvoiceButton" class="auth-secondary checkout-invoice-button" type="button">
          Request Invoice by Email
        </button>
        <p>Pay now with PayPal, Venmo, Apple Pay, or Zelle — or request an invoice and pay later.</p>
      </section>

      <section id="cartPayPanel" class="cart-pay-panel" hidden>
        <div class="checkout-title">Choose Payment Method</div>
        <p class="cart-pay-copy">PayPal, Venmo, and Apple Pay include a 5% processing surcharge. Zelle does not. Your final total is revalidated securely before payment.</p>
        <div class="nexus-wallet-buttons">
          <paypal-button id="cartPayPalButton" class="nexus-paypal-button" hidden></paypal-button>
          <venmo-button id="cartVenmoButton" class="nexus-venmo-button" type="pay" hidden></venmo-button>
          <apple-pay-button id="cartApplePayButton" class="nexus-apple-pay-button" buttonstyle="black" type="buy" locale="en-US" hidden></apple-pay-button>
          <button id="cartZelleStartButton" class="zelle-submit-button" type="button" hidden>Pay with Zelle</button>
        </div>
        <div id="cartPayMessage" class="paypal-message" aria-live="polite"></div>

        <div id="cartZellePanel" class="zelle-shell" hidden>
          <div class="zelle-head">
            <strong>Pay with Zelle</strong>
            <small>Send the exact server-verified total, then report the payment below.</small>
          </div>
          <div id="cartZelleDetails" class="zelle-details"></div>
          <label class="zelle-confirmation-label">
            Confirmation / reference
            <input id="cartZelleConfirmation" class="zelle-confirmation" type="text" maxlength="120" placeholder="Optional">
          </label>
          <button id="cartZelleSubmitButton" class="zelle-submit-button" type="button">
            I Sent the Zelle Payment
          </button>
          <div id="cartZelleMessage" class="zelle-message"></div>
        </div>
      </section>

      <div id="invoiceRequestMessage" class="invoice-request-message" aria-live="polite"></div>
    </div>

    <div id="invoiceSuccess" class="invoice-success" hidden>
      <div class="success-orbit">✓</div>
      <span class="eyebrow">REQUEST RECEIVED</span>
      <h2>Invoice queued.</h2>
      <p>Your invoice request is waiting for Science By Hugs approval.</p>
      <div class="success-number">
        <span>Invoice</span>
        <strong id="successInvoiceNumber">—</strong>
      </div>
      <button id="successCloseButton" class="auth-primary" type="button">Return to Nexus</button>
    </div>

    <div id="payNowSuccess" class="invoice-success" hidden>
      <div class="success-orbit">✓</div>
      <span class="eyebrow">CHECKOUT RECEIVED</span>
      <h2 id="payNowSuccessTitle">Payment received.</h2>
      <p id="payNowSuccessCopy">Your order has been sent to Science By Hugs Core.</p>
      <div class="success-number">
        <span>Order</span>
        <strong id="payNowOrderNumber">—</strong>
      </div>
      <button id="payNowSuccessCloseButton" class="auth-primary" type="button">Return to Nexus</button>
    </div>
  </dialog>

  <dialog id="accountDialog" class="account-dialog">
    <button id="closeAccountDialog" class="dialog-close" aria-label="Close">×</button>

    <div id="signedOutView" class="auth-shell">
      <div class="auth-brand-panel">
        <img class="auth-brand-logo" src="${nexusLogoUrl}" alt="Nexus — Science By Hugs" />
        <span class="auth-status-pill"><i></i> SECURE CUSTOMER ACCESS</span>
        <h2>Welcome to <em>Nexus.</em></h2>
        <p class="account-copy">Your Science By Hugs account connects orders, invoices, rewards, and research access in one place.</p>
      </div>

      <form id="loginForm" class="auth-form auth-card">
        <label>
          Email
          <input id="loginEmail" type="email" autocomplete="email" required />
        </label>
        <label>
          Password
          <input id="loginPassword" type="password" autocomplete="current-password" required />
        </label>
        <button id="loginSubmit" class="auth-primary auth-primary-glow" type="submit">Sign In to Nexus <span aria-hidden="true">→</span></button>
        <button id="forgotPasswordButton" class="auth-link auth-forgot-link" type="button">Forgot your password?</button>
        <div class="auth-divider"><span>First time here?</span></div>
        <button id="createAccountButton" class="auth-secondary create-account-button" type="button">
          <span class="create-account-icon" aria-hidden="true">＋</span>
          <span><strong>Create Account</strong><small>Join as a New Researcher</small></span>
          <b aria-hidden="true">→</b>
        </button>
        <div id="loginMessage" class="auth-message" aria-live="polite"></div>
      </form>

      <form id="signupForm" class="auth-form recovery-form auth-card" hidden>
        <span class="eyebrow">CREATE NEXUS IDENTITY</span>
        <h3>Join the Nexus.</h3>
        <p class="account-copy">Create your account and begin as a New Researcher.</p>
        <div class="account-name-grid">
          <label>
            First name
            <input id="signupFirstName" type="text" autocomplete="given-name" required />
          </label>
          <label>
            Last name
            <input id="signupLastName" type="text" autocomplete="family-name" required />
          </label>
        </div>
        <label>
          Email
          <input id="signupEmail" type="email" autocomplete="email" required />
        </label>
        <label>
          Password
          <input id="signupPassword" type="password" autocomplete="new-password" minlength="8" required />
        </label>
        <label>
          Confirm password
          <input id="signupPasswordConfirm" type="password" autocomplete="new-password" minlength="8" required />
        </label>
        <button id="signupSubmit" class="auth-primary" type="submit">Create Account</button>
        <button id="signupBack" class="auth-link" type="button">Back to sign in</button>
        <div id="signupMessage" class="auth-message" aria-live="polite"></div>
      </form>

      <form id="forgotPasswordForm" class="auth-form recovery-form auth-card" hidden>
        <span class="eyebrow">PASSWORD RECOVERY</span>
        <h3>Reset your password.</h3>
        <p class="account-copy">Enter the email connected to your Science By Hugs account.</p>
        <label>
          Email
          <input id="forgotPasswordEmail" type="email" autocomplete="email" required />
        </label>
        <button id="forgotPasswordSubmit" class="auth-primary" type="submit">Send Reset Email</button>
        <button id="forgotPasswordBack" class="auth-link" type="button">Back to sign in</button>
        <div id="forgotPasswordMessage" class="auth-message" aria-live="polite"></div>
      </form>

      <form id="recoveryPasswordForm" class="auth-form recovery-form auth-card" hidden>
        <span id="passwordSetupEyebrow" class="eyebrow">SECURE RECOVERY</span>
        <h3 id="passwordSetupTitle">Choose a new password.</h3>
        <p id="passwordSetupCopy" class="account-copy">Create a secure password for your Science By Hugs account.</p>
        <label>
          New password
          <input id="recoveryPassword" type="password" autocomplete="new-password" minlength="8" required />
        </label>
        <label>
          Confirm new password
          <input id="recoveryPasswordConfirm" type="password" autocomplete="new-password" minlength="8" required />
        </label>
        ${marketingFields('activation')}
        <button id="recoveryPasswordSubmit" class="auth-primary" type="submit">Set New Password</button>
        <div id="recoveryPasswordMessage" class="auth-message" aria-live="polite"></div>
      </form>
    </div>

    <div id="signedInView" hidden>
      <div id="accountHubView" class="account-hub-view">
        <div class="account-welcome">
          <span class="eyebrow">NEXUS IDENTITY</span>
          <h2 id="accountWelcome">Welcome to the Nexus.</h2>
          <p class="account-copy">Your research account, orders, and connections — all in one place.</p>
          <div class="account-identity-strip">
            <span id="accountCustomerId">—</span>
            <i></i>
            <span id="accountMembership">—</span>
            <i></i>
            <span id="accountStatus">—</span>
          </div>
          <div id="accountBenefits" class="account-benefits" hidden></div>
          <span id="accountName" class="account-hidden-identity"></span>
          <span id="accountEmail" class="account-hidden-identity"></span>
        </div>

        <div class="account-hub-actions">
          <button id="manageAccountButton" class="account-hub-card" type="button">
            <span class="account-hub-icon">◎</span>
            <span><strong>Manage Account</strong><small>Photo, profile, notifications & security</small></span>
            <b>→</b>
          </button>
          <button id="orderActivityButton" class="account-hub-card" type="button">
            <span class="account-hub-icon">◇</span>
            <span><strong>Order Activity</strong><small>Orders, payments & invoices</small></span>
            <b>→</b>
          </button>
          <button id="accountReferralButton" class="account-hub-card" type="button">
            <span class="account-hub-icon">↗</span>
            <span><strong>Refer a Friend</strong><small>Share Nexus & view referral progress</small></span>
            <b>→</b>
          </button>
          <button id="logoutButton" class="account-hub-card account-hub-signout" type="button">
            <span class="account-hub-icon">↪</span>
            <span><strong>Sign Out</strong><small>Securely end this Nexus session</small></span>
            <b>→</b>
          </button>
        </div>
      </div>

      <div id="accountManageView" class="account-subview" hidden>
        <button id="backFromManageAccount" class="subpage-back-button account-subview-back" type="button">← Back to Account</button>
        <div class="account-subview-heading">
          <span class="eyebrow">ACCOUNT CONTROL</span>
          <h2>Manage Account</h2>
          <p>Keep your Nexus identity and sign-in information current.</p>
        </div>

        ${avatarPanel()}
        <form id="accountManageForm" class="auth-form account-manage-form">
          <div class="account-name-grid">
            <label>
              First name
              <input id="manageFirstName" type="text" autocomplete="given-name" required />
            </label>
            <label>
              Last name
              <input id="manageLastName" type="text" autocomplete="family-name" required />
            </label>
          </div>
          <label>
            Phone number
            <input id="managePhone" type="tel" autocomplete="tel" />
          </label>
          <label>
            Email
            <input id="manageEmail" type="email" autocomplete="email" required />
          </label>
          <button id="accountManageSubmit" class="auth-primary" type="submit">Save Account Changes</button>
          <div id="accountManageMessage" class="auth-message" aria-live="polite"></div>
        </form>

        ${pushPanel()}
        ${marketingPanel()}
        <section class="account-security-shell account-manage-security">
          <div class="account-history-heading">
            <div>
              <span class="eyebrow">SECURITY</span>
              <h3>Change password</h3>
            </div>
          </div>
          <form id="changePasswordForm" class="auth-form compact-auth-form">
            <label>
              Current password
              <input id="currentPassword" type="password" autocomplete="current-password" required />
            </label>
            <label>
              New password
              <input id="newPassword" type="password" autocomplete="new-password" minlength="8" required />
            </label>
            <label>
              Confirm new password
              <input id="confirmNewPassword" type="password" autocomplete="new-password" minlength="8" required />
            </label>
            <button id="changePasswordSubmit" class="auth-primary" type="submit">Change Password</button>
            <div id="changePasswordMessage" class="auth-message" aria-live="polite"></div>
          </form>
        </section>
      </div>

      <div id="accountOrdersView" class="account-subview" hidden>
        <button id="backFromOrderActivity" class="subpage-back-button account-subview-back" type="button">← Back to Account</button>
        <section class="account-history-shell account-orders-shell">
          <div class="account-history-heading">
            <div>
              <span class="eyebrow">ORDER ACTIVITY</span>
              <h3>Orders & invoices</h3>
            </div>
            <button id="refreshHistoryButton" class="history-refresh" type="button">Refresh</button>
          </div>
          <div id="accountHistory" class="account-history">
            <div class="history-state">Loading history…</div>
          </div>
        </section>
      </div>
    </div>
  </dialog>
`

const discountCodeInput = document.querySelector<HTMLInputElement>('#discountCode')!
const applyDiscountCodeButton = document.querySelector<HTMLButtonElement>('#applyDiscountCodeButton')!
const discountCodeMessage = document.querySelector<HTMLDivElement>('#discountCodeMessage')!
const grid = document.querySelector<HTMLDivElement>('#catalogGrid')!
const chips = document.querySelector<HTMLDivElement>('#categoryChips')!
const count = document.querySelector<HTMLSpanElement>('#productCount')!
const searchInput = document.querySelector<HTMLInputElement>('#searchInput')!
const entryGate = document.querySelector<HTMLElement>('#entryGate')!
const entryAge21 = document.querySelector<HTMLInputElement>('#entryAge21')!
const entryResearchUse = document.querySelector<HTMLInputElement>('#entryResearchUse')!
const enterNexusButton = document.querySelector<HTMLButtonElement>('#enterNexusButton')!
const exitNexusButton = document.querySelector<HTMLButtonElement>('#exitNexusButton')!

function syncEntryGateState() {
  enterNexusButton.disabled = !(entryAge21.checked && entryResearchUse.checked)
}

function unlockNexusEntry() {
  const acknowledgedAt = new Date()
  const expiresAt = new Date(acknowledgedAt.getTime() + ENTRY_GATE_DAYS * 24 * 60 * 60 * 1000)
  const acknowledgment: EntryGateAcknowledgment = {
    version: ENTRY_GATE_VERSION,
    acknowledgedAt: acknowledgedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    age21: true,
    researchUse: true,
  }

  try {
    window.localStorage.setItem(ENTRY_GATE_STORAGE_KEY, JSON.stringify(acknowledgment))
  } catch {
    // The gate still unlocks for the current page when local storage is unavailable.
  }

  entryGate.hidden = true
  document.documentElement.classList.remove('nexus-gated')
}

if (!hasValidEntryAcknowledgment()) {
  document.documentElement.classList.add('nexus-gated')
}

entryAge21.addEventListener('change', syncEntryGateState)
entryResearchUse.addEventListener('change', syncEntryGateState)
enterNexusButton.addEventListener('click', () => {
  if (enterNexusButton.disabled) return
  unlockNexusEntry()
})
exitNexusButton.addEventListener('click', () => {
  if (window.history.length > 1) {
    window.history.back()
    window.setTimeout(() => {
      if (!document.hidden && !entryGate.hidden) window.location.replace('about:blank')
    }, 350)
    return
  }
  window.location.replace('about:blank')
})

const productDialog = document.querySelector<HTMLDialogElement>('#productDialog')!
const dialogContent = document.querySelector<HTMLDivElement>('#dialogContent')!
const cartDialog = document.querySelector<HTMLDialogElement>('#cartDialog')!
const accountDialog = document.querySelector<HTMLDialogElement>('#accountDialog')!
const menuDialog = document.querySelector<HTMLDialogElement>('#menuDialog')!
const supportDialog = document.querySelector<HTMLDialogElement>('#supportDialog')!
const policyDialog = document.querySelector<HTMLDialogElement>('#policyDialog')!
const referralDialog = document.querySelector<HTMLDialogElement>('#referralDialog')!
const referralDialogContent = document.querySelector<HTMLDivElement>('#referralDialogContent')!
const menuButton = document.querySelector<HTMLButtonElement>('#menuButton')!
const accountButton = document.querySelector<HTMLButtonElement>('#accountButton')!
const cartButton = document.querySelector<HTMLButtonElement>('#cartButton')!
const cartCount = document.querySelector<HTMLSpanElement>('#cartCount')!
const mobileCartCount = document.querySelector<HTMLElement>('#mobileCartCount')!
const mobileHomeButton = document.querySelector<HTMLButtonElement>('#mobileHomeButton')!
const mobileAccountButton = document.querySelector<HTMLButtonElement>('#mobileAccountButton')!
const mobileSupportButton = document.querySelector<HTMLButtonElement>('#mobileSupportButton')!
const mobileCartButton = document.querySelector<HTMLButtonElement>('#mobileCartButton')!
const signedOutView = document.querySelector<HTMLDivElement>('#signedOutView')!
const signedInView = document.querySelector<HTMLDivElement>('#signedInView')!
const accountHubView = document.querySelector<HTMLDivElement>('#accountHubView')!
const accountManageView = document.querySelector<HTMLDivElement>('#accountManageView')!
const accountOrdersView = document.querySelector<HTMLDivElement>('#accountOrdersView')!
const manageAccountButton = document.querySelector<HTMLButtonElement>('#manageAccountButton')!
const orderActivityButton = document.querySelector<HTMLButtonElement>('#orderActivityButton')!
const accountReferralButton = document.querySelector<HTMLButtonElement>('#accountReferralButton')!
const backFromManageAccount = document.querySelector<HTMLButtonElement>('#backFromManageAccount')!
const backFromOrderActivity = document.querySelector<HTMLButtonElement>('#backFromOrderActivity')!
const accountManageForm = document.querySelector<HTMLFormElement>('#accountManageForm')!
const manageFirstName = document.querySelector<HTMLInputElement>('#manageFirstName')!
const manageLastName = document.querySelector<HTMLInputElement>('#manageLastName')!
const managePhone = document.querySelector<HTMLInputElement>('#managePhone')!
const manageEmail = document.querySelector<HTMLInputElement>('#manageEmail')!
const accountManageSubmit = document.querySelector<HTMLButtonElement>('#accountManageSubmit')!
const accountManageMessage = document.querySelector<HTMLDivElement>('#accountManageMessage')!
const loginForm = document.querySelector<HTMLFormElement>('#loginForm')!
const loginEmail = document.querySelector<HTMLInputElement>('#loginEmail')!
const loginPassword = document.querySelector<HTMLInputElement>('#loginPassword')!
const loginSubmit = document.querySelector<HTMLButtonElement>('#loginSubmit')!
const loginMessage = document.querySelector<HTMLDivElement>('#loginMessage')!
const createAccountButton = document.querySelector<HTMLButtonElement>('#createAccountButton')!
const signupForm = document.querySelector<HTMLFormElement>('#signupForm')!
const signupFirstName = document.querySelector<HTMLInputElement>('#signupFirstName')!
const signupLastName = document.querySelector<HTMLInputElement>('#signupLastName')!
const signupEmail = document.querySelector<HTMLInputElement>('#signupEmail')!
const signupPassword = document.querySelector<HTMLInputElement>('#signupPassword')!
const signupPasswordConfirm = document.querySelector<HTMLInputElement>('#signupPasswordConfirm')!
const signupSubmit = document.querySelector<HTMLButtonElement>('#signupSubmit')!
const signupBack = document.querySelector<HTMLButtonElement>('#signupBack')!
const signupMessage = document.querySelector<HTMLDivElement>('#signupMessage')!
const forgotPasswordButton = document.querySelector<HTMLButtonElement>('#forgotPasswordButton')!
const forgotPasswordForm = document.querySelector<HTMLFormElement>('#forgotPasswordForm')!
const forgotPasswordEmail = document.querySelector<HTMLInputElement>('#forgotPasswordEmail')!
const forgotPasswordSubmit = document.querySelector<HTMLButtonElement>('#forgotPasswordSubmit')!
const forgotPasswordBack = document.querySelector<HTMLButtonElement>('#forgotPasswordBack')!
const forgotPasswordMessage = document.querySelector<HTMLDivElement>('#forgotPasswordMessage')!
const recoveryPasswordForm = document.querySelector<HTMLFormElement>('#recoveryPasswordForm')!
const recoveryPassword = document.querySelector<HTMLInputElement>('#recoveryPassword')!
const recoveryPasswordConfirm = document.querySelector<HTMLInputElement>('#recoveryPasswordConfirm')!
const recoveryPasswordSubmit = document.querySelector<HTMLButtonElement>('#recoveryPasswordSubmit')!
const recoveryPasswordMessage = document.querySelector<HTMLDivElement>('#recoveryPasswordMessage')!
const changePasswordForm = document.querySelector<HTMLFormElement>('#changePasswordForm')!
const currentPassword = document.querySelector<HTMLInputElement>('#currentPassword')!
const newPassword = document.querySelector<HTMLInputElement>('#newPassword')!
const confirmNewPassword = document.querySelector<HTMLInputElement>('#confirmNewPassword')!
const changePasswordSubmit = document.querySelector<HTMLButtonElement>('#changePasswordSubmit')!
const changePasswordMessage = document.querySelector<HTMLDivElement>('#changePasswordMessage')!
const cartEmpty = document.querySelector<HTMLDivElement>('#cartEmpty')!
const cartContent = document.querySelector<HTMLDivElement>('#cartContent')!
const cartItems = document.querySelector<HTMLDivElement>('#cartItems')!
const customerSignedOut = document.querySelector<HTMLDivElement>('#customerSignedOut')!
const customerSignedIn = document.querySelector<HTMLDivElement>('#customerSignedIn')!
const policyAcknowledgment = document.querySelector<HTMLInputElement>('#policyAcknowledgment')!
const contactMethod = document.querySelector<HTMLSelectElement>('#contactMethod')!
const customerNotes = document.querySelector<HTMLTextAreaElement>('#customerNotes')!
const payNowButton = document.querySelector<HTMLButtonElement>('#payNowButton')!
const requestInvoiceButton = document.querySelector<HTMLButtonElement>('#requestInvoiceButton')!
const cartPayPanel = document.querySelector<HTMLElement>('#cartPayPanel')!
const cartPayPalButton = document.querySelector<HTMLElement>('#cartPayPalButton')!
const cartVenmoButton = document.querySelector<HTMLElement>('#cartVenmoButton')!
const cartApplePayButton = document.querySelector<HTMLElement>('#cartApplePayButton')!
const cartZelleStartButton = document.querySelector<HTMLButtonElement>('#cartZelleStartButton')!
const cartZellePanel = document.querySelector<HTMLElement>('#cartZellePanel')!
const cartZelleDetails = document.querySelector<HTMLElement>('#cartZelleDetails')!
const cartZelleConfirmation = document.querySelector<HTMLInputElement>('#cartZelleConfirmation')!
const cartZelleSubmitButton = document.querySelector<HTMLButtonElement>('#cartZelleSubmitButton')!
const cartZelleMessage = document.querySelector<HTMLElement>('#cartZelleMessage')!
const cartPayMessage = document.querySelector<HTMLElement>('#cartPayMessage')!
const invoiceRequestMessage = document.querySelector<HTMLDivElement>('#invoiceRequestMessage')!
const invoiceSuccess = document.querySelector<HTMLDivElement>('#invoiceSuccess')!
const payNowSuccess = document.querySelector<HTMLDivElement>('#payNowSuccess')!
const toast = document.querySelector<HTMLDivElement>('#toast')!
const accountHistoryList = document.querySelector<HTMLDivElement>('#accountHistory')!
const refreshHistoryButton = document.querySelector<HTMLButtonElement>('#refreshHistoryButton')!

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0)

function showToast(message: string) {
  toast.textContent = message
  toast.classList.add('show')
  window.setTimeout(() => toast.classList.remove('show'), 1800)
}


function renderAccountBenefits() {
  const benefits = getMembershipBenefits(currentProfile)
  const container = document.querySelector<HTMLElement>('#accountBenefits')
  if (!container) return

  if (!benefits.length) {
    container.hidden = true
    container.innerHTML = ''
    return
  }

  container.hidden = false
  container.innerHTML = benefits.map(benefit => {
    const active = hasMembershipBenefit(currentProfile, benefit)
    return `<span class="account-benefit-chip" data-active="${active ? 'true' : 'false'}">✓ ${escapeHtml(benefit)}</span>`
  }).join('')
}

function showAccountHub() {
  void bindAvatars([currentProfile?.first_name, currentProfile?.last_name].filter(Boolean).join(' '), true)
  accountHubView.hidden = false
  accountManageView.hidden = true
  accountOrdersView.hidden = true
  accountDialog.scrollTop = 0
}

function showAccountManage() {
  accountHubView.hidden = true
  accountManageView.hidden = false
  accountOrdersView.hidden = true
  accountManageMessage.textContent = ''
  accountDialog.scrollTop = 0
}

function showOrderActivity() {
  accountHubView.hidden = true
  accountManageView.hidden = true
  accountOrdersView.hidden = false
  accountDialog.scrollTop = 0
  void refreshOrderHistory()
}

function showLoginView() {
  loginForm.hidden = false
  signupForm.hidden = true
  forgotPasswordForm.hidden = true
  recoveryPasswordForm.hidden = true
}

function showSignupView() {
  loginForm.hidden = true
  signupForm.hidden = false
  forgotPasswordForm.hidden = true
  recoveryPasswordForm.hidden = true
  signupEmail.value = loginEmail.value.trim()
  signupMessage.textContent = ''
}

function showForgotPasswordView() {
  loginForm.hidden = true
  signupForm.hidden = true
  forgotPasswordForm.hidden = false
  recoveryPasswordForm.hidden = true
  forgotPasswordEmail.value = loginEmail.value.trim()
  forgotPasswordMessage.textContent = ''
}

function showRecoveryPasswordView() {
  loginForm.hidden = true
  signupForm.hidden = true
  forgotPasswordForm.hidden = true
  recoveryPasswordForm.hidden = false
  signedOutView.hidden = false
  signedInView.hidden = true
  recoveryPasswordMessage.textContent = ''

  const eyebrow = document.querySelector<HTMLElement>('#passwordSetupEyebrow')
  const title = document.querySelector<HTMLElement>('#passwordSetupTitle')
  const copy = document.querySelector<HTMLElement>('#passwordSetupCopy')
  const submit = document.querySelector<HTMLButtonElement>('#recoveryPasswordSubmit')

  if (inviteMode) {
    if (eyebrow) eyebrow.textContent = 'ACCOUNT ACTIVATION'
    if (title) title.textContent = 'Create your password.'
    if (copy) copy.textContent = 'Your invitation is verified. Create a password to activate your Nexus account and connect your existing customer profile.'
    if (submit) submit.textContent = 'Activate My Account'
  } else {
    if (eyebrow) eyebrow.textContent = 'SECURE RECOVERY'
    if (title) title.textContent = 'Choose a new password.'
    if (copy) copy.textContent = 'Create a secure password for your Science By Hugs account.'
    if (submit) submit.textContent = 'Set New Password'
  }

  if (!accountDialog.open) accountDialog.showModal()
}

async function maybeClaimStoredReferral() {
  const referralCode = window.localStorage.getItem('sbh_referral_code')?.trim()
  if (!referralCode) return

  try {
    await claimReferral(referralCode)
    window.localStorage.removeItem('sbh_referral_code')

    const url = new URL(window.location.href)
    url.searchParams.delete('ref')
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash)
    showToast('Referral connected')
  } catch (error) {
    console.info('Referral attribution unavailable', error)
  }
}

function referralStatusLabel(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'qualified') return 'Qualified'
  if (normalized === 'registered') return 'Registered'
  return 'Pending'
}

async function openReferralDashboard() {
  if (menuDialog.open) menuDialog.close()
  if (!referralDialog.open) referralDialog.showModal()

  if (!currentProfile) {
    referralDialogContent.innerHTML = `
      <span class="eyebrow">REFERRAL LAB</span>
      <h3>Refer a Friend</h3>
      <p>Sign in to access your personal referral code, rewards, and referral progress.</p>
      <button id="referralSignInButton" class="auth-primary referral-action" type="button">Sign In</button>
    `
    document.querySelector<HTMLButtonElement>('#referralSignInButton')?.addEventListener('click', () => {
      referralDialog.close()
      accountDialog.showModal()
    })
    return
  }

  referralDialogContent.innerHTML = `
    <div class="referral-loading">
      <div class="loader"></div>
      <p>Loading your referral lab…</p>
    </div>
  `

  try {
    referralDashboard = await getReferralDashboard()
  } catch (error) {
    referralDialogContent.innerHTML = `
      <span class="eyebrow">REFERRAL LAB</span>
      <h3>Referral dashboard unavailable.</h3>
      <p>${escapeHtml(error instanceof Error ? error.message : 'Please try again.')}</p>
    `
    return
  }

  const data = referralDashboard
  const referralLink = buildReferralLink(data.referralCode)
  const nextThreshold = data.nextMilestone?.threshold || 20
  const progress = Math.min(100, Math.round((data.qualifiedCount / nextThreshold) * 100))

  const milestones = data.milestones.map(milestone => `
    <div class="referral-milestone ${milestone.reached ? 'reached' : ''}">
      <div class="referral-milestone-count">${milestone.threshold}</div>
      <div>
        <strong>${escapeHtml(milestone.title)}</strong>
        <span>${escapeHtml(milestone.reward)}</span>
      </div>
      <b>${milestone.reached ? '✓' : ''}</b>
    </div>
  `).join('')

  const referralRows = data.referrals.length
    ? data.referrals.map(referral => `
        <div class="referral-row">
          <div>
            <strong>${escapeHtml(referral.name || 'Referral')}</strong>
            <small>${escapeHtml(historyDate(referral.referredAt))}</small>
          </div>
          <span class="referral-state ${referral.status === 'qualified' ? 'qualified' : ''}">
            ${escapeHtml(referralStatusLabel(referral.status))}
          </span>
        </div>
      `).join('')
    : '<div class="referral-empty">No referrals tracked yet. Share your link to get started.</div>'

  const availableRewards = data.availablePercentageRewards.length
    ? data.availablePercentageRewards.map(reward => `
        <div class="referral-reward-card">
          <div>
            <span>AVAILABLE</span>
            <strong>${escapeHtml(reward.title)}</strong>
            <small>${escapeHtml(reward.description || '')}</small>
          </div>
          <b>${reward.value}%</b>
        </div>
      `).join('')
    : '<div class="referral-empty">No percentage rewards available right now.</div>'

  referralDialogContent.innerHTML = `
    <div class="referral-dashboard">
      <div class="referral-hero">
        <span class="eyebrow">REFERRAL LAB</span>
        <h3>Refer a Friend</h3>
        <p>Share your Nexus referral link. Qualified referrals count toward your Science By Hugs rewards.</p>
      </div>

      <div class="referral-code-card">
        <span>Your Referral Code</span>
        <strong>${escapeHtml(data.referralCode)}</strong>
        <div class="referral-link">${escapeHtml(referralLink)}</div>
        <div class="referral-actions">
          <button id="copyReferralButton" class="auth-primary" type="button">Copy Link</button>
          <button id="shareReferralButton" class="auth-secondary" type="button">Share</button>
        </div>
      </div>

      <div class="referral-stats">
        <div><span>Qualified</span><strong>${data.qualifiedCount}</strong></div>
        <div><span>Pending</span><strong>${data.pendingCount}</strong></div>
        <div><span>Total</span><strong>${data.totalCount}</strong></div>
      </div>

      <div class="referral-earned-rewards">
        <div class="referral-section-title">Your Rewards</div>
        ${data.freeShippingActive ? '<div class="referral-benefit-chip">✓ Free Shipping Unlocked</div>' : ''}
        ${availableRewards}
      </div>

      <div class="referral-progress-card">
        <div>
          <span>Reward Progress</span>
          <strong>${data.nextMilestone ? `${data.qualifiedCount} / ${data.nextMilestone.threshold}` : 'All milestones reached'}</strong>
        </div>
        <div class="referral-progress"><i style="width:${progress}%"></i></div>
        <small>${
          data.nextMilestone
            ? `${Math.max(0, data.nextMilestone.threshold - data.qualifiedCount)} more qualified referral(s) until ${escapeHtml(data.nextMilestone.reward)}.`
            : 'You reached every current referral milestone.'
        }</small>
      </div>

      <div class="referral-milestones">
        <div class="referral-section-title">Reward Milestones</div>
        ${milestones}
      </div>

      <form id="trackReferralForm" class="referral-track-form">
        <div class="referral-section-title">Track a Friend</div>
        <p>Add someone you referred. This does not send them an email; it simply lets Nexus track their progress.</p>
        <label>
          Name
          <input id="referralName" type="text" maxlength="120" placeholder="Optional">
        </label>
        <label>
          Email
          <input id="referralEmail" type="email" autocomplete="email" required placeholder="friend@example.com">
        </label>
        <label class="referral-consent">
          <input id="referralConsent" type="checkbox" required>
          <span>I confirm that I have permission to provide this person's contact information to Science By Hugs for referral tracking purposes.</span>
        </label>
        <button id="trackReferralSubmit" class="auth-primary" type="submit">Track Referral</button>
        <div id="trackReferralMessage" class="auth-message"></div>
      </form>

      <div class="referral-history">
        <div class="referral-section-title">Your Referrals</div>
        ${referralRows}
      </div>
    </div>
  `

  document.querySelector<HTMLButtonElement>('#copyReferralButton')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(referralLink)
      showToast('Referral link copied')
    } catch {
      showToast('Could not copy referral link')
    }
  })

  const shareButton = document.querySelector<HTMLButtonElement>('#shareReferralButton')
  if (shareButton) {
    if (navigator.share) {
      shareButton.addEventListener('click', async () => {
        try {
          await navigator.share({
            title: 'Science By Hugs Nexus',
            text: 'Join me on Science By Hugs Nexus.',
            url: referralLink,
          })
        } catch {
          // User cancellation is intentionally silent.
        }
      })
    } else {
      shareButton.textContent = 'Copy Code'
      shareButton.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(data.referralCode)
          showToast('Referral code copied')
        } catch {
          showToast('Could not copy referral code')
        }
      })
    }
  }

  const trackForm = document.querySelector<HTMLFormElement>('#trackReferralForm')
  trackForm?.addEventListener('submit', async event => {
    event.preventDefault()
    const nameInput = document.querySelector<HTMLInputElement>('#referralName')!
    const emailInput = document.querySelector<HTMLInputElement>('#referralEmail')!
    const submitButton = document.querySelector<HTMLButtonElement>('#trackReferralSubmit')!
    const message = document.querySelector<HTMLElement>('#trackReferralMessage')!
    const consent = document.querySelector<HTMLInputElement>('#referralConsent')!

    message.textContent = ''

    if (!consent.checked) {
      message.textContent = 'Please confirm you have permission to provide this contact information.'
      return
    }
    submitButton.disabled = true
    submitButton.textContent = 'Saving…'

    try {
      const result = await submitReferral(
        nameInput.value.trim(),
        emailInput.value.trim(),
        consent.checked,
      )
      message.textContent = result.alreadyTracked
        ? 'That referral is already being tracked.'
        : 'Referral added to your dashboard.'
      showToast(result.alreadyTracked ? 'Referral already tracked' : 'Referral tracked')
      await openReferralDashboard()
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : 'Could not save referral.'
      submitButton.disabled = false
      submitButton.textContent = 'Track Referral'
    }
  })
}

function openSupportDialog() {
  if (menuDialog.open) menuDialog.close()
  supportDialog.showModal()
}


function openPolicyDialog() {
  if (menuDialog.open) menuDialog.close()
  policyDialog.showModal()
}

function categories() {
  return ['All', ...new Set(products.map(p => p.product_categories?.name).filter(Boolean) as string[])]
}

function renderChips() {
  chips.innerHTML = categories().map(category => `
    <button class="chip ${category === selectedCategory ? 'active' : ''}" data-category="${escapeHtml(category)}">
      ${escapeHtml(category)}
    </button>
  `).join('')

  chips.querySelectorAll<HTMLButtonElement>('.chip').forEach(button => {
    button.addEventListener('click', () => {
      selectedCategory = button.dataset.category || 'All'
      renderChips()
      renderProducts()
    })
  })
}

function visibleProducts() {
  const normalized = query.trim().toLowerCase()

  return products.filter(product => {
    const category = product.product_categories?.name || 'Uncategorized'
    const normalizedCategory = category.trim().toLowerCase()
    const restrictedCategory =
      normalizedCategory.includes('oral') ||
      normalizedCategory.includes('inject')

    const privilegedCatalogAccess = canViewRestrictedCatalog()
    const accessMatch =
      (!product.core_hidden || privilegedCatalogAccess) &&
      (!restrictedCategory || privilegedCatalogAccess)

    const categoryMatch =
      selectedCategory === 'All' ||
      category === selectedCategory

    const searchMatch =
      !normalized ||
      [
        product.name,
        product.product_type,
        product.description,
        category,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalized)

    return (
      accessMatch &&
      categoryMatch &&
      searchMatch
    )
  })
}

function renderProducts() {
  const list = visibleProducts()
  count.textContent = `${list.length} item${list.length === 1 ? '' : 's'}`

  if (!list.length) {
    grid.innerHTML = '<div class="state"><p>No products match this search.</p></div>'
    return
  }

  grid.innerHTML = list.map(product => {
    const category = product.product_categories?.name || 'Research'
    const available = (product.storefront_status || '').toLowerCase() === 'available'

    return `
      <article class="product-card" data-id="${product.id}">
        <div class="product-image">
          ${product.image_url
            ? `<img src="${escapeHtml(product.image_url)}" alt="" loading="lazy" />`
            : `<img src="${defaultProductImageUrl}" alt="Science By Hugs research vial" loading="lazy" class="default-product-image" />`}
          ${product.featured ? '<span class="featured">FEATURED</span>' : ''}
        </div>
        <div class="product-body">
          <span class="category">${escapeHtml(category)}</span>
          <h3>${escapeHtml(product.name)}</h3>
          <p class="type">${escapeHtml(product.product_type || 'Research Product')}</p>
          <div class="product-footer">
            <strong>${money(Number(product.price))}</strong>
            <span class="availability ${available ? '' : 'unavailable'}">${escapeHtml(product.storefront_status || 'Available')}</span>
          </div>
          <button
            class="add-cart-button"
            data-add-id="${product.id}"
            type="button"
            ${available ? '' : 'disabled'}
          >
            ${available ? 'Add to Cart' : 'Unavailable'}
          </button>
        </div>
      </article>
    `
  }).join('')

  grid.querySelectorAll<HTMLElement>('.product-card').forEach(card => {
    card.addEventListener('click', event => {
      if ((event.target as HTMLElement).closest('[data-add-id]')) return
      openProduct(card.dataset.id || '')
    })
  })

  grid.querySelectorAll<HTMLButtonElement>('[data-add-id]').forEach(button => {
    button.addEventListener('click', () => {
      const product = products.find(item => item.id === button.dataset.addId)
      if (!product) return
      cart = addProduct(cart, product)
      updateCartUI()
      showToast('Added to cart')
    })
  })
}

function openProduct(id: string) {
  const product = products.find(item => item.id === id)
  if (!product) return

  const category = product.product_categories?.name || 'Research'
  const available = (product.storefront_status || '').toLowerCase() === 'available'

  dialogContent.innerHTML = `
    <div class="dialog-image">
      ${product.image_url
        ? `<img src="${escapeHtml(product.image_url)}" alt="" />`
        : `<img src="${defaultProductImageUrl}" alt="Science By Hugs research vial" class="default-product-image" />`}
    </div>
    <span class="category">${escapeHtml(category)}</span>
    <h2>${escapeHtml(product.name)}</h2>
    <div class="dialog-price">${money(Number(product.price))}</div>
    <p class="dialog-description">${escapeHtml(product.description || 'Product information is being prepared.')}</p>
    <div class="research-notice">For research use only. Catalog availability is synchronized with the Science By Hugs research database.</div>
    <button id="dialogAddToCart" class="request-invoice-button" type="button" ${available ? '' : 'disabled'}>
      ${available ? 'Add to Cart' : 'Unavailable'}
    </button>
  `

  document.querySelector<HTMLButtonElement>('#dialogAddToCart')?.addEventListener('click', () => {
    if (!available) return
    cart = addProduct(cart, product)
    updateCartUI()
    showToast('Added to cart')
  })

  productDialog.showModal()
}

function canViewRestrictedCatalog() {
  const membershipName = currentProfile?.memberships?.name?.trim().toLowerCase()
  return membershipName === 'founding member' || membershipName === 'principal scientist'
}

function isFoundingMember() {
  return currentProfile?.memberships?.name?.trim().toLowerCase() === 'founding member'
}

const cartSignature = () =>
  cart.map(item => `${item.id}:${item.quantity}`).sort().join('|')

applyDiscountCodeButton.addEventListener('click', async () => {
  const code = discountCodeInput.value.trim()
  if (!code) {
    discountCodeMessage.textContent = 'Enter a discount code first.'
    discountCodeInput.focus()
    return
  }
  if (!currentProfile) {
    discountCodeMessage.textContent = 'Sign in before applying a discount code.'
    return
  }

  applyDiscountCodeButton.disabled = true
  discountCodeMessage.textContent = 'Checking code…'
  try {
    const baseTotals = calculateCart(cart, isFoundingMember())
    const discount = await validateDiscountCode(code, baseTotals.subtotal, baseTotals.shipping)
    appliedDiscount = discount
    appliedDiscountCartSignature = cartSignature()
    discountCodeInput.value = discount.code
    discountCodeMessage.textContent = '✓ ' + discount.description + ' applied.'
    updateCartUI()
  } catch (error) {
    appliedDiscount = null
    appliedDiscountCartSignature = ''
    discountCodeMessage.textContent =
      error instanceof Error ? error.message : 'Discount code is not valid.'
    updateCartUI()
  } finally {
    applyDiscountCodeButton.disabled = false
  }
})

discountCodeInput.addEventListener('input', () => {
  if (appliedDiscount && discountCodeInput.value.trim().toLowerCase() !== appliedDiscount.code.toLowerCase()) {
    appliedDiscount = null
    appliedDiscountCartSignature = ''
    updateCartUI()
  }
  discountCodeMessage.textContent = ''
})

function updateCartUI() {
  if (appliedDiscount && appliedDiscountCartSignature && appliedDiscountCartSignature !== cartSignature()) {
    appliedDiscount = null
    appliedDiscountCartSignature = ''
    discountCodeMessage.textContent = 'Cart changed. Reapply your discount code.'
  }

  const quantity = cartQuantity(cart)
  cartCount.textContent = String(quantity)
  mobileCartCount.textContent = String(quantity)
  mobileCartCount.hidden = quantity === 0

  if (!cart.length) {
    cartEmpty.hidden = false
    cartContent.hidden = true
    return
  }

  cartEmpty.hidden = true
  cartContent.hidden = false

  cartItems.innerHTML = cart.map(item => `
    <div class="cart-row">
      <div class="cart-copy">
        <strong>${escapeHtml(item.product)}</strong>
        <span>${money(item.price)} each</span>
      </div>
      <div class="quantity-control">
        <button type="button" data-qty-id="${item.id}" data-delta="-1">−</button>
        <b>${item.quantity}</b>
        <button type="button" data-qty-id="${item.id}" data-delta="1">+</button>
      </div>
      <strong class="line-total">${money(item.price * item.quantity)}</strong>
    </div>
  `).join('')

  cartItems.querySelectorAll<HTMLButtonElement>('[data-qty-id]').forEach(button => {
    button.addEventListener('click', () => {
      cart = changeQuantity(
        cart,
        button.dataset.qtyId || '',
        Number(button.dataset.delta || 0),
      )
      updateCartUI()
    })
  })

  const totals = calculateCart(cart, isFoundingMember(), appliedDiscount)
  document.querySelector<HTMLElement>('#cartSubtotal')!.textContent = money(totals.subtotal)
  const discountLabel = document.querySelector<HTMLElement>('#cartDiscountLabel')!
  discountLabel.textContent = appliedDiscount ? `Discount (${appliedDiscount.code})` : 'Discounts'
  document.querySelector<HTMLElement>('#cartDiscount')!.textContent = '-' + money(totals.totalSavings)
  document.querySelector<HTMLElement>('#cartShipping')!.textContent = money(totals.shipping)
  document.querySelector<HTMLElement>('#cartTax')!.textContent = money(totals.tax)
  document.querySelector<HTMLElement>('#cartTotal')!.textContent = money(totals.total)

  updateCheckoutCustomer()
  updateRequestButton()
}

function updateCheckoutCustomer() {
  if (!currentProfile) {
    customerSignedOut.hidden = false
    customerSignedIn.hidden = true
    updateRequestButton()
    return
  }

  customerSignedOut.hidden = true
  customerSignedIn.hidden = false

  const name = [currentProfile.first_name, currentProfile.last_name].filter(Boolean).join(' ')
  document.querySelector<HTMLElement>('#checkoutCustomerName')!.textContent = name || 'Science By Hugs Customer'
  document.querySelector<HTMLElement>('#checkoutCustomerId')!.textContent =
    currentProfile.customer_number ? `Customer ID: ${currentProfile.customer_number}` : 'Customer ID: —'
  document.querySelector<HTMLElement>('#checkoutCustomerEmail')!.textContent =
    currentProfile.email || 'Email: —'
  document.querySelector<HTMLElement>('#checkoutCustomerPhone')!.textContent =
    currentProfile.phone ? `Phone: ${currentProfile.phone}` : 'Phone: —'

  if (!contactMethod.value && currentProfile.preferred_contact_method) {
    const preferred = currentProfile.preferred_contact_method
    if ([...contactMethod.options].some(option => option.value === preferred)) {
      contactMethod.value = preferred
    }
  }

  updateRequestButton()
}

function currentAccountIsActive() {
  return String(currentProfile?.account_status || '').trim().toLowerCase() === 'active'
}

function updateRequestButton() {
  if (!cart.length) {
    payNowButton.disabled = true
    requestInvoiceButton.disabled = true
    payNowButton.textContent = 'Pay Now'
    requestInvoiceButton.textContent = 'Request Invoice by Email'
    return
  }

  if (!currentProfile) {
    payNowButton.disabled = false
    requestInvoiceButton.disabled = false
    payNowButton.textContent = 'Sign In to Pay'
    requestInvoiceButton.textContent = 'Sign In to Request Invoice'
    return
  }

  if (!currentAccountIsActive()) {
    payNowButton.textContent = 'Account Suspended'
    requestInvoiceButton.textContent = 'Account Suspended'
    payNowButton.disabled = true
    requestInvoiceButton.disabled = true
    return
  }

  const locked = Boolean(activeCheckoutOrder)
  payNowButton.textContent = locked ? 'Pay Now Order Started' : 'Pay Now'
  requestInvoiceButton.textContent = locked ? 'Pay Now Order Started' : 'Request Invoice by Email'
  payNowButton.disabled = !policyAcknowledgment.checked || locked
  requestInvoiceButton.disabled = !policyAcknowledgment.checked || locked
}

async function ensureCheckoutOrder(paymentMethod: 'PayPal' | 'Venmo' | 'Apple Pay' | 'Zelle') {
  if (activeCheckoutOrder) {
    if (activeCheckoutPaymentMethod !== paymentMethod) {
      throw new Error(`This checkout was started with ${activeCheckoutPaymentMethod}. Complete that payment method before switching.`)
    }
    return activeCheckoutOrder
  }

  const result = await createCheckoutOrder(cart, {
    policyAcknowledged: policyAcknowledgment.checked,
    contactMethod: contactMethod.value,
    customerNotes: customerNotes.value.trim(),
    discountCode: appliedDiscount?.code || '',
    paymentMethod,
  })

  activeCheckoutOrder = result
  activeCheckoutPaymentMethod = paymentMethod
  document.querySelector<HTMLElement>('#cartSubtotal')!.textContent = money(result.totals.subtotal)
  document.querySelector<HTMLElement>('#cartDiscountLabel')!.textContent =
    result.discountCode ? `Discount (${result.discountCode})` : 'Discounts'
  document.querySelector<HTMLElement>('#cartDiscount')!.textContent =
    '-' + money(result.totals.totalSavings ?? result.totals.discount)
  document.querySelector<HTMLElement>('#cartShipping')!.textContent = money(result.totals.shipping)
  document.querySelector<HTMLElement>('#cartTax')!.textContent = money(result.totals.tax)
  document.querySelector<HTMLElement>('#cartProcessingFee')!.textContent = money(result.totals.processingFee)
  document.querySelector<HTMLElement>('#cartTotal')!.textContent = money(result.totals.total)

  cartItems.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    button.disabled = true
  })
  updateRequestButton()
  return result
}

async function finishPayNow(
  title: string,
  copy: string,
) {
  const orderNumber = activeCheckoutOrder?.orderNumber || 'Pending'

  clearCart()
  cart = []
  policyAcknowledgment.checked = false
  customerNotes.value = ''
  appliedDiscount = null
  appliedDiscountCartSignature = ''
  discountCodeInput.value = ''
  discountCodeMessage.textContent = ''
  cartPayPanel.hidden = true
  cartZellePanel.hidden = true
  cartContent.hidden = true
  cartEmpty.hidden = true

  document.querySelector<HTMLElement>('#payNowSuccessTitle')!.textContent = title
  document.querySelector<HTMLElement>('#payNowSuccessCopy')!.textContent = copy
  document.querySelector<HTMLElement>('#payNowOrderNumber')!.textContent = orderNumber
  invoiceSuccess.hidden = true
  payNowSuccess.hidden = false

  activeCheckoutOrder = null
  activeCheckoutPaymentMethod = null
  updateCartUI()
  await refreshOrderHistory()
}

async function setupCartPayNow() {
  cartPayMessage.textContent = ''

  try {
    const sdk = await getPayPalSdk()
    const methods = await sdk.findEligibleMethods({ currencyCode: 'USD' })
    const paypalEligible = methods.isEligible('paypal')
    const venmoEligible = methods.isEligible('venmo')
    const ApplePaySessionCtor = (window as any).ApplePaySession
    const applePayEligible =
      methods.isEligible('applepay') &&
      Boolean(ApplePaySessionCtor?.canMakePayments?.())

    const paypalSession = sdk.createPayPalOneTimePaymentSession({
      onApprove: async ({ orderId: paypalOrderId }: { orderId: string }) => {
        if (!activeCheckoutOrder) return
        cartPayMessage.textContent = 'Finalizing PayPal payment…'
        try {
          const capture = await capturePayPalOrder(activeCheckoutOrder.orderId, paypalOrderId, 'PayPal')
          if (capture.orderNumber && activeCheckoutOrder) {
            activeCheckoutOrder.orderNumber = capture.orderNumber
          }
          await finishPayNow(
            'Payment received.',
            capture.invoicePdfReady === false
              ? 'Your PayPal payment was verified and your order is processing. Your invoice is still being finalized.'
              : 'Your PayPal payment was verified and your order is now processing.',
          )
        } catch (error) {
          cartPayMessage.textContent =
            error instanceof Error ? error.message : 'PayPal capture failed.'
        }
      },
      onCancel: () => {
        cartPayMessage.textContent = 'PayPal checkout was cancelled. You can choose another option.'
      },
      onError: (error: unknown) => {
        console.error('Cart PayPal checkout error', error)
        cartPayMessage.textContent = 'PayPal checkout could not be completed.'
      },
    })

    const venmoSession = sdk.createVenmoOneTimePaymentSession({
      onApprove: async ({ orderId: paypalOrderId }: { orderId: string }) => {
        if (!activeCheckoutOrder) return
        cartPayMessage.textContent = 'Finalizing Venmo payment…'
        try {
          const capture = await capturePayPalOrder(activeCheckoutOrder.orderId, paypalOrderId, 'Venmo')
          if (capture.orderNumber && activeCheckoutOrder) {
            activeCheckoutOrder.orderNumber = capture.orderNumber
          }
          await finishPayNow(
            'Payment received.',
            capture.invoicePdfReady === false
              ? 'Your Venmo payment was verified and your order is processing. Your invoice is still being finalized.'
              : 'Your Venmo payment was verified and your order is now processing.',
          )
        } catch (error) {
          cartPayMessage.textContent =
            error instanceof Error ? error.message : 'Venmo capture failed.'
        }
      },
      onCancel: () => {
        cartPayMessage.textContent = 'Venmo checkout was cancelled. You can choose another option.'
      },
      onError: (error: unknown) => {
        console.error('Cart Venmo checkout error', error)
        cartPayMessage.textContent = 'Venmo checkout could not be completed.'
      },
    })

    if (paypalEligible) {
      cartPayPalButton.hidden = false
      if (!cartPayPalButton.dataset.bound) {
        cartPayPalButton.dataset.bound = 'true'
        cartPayPalButton.addEventListener('click', async () => {
          cartPayMessage.textContent = 'Preparing secure PayPal checkout…'
          try {
            const checkout = await ensureCheckoutOrder('PayPal')
            const paypalOrder = await createPayPalOrder(checkout.orderId, 'PayPal')
            await paypalSession.start(
              { presentationMode: 'auto' },
              Promise.resolve({ orderId: paypalOrder.orderId }),
            )
          } catch (error) {
            cartPayMessage.textContent =
              error instanceof Error ? error.message : 'Could not start PayPal checkout.'
          }
        })
      }
    }

    if (venmoEligible) {
      cartVenmoButton.hidden = false
      if (!cartVenmoButton.dataset.bound) {
        cartVenmoButton.dataset.bound = 'true'
        cartVenmoButton.addEventListener('click', async () => {
          cartPayMessage.textContent = 'Preparing secure Venmo checkout…'
          try {
            const checkout = await ensureCheckoutOrder('Venmo')
            const paypalOrder = await createPayPalOrder(checkout.orderId, 'Venmo')
            await venmoSession.start(
              { presentationMode: 'auto' },
              Promise.resolve({ orderId: paypalOrder.orderId }),
            )
          } catch (error) {
            cartPayMessage.textContent =
              error instanceof Error ? error.message : 'Could not start Venmo checkout.'
          }
        })
      }
    }

    if (applePayEligible) {
      const paypalApplePaySession = sdk.createApplePayOneTimePaymentSession()
      const applePayConfig = await paypalApplePaySession.config()

      cartApplePayButton.hidden = false

      if (!cartApplePayButton.dataset.bound) {
        cartApplePayButton.dataset.bound = 'true'
        cartApplePayButton.addEventListener('click', () => {
          cartPayMessage.textContent = 'Preparing secure Apple Pay checkout…'

          // Apple Pay must authorize the exact amount on the PayPal order.
          // Mirror the server's wallet pricing here before Apple opens the sheet:
          // 5% processing fee on taxable merchandise, then 8% tax on
          // taxable merchandise + processing fee. Shipping is not taxed.
          const preview = calculateCart(cart, isFoundingMember(), appliedDiscount)
          const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
          const taxableMerchandise = roundMoney(Math.max(0, preview.subtotal - preview.discount))
          const processingFee = roundMoney(taxableMerchandise * 0.05)
          const tax = roundMoney((taxableMerchandise + processingFee) * 0.08)
          const applePayTotal = roundMoney(
            preview.subtotal - preview.discount + preview.shipping + processingFee + tax,
          )

          document.querySelector<HTMLElement>('#cartProcessingFee')!.textContent = money(processingFee)
          document.querySelector<HTMLElement>('#cartTax')!.textContent = money(tax)
          document.querySelector<HTMLElement>('#cartTotal')!.textContent = money(applePayTotal)

          const nativeSession = new ApplePaySessionCtor(4, {
            countryCode: 'US',
            currencyCode: 'USD',
            merchantCapabilities: applePayConfig.merchantCapabilities,
            supportedNetworks: applePayConfig.supportedNetworks,
            requiredBillingContactFields: ['name', 'postalAddress'],
            requiredShippingContactFields: [],
            total: {
              label: 'Science By Hugs',
              amount: Math.max(applePayTotal, 0).toFixed(2),
              type: 'final',
            },
          })

          const preparedOrder = (async () => {
            const checkout = await ensureCheckoutOrder('Apple Pay')
            const paypalOrder = await createPayPalOrder(checkout.orderId, 'Apple Pay')
            return { checkout, paypalOrder }
          })()

          nativeSession.onvalidatemerchant = async (event: any) => {
            try {
              const { merchantSession } = await paypalApplePaySession.validateMerchant({
                validationUrl: event.validationURL,
              })
              nativeSession.completeMerchantValidation(merchantSession)
            } catch (error) {
              console.error('Apple Pay merchant validation failed', error)
              cartPayMessage.textContent =
                error instanceof Error
                  ? `Apple Pay merchant validation failed: ${error.message}`
                  : 'Apple Pay could not validate this merchant session.'
              nativeSession.abort()
            }
          }

          nativeSession.onpaymentauthorized = async (event: any) => {
            try {
              const { checkout, paypalOrder } = await preparedOrder

              await paypalApplePaySession.confirmOrder({
                orderId: paypalOrder.orderId,
                token: event.payment.token,
                billingContact: event.payment.billingContact,
                shippingContact: event.payment.shippingContact,
              })

              cartPayMessage.textContent = 'Finalizing Apple Pay payment…'
              const capture = await capturePayPalOrder(
                checkout.orderId,
                paypalOrder.orderId,
                'Apple Pay',
              )

              if (capture.orderNumber && activeCheckoutOrder) {
                activeCheckoutOrder.orderNumber = capture.orderNumber
              }

              nativeSession.completePayment({
                status: ApplePaySessionCtor.STATUS_SUCCESS,
              })

              await finishPayNow(
                'Payment received.',
                capture.invoicePdfReady === false
                  ? 'Your Apple Pay payment was verified and your order is processing. Your invoice is still being finalized.'
                  : 'Your Apple Pay payment was verified and your order is now processing.',
              )
            } catch (error) {
              console.error('Apple Pay payment failed', error)
              nativeSession.completePayment({
                status: ApplePaySessionCtor.STATUS_FAILURE,
              })
              cartPayMessage.textContent =
                error instanceof Error ? error.message : 'Apple Pay payment could not be completed.'
            }
          }

          nativeSession.oncancel = () => {
            cartPayMessage.textContent = 'Apple Pay checkout was cancelled. You can choose another option.'
          }

          nativeSession.begin()
        })
      }
    } else {
      cartApplePayButton.hidden = true
    }

    if (!paypalEligible && !venmoEligible && !applePayEligible) {
      cartPayMessage.textContent = 'PayPal, Venmo, and Apple Pay are unavailable for this session.'
    }
  } catch (error) {
    console.error('Cart wallet setup unavailable', error)
    cartPayMessage.textContent = 'PayPal, Venmo, and Apple Pay are unavailable right now.'
  }

  try {
    const zelle = await getZelleConfig()
    cartZelleStartButton.hidden = false

    if (!cartZelleStartButton.dataset.bound) {
      cartZelleStartButton.dataset.bound = 'true'
      cartZelleStartButton.addEventListener('click', async () => {
        // Open Zelle immediately. Creating the server-verified checkout order can
        // take several seconds on a cold function, so don't make the customer
        // stare at a loading button while that happens.
        cartZelleStartButton.disabled = true
        cartZelleStartButton.textContent = 'Preparing Zelle…'
        cartZelleDetails.innerHTML = `
          <div><span>Recipient</span><strong>${escapeHtml(zelle.displayName)}</strong></div>
          <div><span>Send to</span><strong>${escapeHtml(zelle.contact)}</strong></div>
          <div><span>Exact total</span><strong>Confirming…</strong></div>
        `
        cartZelleMessage.textContent = 'Confirming your exact total securely…'
        cartZelleSubmitButton.disabled = true
        cartZellePanel.hidden = false
        cartZelleStartButton.hidden = true
        cartZellePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })

        try {
          const checkout = await ensureCheckoutOrder('Zelle')
          cartZelleDetails.innerHTML = `
            <div><span>Recipient</span><strong>${escapeHtml(zelle.displayName)}</strong></div>
            <div><span>Send to</span><strong>${escapeHtml(zelle.contact)}</strong></div>
            <div><span>Exact total</span><strong>${money(checkout.totals.total)}</strong></div>
          `
          cartZelleMessage.textContent = ''
          cartZelleSubmitButton.disabled = false
        } catch (error) {
          cartZellePanel.hidden = true
          cartZelleStartButton.hidden = false
          cartZelleStartButton.disabled = false
          cartZelleStartButton.textContent = 'Pay with Zelle'
          cartZelleSubmitButton.disabled = false
          cartZelleMessage.textContent = ''
          cartPayMessage.textContent =
            error instanceof Error ? error.message : 'Could not prepare Zelle payment.'
        }
      })
    }

    if (!cartZelleSubmitButton.dataset.bound) {
      cartZelleSubmitButton.dataset.bound = 'true'
      cartZelleSubmitButton.addEventListener('click', async () => {
        if (!activeCheckoutOrder) return

        const confirmed = window.confirm(
          'Confirm that you already sent the Zelle payment?\n\nThis submits the payment for manual verification. It does not mark the order paid.'
        )
        if (!confirmed) return

        cartZelleSubmitButton.disabled = true
        cartZelleSubmitButton.textContent = 'Submitting…'
        cartZelleMessage.textContent = 'Submitting Zelle payment for verification…'

        try {
          await submitZellePayment(
            activeCheckoutOrder.orderId,
            cartZelleConfirmation.value.trim(),
          )
          await finishPayNow(
            'Payment submitted.',
            'Your Zelle payment is waiting for Science By Hugs verification before processing.',
          )
        } catch (error) {
          cartZelleMessage.textContent =
            error instanceof Error ? error.message : 'Could not submit Zelle payment.'
          cartZelleSubmitButton.disabled = false
          cartZelleSubmitButton.textContent = 'I Sent the Zelle Payment'
        }
      })
    }
  } catch (error) {
    console.info('Cart Zelle setup unavailable', error)
  }
}

const historyDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))

function friendlyOrderStatus(status: string) {
  const labels: Record<string, string> = {
    invoice_bridge_pending: 'Creating invoice',
    invoice_requested: 'Awaiting approval',
    invoice_ready: 'Invoice ready',
    invoice_sent: 'Invoice sent',
    checkout_pending: 'Awaiting payment',
    processing: 'Processing',
    ordered: 'Ordered',
    shipped: 'Shipped',
    delivered: 'Delivered',
    delayed: 'Delayed',
    pending: 'Pending',
    paid: 'Paid',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }

  return labels[status] || status.replaceAll('_', ' ')
}

const deliveryDate = (value: string) => new Intl.DateTimeFormat('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
}).format(new Date(value + 'T00:00:00Z'))

function renderAccountHistory() {
  if (!currentProfile) {
    accountHistoryList.innerHTML = '<div class="history-state">Sign in to view your order history.</div>'
    return
  }

  if (!accountHistory.length) {
    accountHistoryList.innerHTML = '<div class="history-state">No Nexus orders yet.</div>'
    return
  }

  accountHistoryList.innerHTML = accountHistory.map(order => {
    const invoiceLabel = order.invoice?.invoice_number || order.order_number || 'Pending'
    const invoiceSent = order.invoice?.send_status === 'sent'
    const directCheckout = order.invoice?.status === 'direct_checkout'
    const paymentVerified =
      order.payment?.status === 'verified' ||
      order.payment_status === 'paid'
    const paymentSubmitted =
      order.payment?.status === 'submitted' &&
      !paymentVerified

    const fulfillmentStatus =
      ['ordered', 'shipped', 'delivered', 'delayed', 'cancelled'].includes(order.status)
        ? friendlyOrderStatus(order.status)
        : 'Paid · Processing'

    const status =
      paymentVerified
        ? fulfillmentStatus
        : paymentSubmitted
          ? 'Payment submitted'
          : friendlyOrderStatus(order.status)

    const items = order.items.map(item => `
      <div class="history-line">
        <span>${escapeHtml(item.product_name)} <small>× ${item.quantity}</small></span>
        <strong>${money(item.line_total)}</strong>
      </div>
    `).join('')

    const paymentText =
      paymentVerified
        ? `Paid${order.payment?.provider ? ` via ${order.payment.provider}` : ''}`
        : paymentSubmitted
          ? `Submitted${order.payment?.provider ? ` via ${order.payment.provider}` : ''} · awaiting verification`
          : invoiceSent || directCheckout
            ? 'Waiting for payment'
            : 'Payment opens after invoice delivery'

    return `
      <article class="history-card">
        <div class="history-card-top">
          <div>
            <span class="history-number">${escapeHtml(invoiceLabel)}</span>
            <small>${escapeHtml(historyDate(order.created_at))}</small>
          </div>
          <span class="history-status ${order.status === 'delayed' ? 'delayed' : order.status === 'cancelled' ? 'cancelled' : order.status === 'delivered' ? 'paid' : paymentVerified ? 'paid' : paymentSubmitted ? 'submitted' : invoiceSent ? 'sent' : ''}">
            ${escapeHtml(status)}
          </span>
        </div>

        ${!['delivered', 'cancelled'].includes(order.status) ? `
          <div class="history-delivery">
            <span>Estimated delivery</span>
            <strong>${order.estimated_delivery_date ? escapeHtml(deliveryDate(order.estimated_delivery_date)) : 'To be confirmed'}</strong>
            <small>Delivery dates are estimates and may change.</small>
          </div>
        ` : ''}

        <div class="history-lines">${items || '<span class="history-muted">Item details unavailable.</span>'}</div>

        ${(order.discount_total + order.shipping_discount_total) > 0 ? `
          <div class="history-total history-discount-total">
            <span>Discount${order.discount_code ? ` (${escapeHtml(order.discount_code)})` : ''}</span>
            <strong>-${money(order.discount_total + order.shipping_discount_total)}</strong>
          </div>
        ` : ''}
        ${order.processing_fee_total > 0 ? `
          <div class="history-total">
            <span>PayPal/Venmo Processing Fee</span>
            <strong>${money(order.processing_fee_total)}</strong>
          </div>
        ` : ''}

        <div class="history-total">
          <span>Total</span>
          <strong>${money(order.total)}</strong>
        </div>

        ${order.invoice ? `
          <div class="history-invoice">
            <span>${directCheckout ? 'Order type' : 'Invoice status'}</span>
            <strong>${escapeHtml(
              directCheckout
                ? 'Pay Now'
                : invoiceSent
                  ? 'Sent by email'
                  : order.invoice.pdf_status === 'created'
                    ? 'PDF ready'
                    : friendlyOrderStatus(order.invoice.status)
            )}</strong>
          </div>
        ` : ''}

        ${directCheckout && order.invoice?.pdf_status === 'created' ? `
          <button
            class="history-pdf-button"
            type="button"
            data-invoice-pdf-id="${escapeHtml(order.invoice.id)}"
          >
            View Invoice PDF
          </button>
        ` : ''}

        <div class="history-payment ${paymentVerified ? 'paid' : paymentSubmitted ? 'submitted' : ''}">
          <div>
            <span>Payment status</span>
            <strong>${escapeHtml(paymentText)}</strong>
          </div>
          ${paymentVerified && (order.payment?.verified_at || order.paid_at) ? `
            <small>Verified ${escapeHtml(historyDate(order.payment?.verified_at || order.paid_at || order.created_at))}</small>
          ` : ''}
        </div>

        ${(invoiceSent || directCheckout) && !paymentVerified && !paymentSubmitted ? `
          <div class="history-paypal-shell">
            <div>
              <span class="eyebrow">PAY SECURELY</span>
              <strong>PayPal or Venmo</strong>
              <small>Choose an eligible payment method to securely complete payment.</small>
            </div>
            <div class="nexus-wallet-buttons">
              <paypal-button
                class="nexus-paypal-button"
                data-order-id="${escapeHtml(order.id)}"
                hidden
              ></paypal-button>
              <venmo-button
                class="nexus-venmo-button"
                data-order-id="${escapeHtml(order.id)}"
                type="pay"
                hidden
              ></venmo-button>
            </div>
            <div class="paypal-message" data-paypal-message="${escapeHtml(order.id)}"></div>
            <div class="zelle-shell" data-zelle-shell="${escapeHtml(order.id)}" hidden>
              <div class="zelle-head">
                <strong>Pay with Zelle</strong>
                <small>Send the exact invoice total, then report the payment below.</small>
              </div>
              <div class="zelle-details" data-zelle-details="${escapeHtml(order.id)}"></div>
              <label class="zelle-confirmation-label">
                Confirmation / reference
                <input
                  class="zelle-confirmation"
                  data-zelle-confirmation="${escapeHtml(order.id)}"
                  type="text"
                  maxlength="120"
                  placeholder="Optional"
                >
              </label>
              <button
                class="zelle-submit-button"
                data-zelle-submit="${escapeHtml(order.id)}"
                type="button"
              >
                I Sent the Zelle Payment
              </button>
              <div class="zelle-message" data-zelle-message="${escapeHtml(order.id)}"></div>
            </div>
          </div>
        ` : ''}
      </article>
    `
  }).join('')

  accountHistoryList.querySelectorAll<HTMLButtonElement>('[data-invoice-pdf-id]').forEach(button => {
    button.addEventListener('click', async () => {
      const invoiceId = button.dataset.invoicePdfId
      if (!invoiceId) return

      const popup = window.open('', '_blank')
      const original = button.textContent
      button.disabled = true
      button.textContent = 'Opening PDF…'

      try {
        const result = await getInvoicePdfLink(invoiceId)
        if (popup) popup.location.href = result.url
        else window.location.href = result.url
      } catch (error) {
        if (popup) popup.close()
        showToast(error instanceof Error ? error.message : 'Could not open invoice PDF')
      } finally {
        button.disabled = false
        button.textContent = original || 'View Invoice PDF'
      }
    })
  })

  void Promise.all([
    setupPayPalCheckout(),
    setupZelleCheckout(),
  ])
}

async function setupPayPalCheckout() {
  const paypalButtons = [
    ...document.querySelectorAll<HTMLElement>('.nexus-paypal-button'),
  ]
  const venmoButtons = [
    ...document.querySelectorAll<HTMLElement>('.nexus-venmo-button'),
  ]

  if (!paypalButtons.length && !venmoButtons.length) return

  try {
    const sdk = await getPayPalSdk()
    const methods = await sdk.findEligibleMethods({ currencyCode: 'USD' })
    const paypalEligible = methods.isEligible('paypal')
    const venmoEligible = methods.isEligible('venmo')

    const setupButton = (
      button: HTMLElement,
      paymentMethod: 'PayPal' | 'Venmo',
    ) => {
      const orderId = button.dataset.orderId
      if (!orderId) return

      const message = document.querySelector<HTMLElement>(
        `[data-paypal-message="${CSS.escape(orderId)}"]`,
      )

      const session =
        paymentMethod === 'Venmo'
          ? sdk.createVenmoOneTimePaymentSession({
              onApprove: async ({ orderId: paypalOrderId }: { orderId: string }) => {
                if (message) message.textContent = 'Finalizing Venmo payment…'

                try {
                  await capturePayPalOrder(orderId, paypalOrderId, 'Venmo')
                  if (message) message.textContent = 'Venmo payment completed.'
                  showToast('Venmo payment completed')
                  await refreshOrderHistory()
                } catch (error) {
                  if (message) {
                    message.textContent =
                      error instanceof Error ? error.message : 'Venmo capture failed.'
                  }
                }
              },
              onCancel: () => {
                if (message) message.textContent = 'Venmo checkout was cancelled.'
              },
              onError: (error: unknown) => {
                console.error('Venmo checkout error', error)
                if (message) message.textContent = 'Venmo checkout could not be completed.'
              },
            })
          : sdk.createPayPalOneTimePaymentSession({
              onApprove: async ({ orderId: paypalOrderId }: { orderId: string }) => {
                if (message) message.textContent = 'Finalizing PayPal payment…'

                try {
                  await capturePayPalOrder(orderId, paypalOrderId, 'PayPal')
                  if (message) message.textContent = 'PayPal payment completed.'
                  showToast('PayPal payment completed')
                  await refreshOrderHistory()
                } catch (error) {
                  if (message) {
                    message.textContent =
                      error instanceof Error ? error.message : 'PayPal capture failed.'
                  }
                }
              },
              onCancel: () => {
                if (message) message.textContent = 'PayPal checkout was cancelled.'
              },
              onError: (error: unknown) => {
                console.error('PayPal checkout error', error)
                if (message) message.textContent = 'PayPal checkout could not be completed.'
              },
            })

      button.hidden = false
      button.addEventListener('click', async () => {
        if (message) {
          message.textContent =
            paymentMethod === 'Venmo'
              ? 'Opening Venmo…'
              : 'Opening PayPal…'
        }

        try {
          const paypalOrder = await createPayPalOrder(orderId, paymentMethod)
          await session.start(
            { presentationMode: 'auto' },
            Promise.resolve({ orderId: paypalOrder.orderId }),
          )
        } catch (error) {
          if (message) {
            message.textContent =
              error instanceof Error
                ? error.message
                : `Could not start ${paymentMethod} checkout.`
          }
        }
      })
    }

    if (paypalEligible) {
      paypalButtons.forEach(button => setupButton(button, 'PayPal'))
    } else {
      paypalButtons.forEach(button => {
        button.hidden = true
      })
    }

    if (venmoEligible) {
      venmoButtons.forEach(button => setupButton(button, 'Venmo'))
    } else {
      venmoButtons.forEach(button => {
        button.hidden = true
      })
    }

    if (!paypalEligible && !venmoEligible) {
      paypalButtons.forEach(button => {
        const orderId = button.dataset.orderId || ''
        const message = document.querySelector<HTMLElement>(
          `[data-paypal-message="${CSS.escape(orderId)}"]`,
        )
        if (message) {
          message.textContent = 'PayPal and Venmo are not available for this session.'
        }
      })
    } else if (!venmoEligible) {
      venmoButtons.forEach(button => {
        const orderId = button.dataset.orderId || ''
        const message = document.querySelector<HTMLElement>(
          `[data-paypal-message="${CSS.escape(orderId)}"]`,
        )
        if (message && !message.textContent) {
          message.textContent = 'Venmo is unavailable on this device/session; PayPal is still available.'
        }
      })
    }
  } catch (error) {
    console.error('PayPal/Venmo setup unavailable', error)

    ;[...paypalButtons, ...venmoButtons].forEach(button => {
      const orderId = button.dataset.orderId || ''
      const message = document.querySelector<HTMLElement>(
        `[data-paypal-message="${CSS.escape(orderId)}"]`,
      )
      if (message) {
        message.textContent = 'PayPal/Venmo setup is unavailable right now.'
      }
    })
  }
}


async function setupZelleCheckout() {
  const shells = [
    ...document.querySelectorAll<HTMLElement>('[data-zelle-shell]'),
  ]
  if (!shells.length) return

  try {
    const config = await getZelleConfig()

    shells.forEach(shell => {
      const orderId = shell.dataset.zelleShell
      if (!orderId) return

      const details = document.querySelector<HTMLElement>(
        `[data-zelle-details="${CSS.escape(orderId)}"]`,
      )
      const input = document.querySelector<HTMLInputElement>(
        `[data-zelle-confirmation="${CSS.escape(orderId)}"]`,
      )
      const button = document.querySelector<HTMLButtonElement>(
        `[data-zelle-submit="${CSS.escape(orderId)}"]`,
      )
      const message = document.querySelector<HTMLElement>(
        `[data-zelle-message="${CSS.escape(orderId)}"]`,
      )

      if (details) {
        details.innerHTML = `
          <div><span>Recipient</span><strong>${escapeHtml(config.displayName)}</strong></div>
          <div><span>Send to</span><strong>${escapeHtml(config.contact)}</strong></div>
          ${config.qrUrl ? `<img src="${escapeHtml(config.qrUrl)}" alt="Zelle QR code">` : ''}
        `
      }

      shell.hidden = false

      button?.addEventListener('click', async () => {
        const confirmed = window.confirm(
          'Confirm that you already sent the Zelle payment?\n\nThis does not mark the order paid. Science By Hugs will verify it before processing.'
        )
        if (!confirmed) return

        button.disabled = true
        button.textContent = 'Submitting…'
        if (message) message.textContent = 'Sending payment notice to Science By Hugs…'

        try {
          await submitZellePayment(orderId, input?.value.trim() || '')
          if (message) message.textContent = 'Payment submitted for verification.'
          showToast('Zelle payment submitted')
          await refreshOrderHistory()
        } catch (error) {
          if (message) {
            message.textContent =
              error instanceof Error ? error.message : 'Could not submit Zelle payment.'
          }
          button.disabled = false
          button.textContent = 'I Sent the Zelle Payment'
        }
      })
    })
  } catch (error) {
    console.info('Zelle setup unavailable', error)
  }
}

async function refreshOrderHistory() {
  if (!currentProfile) {
    accountHistory = []
    renderAccountHistory()
    return
  }

  accountHistoryList.innerHTML = '<div class="history-state">Loading history…</div>'
  refreshHistoryButton.disabled = true

  try {
    accountHistory = await getMyOrderHistory(currentProfile.id)
    renderAccountHistory()
  } catch (error) {
    console.error('Order history load failed', error)
    accountHistoryList.innerHTML =
      '<div class="history-state history-error">Order history could not be loaded.</div>'
  } finally {
    refreshHistoryButton.disabled = false
  }
}

async function refreshAccount() {
  const user = await getCurrentUser()
  void bindPushPanel(!recoveryMode && !inviteMode ? user?.id || '' : '')
  void bindAvatars()

  if (recoveryMode || inviteMode) {
    currentProfile = null
    showRecoveryPasswordView()
    updateCheckoutCustomer()
    updateCartUI()
    return
  }

  if (!user) {
    currentProfile = null
    accountButton.textContent = 'Account'
    signedOutView.hidden = false
    signedInView.hidden = true
    accountHistory = []
    renderAccountHistory()
    updateCheckoutCustomer()
    updateCartUI()
    return
  }

  try {
    currentProfile = await getMyProfile()
  } catch (error) {
    console.error('Profile load failed', error)
    currentProfile = null
  }

  signedOutView.hidden = true
  signedInView.hidden = false

  const fullName = currentProfile
    ? [currentProfile.first_name, currentProfile.last_name].filter(Boolean).join(' ')
    : ''

  const firstName = currentProfile?.first_name?.trim() || fullName.split(' ')[0] || 'Researcher'
  accountButton.innerHTML = avatarMarkup()
  accountButton.setAttribute('aria-label', fullName || 'My Account')
  void bindAvatars(fullName)
  document.querySelector<HTMLElement>('#accountWelcome')!.textContent = `Welcome, ${firstName}, to the Nexus.`
  document.querySelector<HTMLElement>('#accountName')!.textContent = fullName || 'Your account'
  document.querySelector<HTMLElement>('#accountEmail')!.textContent = currentProfile?.email || user.email || ''
  document.querySelector<HTMLElement>('#accountCustomerId')!.textContent = currentProfile?.customer_number || 'Nexus Member'
  document.querySelector<HTMLElement>('#accountMembership')!.textContent = currentProfile?.memberships?.name || 'Member'
  document.querySelector<HTMLElement>('#accountStatus')!.textContent = currentProfile?.account_status || 'Active'
  renderAccountBenefits()
  void bindMarketing('nexus')
  manageFirstName.value = currentProfile?.first_name || ''
  manageLastName.value = currentProfile?.last_name || ''
  managePhone.value = currentProfile?.phone || ''
  manageEmail.value = currentProfile?.email || user.email || ''
  showAccountHub()
  const pushUrl = new URL(location.href)
  if (pushUrl.searchParams.get('push') === 'orders') {
    pushUrl.searchParams.delete('push')
    history.replaceState(null, '', pushUrl)
    if (!accountDialog.open) accountDialog.showModal()
    showOrderActivity()
  }
  updateCheckoutCustomer()
  updateCartUI()

  // Warm the PayPal/Venmo SDK after sign-in so wallet buttons open faster later.
  // This runs off the critical account-render path and reuses getPayPalSdk()'s cached promise.
  if (currentProfile && currentAccountIsActive()) {
    window.setTimeout(() => {
      void getPayPalSdk().catch(error => {
        console.info('PayPal preload unavailable', error)
      })
    }, 250)
  }
}

productDialog.addEventListener('click', event => {
  if (event.target === productDialog) productDialog.close()
})
cartDialog.addEventListener('click', event => {
  if (event.target === cartDialog) cartDialog.close()
})
accountDialog.addEventListener('click', event => {
  if (event.target === accountDialog && !recoveryMode) accountDialog.close()
})
menuDialog.addEventListener('click', event => {
  if (event.target === menuDialog) menuDialog.close()
})
function returnToMenu(dialog: HTMLDialogElement) {
  dialog.close()
  if (!menuDialog.open) menuDialog.showModal()
}

supportDialog.addEventListener('click', event => {
  if (event.target === supportDialog) supportDialog.close()
})
policyDialog.addEventListener('click', event => {
  if (event.target === policyDialog) policyDialog.close()
})
referralDialog.addEventListener('click', event => {
  if (event.target === referralDialog) referralDialog.close()
})

document.querySelector<HTMLButtonElement>('#closeDialog')!.addEventListener('click', () => productDialog.close())
document.querySelector<HTMLButtonElement>('#closeCartDialog')!.addEventListener('click', () => cartDialog.close())
document.querySelector<HTMLButtonElement>('#closeAccountDialog')!.addEventListener('click', () => {
  if (!recoveryMode) accountDialog.close()
})
document.querySelector<HTMLButtonElement>('#closeMenuDialog')!.addEventListener('click', () => menuDialog.close())
document.querySelector<HTMLButtonElement>('#closeSupportDialog')!.addEventListener('click', () => supportDialog.close())
document.querySelector<HTMLButtonElement>('#backSupportToMenu')!.addEventListener('click', () => returnToMenu(supportDialog))
document.querySelector<HTMLButtonElement>('#closePolicyDialog')!.addEventListener('click', () => policyDialog.close())
document.querySelector<HTMLButtonElement>('#backPolicyToMenu')!.addEventListener('click', () => returnToMenu(policyDialog))

document.querySelector<HTMLButtonElement>('#closeReferralDialog')!.addEventListener('click', () => referralDialog.close())
document.querySelector<HTMLButtonElement>('#backReferralToMenu')!.addEventListener('click', () => returnToMenu(referralDialog))
document.querySelector<HTMLButtonElement>('#successCloseButton')!.addEventListener('click', () => cartDialog.close())
document.querySelector<HTMLButtonElement>('#payNowSuccessCloseButton')!.addEventListener('click', () => cartDialog.close())

menuButton.addEventListener('click', () => {
  menuDialog.showModal()
})

menuDialog.querySelectorAll<HTMLButtonElement>('[data-menu-target]').forEach(button => {
  button.addEventListener('click', () => {
    const target = button.dataset.menuTarget

    if (target === 'catalog') {
      menuDialog.close()
      document.querySelector('.catalog-shell')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    if (target === 'account') {
      menuDialog.close()
      accountDialog.showModal()
      return
    }

    if (target === 'referral') {
      void openReferralDashboard()
      return
    }

    if (target === 'support') {
      openSupportDialog()
      return
    }

    if (target === 'policies') {
      openPolicyDialog()
      return
    }
  })
})

accountButton.addEventListener('click', () => {
  openAccountDialog()
})

function openCartDialog() {
  invoiceSuccess.hidden = true
  payNowSuccess.hidden = true
  cartEmpty.hidden = cart.length > 0
  cartContent.hidden = cart.length === 0
  cartDialog.showModal()
}

function openAccountDialog() {
  if (!recoveryMode) {
    showLoginView()
    if (currentProfile) showAccountHub()
  }
  accountDialog.showModal()
}

function setMobileNavActive(active: 'home' | 'account' | 'support' | 'cart') {
  const items = [
    [mobileHomeButton, 'home'],
    [mobileAccountButton, 'account'],
    [mobileSupportButton, 'support'],
    [mobileCartButton, 'cart'],
  ] as const

  items.forEach(([button, key]) => {
    button.classList.toggle('active', key === active)
  })
}

mobileHomeButton.addEventListener('click', () => {
  setMobileNavActive('home')
  window.scrollTo({ top: 0, behavior: 'smooth' })
})

mobileAccountButton.addEventListener('click', () => {
  setMobileNavActive('account')
  openAccountDialog()
})

mobileSupportButton.addEventListener('click', () => {
  setMobileNavActive('support')
  openSupportDialog()
})

mobileCartButton.addEventListener('click', () => {
  setMobileNavActive('cart')
  openCartDialog()
})

cartButton.addEventListener('click', () => {
  invoiceSuccess.hidden = true
  payNowSuccess.hidden = true
  cartEmpty.hidden = cart.length > 0
  cartContent.hidden = cart.length === 0
  invoiceRequestMessage.textContent = ''
  updateCartUI()
  cartDialog.showModal()
})

document.querySelector<HTMLButtonElement>('#cartSignInButton')!.addEventListener('click', () => {
  cartDialog.close()
  accountDialog.showModal()
})

policyAcknowledgment.addEventListener('change', updateRequestButton)

payNowButton.addEventListener('click', async () => {
  invoiceSuccess.hidden = true
  payNowSuccess.hidden = true
  if (!currentProfile) {
    cartDialog.close()
    accountDialog.showModal()
    return
  }

  if (!currentAccountIsActive()) {
    showToast('This account is suspended. Contact support for assistance.')
    return
  }

  if (!policyAcknowledgment.checked) {
    showToast('Please acknowledge the policies first.')
    return
  }

  cartPayPanel.hidden = false
  cartPayPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  await setupCartPayNow()
})

manageAccountButton.addEventListener('click', showAccountManage)
orderActivityButton.addEventListener('click', showOrderActivity)
backFromManageAccount.addEventListener('click', showAccountHub)
backFromOrderActivity.addEventListener('click', showAccountHub)
accountReferralButton.addEventListener('click', () => {
  accountDialog.close()
  void openReferralDashboard()
})

accountManageForm.addEventListener('submit', async event => {
  event.preventDefault()
  accountManageMessage.textContent = ''
  accountManageSubmit.disabled = true
  accountManageSubmit.textContent = 'Saving…'

  try {
    const result = await updateAccountDetails({
      firstName: manageFirstName.value,
      lastName: manageLastName.value,
      phone: managePhone.value,
      email: manageEmail.value,
    })

    await refreshAccount()
    showAccountManage()
    accountManageMessage.textContent = result.emailConfirmationRequired
      ? 'Account updated. Check your email to confirm the new sign-in address.'
      : 'Account updated successfully.'
    showToast('Account updated')
  } catch (error) {
    accountManageMessage.textContent =
      error instanceof Error ? error.message : 'Could not update your account.'
  } finally {
    accountManageSubmit.disabled = false
    accountManageSubmit.textContent = 'Save Account Changes'
  }
})

refreshHistoryButton.addEventListener('click', () => {
  void refreshOrderHistory()
})

requestInvoiceButton.addEventListener('click', async () => {
  cartPayPanel.hidden = true
  cartZellePanel.hidden = true
  payNowSuccess.hidden = true
  invoiceSuccess.hidden = true
  if (!currentProfile) {
    cartDialog.close()
    accountDialog.showModal()
    return
  }

  if (!currentAccountIsActive()) {
    showToast('This account is suspended. Contact support for assistance.')
    return
  }

  if (!policyAcknowledgment.checked) {
    showToast('Please acknowledge the policies first.')
    return
  }

  invoiceRequestMessage.textContent = ''
  requestInvoiceButton.disabled = true
  requestInvoiceButton.textContent = 'Creating Request…'

  try {
    const result = await requestInvoice(cart, {
      policyAcknowledged: true,
      contactMethod: contactMethod.value,
      customerNotes: customerNotes.value.trim(),
      discountCode: appliedDiscount?.code || '',
    })

    clearCart()
    cart = []
    policyAcknowledgment.checked = false
    customerNotes.value = ''
    appliedDiscount = null
    appliedDiscountCartSignature = ''
    discountCodeInput.value = ''
    discountCodeMessage.textContent = ''
    updateCartUI()

    payNowSuccess.hidden = true
    document.querySelector<HTMLElement>('#successInvoiceNumber')!.textContent =
      result.invoiceNumber || 'Pending'
    cartContent.hidden = true
    cartEmpty.hidden = true
    invoiceSuccess.hidden = false
    await refreshOrderHistory()
  } catch (error) {
    invoiceRequestMessage.textContent =
      error instanceof Error ? error.message : 'Invoice request failed.'
    updateRequestButton()
  } finally {
    if (!invoiceSuccess.hidden) return
    requestInvoiceButton.textContent = currentProfile ? 'Request Invoice by Email' : 'Sign In to Request Invoice'
  }
})


createAccountButton.addEventListener('click', () => {
  showSignupView()
})

signupBack.addEventListener('click', () => {
  showLoginView()
})

signupForm.addEventListener('submit', async event => {
  event.preventDefault()
  signupMessage.textContent = ''

  if (signupPassword.value.length < 8) {
    signupMessage.textContent = 'Use at least 8 characters for your password.'
    return
  }

  if (signupPassword.value !== signupPasswordConfirm.value) {
    signupMessage.textContent = 'The passwords do not match.'
    return
  }

  signupSubmit.disabled = true
  signupSubmit.textContent = 'Creating Account…'

  try {
    const result = await signUp({
      firstName: signupFirstName.value,
      lastName: signupLastName.value,
      email: signupEmail.value,
      password: signupPassword.value,
    })

    signupPassword.value = ''
    signupPasswordConfirm.value = ''

    if (result.confirmationRequired) {
      signupMessage.textContent = 'Account created. Check your email to confirm your address, then return to Nexus to sign in.'
      signupSubmit.textContent = 'Confirmation Email Sent'
      return
    }

    await refreshAccount()
    await loadCatalog()
    accountDialog.close()
    showToast('Nexus account created')
  } catch (error) {
    signupMessage.textContent = error instanceof Error ? error.message : 'Could not create your account.'
  } finally {
    if (signupSubmit.textContent !== 'Confirmation Email Sent') {
      signupSubmit.disabled = false
      signupSubmit.textContent = 'Create Account'
    }
  }
})

forgotPasswordButton.addEventListener('click', () => {
  showForgotPasswordView()
})

forgotPasswordBack.addEventListener('click', () => {
  showLoginView()
})

forgotPasswordForm.addEventListener('submit', async event => {
  event.preventDefault()
  forgotPasswordMessage.textContent = ''
  forgotPasswordSubmit.disabled = true
  forgotPasswordSubmit.textContent = 'Sending…'

  try {
    await requestPasswordReset(forgotPasswordEmail.value)
    forgotPasswordMessage.textContent =
      'If that email is connected to a Nexus account, a secure reset link has been sent.'
    forgotPasswordSubmit.textContent = 'Email Sent'
  } catch (error) {
    forgotPasswordMessage.textContent =
      error instanceof Error ? error.message : 'Could not send the reset email.'
    forgotPasswordSubmit.disabled = false
    forgotPasswordSubmit.textContent = 'Send Reset Email'
  }
})

recoveryPasswordForm.addEventListener('submit', async event => {
  event.preventDefault()
  recoveryPasswordMessage.textContent = ''

  if (recoveryPassword.value.length < 8) {
    recoveryPasswordMessage.textContent = 'Use at least 8 characters.'
    return
  }

  if (recoveryPassword.value !== recoveryPasswordConfirm.value) {
    recoveryPasswordMessage.textContent = 'The new passwords do not match.'
    return
  }

  recoveryPasswordSubmit.disabled = true
  recoveryPasswordSubmit.textContent = 'Updating…'

  try {
    const wasInvite = inviteMode
    const choices = readMarketing(recoveryPasswordForm)
    await updatePassword(recoveryPassword.value)

    if (wasInvite) {
      recoveryPasswordMessage.textContent = 'Connecting your customer profile…'
      const claim = await claimExistingProfile()
      if (!claim?.profile) {
        throw new Error('Your password was created, but Nexus could not connect your customer profile. Please contact support.')
      }
    }

    if (choices.email_opt_in || choices.sms_opt_in) await saveMarketing(recoveryPasswordForm, 'nexus', 'activation')
    recoveryPassword.value = ''
    recoveryPasswordConfirm.value = ''
    recoveryMode = false
    inviteMode = false

    const cleanUrl = new URL(window.location.href)
    cleanUrl.searchParams.delete('mode')
    window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search + cleanUrl.hash)

    await refreshAccount()
    showToast(wasInvite ? 'Nexus account activated' : 'Password updated successfully')
    if (accountDialog.open) accountDialog.close()
  } catch (error) {
    recoveryPasswordMessage.textContent =
      error instanceof Error ? error.message : 'Could not update the password.'
  } finally {
    recoveryPasswordSubmit.disabled = false
    recoveryPasswordSubmit.textContent = inviteMode ? 'Activate My Account' : 'Set New Password'
  }
})

changePasswordForm.addEventListener('submit', async event => {
  event.preventDefault()
  changePasswordMessage.textContent = ''

  if (newPassword.value.length < 8) {
    changePasswordMessage.textContent = 'Use at least 8 characters for the new password.'
    return
  }

  if (newPassword.value !== confirmNewPassword.value) {
    changePasswordMessage.textContent = 'The new passwords do not match.'
    return
  }

  if (currentPassword.value === newPassword.value) {
    changePasswordMessage.textContent = 'Choose a new password that is different from your current password.'
    return
  }

  changePasswordSubmit.disabled = true
  changePasswordSubmit.textContent = 'Changing…'

  try {
    await changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    confirmNewPassword.value = ''
    changePasswordMessage.textContent = 'Password changed successfully.'
    showToast('Password changed')
  } catch (error) {
    changePasswordMessage.textContent =
      error instanceof Error ? error.message : 'Could not change the password.'
  } finally {
    changePasswordSubmit.disabled = false
    changePasswordSubmit.textContent = 'Change Password'
  }
})

document.querySelector<HTMLButtonElement>('#logoutButton')!.addEventListener('click', async () => {
  const logoutButton = document.querySelector<HTMLButtonElement>('#logoutButton')!
  logoutButton.disabled = true
  try {
    await disablePush()
    await signOut()
    await refreshAccount()
    await loadCatalog()
    showToast('Signed out')
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Could not sign out')
  } finally {
    logoutButton.disabled = false
  }
})

loginForm.addEventListener('submit', async event => {
  event.preventDefault()
  loginMessage.textContent = ''
  loginSubmit.disabled = true
  loginSubmit.textContent = 'Signing In…'

  try {
    await signIn(loginEmail.value, loginPassword.value)
    loginPassword.value = ''
    await refreshAccount()
    await loadCatalog()
    accountDialog.close()

    if (cart.length) {
      updateCartUI()
      cartDialog.showModal()
    }
  } catch (error) {
    loginMessage.textContent = error instanceof Error ? error.message : 'Sign in failed.'
  } finally {
    loginSubmit.disabled = false
    loginSubmit.textContent = 'Sign In'
  }
})

searchInput.addEventListener('input', () => {
  query = searchInput.value
  renderProducts()
})

onAuthChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    recoveryMode = !inviteMode
    showRecoveryPasswordView()
    return
  }

  if (inviteMode) {
    showRecoveryPasswordView()
    return
  }

  if (!recoveryMode) {
    void refreshAccount()
  }
})

async function loadCatalog() {
  try {
    products = await fetchCatalog()

    const liveProducts = new Map(products.map(product => [product.id, product]))
    let cartChanged = false

    cart = cart.map(item => {
      const product = liveProducts.get(item.id)
      if (!product) return item

      const price = Number(product.price) || 0
      const shippingFrom = product.shipping_from || ''

      if (item.price === price && item.shippingFrom === shippingFrom) return item

      cartChanged = true
      return { ...item, price, shippingFrom }
    })

    if (cartChanged) saveCart(cart)

    renderChips()
    renderProducts()
    updateCartUI()
  } catch (error) {
    console.error(error)
    grid.innerHTML = `
      <div class="state error">
        <strong>Nexus could not reach the catalog.</strong>
        <p>Please refresh and try again.</p>
      </div>
    `
  }
}

updateCartUI()

function enablePwaAutoRefresh() {
  if (!('serviceWorker' in navigator)) return

  const hadControllerAtBoot = Boolean(navigator.serviceWorker.controller)
  let reloadingForUpdate = false
  let lastUpdateCheck = 0

  const checkForUpdate = async () => {
    const now = Date.now()
    if (now - lastUpdateCheck < 15_000) return
    lastUpdateCheck = now

    try {
      const registration = await navigator.serviceWorker.getRegistration()
      await registration?.update()
    } catch (error) {
      console.warn('PWA update check failed', error)
    }
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadControllerAtBoot || reloadingForUpdate) return
    reloadingForUpdate = true
    window.location.reload()
  })

  window.addEventListener('load', () => void checkForUpdate())
  window.addEventListener('pageshow', () => void checkForUpdate())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate()
  })
}

enablePwaAutoRefresh()

void Promise.all([
  loadCatalog(),
  refreshAccount(),
])
