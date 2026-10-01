import type { Page } from '../core/search'
import { IconArrow, IconBack, IconClose, IconSearch } from './icons'

export function SearchField({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  return (
    <label className="search">
      <IconSearch size={18} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        spellCheck={false}
      />
      {value && (
        <button type="button" className="search-clear" onClick={() => onChange('')} aria-label="Clear search">
          <IconClose size={16} />
        </button>
      )}
    </label>
  )
}

/** Marks the query words inside a text (case-insensitive). */
export function Highlight({ text, query }: { text: string; query: string }) {
  const words = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (words.length === 0) return <>{text}</>
  const parts = text.split(new RegExp(`(${words.join('|')})`, 'gi'))
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part))}
    </>
  )
}

/** Quiet pager: ‹  21–40 of 143  › – hidden when everything fits on one page. */
export function Pager<T>({ page, onChange, label = 'entries' }: { page: Page<T>; onChange: (p: number) => void; label?: string }) {
  if (page.pages <= 1) return null
  return (
    <nav className="pager" aria-label={`Pages of ${label}`}>
      <button className="icon-btn" onClick={() => onChange(page.page - 1)} disabled={page.page === 0} aria-label="Previous page">
        <IconBack size={16} />
      </button>
      <span className="muted small">
        <span style={{ color: 'var(--ink)' }}>
          {page.from}–{page.to}
        </span>{' '}
        of {page.total}
      </span>
      <button className="icon-btn" onClick={() => onChange(page.page + 1)} disabled={page.page >= page.pages - 1} aria-label="Next page">
        <IconArrow size={16} />
      </button>
    </nav>
  )
}
