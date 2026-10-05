"use client"

import * as React from "react"

// Slice 6x: Radix dialogs return focus on close only to their own Trigger. Saha opens most dialogs and the phone
// navigation sheet from ordinary buttons with controlled state, so focus fell to <body> after Escape or Close.
// This remembers the element that had focus when the dialog opened and returns focus to it on close, unless the
// caller handled focus itself or the opener is no longer in the document.
export function useReturnFocus(
  onOpenAutoFocus?: (event: Event) => void,
  onCloseAutoFocus?: (event: Event) => void
) {
  const opener = React.useRef<HTMLElement | null>(null)
  return {
    onOpenAutoFocus: (event: Event) => {
      const active = document.activeElement
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null
      onOpenAutoFocus?.(event)
    },
    onCloseAutoFocus: (event: Event) => {
      onCloseAutoFocus?.(event)
      const target = opener.current
      opener.current = null
      if (event.defaultPrevented || !target || !target.isConnected) return
      event.preventDefault()
      target.focus()
    },
  }
}
