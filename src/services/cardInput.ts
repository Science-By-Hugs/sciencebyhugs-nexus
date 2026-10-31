// Pure card-entry helpers for the in-app card form. Nothing here stores, logs or
// transmits card data; it only validates and formats what the customer types.

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown'

export const digitsOnly = (value: string) => value.replace(/\D+/g, '')

export function cardBrand(number: string): CardBrand {
  const n = digitsOnly(number)
  if (/^4/.test(n)) return 'visa'
  if (/^(5[1-5]|2(2[2-9][1-9]|2[3-9]\d|[3-6]\d\d|7[01]\d|720))/.test(n)) return 'mastercard'
  if (/^3[47]/.test(n)) return 'amex'
  if (/^(6011|65|64[4-9]|622)/.test(n)) return 'discover'
  return 'unknown'
}

export function passesLuhn(number: string): boolean {
  const n = digitsOnly(number)
  if (n.length < 12 || n.length > 19) return false
  let sum = 0
  for (let i = 0; i < n.length; i += 1) {
    let digit = Number(n[n.length - 1 - i])
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

/** "4242424242424242" -> "4242 4242 4242 4242"; Amex groups 4-6-5. */
export function formatCardNumber(value: string): string {
  const n = digitsOnly(value).slice(0, 19)
  const groups = cardBrand(n) === 'amex' ? [4, 6, 5] : [4, 4, 4, 4, 3]
  const parts: string[] = []
  let index = 0
  for (const size of groups) {
    if (index >= n.length) break
    parts.push(n.slice(index, index + size))
    index += size
  }
  return parts.join(' ')
}

/** While typing: "4" -> "04", "12" -> "12", "123" -> "12 / 3", "1228" -> "12 / 28". */
export function formatExpiry(value: string): string {
  let n = digitsOnly(value).slice(0, 4)
  if (n.length === 1 && Number(n) > 1) n = `0${n}`
  return n.length <= 2 ? n : `${n.slice(0, 2)} / ${n.slice(2)}`
}

/** Parses "MM / YY" (or MMYY) into SDK fields; null when invalid or expired. */
export function parseExpiry(value: string, now = new Date()): { month: string; year: string } | null {
  const n = digitsOnly(value)
  if (n.length !== 4) return null
  const month = Number(n.slice(0, 2))
  const year = 2000 + Number(n.slice(2))
  if (month < 1 || month > 12) return null
  const endOfMonth = new Date(year, month, 1) // first day of the following month
  if (endOfMonth <= now) return null
  return { month: String(month).padStart(2, '0'), year: String(year) }
}

export function validSecurityCode(code: string, number: string): boolean {
  const n = digitsOnly(code)
  return cardBrand(number) === 'amex' ? n.length === 4 : n.length === 3
}

export function validPostalCode(value: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(value.trim())
}

export const cardBrandLabel = (brand: string) => {
  const key = brand.toLowerCase()
  return key === 'visa' ? 'Visa'
    : key === 'mastercard' ? 'Mastercard'
    : key === 'amex' ? 'American Express'
    : key === 'discover' ? 'Discover'
    : 'Card'
}
