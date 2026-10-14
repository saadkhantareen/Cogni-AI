import { useEffect, useState } from 'react'
import ThemeButton from '../components/ThemeButton'
import { Icon } from '../components/IconSprite'
import { useTheme } from '../hooks/useTheme'

const BLOOMS = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create']
const PILLS = [
  ['Draft', 'p-grey'],
  ['Pending HOD', 'p-warn'],
  ['Returned', 'p-bad'],
  ['Approved', 'p-good'],
  ['Live', 'p-blue'],
  ['Closed', 'p-grey'],
  ['AI draft', 'p-ai'],
]

function Section({ title, children }) {
  return (
    <section className="panel mt" style={{ padding: 0 }}>
      <div className="panel-h">
        <h2 style={{ fontSize: 18 }}>{title}</h2>
      </div>
      <div className="panel-b">{children}</div>
    </section>
  )
}

export default function StyleGuide() {
  const { theme, isDark } = useTheme()
  const [modalOpen, setModalOpen] = useState(false)
  const [toastShow, setToastShow] = useState(false)
  const [toastError, setToastError] = useState(false)
  const [choice, setChoice] = useState(1)

  useEffect(() => {
    if (!toastShow) return undefined
    const t = setTimeout(() => setToastShow(false), 3200)
    return () => clearTimeout(t)
  }, [toastShow])

  useEffect(() => {
    if (!modalOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setModalOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [modalOpen])

  const showToast = (error = false) => {
    setToastError(error)
    setToastShow(true)
  }

  return (
    <div className="main" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="topbar">
        <div>
          <div className="crumb">
            <span>Temporary · remove in F8</span>
          </div>
          <h1>Style guide</h1>
          <p className="small" style={{ margin: '8px 0 0' }}>
            One of every component class from v7. Theme:{' '}
            <b className="mono">{theme}</b> ({isDark ? 'dark' : 'light'}). Toggle and compare
            against <span className="mono">reference/Cogni.ai-v7.html</span>.
          </p>
        </div>
        <div className="acts">
          <ThemeButton />
        </div>
      </div>

      <Section title="Buttons">
        <div className="row">
          <button type="button" className="btn">
            Default
          </button>
          <button type="button" className="btn primary">
            Primary
          </button>
          <button type="button" className="btn good">
            Good
          </button>
          <button type="button" className="btn bad">
            Bad
          </button>
          <button type="button" className="btn bad solid">
            Bad solid
          </button>
          <button type="button" className="btn ghost">
            Ghost
          </button>
          <button type="button" className="btn small">
            Small
          </button>
          <button type="button" className="btn small primary">
            Small primary
          </button>
          <button type="button" className="btn icon ghost" aria-label="Close">
            <Icon name="x" />
          </button>
          <ThemeButton />
          <button type="button" className="btn primary" disabled>
            Disabled
          </button>
          <button type="button" className="btn primary busy" aria-busy="true">
            Busy
          </button>
        </div>
      </Section>

      <Section title="Pills & Bloom tags">
        <div className="row" style={{ marginBottom: 12 }}>
          {PILLS.map(([label, cls]) => (
            <span key={cls + label} className={`pill ${cls}`}>
              {label}
            </span>
          ))}
        </div>
        <div className="row">
          {BLOOMS.map((b) => (
            <span key={b} className={`bloom b-${b}`}>
              {b}
            </span>
          ))}
        </div>
        <div className="row mt">
          <span className="chip-ai">
            <Icon name="spark" />
            AI draft
          </span>
          <span className="chip-human">
            <Icon name="check" />
            Human decision
          </span>
          <span className="portal r-admin">ADMIN PORTAL</span>
          <span className="portal r-hod">HOD PORTAL</span>
          <span className="portal r-teacher">TEACHER PORTAL</span>
          <span className="portal r-student">STUDENT PORTAL</span>
        </div>
      </Section>

      <Section title="Panel">
        <div className="grid g2e">
          <div className="panel">
            <div className="panel-h">
              <h3>Panel header</h3>
              <button type="button" className="btn small ghost">
                Action
              </button>
            </div>
            <div className="panel-b">
              <p className="small" style={{ margin: 0 }}>
                Body text in a panel. Used across dashboards, exams and settings.
              </p>
            </div>
          </div>
          <div className="panel stat">
            <div className="l">At a glance</div>
            <div className="v num">12</div>
            <div className="d">Open exams</div>
          </div>
        </div>
      </Section>

      <Section title="Table">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Exam</th>
                <th>Status</th>
                <th>Score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>SQL Joins Quiz</b>
                  <div className="small">CS-201-A</div>
                </td>
                <td>
                  <span className="pill p-blue">Live</span>
                </td>
                <td className="num">—</td>
                <td>
                  <button type="button" className="btn small">
                    Open
                  </button>
                </td>
              </tr>
              <tr>
                <td>
                  <b>Midterm</b>
                  <div className="small">CS-201-A</div>
                </td>
                <td>
                  <span className="pill p-warn">Pending HOD</span>
                </td>
                <td className="num">—</td>
                <td>
                  <button type="button" className="btn small">
                    Review
                  </button>
                </td>
              </tr>
              <tr>
                <td colSpan={4} className="empty">
                  Empty row example
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Question card">
        <div className="qcard ai-card">
          <div className="qtop">
            <div className="qtags">
              <span className="mono" style={{ color: 'var(--color-muted-foreground)' }}>
                Q1
              </span>
              <span className="chip-ai">
                <Icon name="spark" />
                AI draft
              </span>
              <span className="pill p-grey">MCQ · 2 marks</span>
              <span className="bloom b-Understand">Understand</span>
              <span className="small">Joins · CLO2</span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn small ghost">
                Edit
              </button>
              <button type="button" className="btn small ghost">
                Regenerate
              </button>
            </div>
          </div>
          <p style={{ margin: '10px 0 0', fontWeight: 500 }}>
            Which JOIN returns only matching rows from both tables?
          </p>
        </div>
      </Section>

      <Section title="Choices (MCQ)">
        <div role="radiogroup" aria-label="Sample MCQ">
          {['INNER JOIN', 'LEFT JOIN', 'CROSS JOIN', 'FULL OUTER JOIN'].map((o, k) => {
            const sel = choice === k
            return (
              <div
                key={o}
                className={`choice ${sel ? 'sel' : ''}`}
                role="radio"
                aria-checked={sel}
                tabIndex={sel ? 0 : -1}
                onClick={() => setChoice(k)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setChoice(k)
                  }
                }}
              >
                <span className="k" aria-hidden="true">
                  {'ABCD'[k]}
                </span>
                <span>{o}</span>
                {sel ? (
                  <span className="sel-lab" aria-hidden="true">
                    <Icon name="check" className="sm" />
                    Selected
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="Exam timer bar">
        <div className="exambar" role="region" aria-label="Exam status">
          <div className="tl">
            <Icon name="clock" />
            <div>
              <div className="small" style={{ lineHeight: 1.2 }}>
                Time left
              </div>
              <div className="timer num" role="timer">
                14:32
              </div>
            </div>
          </div>
          <div className="prog">
            <div className="small">
              <b style={{ color: 'var(--color-foreground)' }}>3 of 8</b> answered
            </div>
            <div className="bar" aria-hidden="true">
              <i style={{ width: '37%' }} />
            </div>
          </div>
          <button type="button" className="btn good">
            Submit exam…
          </button>
        </div>
      </Section>

      <Section title="Chat bubbles">
        <div className="msgs" style={{ maxHeight: 280, minHeight: 180 }}>
          <div className="msg a old">
            <div style={{ marginBottom: 6 }}>
              <span className="chip-ai">
                <Icon name="spark" />
                Study assistant
              </span>
            </div>
            Ask me anything about this material. I answer only from the source and show the page I
            used.
            <span className="src">p. 12 · Joins overview</span>
          </div>
          <div className="msg u old">What is the difference between INNER and LEFT JOIN?</div>
          <div className="msg a">
            <div style={{ marginBottom: 6 }}>
              <span className="chip-ai">
                <Icon name="spark" />
                Study assistant
              </span>
            </div>
            INNER JOIN keeps only matching rows; LEFT JOIN keeps all rows from the left table.
            <span className="src">p. 14 · Outer joins</span>
          </div>
        </div>
      </Section>

      <Section title="Modal & toast">
        <div className="row">
          <button type="button" className="btn primary" onClick={() => setModalOpen(true)}>
            Open modal
          </button>
          <button type="button" className="btn" onClick={() => showToast(false)}>
            Show toast
          </button>
          <button type="button" className="btn bad" onClick={() => showToast(true)}>
            Show error toast
          </button>
        </div>
        <p className="small" style={{ marginTop: 12 }}>
          Modal and toast use the same classes as v7 overlays (see wireframe 35-shared-overlays).
        </p>
      </Section>

      <Section title="Empty / callout">
        <div className="empty">Nothing here yet.</div>
        <div className="callout blue mt">
          <Icon name="info" />
          <div>
            <b>Callout</b> — advisory note with the same markup as login and feedback pages.
          </div>
        </div>
      </Section>

      <div
        className="modal-bg"
        hidden={!modalOpen}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModalOpen(false)
        }}
      >
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sg-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="sg-modal-title">Release results?</h3>
          <p className="small">
            Students are notified and can see their scores and feedback. 1 flag is undecided.
          </p>
          <div className="acts">
            <button type="button" className="btn" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setModalOpen(false)
                showToast(false)
              }}
            >
              Release
            </button>
          </div>
        </div>
      </div>

      <div
        className={`toast${toastError ? ' error' : ''}${toastShow ? ' show' : ''}`}
        role="status"
        aria-live="polite"
      >
        <Icon name={toastError ? 'alert' : 'check'} />
        <span>{toastError ? 'Something went wrong' : 'Signed in as Hamza Ali'}</span>
      </div>
    </div>
  )
}
