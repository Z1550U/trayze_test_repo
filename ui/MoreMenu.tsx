import { useEffect, useRef, useState } from 'react'
import { IconMore } from './icons'

export interface MenuItem {
  label: string
  onClick: () => void
}

/** "⋯" button with a small menu for the rarer actions of a view. */
export function MoreMenu({ items, label = 'More actions' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" aria-label={label} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <IconMore size={18} />
      </button>
      {open && (
        <div className="menu fade-in" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setOpen(false)
                it.onClick()
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
