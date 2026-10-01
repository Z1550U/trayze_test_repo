import { useRef, useState, type ReactNode } from 'react'
import type { Category } from '../core/types'
import { formatSize, shortHash } from '../core/format'
import { COLOR, LEGEND } from './colors'
import { HashGlyph } from './HashGlyph'
import { IconCheck, IconKind, IconUpload } from './icons'

export interface StackSheet {
  key: string
  name: string
  category?: Category
  kindLabel?: string
  size?: number
}

interface Props {
  /** Files in the stack, index 0 is on top. Empty → drop mode. */
  sheets: StackSheet[]
  progress?: number
  hash?: string
  /** Anchored / found: the fan closes and the top sheet gets a seal */
  sealed?: boolean
  /** Not found: the top sheet is shown dashed */
  unmatched?: boolean
  onFiles?: (files: FileList) => void
  multiple?: boolean
  dropTitle?: string
  dropHint?: string
  corner?: ReactNode
}

const FAN = [
  { r: 0, x: 0, y: 0 },
  { r: -7, x: -5, y: 1 },
  { r: 6.5, x: 5, y: 1.5 },
  { r: -13, x: -9, y: 3 },
  { r: 12, x: 9, y: 3.5 }
]
const CLOSED = [
  { r: 0, x: 0, y: 0 },
  { r: -1.6, x: -0.6, y: 1.1 },
  { r: 1.3, x: 0.6, y: 2 },
  { r: -2.4, x: -1, y: 2.9 },
  { r: 2.1, x: 1, y: 3.8 }
]

function transform(depth: number, open: number, closed: boolean) {
  const f = (closed ? CLOSED : FAN)[depth]
  const k = closed ? 1 : open
  return `translate(${f.x * k}%, ${f.y}%) rotate(${f.r * k}deg)`
}

export function DocumentStack({ sheets, progress, hash, sealed, unmatched, onFiles, multiple = true, dropTitle = 'Drop files here', dropHint = 'or click to choose', corner }: Props) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const dropMode = sheets.length === 0
  const depthCount = Math.min(5, Math.max(4, sheets.length))
  const openness = over ? 1.45 : 1
  const top = sheets[0]
  const active = top?.category

  const pick = () => input.current?.click()

  return (
    <div>
      <div
        className={`stack${over ? ' over' : ''}`}
        onDragOver={(e) => {
          if (!onFiles) return
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false)
        }}
        onDrop={(e) => {
          if (!onFiles) return
          e.preventDefault()
          setOver(false)
          if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files)
        }}
      >
        {Array.from({ length: depthCount }, (_, i) => depthCount - 1 - i).map((depth) => {
          const sheet = sheets[depth]
          const isTop = depth === 0
          const style = { transform: transform(depth, openness, !!sealed), zIndex: 10 - depth }

          if (isTop && dropMode) {
            return (
              <div
                key="drop"
                className="sheet top sheet-drop"
                style={style}
                role="button"
                tabIndex={0}
                aria-label={`${dropTitle} – ${dropHint}`}
                onClick={pick}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick())}
              >
                <span className="dashed" />
                <span className="drop-ring">
                  <IconUpload size={28} />
                </span>
                <span style={{ fontSize: 17, fontWeight: 480 }}>{dropTitle}</span>
                <span className="muted small">{dropHint}</span>
              </div>
            )
          }

          if (isTop && top) {
            return (
              <div key={top.key} className="sheet top fade-in" style={{ ...style, borderStyle: unmatched ? 'dashed' : undefined, borderColor: unmatched ? 'rgba(20,22,24,.25)' : undefined }}>
                <div className="sheet-head">
                  <span className="tile">
                    <IconKind category={top.category ?? 'other'} size={20} />
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span className="small" style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--muted)' }}>
                      {top.category && <span className="dot" style={{ background: COLOR[top.category] }} />}
                      {top.kindLabel ?? 'Reading…'}
                    </span>
                    {top.size !== undefined && <span className="small muted">{formatSize(top.size)}</span>}
                  </span>
                </div>
                <span className="sheet-name">{top.name}</span>
                <div className="lines" aria-hidden="true">
                  <span style={{ width: '88%' }} />
                  <span style={{ width: '72%' }} />
                  <span style={{ width: '80%' }} />
                  <span style={{ width: '64%', marginTop: 10 }} />
                  <span style={{ width: '76%' }} />
                </div>
                <div className="sheet-foot">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className="small muted">{hash ? 'Fingerprint' : 'Reading'}</span>
                    <span className="mono" style={{ fontSize: 12 }}>
                      {hash ? shortHash(hash, 6, 6) : `${Math.round((progress ?? 0) * 100)} %`}
                    </span>
                  </div>
                  <HashGlyph hash={hash} progress={progress} size={78} color="var(--ink)" label={hash ? 'Visual fingerprint of the file' : undefined} />
                </div>
                {!hash && progress !== undefined && (
                  <span className="progress-line" aria-hidden="true">
                    <span style={{ width: `${Math.round(progress * 100)}%` }} />
                  </span>
                )}
                {sealed && (
                  <span className="seal" aria-label="Anchored">
                    <IconCheck size={22} />
                  </span>
                )}
                {corner}
              </div>
            )
          }

          return (
            <div key={`back-${depth}-${sheet?.key ?? 'blank'}`} className="sheet back" style={style} aria-hidden="true">
              {sheet ? (
                <span className="back-label">
                  {sheet.category && <span className="dot" style={{ background: COLOR[sheet.category] }} />}
                  {sheet.name}
                </span>
              ) : null}
              <div className="lines" style={{ opacity: 0.7 }}>
                <span style={{ width: '60%' }} />
                <span style={{ width: '82%' }} />
                <span style={{ width: '70%' }} />
              </div>
            </div>
          )
        })}
        {onFiles && (
          <input
            ref={input}
            type="file"
            multiple={multiple}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              if (e.target.files?.length) onFiles(e.target.files)
              e.target.value = ''
            }}
          />
        )}
      </div>
      <div className="legend" aria-hidden="true">
        {LEGEND.map((l) => (
          <span key={l.label} className={active && l.categories.includes(active) ? 'active' : undefined}>
            <span className="dot" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  )
}
