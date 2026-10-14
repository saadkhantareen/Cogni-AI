import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import ThemeButton from '../components/ThemeButton'

const ROLE_LABEL = {
  admin: 'Admin',
  hod: 'Head of Department',
  teacher: 'Teacher',
  student: 'Student',
}

/** Temporary F2 placeholder until role dashboards are ported. */
export default function RoleHome() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  if (!user) return null

  const onLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="main" style={{ maxWidth: 720, margin: '48px auto', padding: 24 }}>
      <div className="topbar" style={{ marginBottom: 24 }}>
        <div>
          <div className="crumb">
            <span className={`portal r-${user.role}`}>{ROLE_LABEL[user.role] || user.role}</span>
          </div>
          <h1>Welcome, {user.name}</h1>
          <p className="small" style={{ marginTop: 8 }}>
            Signed in as <b>{user.email}</b> · role <b className="mono">{user.role}</b>
          </p>
        </div>
        <div className="acts">
          <ThemeButton />
          <button type="button" className="btn" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </div>
      <div className="panel">
        <div className="panel-b">
          <p>
            This is a placeholder role home for Phase F2. Dashboard pages land in later frontend
            phases.
          </p>
        </div>
      </div>
    </div>
  )
}
