import { IconCoins, IconGit, IconHelp, IconPlus, IconProjects, IconSearch } from './icons'

export type View = 'repos' | 'projects' | 'anchor' | 'verify' | 'earnings' | 'about'

type Item = { id: View; label: string; Icon: typeof IconPlus }
const REPOS: Item = { id: 'repos', label: 'Repos', Icon: IconGit }
const MONEY: Item[] = [
  { id: 'earnings', label: 'Earnings', Icon: IconCoins },
  { id: 'about', label: 'How it works', Icon: IconHelp }
]
/** Git releases are the main path; single files keep their own tools once you're in that area. */
const FILES: Item[] = [
  { id: 'projects', label: 'Files', Icon: IconProjects },
  { id: 'anchor', label: 'Anchor', Icon: IconPlus },
  { id: 'verify', label: 'Verify', Icon: IconSearch }
]
const isFiles = (v?: View) => v === 'projects' || v === 'anchor' || v === 'verify'

export function Navigation({ active, files, onChange }: { active?: View; files?: boolean; onChange: (v: View) => void }) {
  const items = files || isFiles(active) ? [REPOS, ...FILES, ...MONEY] : [REPOS, ...MONEY]
  return (
    <nav className="nav" aria-label="Main navigation">
      {items.map(({ id, label, Icon }) => (
        <button key={id} onClick={() => onChange(id)} aria-current={active === id ? 'page' : undefined} aria-label={label}>
          <Icon size={20} />
          <span className="nav-label">{label}</span>
        </button>
      ))}
    </nav>
  )
}
