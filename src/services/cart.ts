import type { CatalogProduct } from './catalog'

export type CartItem = {
  id: string
  product: string
  price: number
  quantity: number
  shippingFrom: string
}

export type CartTotals = {
  subtotal: number
  discount: number
  shippingDiscount: number
  totalSavings: number
  shipping: number
  tax: number
  total: number
}

const STORAGE_KEY = 'sbhNexusCart'

export const SHIPPING_RATES: Record<string, number> = {
  'Shipping - Emlin (L)': 70,
  'Shipping - Emlin (S)': 50,
  'Shipping - Emlin (US)': 20,
  'Shipping - Amazon': 3,
  'Shipping - Ella (US)': 20,
  'Shipping - Ella (CN)': 50,
  'Shipping Gigi': 20,
  'Shipping': 0,
}

export function loadCart(): CartItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCart(cart: CartItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart))
}

export function clearCart() {
  localStorage.removeItem(STORAGE_KEY)
}

export function addProduct(cart: CartItem[], product: CatalogProduct): CartItem[] {
  const next = cart.map(item => ({ ...item }))
  const existing = next.find(item => item.id === product.id)

  if (existing) {
    existing.quantity += 1
  } else {
    next.push({
      id: product.id,
      product: product.name,
      price: Number(product.price) || 0,
      quantity: 1,
      shippingFrom: product.shipping_from || '',
    })
  }

  saveCart(next)
  return next
}

export function changeQuantity(cart: CartItem[], id: string, delta: number): CartItem[] {
  const next = cart
    .map(item => item.id === id ? { ...item, quantity: item.quantity + delta } : { ...item })
    .filter(item => item.quantity > 0)

  saveCart(next)
  return next
}

export type AppliedDiscount = {
  kind: 'free_shipping' | 'referral_bonus' | 'new_customer' | 'group_buy' | 'custom'
  discountPercent?: number | null
  shippingDiscount?: number | null
}

export function calculateCart(cart: CartItem[], foundingMember: boolean, appliedDiscount?: AppliedDiscount | null): CartTotals {
  const subtotal = cart.reduce(
    (total, item) => total + Number(item.price || 0) * Number(item.quantity || 0),
    0,
  )

  const shippingSources = new Set(
    cart.map(item => item.shippingFrom?.trim()).filter(Boolean),
  )

  let shipping = 0

  shippingSources.forEach(source => {
    if (foundingMember && source.toLowerCase() === 'shipping gigi') return
    shipping += SHIPPING_RATES[source] || 0
  })

  // Match the server (evaluate_discount_code): a code with a shipping amount discounts
  // shipping; otherwise it is a percent off merchandise. Covers custom codes too.
  const isShippingDiscount = Boolean(appliedDiscount) &&
    (appliedDiscount!.kind === 'free_shipping' || appliedDiscount!.discountPercent == null)
  const percent = Number(appliedDiscount?.discountPercent || 0)
  const discount = appliedDiscount && !isShippingDiscount
    ? Math.round((subtotal * percent / 100) * 100) / 100
    : 0
  const shippingDiscount = isShippingDiscount
    ? Math.min(shipping, Number(appliedDiscount!.shippingDiscount || 0))
    : 0
  shipping = Math.max(0, shipping - shippingDiscount)

  const taxableMerchandise = Math.max(0, subtotal - discount)
  const tax = taxableMerchandise * 0.08
  const total = subtotal - discount + shipping + tax

  return {
    subtotal,
    discount,
    shippingDiscount,
    totalSavings: Math.round((discount + shippingDiscount) * 100) / 100,
    shipping,
    tax,
    total,
  }
}

export function cartQuantity(cart: CartItem[]) {
  return cart.reduce((total, item) => total + item.quantity, 0)
}
