import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { windowState } from '../../utils/pkTime'
import { ShellError, ShellLoading } from '../../components/AppShell'
import EmptyState from '../../components/EmptyState'
import Field from '../../components/Field'
import { useModal } from '../../components/Modal'
import FileAttachmentViewer from '../../components/FileAttachmentViewer'
import PdfViewer from '../../components/PdfViewer'
import { useToast } from '../../components/Toast'
import {
  attemptPercent,
  classHue,
  formatTeacherName,
  formatSubmittedAt,
  materialKindLabel,
} from '../../utils/student'
import Exams from './Exams'
import Results from './Results'

function materialLabel(m) {
  return (m?.display_name || m?.name || 'Material').trim() || 'Material'
}

function splitNameExt(name) {
  const raw = String(name || '').trim()
  const i = raw.lastIndexOf('.')
  if (i > 0 && i < raw.length - 1 && raw.length - i <= 6) {
    return { base: raw.slice(0, i), ext: raw.slice(i) }
  }
  return { base: raw, ext: '' }
}

function StudentMaterials({ materials, onMaterialsChange }) {
  const toast = useToast()
  const { openModal, closeModal } = useModal()
  const [openingId, setOpeningId] = useState(null)
  const [viewer, setViewer] = useState(null)
  const list = materials || []

  function closeViewer() {
    setViewer((current) => {
      if (current?.url) URL.revokeObjectURL(current.url)
      return null
    })
  }

  async function openDoc(m) {
    setOpeningId(m.id)
    try {
      const label = materialLabel(m)
      const kind = m.kind || 'pdf'
      const useOriginal = Boolean(m.has_file) && ['pdf', 'docx', 'pptx'].includes(kind)
      const { blob, filename } = useOriginal
        ? await api.fetchMaterialFile(m.id, m.name || label)
        : await api.fetchMaterialPreview(m.id)
      const url = URL.createObjectURL(blob)
      setViewer((current) => {
        if (current?.url) URL.revokeObjectURL(current.url)
        return {
          mode: useOriginal && kind !== 'pdf' ? 'file' : 'pdf',
          kind,
          title: label,
          subtitle: [
            materialKindLabel(kind),
            m.name && label !== m.name ? `Original: ${m.name}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          url,
          filename,
        }
      })
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not open this document.', {
        type: 'error',
      })
    } finally {
      setOpeningId(null)
    }
  }

  function onRename(m) {
    const current = materialLabel(m)
    const { base, ext } = splitNameExt(current)
    let nextBase = base
    openModal(
      <>
        <h3>Rename for you</h3>
        <p className="small" style={{ marginTop: -4 }}>
          Only you see this name. Other users still see the original file name.
        </p>
        <Field id={`s-rename-cur-${m.id}`} label="Current name">
          <input id={`s-rename-cur-${m.id}`} value={m.name || current} readOnly disabled />
        </Field>
        <Field
          id={`s-rename-new-${m.id}`}
          label="New name"
          hint={ext ? `Extension ${ext} stays attached.` : null}
        >
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <input
              id={`s-rename-new-${m.id}`}
              className="inp"
              defaultValue={base}
              autoFocus
              onChange={(e) => {
                nextBase = e.target.value
              }}
              style={{ flex: 1, minWidth: 0 }}
            />
            {ext ? (
              <span className="small" style={{ flexShrink: 0 }}>
                {ext}
              </span>
            ) : null}
          </div>
        </Field>
        <div className="acts">
          <button type="button" className="btn" onClick={closeModal}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={async () => {
              const name = `${(nextBase || '').trim()}${ext}`.trim()
              if (!name) {
                toast('Enter a name.', { type: 'error' })
                return
              }
              try {
                const updated = await api.putMaterialAlias(m.id, name)
                onMaterialsChange?.(
                  list.map((row) => (row.id === m.id ? { ...row, ...updated } : row)),
                )
                toast('Name updated for you')
                closeModal()
              } catch (err) {
                toast(err instanceof ApiError ? err.message : 'Could not rename.', {
                  type: 'error',
                })
              }
            }}
          >
            Save
          </button>
        </div>
      </>,
    )
  }

  if (!list.length) {
    return <EmptyState>No material yet</EmptyState>
  }

  return (
    <>
      <div className="panel">
        {list.map((m) => (
          <div className="lrow" key={m.id}>
            <div className="grow">
              <b title={materialLabel(m)}>{materialLabel(m)}</b>
              <div className="small">
                {materialKindLabel(m.kind)}
                {m.created_at
                  ? ` · added ${formatSubmittedAt(m.created_at).split(',')[0] || ''}`
                  : ''}
              </div>
            </div>
            <div className="lrow-actions">
              <button
                type="button"
                className={`btn small${openingId === m.id ? ' busy' : ''}`}
                disabled={openingId === m.id}
                onClick={() => openDoc(m)}
              >
                {openingId === m.id ? 'Opening…' : 'View'}
              </button>
              <button type="button" className="btn small" onClick={() => onRename(m)}>
                Rename
              </button>
              <Link
                className="btn small"
                to={`/app/student/study?doc=${encodeURIComponent(m.id)}`}
              >
                Ask the assistant
              </Link>
            </div>
          </div>
        ))}
      </div>
      {viewer?.mode === 'file' ? (
        <FileAttachmentViewer
          title={viewer.title}
          subtitle={viewer.subtitle}
          filename={viewer.filename}
          kindLabel={materialKindLabel(viewer.kind)}
          url={viewer.url}
          onClose={closeViewer}
          onDownload={() => {
            const a = document.createElement('a')
            a.href = viewer.url
            a.download = viewer.filename || 'material'
            document.body.appendChild(a)
            a.click()
            a.remove()
          }}
        />
      ) : viewer ? (
        <PdfViewer
          title={viewer.title}
          subtitle={viewer.subtitle}
          url={viewer.url}
          onClose={closeViewer}
          onDownload={() => {
            const a = document.createElement('a')
            a.href = viewer.url
            a.download = viewer.filename || 'material.pdf'
            document.body.appendChild(a)
            a.click()
            a.remove()
          }}
        />
      ) : null}
    </>
  )
}

export default function ClassDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'overview'

  const [cls, setCls] = useState(null)
  const [exams, setExams] = useState([])
  const [materials, setMaterials] = useState([])
  const [attempts, setAttempts] = useState([])
  const [classIndex, setClassIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [c, xs, mats, ats, allClasses] = await Promise.all([
        api.getClass(id),
        api.listExams({ class_id: id }),
        api.listMaterials(id),
        api.listMyAttempts(),
        api.listClasses().catch(() => []),
      ])
      setCls(c)
      setExams(xs || [])
      setMaterials(mats || [])
      setAttempts(ats || [])
      const idx = (allClasses || []).findIndex((x) => x.id === id)
      setClassIndex(idx >= 0 ? idx : 0)
    } catch (err) {
      setError(err)
      setCls(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const setTab = (k) => {
    const next = new URLSearchParams(searchParams)
    if (k === 'overview') next.delete('tab')
    else next.set('tab', k)
    setSearchParams(next, { replace: true })
  }

  const attemptByExam = useMemo(() => {
    const m = new Map()
    attempts.forEach((a) => m.set(a.exam_id, a))
    return m
  }, [attempts])

  const available = useMemo(() => {
    return exams.filter((x) => {
      if (x.status !== 'published') return false
      const at = attemptByExam.get(x.id)
      if (at && at.status === 'submitted') return false
      return at?.status === 'in_progress' || ['open', 'none'].includes(windowState(x.opens_at, x.closes_at))
    })
  }, [exams, attemptByExam])

  const released = useMemo(() => {
    return attempts.filter((a) => {
      if (a.status !== 'submitted') return false
      const x = exams.find((e) => e.id === a.exam_id)
      return x && x.released
    })
  }, [attempts, exams])

  const avg = useMemo(() => {
    if (!released.length) return null
    const sum = released.reduce((s, a) => {
      const x = exams.find((e) => e.id === a.exam_id)
      return s + (x ? attemptPercent(a, x) : 0)
    }, 0)
    return Math.round(sum / released.length)
  }, [released, exams])

  if (loading) return <ShellLoading label="Loading class…" />
  if (error) {
    return (
      <ShellError message={error.message || 'Class not found.'} onRetry={load} />
    )
  }
  if (!cls) return <EmptyState>Class not found.</EmptyState>

  const teacher = formatTeacherName()
  const hue = classHue(classIndex)

  let body = null
  if (tab === 'overview') {
    body = (
      <>
        <div className="sgrid">
          <article
            className="scard"
            tabIndex={0}
            onClick={() => setTab('material')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setTab('material')
              }
            }}
          >
            <h3>Material</h3>
            <b className="scard-n">{materials.length}</b>
            <p className="small">View files or ask the study assistant</p>
          </article>
          <article
            className="scard"
            tabIndex={0}
            onClick={() => setTab('exams')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setTab('exams')
              }
            }}
          >
            <h3>Exams</h3>
            <b className="scard-n">{available.length}</b>
            <p className="small">
              {available.length
                ? `Open now: ${available[0].title}`
                : 'Nothing open right now'}
            </p>
            {available.length ? (
              <button
                type="button"
                className="btn primary small"
                onClick={(e) => {
                  e.stopPropagation()
                  navigate(`/app/student/exams/${available[0].id}/take`)
                }}
              >
                Start exam
              </button>
            ) : null}
          </article>
          <article
            className="scard"
            tabIndex={0}
            onClick={() => setTab('results')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setTab('results')
              }
            }}
          >
            <h3>Results</h3>
            <b className="scard-n">{avg == null ? '—' : `${avg}%`}</b>
            <p className="small">
              {released.length
                ? `${released.length} released · see your study plan`
                : 'Released after your teacher reviews answers'}
            </p>
          </article>
        </div>
        <section className="dzone" aria-labelledby="dz-h">
          <div>
            <h3 id="dz-h">Leave this class</h3>
            <p className="small">
              You&apos;ll lose access to its exams and material. Your submitted results are kept.
              You can rejoin with the join code.
            </p>
          </div>
          <button
            type="button"
            className="btn bad"
            onClick={() =>
              toast('Ask your teacher to remove you from this class.', { type: 'error' })
            }
          >
            Leave class…
          </button>
        </section>
      </>
    )
  } else if (tab === 'exams') {
    body = <Exams classId={id} />
  } else if (tab === 'results') {
    body = <Results classId={id} />
  } else if (tab === 'material') {
    body = <StudentMaterials materials={materials} onMaterialsChange={setMaterials} />
  }

  return (
    <>
      <div className="crumb">
        <Link to="/app/student">Home</Link> <span aria-hidden="true">/</span>{' '}
        <Link to={`/app/student/classes/${cls.id}`}>{cls.code}</Link>
      </div>
      <header className="cbanner" style={{ '--hue': hue }}>
        <div>
          <span className="small">
            {cls.code} · {cls.section || '—'} · {teacher}
          </span>
          <h1>{cls.name}</h1>
        </div>
      </header>
      {body}
    </>
  )
}
