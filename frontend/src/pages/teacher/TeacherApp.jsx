import { Link, Route, Routes } from 'react-router-dom'
import AppShell from '../../components/AppShell'
import PageTop from '../../components/PageTop'
import Panel from '../../components/Panel'
import Dashboard from './Dashboard'
import Classes from './Classes'
import ClassDetail from './ClassDetail'
import Materials from './Materials'
import CreateExam from './CreateExam'
import Exams from './Exams'
import ExamEditor from './ExamEditor'
import Flags from './Flags'
import NotFound from '../NotFound'

/** Teacher portal routes inside AppShell (ARCHITECTURE F4). */
export default function TeacherApp() {
  return (
    <AppShell>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="classes" element={<Classes />} />
        <Route path="classes/:id" element={<ClassDetail />} />
        <Route path="materials" element={<Materials />} />
        <Route path="exams" element={<Exams />} />
        <Route path="exams/new" element={<CreateExam />} />
        <Route path="exams/:id" element={<ExamEditor />} />
        <Route path="exams/:id/results" element={<ComingSoon title="Results" />} />
        <Route path="attempts/:id" element={<ComingSoon title="Attempt review" />} />
        <Route path="flags" element={<Flags />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  )
}

function ComingSoon({ title }) {
  return (
    <>
      <PageTop title={title} />
      <Panel>
        <p style={{ margin: 0 }}>This screen lands in a later teacher phase.</p>
        <p className="small" style={{ marginTop: 12 }}>
          <Link to="/app/teacher">Back to Home</Link>
        </p>
      </Panel>
    </>
  )
}
