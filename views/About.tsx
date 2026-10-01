import { useEffect, useState } from 'react'
import { hashText } from '../core/hash'
import { HashGlyph } from '../ui/HashGlyph'
import { COLOR } from '../ui/colors'
import { IconArrow, IconLink, IconLock, IconPlus, IconSearch, IconUsers } from '../ui/icons'
import type { View } from '../ui/Navigation'
import { config } from '../chain/config'

const STEPS = [
  {
    title: 'Fingerprint',
    text: 'Drop any file. trayze reads it on your device and computes its SHA-256 fingerprint – 64 characters that change completely if a single bit of the file changes. The file itself is never uploaded.'
  },
  {
    title: 'Anchor',
    text: 'Your wallet signs the fingerprint and writes it to the Alephium blockchain. The block it lands in carries a timestamp nobody can change afterwards – not you, not us.'
  },
  {
    title: 'Verify',
    text: 'Anyone can drop the same file later. If the fingerprint matches, trayze shows when it was anchored and by which address – without you having shared anything beforehand.'
  }
]

const FEATURES = [
  {
    Icon: IconLink,
    color: COLOR.document,
    title: 'Projects & evolution',
    text: 'Versions of one piece of work form a chain: every entry points to the one before. Your trail from first idea to delivery becomes visible – and nothing can be slipped in or back-dated.'
  },
  {
    Icon: IconUsers,
    color: COLOR.audio,
    title: 'Co-signing & split sheets',
    text: 'An entry can require confirmation from every party – optionally with each share. It only counts once all have signed with their own wallet before the deadline.'
  },
  {
    Icon: IconSearch,
    color: COLOR.image,
    title: 'See what changed',
    text: 'Verify shows whether a file is identical, or what differs from the anchored version: file name, metadata, size – and for images even a renamed or re-exported copy.'
  },
  {
    Icon: IconLock,
    color: COLOR.video,
    title: 'Private by design',
    text: 'Only fingerprints and the signing address go on-chain in the clear. Titles, notes and names are backed up encrypted – only your passkey or recovery code unlocks them. Files never leave your device.'
  }
]

const PROVEN = ['When it was anchored (block time)', 'The exact file content (fingerprint)', 'Which address signed', 'The order of versions in a project', 'Who co-signed which shares']
const STATED = ['Title, stage and notes', 'Capture date, author, GPS from metadata', 'That you created the work', 'That the file is original or not generated']

const FAQ = [
  {
    q: 'What exactly goes on the blockchain?',
    a: 'Two SHA-256 fingerprints per entry – one of the file, one of the details you chose to include – plus a link to the previous entry and your address. A fingerprint cannot be turned back into the file.'
  },
  {
    q: 'Does it prove that I made the work?',
    a: 'No – and no system can. It proves that this exact file existed at that moment and that your address vouched for it. Anchored early and often, that is strong evidence of priority in a dispute. It is not a copyright registration or legal advice.'
  },
  {
    q: 'Do I need to keep the file?',
    a: 'Yes. Verification needs the exact original – a re-saved or converted copy has a different fingerprint. Keep your originals and the proof file (.json) together.'
  },
  {
    q: 'Can a proof file be faked?',
    a: 'Anyone can edit a JSON file, so trayze never trusts it on its own. Time and signer always come from the blockchain; an edited proof is flagged as altered or not anchored.'
  },
  {
    q: 'What does it cost?',
    a: 'Each anchor or confirmation is a small Alephium transaction, paid in ALPH by whoever signs. The simulation mode is free and stores everything only in your browser – ideal to try things out.'
  },
  {
    q: 'Why Alephium?',
    a: 'A proof-of-work blockchain that is energy-efficient by design, with fast blocks, low fees and a public record that doesn’t depend on trayze existing tomorrow.'
  }
]

export function About({ go }: { go: (v: View) => void }) {
  return (
    <div className="fade-in about">
      <div className="stage">
        <div className="stage-left">
          <div>
            <p className="eyebrow">How it works</p>
            <h1 className="title">
              Proof of a file,
              <span className="grey">at a moment in time.</span>
            </h1>
          </div>
          <p className="lead">
            trayze records that a file existed – in exactly this form, at exactly this time – and who vouched for it. For drafts, mixes, photos, contracts, code: any file. The file never leaves your device.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="pill pill-black" onClick={() => go('anchor')}>
              <span className="knob">
                <IconPlus size={16} />
              </span>
              Anchor a file
            </button>
            <button className="pill pill-glass" onClick={() => go('verify')}>
              Verify a file
            </button>
          </div>
        </div>
        <FingerprintDemo />
      </div>

      <section>
        <p className="eyebrow">Three steps</p>
        <div className="about-steps">
          {STEPS.map((s, i) => (
            <div key={s.title} className="glass about-step">
              <span className="about-step-num">0{i + 1}</span>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="eyebrow">What you can do</p>
        <div className="features">
          {FEATURES.map(({ Icon, color, title, text }) => (
            <div key={title} className="glass feature">
              <span className="tile" style={{ color }}>
                <Icon size={20} />
              </span>
              <div>
                <h2>{title}</h2>
                <p>{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass panel">
        <div>
          <p className="eyebrow" style={{ marginBottom: 8 }}>
            Honest about limits
          </p>
          <h2 style={{ fontSize: 26, fontWeight: 460, letterSpacing: '-0.02em' }}>The chain secures the record – not reality.</h2>
        </div>
        <div className="proven-stated">
          <div>
            <h3>
              <span className="dot" style={{ background: 'var(--sage)' }} /> Proven
            </h3>
            <ul>
              {PROVEN.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>
              <span className="dot" style={{ background: 'var(--taupe)' }} /> Stated
            </h3>
            <ul>
              {STATED.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
        <span className="muted small" style={{ lineHeight: 1.55 }}>
          Everything under “stated” is recorded exactly as given and can’t be changed later – but whether it is true is up to the person who signed.
        </span>
      </section>

      <section>
        <p className="eyebrow">Good to know</p>
        <div className="glass faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>
                {f.q}
                <span className="faq-plus" aria-hidden="true" />
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="about-end">
        <h2>Start with the file you’re working on right now.</h2>
        <button className="pill pill-black" onClick={() => go('anchor')}>
          <span className="knob">
            <IconArrow size={16} />
          </span>
          Anchor a file
        </button>
        <p className="muted small" style={{ margin: '18px 0 0', lineHeight: 1.6 }}>
          trayze is free software under the GNU AGPL-3.0.
          {config.source && (
            <>
              {' '}
              <a href={config.source} target="_blank" rel="noreferrer" style={{ color: 'var(--ink)' }}>
                Source code
              </a>
            </>
          )}
          {config.network !== 'mainnet' && <> · Running on the Alephium {config.network} – test ALPH only, nothing here has real value.</>}
        </p>
      </section>
    </div>
  )
}

/** Type something and watch the fingerprint change – the core idea in ten seconds. */
function FingerprintDemo() {
  const [text, setText] = useState('Northern Light – final mix')
  const [hash, setHash] = useState('')
  useEffect(() => {
    let live = true
    void hashText(text).then((h) => live && setHash(h))
    return () => {
      live = false
    }
  }, [text])

  return (
    <section className="glass panel demo">
      <h3>Try it · a fingerprint</h3>
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} aria-label="Text to fingerprint" spellCheck={false} />
      <div className="demo-glyph">
        <HashGlyph hash={hash} size={148} color="var(--ink)" label="Fingerprint of the text" />
      </div>
      <span className="mono demo-hash">{hash || ' '}</span>
      <span className="muted small" style={{ lineHeight: 1.55 }}>
        Change a single letter – the fingerprint changes completely. It is always 64 characters, whether for one word or a 4 GB video, and it can’t be turned back into the content.
      </span>
    </section>
  )
}
