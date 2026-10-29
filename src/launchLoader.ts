import './launchLoader.css'

/**
 * "Opening Nexus" launch loader.
 *
 * A vial drops in and settles upright, one soft highlight crosses the glass,
 * the n. symbol and caption fade in, then the overlay fades away over the app
 * that has been rendering underneath the whole time. It never waits on data,
 * offers Skip from the first frame, and collapses to a short still frame when
 * the person prefers reduced motion.
 */
const VISIBLE_MS = 1650
const FADE_MS = 300
const REDUCED_VISIBLE_MS = 600

const vialSvg = `
<svg class="launch-loader-vial" width="94" height="198" viewBox="0 0 100 210" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="launchCap" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#7E8689"/><stop offset="0.3" stop-color="#D5D9DA"/>
      <stop offset="0.55" stop-color="#A8B0B2"/><stop offset="1" stop-color="#6E7679"/>
    </linearGradient>
    <linearGradient id="launchSheen" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#F0F1EF" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#F0F1EF" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#F0F1EF" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="launchBody"><path d="M31 26V33C31 41 7 44 7 62V190C7 202 15 208 27 208H73C85 208 93 202 93 190V62C93 44 69 41 69 33V26Z"/></clipPath>
  </defs>
  <path d="M31 26V33C31 41 7 44 7 62V190C7 202 15 208 27 208H73C85 208 93 202 93 190V62C93 44 69 41 69 33V26Z" fill="#F0F1EF" fill-opacity="0.05" stroke="#F0F1EF" stroke-opacity="0.42" stroke-width="1.5"/>
  <path d="M12 70C12 60 20 54 30 50" stroke="#F0F1EF" stroke-opacity="0.22" stroke-width="1.2" fill="none"/>
  <path d="M13.5 72V188" stroke="#F0F1EF" stroke-opacity="0.26" stroke-width="3" stroke-linecap="round"/>
  <path d="M86.5 76V186" stroke="#F0F1EF" stroke-opacity="0.12" stroke-width="2" stroke-linecap="round"/>
  <ellipse cx="50" cy="199" rx="37" ry="4.5" fill="none" stroke="#F0F1EF" stroke-opacity="0.22"/>
  <g clip-path="url(#launchBody)"><g class="launch-loader-sheen"><rect x="-10" y="20" width="44" height="200" fill="url(#launchSheen)" transform="skewX(-12)"/></g></g>
  <rect x="26" y="2" width="48" height="20" rx="4" fill="url(#launchCap)"/>
  <rect x="26" y="18" width="48" height="8" rx="1.5" fill="url(#launchCap)" opacity="0.85"/>
  <path d="M28 19H72" stroke="#171A1C" stroke-opacity="0.35"/>
</svg>`

const symbolSvg = `
<svg class="launch-loader-symbol" width="40" height="40" viewBox="0 0 256 256" aria-hidden="true" focusable="false">
  <rect width="256" height="256" fill="#A8B0B2"/>
  <g fill="#171A1C"><path d="M64 177V83h19v12c7-9 17-14 30-14 25 0 39 16 39 42v54h-20v-52c0-17-8-26-22-26-16 0-26 11-26 29v49z"/><circle cx="183" cy="167" r="10"/></g>
</svg>`

function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

export function showLaunchLoader(root: HTMLElement = document.body) {
  if (document.getElementById('launchLoader')) return
  const reduced = prefersReducedMotion()
  const overlay = document.createElement('div')
  overlay.id = 'launchLoader'
  overlay.className = 'launch-loader'
  overlay.setAttribute('role', 'status')
  overlay.setAttribute('aria-label', 'Opening Nexus')
  overlay.innerHTML = `
    <div class="launch-loader-stage">${vialSvg}</div>
    <div class="launch-loader-mark">${symbolSvg}<span>Opening Nexus</span></div>
    <button type="button" class="launch-loader-skip">Skip</button>`

  let closed = false
  const timers: number[] = []
  const finish = () => {
    if (closed) return
    closed = true
    timers.forEach(window.clearTimeout)
    overlay.classList.add('is-leaving')
    window.setTimeout(() => overlay.remove(), reduced ? 0 : FADE_MS)
  }

  overlay.querySelector('.launch-loader-skip')!.addEventListener('click', finish)
  timers.push(window.setTimeout(finish, reduced ? REDUCED_VISIBLE_MS : VISIBLE_MS))
  root.appendChild(overlay)
  return finish
}
