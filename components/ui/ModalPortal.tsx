'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalPortalProps {
  children: ReactNode
  containerId?: string
}

export default function ModalPortal({
  children,
  containerId = 'promobi-modal-root',
}: ModalPortalProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (typeof document === 'undefined') return

    let created = false
    let root = document.getElementById(containerId)
    if (!root) {
      root = document.createElement('div')
      root.id = containerId
      document.body.appendChild(root)
      created = true
    }

    setContainer(root)

    return () => {
      if (created && root && root.childElementCount === 0) {
        root.remove()
      }
    }
  }, [containerId])

  if (!container) return null
  return createPortal(children, container)
}

