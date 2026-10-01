import type { Category } from '../core/types'

export const COLOR: Record<Category, string> = {
  image: 'var(--sage)',
  audio: 'var(--lavender)',
  video: 'var(--rose)',
  pdf: 'var(--taupe)',
  document: 'var(--taupe)',
  spreadsheet: 'var(--taupe)',
  presentation: 'var(--taupe)',
  text: 'var(--taupe)',
  code: 'var(--mist)',
  archive: 'var(--sand)',
  daw: 'var(--lavender)',
  other: 'var(--sand)'
}

/** The four groups shown in the legend below the stack */
export const LEGEND: { label: string; color: string; categories: Category[] }[] = [
  { label: 'Image', color: 'var(--sage)', categories: ['image'] },
  { label: 'Audio', color: 'var(--lavender)', categories: ['audio', 'daw'] },
  { label: 'Video', color: 'var(--rose)', categories: ['video'] },
  { label: 'Document', color: 'var(--taupe)', categories: ['pdf', 'document', 'spreadsheet', 'presentation', 'text', 'code', 'archive', 'other'] }
]

/** Colours for the parties of a split sheet, in order. */
export const PARTY_COLORS = ['var(--ink)', 'var(--lavender)', 'var(--sage)', 'var(--rose)', 'var(--taupe)', 'var(--mist)', 'var(--sand)', '#8b918f']
