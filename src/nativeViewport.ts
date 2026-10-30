import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

// Native-only viewport bridge for the installed iOS app.
// - Safe-area insets come from UIKit (NexusSafeArea plugin) because CSS env()
//   can read 0 on a cold WKWebView launch with contentInset = never.
// - The visible height follows window.visualViewport so full-screen sheets
//   shrink above the keyboard instead of hiding the focused field.
// The website/PWA never calls installNativeViewport and keeps CSS env() values.

export type SafeAreaInsets = { top: number; right: number; bottom: number; left: number }

interface NexusSafeAreaPlugin {
  get(): Promise<SafeAreaInsets>
  addListener(eventName: 'change', listener: (insets: SafeAreaInsets) => void): Promise<PluginListenerHandle>
}

type StyleTarget = { style: { setProperty(name: string, value: string): void } }

const EDITABLE = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]),textarea,select,[contenteditable="true"]'
const SIDES = ['top', 'right', 'bottom', 'left'] as const

const cleanInset = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : Number.NaN
  // Real iPhone/iPad insets are 0–~70pt. Reject anything implausible rather than
  // pushing the header off screen.
  if (!Number.isFinite(number) || number < 0 || number > 200) return null
  return Math.round(number)
}

/** Writes --native-safe-{side} for each valid side; invalid sides keep the CSS env() fallback. */
export function applySafeAreaInsets(target: StyleTarget, insets: Partial<Record<(typeof SIDES)[number], unknown>> | null | undefined): boolean {
  if (!insets) return false
  let applied = false
  for (const side of SIDES) {
    const value = cleanInset(insets[side])
    if (value === null) continue
    target.style.setProperty(`--native-safe-${side}`, `${value}px`)
    applied = true
  }
  return applied
}

/** Mirrors the visual viewport so fixed sheets fit above the iOS keyboard. */
export function applyVisibleViewport(
  target: StyleTarget,
  viewport: { height: number; offsetTop: number } | null | undefined,
  fallbackHeight: number,
): void {
  const height = viewport && Number.isFinite(viewport.height) && viewport.height > 0 ? viewport.height : fallbackHeight
  const top = viewport && Number.isFinite(viewport.offsetTop) && viewport.offsetTop > 0 ? viewport.offsetTop : 0
  target.style.setProperty('--visible-height', `${Math.round(height)}px`)
  target.style.setProperty('--visible-top', `${Math.round(top)}px`)
}

export const isEditingControl = (element: Element | null | undefined): boolean =>
  Boolean(element && typeof element.matches === 'function' && element.matches(EDITABLE))

let installed = false

export function installNativeViewport(): void {
  if (installed) return
  installed = true
  const root = document.documentElement
  const body = document.body

  // 1. Safe-area insets from UIKit, kept current on rotation / split view.
  const safeArea = registerPlugin<NexusSafeAreaPlugin>('NexusSafeArea')
  safeArea.get().then(insets => applySafeAreaInsets(root, insets)).catch(() => {
    // Older native shell without the plugin: CSS env() fallback stays in effect.
  })
  safeArea.addListener('change', insets => { applySafeAreaInsets(root, insets) }).catch(() => undefined)

  // 2. Visible viewport (keyboard-aware).
  const viewport = window.visualViewport
  let frame = 0
  const syncViewport = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => applyVisibleViewport(root, viewport, window.innerHeight))
  }
  applyVisibleViewport(root, viewport, window.innerHeight)
  viewport?.addEventListener('resize', syncViewport)
  viewport?.addEventListener('scroll', syncViewport)
  window.addEventListener('orientationchange', syncViewport)
  window.addEventListener('resize', syncViewport)

  // 3. Keyboard state: hide the tab bar while editing and keep the active field visible.
  let revealTimer = 0
  const syncEditing = () => {
    const editing = isEditingControl(document.activeElement)
    body.classList.toggle('keyboard-open', editing)
    if (!editing) syncViewport()
  }
  document.addEventListener('focusin', event => {
    syncEditing()
    const field = event.target
    if (!(field instanceof HTMLElement) || !isEditingControl(field)) return
    window.clearTimeout(revealTimer)
    // Wait for the keyboard animation (~250ms) before measuring.
    revealTimer = window.setTimeout(() => {
      if (document.activeElement === field) field.scrollIntoView({ block: 'center', inline: 'nearest' })
    }, 320)
  })
  document.addEventListener('focusout', () => requestAnimationFrame(syncEditing))
}
