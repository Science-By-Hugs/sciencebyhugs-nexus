export function bindPasswordVisibility(root: ParentNode = document) {
  root.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input => {
    if (input.dataset.visibilityBound) return
    input.dataset.visibilityBound = 'true'
    input.setAttribute('aria-label', input.closest('label')?.firstChild?.textContent?.trim() || 'Password')
    const wrapper = document.createElement('div')
    wrapper.className = 'password-field'
    input.replaceWith(wrapper)
    wrapper.append(input)
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'Show'
    button.className = 'password-visibility'
    button.setAttribute('aria-controls', input.id)
    button.setAttribute('aria-label', 'Show password')
    button.setAttribute('aria-pressed', 'false')
    button.onclick = () => {
      const visible = input.type === 'password'
      input.type = visible ? 'text' : 'password'
      button.textContent = visible ? 'Hide' : 'Show'
      button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password')
      button.setAttribute('aria-pressed', String(visible))
    }
    wrapper.append(button)
  })
}
