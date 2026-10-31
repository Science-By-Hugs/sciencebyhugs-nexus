/** Product artwork is composed locally; no image service or catalog writes are needed. */
export type ImageProduct = {
  id?: string
  name: string
  image_url?: string | null
  product_type?: string | null
  product_categories?: { name: string } | null
}

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!))

export function productLabel(product: ImageProduct) {
  const original = product.name.trim().replace(/\s+/g, ' ') || 'RESEARCH PRODUCT'
  // Only extract an unambiguous trailing strength/volume. Never invent a value or
  // mistake compound identifiers (BPC-157, IGF-1 LR3) or pack counts for strength.
  const match = original.match(/\s*[-–—(]?\s*(\d+(?:\.\d+)?\s*(?:mcg|µg|μg|mg|g|ml)(?:\s*\/\s*(?:\d+(?:\.\d+)?\s*)?ml)?)\s*\)?\s*$/i)
  const multipleStrengths = (original.match(/\d+(?:\.\d+)?\s*(?:mcg|µg|μg|mg|g|ml)\b/gi) || []).length > 1
  const strength = match && !multipleStrengths
    ? match[1].replace(/\s*\/\s*/g, '/').replace(/(\d)\s*(mcg|µg|μg|mg|g|ml)/gi, '$1 $2').toLowerCase()
    : ''
  const name = (strength ? original.slice(0, match!.index).replace(/[\s(–—-]+$/, '') : original) || 'RESEARCH PRODUCT'
  const context = `${product.product_type || ''} ${product.product_categories?.name || ''}`
  const liquid = /\b(?:water|solution|liquid|oil|test-c|test-e|testosterone)\b|\/(?:\s*\d+(?:\.\d+)?\s*)?ml\b/i.test(`${original} ${context}`)
  const supply = !liquid && /\b(?:suppl(?:y|ies)|needle|syringe|swab|wipe|sharps|bandage|glove|accessor(?:y|ies))\b/i.test(`${original} ${context}`)
  return {
    name: name.toUpperCase(), strength, kind: supply ? 'supply' : liquid ? 'liquid' : 'powder',
    descriptor: supply ? 'RESEARCH SUPPLIES' : liquid ? 'RESEARCH SOLUTION'
      : /lyophilized|peptide/i.test(context) ? 'Lyophilized Peptide' : 'Research Material',
  }
}

/** Known legacy placeholders should not prevent a personalized default. */
export function hasCustomProductImage(url?: string | null) {
  return Boolean(url?.trim() && !/(?:^|\/)default-product-vial(?:-photo|-slate)?\.(?:svg|webp|png)(?:[?#]|$)/i.test(url.trim()))
}

function nameLines(name: string): string[] {
  if (name.length <= 16) return [name]
  const words = name.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (line && `${line} ${word}`.length > 21) { lines.push(line); line = word }
    else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  // Keep the entire name for unusually long blends; fit each line to the label.
  return lines.length <= 3 ? lines : [lines[0], lines[1], lines.slice(2).join(' ')]
}

function textLine(value: string, y: number, size: number, weight = 700, width = 420) {
  // Conservative size also works in renderers that ignore SVG textLength.
  const fittedSize = Math.min(size, width / Math.max(1, value.length * 0.68))
  return `<text x="627" y="${y}" text-anchor="middle" font-size="${fittedSize.toFixed(2)}" font-weight="${weight}">${escape(value)}</text>`
}

export function productImageMarkup(product: ImageProduct, baseUrl: string, className = '', lazy = true): string {
  if (hasCustomProductImage(product.image_url)) {
    return `<img class="${escape(className)}" data-catalog-photo="${escape(product.id || '')}" src="${escape(product.image_url!.trim())}" alt="${escape(product.name)}"${lazy ? ' loading="lazy"' : ''} decoding="async" />`
  }
  const label = productLabel(product)
  const lines = nameLines(label.name)
  const name = lines.map((line, i) => textLine(line, lines.length === 1 ? 663 : lines.length === 2 ? 620 + i * 61 : 594 + i * 48, lines.length === 1 ? 79 : lines.length === 2 ? 55 : 44)).join('')
  const strength = label.strength
    ? `<rect x="474" y="700" width="306" height="78" fill="#121516"/>${textLine(label.strength, 756, 48, 700, 274).replace('<text ', '<text fill="#fff" ')}`
    : ''
  const photo = label.kind === 'supply'
    ? `<rect width="1254" height="1254" fill="#202529"/><rect x="350" y="300" width="554" height="715" rx="30" fill="#e8e8e5"/><path d="M350 425h554M627 300v125" stroke="#b8bec0" stroke-width="6"/>`
    : `<image href="${escape(baseUrl)}products/vial-${label.kind}.webp" width="1254" height="1254"/>`
  return `<svg class="personalized-product-image ${escape(className)}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254" role="img" aria-label="${escape(product.name)} — illustrated product image" focusable="false">
    ${photo}
    <g font-family="Arial, Helvetica, sans-serif" fill="#111516">
      <rect x="397" y="486" width="460" height="429" rx="20" fill="none" stroke="#171b1d" stroke-width="3"/>
      <path d="M411 530h88M755 530h88M411 850h432" stroke="#688da1" stroke-width="5"/>
      ${textLine('SCIENCE BY HUGS', 542, 29, 600, 239)}
      ${name}${strength}
      ${textLine(label.descriptor, label.strength ? 826 : 805, 31, 500)}
      ${textLine(label.kind === 'supply' ? 'SCIENCE BY HUGS' : 'FOR RESEARCH USE ONLY', 891, 25, 500)}
    </g>
  </svg>`
}
