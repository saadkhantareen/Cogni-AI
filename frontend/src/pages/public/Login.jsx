import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { ROLE_HOME, useAuth } from '../../auth/AuthContext'
import ThemeButton from '../../components/ThemeButton'
import Logo from '../../components/Logo'
import { Icon } from '../../components/IconSprite'

const DEMO_GROUPS = [
  ['admin', 'Admin', 'Institution setup'],
  ['hod', 'HOD', 'Approves papers'],
  ['teacher', 'Teacher', 'Creates exams'],
  ['student', 'Student', 'Attempts exams'],
]

const DEMO_PASSWORD = 'demo123'

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

export default function Login() {
  const { user, login, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [acctsLoading, setAcctsLoading] = useState(true)
  const [acctsError, setAcctsError] = useState('')

  useEffect(() => {
    document.title = 'Sign in · Cogni.ai'
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setAcctsLoading(true)
      setAcctsError('')
      try {
        const list = await api.getDemoAccounts()
        if (!cancelled) setAccounts(Array.isArray(list) ? list : [])
      } catch (err) {
        if (!cancelled) {
          setAcctsError(
            err instanceof ApiError
              ? err.message
              : 'Could not load demo accounts.',
          )
          setAccounts([])
        }
      } finally {
        if (!cancelled) setAcctsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const byRole = useMemo(() => {
    const map = { admin: [], hod: [], teacher: [], student: [] }
    for (const a of accounts) {
      if (map[a.role]) map[a.role].push(a)
    }
    return map
  }, [accounts])

  if (!authLoading && user) {
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />
  }

  const doLogin = async (em, pw) => {
    setError('')
    setSubmitting(true)
    try {
      const u = await login(em.trim(), pw)
      navigate(ROLE_HOME[u.role] || '/', { replace: true })
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Sign in failed. Please try again.'
      setError(msg)
      setSubmitting(false)
    }
  }

  const onSignIn = () => {
    if (submitting) return
    doLogin(email, password)
  }

  const onEnter = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSignIn()
    }
  }

  const onDemo = (acct) => {
    setEmail(acct.email)
    setPassword(DEMO_PASSWORD)
    if (acct.status !== 'active') {
      setError(
        `${acct.name}'s account is deactivated. Sign in as an admin to reactivate it.`,
      )
      return
    }
    doLogin(acct.email, DEMO_PASSWORD)
  }

  return (
    <div id="v-login">
      <div className="auth">
        <aside className="side">
          <Logo className="inv" />
          <div>
            <h2>Less time writing papers. More time teaching.</h2>
            <p className="mt">
              Pick any demo account to sign in. Try the full loop: a teacher generates a paper, the
              HOD approves it, a student attempts it, the teacher releases results.
            </p>
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
          <div>
            <h1>Sign in</h1>
            <p className="small" style={{ margin: '0 0 22px' }}>
              Use a demo account, or type any email below. Every account&apos;s password is{' '}
              <span className="mono">{DEMO_PASSWORD}</span>.
            </p>
            {error ? (
              <div className="err" role="alert">
                <Icon name="alert" />
                <span>{error}</span>
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="l-email">Email</label>
              <input
                id="l-email"
                type="email"
                autoComplete="username"
                placeholder="name@umt.edu.pk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={onEnter}
                disabled={submitting}
              />
            </div>
            <div className="field">
              <label htmlFor="l-pw">Password</label>
              <div className="pw">
                <input
                  id="l-pw"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={onEnter}
                  disabled={submitting}
                  aria-invalid={error ? 'true' : undefined}
                />
                <button
                  type="button"
                  className="btn ghost"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  aria-pressed={showPw}
                  onClick={() => setShowPw((v) => !v)}
                >
                  <Icon name={showPw ? 'eyeoff' : 'eye'} />
                </button>
              </div>
            </div>
            <button
              type="button"
              className="btn primary"
              style={{ width: '100%', minHeight: 48 }}
              onClick={onSignIn}
              disabled={submitting}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="small" style={{ margin: '14px 0 0', textAlign: 'center' }}>
              New student? Ask an admin to create your account.
            </p>
            <div className="callout blue mt" style={{ marginBottom: 0 }}>
              <Icon name="info" />
              <div>
                Demo accounts share sample data on the server. Password for every account is{' '}
                <span className="mono">{DEMO_PASSWORD}</span>.
              </div>
            </div>
          </div>
          <section aria-labelledby="accts-h">
            <h2 id="accts-h" style={{ fontSize: 18, marginBottom: 4 }}>
              Demo accounts
            </h2>
            <p className="small" style={{ margin: '0 0 14px' }}>
              Click any account to sign in instantly.
            </p>
            {acctsLoading ? (
              <div className="panel empty">Loading demo accounts…</div>
            ) : acctsError ? (
              <div className="err" role="alert">
                <Icon name="alert" />
                <span>{acctsError}</span>
              </div>
            ) : accounts.length === 0 ? (
              <div className="panel empty">No demo accounts available.</div>
            ) : (
              <div className="accts" id="accts">
                {DEMO_GROUPS.map(([role, label, sub]) => (
                  <div className="agroup" key={role}>
                    <h4>
                      <span className={`portal r-${role}`} style={{ margin: 0 }}>
                        {label}
                      </span>
                      <span>{sub}</span>
                    </h4>
                    {byRole[role].length === 0 ? (
                      <div className="empty">No demo accounts in this role</div>
                    ) : (
                      byRole[role].map((u) => (
                        <button
                          type="button"
                          className="acct"
                          key={u.id}
                          disabled={submitting}
                          aria-label={`Sign in as ${u.name}, ${label}`}
                          onClick={() => onDemo(u)}
                        >
                          <div className="av" aria-hidden="true">
                            {initials(u.name)}
                          </div>
                          <div className="who">
                            <b>{u.name}</b>
                            <span>
                              {u.email}
                              {u.dept_name ? ` · ${u.dept_name}` : ''}
                            </span>
                          </div>
                          {u.status === 'active' ? (
                            <span className="go">
                              Sign in <Icon name="arrow" className="sm" />
                            </span>
                          ) : (
                            <span className="pill p-bad">Inactive</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}
