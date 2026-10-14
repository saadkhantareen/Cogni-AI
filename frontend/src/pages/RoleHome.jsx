import AppShell from '../components/AppShell'
import PageTop from '../components/PageTop'
import Panel from '../components/Panel'
import { useAuth } from '../auth/AuthContext'
import { ROLE } from '../utils/roleNav'

/** F3: shell + under-construction stand-in until role dashboards land. */
export default function RoleHome() {
  const { user } = useAuth()
  if (!user) return null

  const R = ROLE[user.role] || ROLE.admin

  return (
    <AppShell>
      <PageTop crumb={<span className={`portal r-${user.role}`}>{R.label}</span>} title="Home" />
      <Panel title="Under construction">
        <p style={{ margin: 0 }}>
          The {R.name.toLowerCase()} portal shell is ready. Dashboard pages land in later frontend
          phases — navigation, notifications and shared components already work.
        </p>
        <p className="small" style={{ margin: '12px 0 0' }}>
          Signed in as <b>{user.name}</b> · <span className="mono">{user.email}</span>
        </p>
      </Panel>
    </AppShell>
  )
}
