import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import * as api from '../../api'
import { ShellError, ShellLoading } from '../../components/AppShell'
import EmptyState from '../../components/EmptyState'
import { Icon } from '../../components/IconSprite'
import PageTop from '../../components/PageTop'
import Panel from '../../components/Panel'
import Pill from '../../components/Pill'
import { formatShortDate } from '../../utils/format'

/**
 * Minimal exam landing for F4 part 1 so Generate can navigate here.
 * Full editor (edit/regen/submit/publish) lands in the next teacher phase.
 */
export default function ExamEditor() {
  const { id } = useParams()
  const location = useLocation()
  const warnings = location.state?.warnings || []
  const [exam, setExam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setExam(await api.getExam(id))
    } catch (err) {
      setError(err)
      setExam(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <ShellLoading label="Loading exam…" />
  if (error) {
    return <ShellError message={error.message || 'Exam not found.'} onRetry={load} />
  }
  if (!exam) return <EmptyState>Exam not found.</EmptyState>

  const qn = exam.questions?.length ?? 0

  return (
    <>
      <PageTop
        crumb={
          <>
            <Link to="/app/teacher">Home</Link> <span aria-hidden="true">/</span>{' '}
            <Link to="/app/teacher/exams">My exams</Link>
          </>
        }
        title={
          <>
            {exam.title} <Pill status={exam.status} />
          </>
        }
        actions={
          <Link className="btn" to="/app/teacher/exams">
            Back to My exams
          </Link>
        }
      />
      {warnings.length ? (
        <div className="callout">
          <Icon name="warn" />
          <div>
            {warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="callout blue">
        <Icon name="info" />
        <div>
          <b>Draft saved.</b> The full question editor arrives in the next teacher phase. You can
          already see this paper under My exams.
        </div>
      </div>
      <Panel title="Summary">
        <p style={{ margin: 0 }}>
          {exam.kind} · {qn} question{qn === 1 ? '' : 's'} · {exam.duration_min} min · created{' '}
          {formatShortDate(exam.created_at)}
        </p>
        {exam.hod_comment ? (
          <p className="small" style={{ marginTop: 12 }}>
            HOD comment: {exam.hod_comment}
          </p>
        ) : null}
        {(exam.history || []).length ? (
          <div className="hist" style={{ marginTop: 16 }}>
            {[...exam.history].reverse().map((h, i) => (
              <div key={i}>
                <span>{formatShortDate(h.at)}</span>
                {h.text}
              </div>
            ))}
          </div>
        ) : null}
      </Panel>
    </>
  )
}
