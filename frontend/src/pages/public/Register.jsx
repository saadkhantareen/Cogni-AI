import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { ROLE_HOME, useAuth } from '../../auth/AuthContext'
import { Icon } from '../../components/IconSprite'
import AuthShell from './AuthShell'

export default function Register() {
  const { user, loading, configLoading, publicConfig, registerStudent, mustChangePassword } =
    useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = 'Create student account · Cogni.ai'
  }, [])

  if (!loading && !configLoading && publicConfig && !publicConfig.student_signup_enabled) {
    return <Navigate to="/login" replace />
  }

  if (user && !mustChangePassword) {
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />
  }

  async function onSubmit() {
    setError('')
    setBusy(true)
    try {
      const u = await registerStudent({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      })
      navigate(
        u.must_change_password ? '/change-password' : ROLE_HOME[u.role] || '/app/student',
        { replace: true },
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create account.')
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Create student account"
      subtitle="Sign up with your school email. After joining, use a class join code from your teacher."
      sideBody="Students create their own account when signup is enabled. Teachers and staff are added by an admin."
    >
      {error ? (
        <div className="err" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="r-name">Full name</label>
        <input
          id="r-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          autoComplete="name"
        />
      </div>
      <div className="field">
        <label htmlFor="r-email">School email</label>
        <input
          id="r-email"
          type="email"
          placeholder="name@school.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          autoComplete="username"
        />
      </div>
      <div className="field">
        <label htmlFor="r-pw">Password</label>
        <div className="pw">
          <input
            id="r-pw"
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            autoComplete="new-password"
          />
          <button
            type="button"
            className="btn ghost"
            aria-label={showPw ? 'Hide password' : 'Show password'}
            onClick={() => setShowPw((v) => !v)}
          >
            <Icon name={showPw ? 'eyeoff' : 'eye'} />
          </button>
        </div>
        <p className="small">At least 10 characters; not your email or a common password.</p>
      </div>
      <button
        type="button"
        className="btn primary"
        style={{ width: '100%', minHeight: 48 }}
        onClick={onSubmit}
        disabled={busy}
      >
        {busy ? 'Creating…' : 'Create account'}
      </button>
      <p className="small" style={{ margin: '14px 0 0', textAlign: 'center' }}>
        Already have an account?{' '}
        <Link to="/login">Sign in</Link>
      </p>
    </AuthShell>
  )
}
