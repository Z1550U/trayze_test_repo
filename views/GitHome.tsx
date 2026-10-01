import { useState } from 'react'
import { parseRepo } from '../core/git'
import { IconArrow, IconGit } from '../ui/icons'

/** Start page: Git releases are trayze's main path. Single files stay one click away. */
export function GitHome({ openRepo }: { openRepo: (slug: string) => void }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const repo = parseRepo(input)
    if (!repo) {
      setError('Enter a GitHub repository, e.g. github.com/owner/repo.')
      return
    }
    setError('')
    openRepo(`github.com/${repo.owner}/${repo.repo}`)
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 44 }}>
      <div style={{ maxWidth: 780 }}>
        <p className="eyebrow">Git releases, anchored on Alephium</p>
        <h1 className="title hero-title">
          Prove your history
          <span className="grey">was never rewritten.</span>
        </h1>
        <p className="lead">Anchor your tags and releases on chain. Anyone can check a repo in seconds – no account, no trayze server, and your code stays where it is.</p>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 780 }}>
        <label htmlFor="repo-input" className="muted small">
          Public GitHub repository
        </label>
        <div className="repo-input glass">
          <IconGit size={22} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <input id="repo-input" className="mono" value={input} onChange={(e) => setInput(e.target.value)} placeholder="github.com/owner/repo" spellCheck={false} autoCapitalize="off" autoComplete="off" />
          <button className="pill pill-black" type="submit">
            Check repo <IconArrow size={16} />
          </button>
        </div>
        {error ? <span className="small chain-break">{error}</span> : <span className="muted small">Your own repo? The same page lets maintainers anchor a release.</span>}
      </form>

      <div className="git-steps">
        <div className="glass git-step">
          <span className="mono muted">01</span>
          <h2>Name your maintainers</h2>
          <p>
            A small <code>.trayze</code> file in the repo lists who may anchor. Only people with write access can change it.
          </p>
        </div>
        <div className="glass git-step">
          <span className="mono muted">02</span>
          <h2>Anchor each release</h2>
          <p>One anchor per tag. It covers the release and every commit before it – a fingerprint, never your code.</p>
        </div>
        <div className="glass git-step">
          <span className="mono muted">03</span>
          <h2>Let anyone check</h2>
          <p>A public page and a README badge show whether the history up to each anchor is still intact.</p>
        </div>
      </div>

      <a href="#/files" className="muted small" style={{ alignSelf: 'flex-start' }}>
        Anchor individual files instead →
      </a>
    </div>
  )
}
