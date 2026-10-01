import type { SVGProps } from 'react'
import type { Category } from '../core/types'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Base({ size = 20, children, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  )
}

export const IconProjects = (p: P) => (
  <Base {...p}>
    <rect x="3.5" y="4.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="4.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="14.5" width="7" height="5" rx="2" />
    <rect x="13.5" y="14.5" width="7" height="5" rx="2" />
  </Base>
)

export const IconPlus = (p: P) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
)

export const IconSearch = (p: P) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </Base>
)

export const IconArrow = (p: P) => (
  <Base {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Base>
)

export const IconBack = (p: P) => (
  <Base {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Base>
)

export const IconCheck = (p: P) => (
  <Base {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Base>
)

export const IconLock = (p: P) => (
  <Base {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Base>
)

export const IconDownload = (p: P) => (
  <Base {...p}>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />
  </Base>
)

export const IconUpload = (p: P) => (
  <Base {...p}>
    <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" />
    <path d="M4 14v3.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V14" />
  </Base>
)

export const IconWallet = (p: P) => (
  <Base {...p}>
    <rect x="3.5" y="6" width="17" height="13" rx="3" />
    <path d="M3.5 10h17M16 14.5h1" />
  </Base>
)

export const IconInfo = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </Base>
)

export const IconHelp = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.1-2.4 3.6M12 17h.01" />
  </Base>
)

export const IconLink = (p: P) => (
  <Base {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Base>
)

/** Icon per file category */
export function IconKind({ category, ...p }: P & { category: Category }) {
  switch (category) {
    case 'image':
      return (
        <Base {...p}>
          <rect x="3.5" y="5" width="17" height="14" rx="3" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="M20.5 16l-5-5-8 8" />
        </Base>
      )
    case 'audio':
      return (
        <Base {...p}>
          <path d="M4 12h1.5M7.5 8v8M11 5v14M14.5 9v6M18 7v10M20.5 12H20" />
        </Base>
      )
    case 'video':
      return (
        <Base {...p}>
          <rect x="3.5" y="6" width="12.5" height="12" rx="3" />
          <path d="M16 10.5l4.5-2.5v8L16 13.5" />
        </Base>
      )
    case 'daw':
      return (
        <Base {...p}>
          <path d="M5 5v14M10 5v14M15 5v14M20 5v14" opacity=".35" />
          <rect x="4" y="8" width="7" height="3" rx="1.2" />
          <rect x="9" y="13" width="9" height="3" rx="1.2" />
        </Base>
      )
    case 'archive':
      return (
        <Base {...p}>
          <rect x="4" y="4.5" width="16" height="15" rx="3" />
          <path d="M12 4.5v3M12 9.5v1M12 12.5v1" />
          <rect x="10.5" y="14.5" width="3" height="3" rx="1" />
        </Base>
      )
    case 'code':
      return (
        <Base {...p}>
          <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
        </Base>
      )
    case 'spreadsheet':
      return (
        <Base {...p}>
          <rect x="4" y="5" width="16" height="14" rx="3" />
          <path d="M4 10h16M4 14.5h16M10 5v14" />
        </Base>
      )
    default:
      return (
        <Base {...p}>
          <path d="M7 3.5h6.5L18 8v10.5A2 2 0 0 1 16 20.5H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z" />
          <path d="M13.5 3.5V8H18M8.5 12.5h6M8.5 16h4" />
        </Base>
      )
  }
}

export const IconClose = (p: P) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Base>
)

export const IconCopy = (p: P) => (
  <Base {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
    <path d="M15.5 8.5V6.5A2 2 0 0 0 13.5 4.5h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
  </Base>
)

export const IconUsers = (p: P) => (
  <Base {...p}>
    <circle cx="9" cy="9" r="3.2" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <circle cx="16.5" cy="9.5" r="2.6" />
    <path d="M15.5 14.2a4.6 4.6 0 0 1 5 4.8" />
  </Base>
)

export const IconChevron = ({ open, ...p }: P & { open?: boolean }) => (
  <svg width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transition: 'transform 0.25s ease', transform: open ? 'rotate(180deg)' : undefined }}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)

export const IconMore = (p: P) => (
  <svg width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
)

export const IconCoins = (p: P) => (
  <svg width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <ellipse cx="12" cy="7" rx="7" ry="3" />
    <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" />
    <path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
  </svg>
)

export const IconGit = (p: P) => (
  <Base {...p}>
    <circle cx="6" cy="6" r="2.4" />
    <circle cx="6" cy="18" r="2.4" />
    <circle cx="18" cy="9" r="2.4" />
    <path d="M6 8.4v7.2" />
    <path d="M18 11.4c0 3.4-4 3.6-10.2 5.4" />
  </Base>
)
