/** Keep the active field visible without replacing or dismissing its sheet. */
export function bindVisibleViewport() {
  const update = () => {
    const height = window.visualViewport?.height || window.innerHeight
    document.documentElement.style.setProperty('--visible-height', `${height}px`)
    const keyboardOpen = window.innerHeight - height > 140
    document.body.classList.toggle('keyboard-open', keyboardOpen)
    if (keyboardOpen && document.activeElement?.matches('input,textarea,select')) {
      requestAnimationFrame(() => document.activeElement?.scrollIntoView({ block: 'nearest', behavior: 'instant' }))
    }
  }
  window.visualViewport?.addEventListener('resize', update)
  window.visualViewport?.addEventListener('scroll', update)
  window.addEventListener('resize', update)
  update()
}
