/** Keep exactly one sheet in the top layer so closing it always returns to the app. */
export function openDialog(target: HTMLDialogElement) {
  const locked = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).find(dialog => dialog.dataset?.lockGuard === 'true')
  if (locked && locked !== target) return
  for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) {
    if (dialog !== target) dialog.close()
  }
  if (!target.open) target.showModal()
  target.scrollTop = 0
  target.querySelector<HTMLButtonElement>('[data-sheet-close], .dialog-close, .referral-close-button')?.focus({ preventScroll: true })
}

export function bindSheetHeaders(root: ParentNode = document) {
  for (const dialog of root.querySelectorAll<HTMLDialogElement>('dialog')) {
    const close = dialog.querySelector<HTMLButtonElement>('.dialog-close')
    if (!close || close.closest('.sheet-topbar')) continue
    const header = document.createElement('div')
    header.className = 'sheet-topbar'
    const label = document.createElement('strong')
    label.textContent = ({menuDialog:'Menu',accountDialog:'Account',cartDialog:'Cart',productDialog:'Product'} as Record<string,string>)[dialog.id] || 'Nexus'
    close.dataset.sheetClose = 'true'
    close.setAttribute('aria-label', 'Close')
    if (dialog.id === 'accountDialog') {
      const wordmark = document.createElement('span')
      wordmark.className = 'auth-sheet-wordmark minimal-wordmark'
      wordmark.setAttribute('aria-label', 'Nexus')
      wordmark.textContent = 'NEXUS'
      header.append(wordmark)
    }
    header.append(label, close)
    dialog.prepend(header)
  }
}
