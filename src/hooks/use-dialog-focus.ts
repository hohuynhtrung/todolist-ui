import { useEffect } from 'react'
import type { RefObject } from 'react'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useDialogFocus(
  isOpen: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!isOpen) return

    const dialogElement = dialogRef.current
    if (!dialogElement) return

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const frame = window.requestAnimationFrame(() => {
      const autofocus = dialogElement.querySelector<HTMLElement>(
        '[autofocus], [data-autofocus]',
      )
      const firstFocusable = Array.from(
        dialogElement.querySelectorAll<HTMLElement>(focusableSelector),
      ).find((element) => element.getClientRects().length > 0)
      ;(autofocus ?? firstFocusable ?? dialogElement).focus()
    })

    function handleKeyDown(event: KeyboardEvent) {
      const activeDialog = dialogRef.current
      if (!activeDialog) return

      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') return

      const focusable = Array.from(
        activeDialog.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => element.getClientRects().length > 0)

      if (focusable.length === 0) {
        event.preventDefault()
        activeDialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      const activeIndex = activeElement ? focusable.indexOf(activeElement) : -1

      if (
        activeIndex < 0 ||
        !activeElement ||
        !activeDialog.contains(activeElement)
      ) {
        event.preventDefault()
        ;(event.shiftKey ? last : first)?.focus()
      } else if (event.shiftKey && activeIndex === 0) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && activeIndex === focusable.length - 1) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      window.requestAnimationFrame(() => {
        if (previousFocus?.isConnected) previousFocus.focus()
      })
    }
  }, [dialogRef, isOpen, onClose])
}
