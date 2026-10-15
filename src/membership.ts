export function membershipBenefitLabel(benefit: string) {
  return /^free gigi shipping$/i.test(benefit.trim()) ? 'Free Shipping' : benefit.trim()
}
export function membershipBenefits(benefits: string[]) {
  return [...new Set(benefits.map(membershipBenefitLabel).filter(Boolean))]
}
