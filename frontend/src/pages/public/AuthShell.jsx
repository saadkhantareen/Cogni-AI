import { Link } from 'react-router-dom'
import ThemeButton from '../../components/ThemeButton'
import Logo from '../../components/Logo'
import { Icon } from '../../components/IconSprite'

const STEPS = [
  ['Upload', 'Teachers add a PDF, slides, a Word file or pasted notes. Scanned pages are read with built-in OCR.'],
  ['Draft', 'The AI drafts questions tagged by Bloom level, topic and course learning outcome.'],
  ['Review', 'The teacher edits the paper. The head of department approves it or sends it back with a comment.'],
  ['Exam', 'Students sit a timed exam. Multiple choice is marked automatically; written answers are graded against a model answer.'],
  ['Feedback', 'Teachers can override any score before releasing results. Students get topic-by-topic feedback and a study plan.'],
]
const ROLES = ['Admin', 'Head of department', 'Teacher', 'Student']

/** Shared layout for public auth pages (login, register, setup, etc.). */
export default function AuthShell({ title, subtitle, children, sideTitle, sideBody, titleAction }) {
  return (
    <div id="v-login">
      <div className="auth">
        <aside className="side">
          <Logo className="inv" />
          <div>
            <h2>{sideTitle || 'Less time writing papers. More time teaching.'}</h2>
            {sideBody ? <p className="mt">{sideBody}</p> : null}
          </div>
          <div className="row">
            <Link className="btn small" to="/" style={{ width: 'fit-content' }}>
              <Icon name="left" className="sm" /> Back to home
            </Link>
            <ThemeButton className="inv-btn" />
          </div>
        </aside>
        <main className="body" id="login-main">
          <div className="mhead">
            <Logo />
            <span className="row">
              <ThemeButton />
              <Link className="btn small ghost" to="/">
                <Icon name="left" className="sm" /> Home
              </Link>
            </span>
          </div>
          <div className="auth-card">
            {titleAction ? <div className="auth-card-tools">{titleAction}</div> : null}
            <h1>{title}</h1>
            {subtitle ? (
              <p className="small" style={{ margin: '0 0 22px' }}>
                {subtitle}
              </p>
            ) : null}
            {children}
          </div>
          <section className="auth-aside" aria-labelledby="auth-aside-h">
            <p className="auth-aside-eyebrow">How Cogni.ai works</p>
            <h2 id="auth-aside-h">From course notes to a graded exam</h2>
            <p className="small auth-aside-lead">
              One workflow for four roles, with a person making every decision.
            </p>
            <ol className="auth-steps">
              {STEPS.map(([name, text], i) => (
                <li key={name}>
                  <span className="auth-step-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <b>{name}</b>
                    <p className="small">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="auth-roles" aria-label="Roles">
              {ROLES.map((r) => (
                <span key={r} className="auth-role">
                  {r}
                </span>
              ))}
            </div>
            <div className="callout blue auth-aside-note">
              <Icon name="info" />
              <div>
                The AI never changes a grade on its own. Writing-likelihood flags are advice for the
                teacher, never an automatic penalty.
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
