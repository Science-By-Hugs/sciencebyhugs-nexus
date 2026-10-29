const paths = {
  home: '<path d="M3 10l9-7 9 7v11h-6v-7H9v7H3z"/>',
  search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="M16 16l5 5"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  catalog: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  support: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2M12 17h.01"/>',
  cart: '<path d="M3 4h2l2 12h12l2-9H6M8 20h.01M18 20h.01"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  orders: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6M9 9h6M9 13h6M9 17h4"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  referral: '<path d="M8 12l8-5M8 12l8 5"/><circle cx="5" cy="12" r="3"/><circle cx="19" cy="5" r="3"/><circle cx="19" cy="19" r="3"/>',
  logout: '<path d="M9 4H4v16h5M9 12h12M17 8l4 4-4 4"/>',
}
export function icon(name: keyof typeof paths) {
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`
}
