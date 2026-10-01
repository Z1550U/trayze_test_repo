/**
 * The fingerprint made visible: 64 hex characters → an 8×8 field of dots.
 * Each character sets size and strength of one dot, so every file gets
 * its own recognisable pattern. While hashing, the field fills up with progress.
 */
interface Props {
  hash?: string
  progress?: number
  size?: number
  color?: string
  label?: string
}

export function HashGlyph({ hash, progress, size = 96, color = 'currentColor', label }: Props) {
  const cells = Array.from({ length: 64 }, (_, i) => i)
  const step = 100 / 8
  const valid = !!hash && /^[0-9a-f]{64}$/i.test(hash)
  const filled = progress !== undefined ? Math.round(progress * 64) : 0
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {cells.map((i) => {
        const cx = (i % 8) * step + step / 2
        const cy = Math.floor(i / 8) * step + step / 2
        let r: number
        let opacity: number
        if (valid) {
          const v = parseInt(hash![i], 16) / 15
          r = (step / 2) * (0.28 + 0.62 * v)
          opacity = 0.14 + 0.86 * v
        } else if (i < filled) {
          r = step * 0.22
          opacity = 0.55
        } else {
          r = step * 0.14
          opacity = 0.14
        }
        return <circle key={i} cx={cx} cy={cy} r={r} fill={color} opacity={opacity} style={{ transition: 'r .5s ease, opacity .5s ease' }} />
      })}
    </svg>
  )
}
