import { isMcqQuestion } from '../../utils/teacher'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import * as api from '../../api'
import { ApiError } from '../../api/client'
import { ShellError, ShellLoading } from '../../components/AppShell'
import { Icon } from '../../components/IconSprite'
import { useModal } from '../../components/Modal'
import PageTop from '../../components/PageTop'
import Pill from '../../components/Pill'
import { useToast } from '../../components/Toast'
import { formatPkt, formatPktRange, windowState } from '../../utils/pkTime'
import useExamLock, {
  exitExamFullscreen,
  requestExamFullscreen,
} from '../../hooks/useExamLock'
import {
  createExamTimerWorker,
  terminateExamTimerWorker,
} from '../../utils/examTimerWorker'
import {
  answeredCount,
  formatMmSs,
  isAnswered,
  secondsLeft,
  unansweredIndexes,
  wordCount,
} from '../../utils/student'

const SAVE_DEBOUNCE_MS = 800
const LETTERS = 'ABCD'

/** Self-ticking exit confirm — timer never pauses while this is open. */
function ExitExamModal({
  deadline,
  serverNow,
  receivedAt,
  submitting,
  onKeepWorking,
  onForfeit,
}) {
  const [modalLeft, setModalLeft] = useState(() =>
    secondsLeft(deadline, serverNow, receivedAt),
  )

  useEffect(() => {
    const tick = () => setModalLeft(secondsLeft(deadline, serverNow, receivedAt))
    tick()
    const id = setInterval(tick, 250)
    const onVis = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [deadline, serverNow, receivedAt])

  return (
    <>
      <h3>Exit exam?</h3>
      <p className="small">
        <b>The timer keeps running</b>
        {deadline ? (
          <>
            {' '}
            — time left: <b className="num">{formatMmSs(modalLeft)}</b>.
          </>
        ) : (
          '.'
        )}{' '}
        Leaving now will <b>submit your answers and use up your only attempt</b>. You will not be
        able to retake this exam.
      </p>
      <div className="acts">
        <button type="button" className="btn" onClick={onKeepWorking}>
          Keep working
        </button>
        <button
          type="button"
          className="btn danger"
          disabled={submitting}
          onClick={onForfeit}
        >
          Exit and forfeit attempt
        </button>
      </div>
    </>
  )
}

/** Phones like the iPhone can't lock a page into fullscreen, so the exam can't run there. */
function fullscreenSupported() {
  if (typeof document === 'undefined') return false
  return Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled)
}

/** Shown instead of the paper whenever the student is outside the fullscreen lock. */
function ExamLockScreen({ reopened, violations, timerText, busy, onReturn, error }) {
  const warned = violations >= 1
  return (
    <div className="exam-lockscreen" role="alertdialog" aria-labelledby="lock-h" aria-describedby="lock-d">
      <div className="exam-lockscreen-box">
        <Icon name="warn" />
        <h1 id="lock-h">{reopened ? 'Your exam was reopened' : 'You left the exam'}</h1>
        <p id="lock-d">
          {reopened
            ? 'Reloading or closing the exam page counts as leaving it. '
            : 'Leaving fullscreen or switching to another tab or window is not allowed. '}
          {warned ? (
            <b>
              This is your only warning. If you leave again, your answers are submitted automatically
              and you cannot continue.
            </b>
          ) : (
            <b>Return to fullscreen to continue.</b>
          )}
        </p>
        <p className="small">
          The timer keeps running: <b className="num">{timerText}</b> left.
        </p>
        {error ? (
          <div className="callout red" role="alert">
            <Icon name="alert" />
            <div>{error}</div>
          </div>
        ) : null}
        <button type="button" className="btn primary" disabled={busy} onClick={onReturn}>
          Return to fullscreen and continue
        </button>
      </div>
    </div>
  )
}

function SaveStatus({ status }) {
  if (status === 'saving') {
    return (
      <span className="saved" role="status">
        Saving…
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="saved" role="status" style={{ color: 'var(--color-destructive)' }}>
        Not saved, retrying
      </span>
    )
  }
  if (status === 'saved') {
    return (
      <span className="saved" role="status">
        <Icon name="check" className="sm" />
        <span>Saved</span>
      </span>
    )
  }
  return null
}

export default function TakeExam() {
  const { id: examId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const qIndex = Math.max(0, parseInt(searchParams.get('q') || '0', 10) || 0)
  const navigate = useNavigate()
  const toast = useToast()
  const { openModal, closeModal } = useModal()

  const [exam, setExam] = useState(null)
  const [cls, setCls] = useState(null)
  const [attempt, setAttempt] = useState(null)
  const [answers, setAnswers] = useState({})
  const [deadline, setDeadline] = useState(null)
  const [serverNow, setServerNow] = useState(null)
  const [receivedAt, setReceivedAt] = useState(null)
  const [left, setLeft] = useState(null)
  const [phase, setPhase] = useState('loading') // loading | before | taking | submitted | closed | error
  const [error, setError] = useState(null)
  const [saveStatus, setSaveStatus] = useState('') // '' | saving | saved | error
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false)
  const [submitting, setSubmitting] = useState(false)
  const [starting, setStarting] = useState(false)
  const [fsError, setFsError] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // Questions are hidden while the student is outside the lock or must re-enter fullscreen.
  const [leaveWarning, setLeaveWarning] = useState(false)
  const [needsFullscreen, setNeedsFullscreen] = useState(false)
  const [violations, setViolations] = useState(0)

  const answersRef = useRef({})
  const attemptRef = useRef(null)
  const saveTimers = useRef({})
  const saveChains = useRef({})
  const warnedRef = useRef({})
  const submittingRef = useRef(false)
  const titleRef = useRef(null)
  const lockPayloadRef = useRef(() => ({ violation_count: 0, integrity_events: [] }))
  const disarmRef = useRef(() => {})
  const reenterFsRef = useRef(async () => false)
  const exitModalOpenRef = useRef(false)
  const skipReenterOnCloseRef = useRef(false)
  const askExitRef = useRef(() => {})
  const violationsRef = useRef(0)
  const handleLeaveRef = useRef(() => {})
  const timerWorkerRef = useRef(null)
  const doSubmitRef = useRef(() => {})
  const endExamRef = useRef(() => {})
  const toastRef = useRef(toast)
  const closeModalRef = useRef(closeModal)

  useEffect(() => {
    toastRef.current = toast
  }, [toast])
  useEffect(() => {
    closeModalRef.current = closeModal
  }, [closeModal])

  useEffect(() => {
    answersRef.current = answers
  }, [answers])
  useEffect(() => {
    attemptRef.current = attempt
  }, [attempt])

  const questions = exam?.questions || []
  const qi = Math.min(qIndex, Math.max(0, questions.length - 1))
  const q = questions[qi]
  const answered = answeredCount(questions, answers)

  const goQ = useCallback(
    (i) => {
      const next = new URLSearchParams(searchParams)
      next.set('q', String(Math.max(0, i)))
      setSearchParams(next, { replace: true })
      requestAnimationFrame(() => titleRef.current?.focus())
    },
    [searchParams, setSearchParams],
  )

  const endExam = useCallback(
    async ({ endReason, toastMsg, forfeit = false }) => {
      if (submittingRef.current) return
      const at = attemptRef.current
      if (!at || at.status === 'submitted') return
      submittingRef.current = true
      setSubmitting(true)
      disarmRef.current()
      try {
        Object.values(saveTimers.current).forEach((t) => clearTimeout(t))
        saveTimers.current = {}
        await Promise.all(
          Object.entries(answersRef.current).map(async ([qid, value]) => {
            try {
              await api.putAttemptAnswer(at.id, qid, value)
            } catch {
              /* best effort */
            }
          }),
        )
        const integrity = lockPayloadRef.current()
        if (forfeit) {
          await api.forfeitAttempt(at.id, {
            reason: 'exit',
            ...integrity,
          })
        } else {
          await api.submitAttempt(at.id, {
            end_reason: endReason || 'manual',
            ...integrity,
          })
        }
        try {
          await exitExamFullscreen()
        } catch {
          /* ignore */
        }
        setPhase('submitted')
        toast(toastMsg || 'Exam submitted')
        navigate(`/app/student/attempts/${at.id}/done`, { replace: true })
      } catch (err) {
        submittingRef.current = false
        setSubmitting(false)
        toast(err instanceof ApiError ? err.message : 'Could not submit. Try again.', {
          type: 'error',
        })
      }
    },
    [navigate, toast],
  )

  const doSubmit = useCallback(
    (auto) =>
      endExam({
        endReason: auto ? 'time_up' : 'manual',
        toastMsg: auto ? 'Time is up. Your answers have been submitted.' : 'Exam submitted',
        forfeit: false,
      }),
    [endExam],
  )

  useEffect(() => {
    doSubmitRef.current = doSubmit
  }, [doSubmit])
  useEffect(() => {
    endExamRef.current = endExam
  }, [endExam])

  const askExit = useCallback(
    (leaveEvt) => {
      if (!exam || !attemptRef.current || submittingRef.current) return
      if (exitModalOpenRef.current) return
      exitModalOpenRef.current = true

      const keepWorking = async () => {
        skipReenterOnCloseRef.current = true
        closeModal()
        exitModalOpenRef.current = false
        const ok = await reenterFsRef.current()
        if (!ok) {
          toast('Could not return to fullscreen. Allow it and try again.', { type: 'error' })
          askExitRef.current(leaveEvt || { type: 'manual_retry' })
        }
      }

      const forfeit = () => {
        skipReenterOnCloseRef.current = true
        closeModal()
        exitModalOpenRef.current = false
        endExam({
          endReason: 'exit',
          toastMsg: 'You exited the exam. Your attempt has been submitted.',
          forfeit: true,
        })
      }

      openModal(
        <ExitExamModal
          deadline={deadline}
          serverNow={serverNow}
          receivedAt={receivedAt}
          submitting={submitting}
          onKeepWorking={keepWorking}
          onForfeit={forfeit}
        />,
        {
          dismissOnBackdrop: false,
          onClose: () => {
            exitModalOpenRef.current = false
            if (skipReenterOnCloseRef.current) {
              skipReenterOnCloseRef.current = false
              return
            }
            void reenterFsRef.current()
          },
        },
      )
    },
    [
      exam,
      openModal,
      closeModal,
      endExam,
      submitting,
      toast,
      deadline,
      serverNow,
      receivedAt,
    ],
  )

  useEffect(() => {
    askExitRef.current = askExit
  }, [askExit])

  /* Leaving fullscreen / the tab / the window: hide the paper and let the server count it.
     The first leave is a warning; the server submits the attempt on the second. */
  const handleLeave = useCallback(
    async (evt) => {
      const at = attemptRef.current
      if (!at || submittingRef.current) return
      setLeaveWarning(true)
      if (violationsRef.current >= 1) {
        // This leave ends the exam: save the latest answers before the server grades them.
        Object.values(saveTimers.current).forEach((t) => clearTimeout(t))
        saveTimers.current = {}
        await Promise.all(
          Object.entries(answersRef.current).map(([qid, value]) =>
            api.putAttemptAnswer(at.id, qid, value).catch(() => {}),
          ),
        )
      }
      let res
      try {
        res = await api.reportExamLeave(at.id, evt?.type || 'tab_hide')
      } catch {
        return // offline: stay locked; reopening the exam is counted by the server anyway
      }
      violationsRef.current = res.violation_count
      setViolations(res.violation_count)
      if (res.status === 'submitted') {
        submittingRef.current = true
        setSubmitting(true)
        disarmRef.current()
        try {
          await exitExamFullscreen()
        } catch {
          /* ignore */
        }
        setPhase('submitted')
        toast('You left the exam a second time, so your answers were submitted.', { type: 'error' })
        navigate(`/app/student/attempts/${at.id}/done`, { replace: true })
      }
    },
    [navigate, toast],
  )

  useEffect(() => {
    handleLeaveRef.current = handleLeave
  }, [handleLeave])

  const onLeaveLock = useCallback((evt) => {
    handleLeaveRef.current(evt)
  }, [])

  const lock = useExamLock({
    active: phase === 'taking' && !submitting && !needsFullscreen,
    onLeave: onLeaveLock,
  })

  useEffect(() => {
    lockPayloadRef.current = lock.getIntegrityPayload
    disarmRef.current = lock.disarm
    reenterFsRef.current = lock.reenterFullscreen
  }, [lock.getIntegrityPayload, lock.disarm, lock.reenterFullscreen])

  const load = useCallback(async () => {
    setPhase('loading')
    setError(null)
    try {
      const x = await api.getExam(examId)
      setExam(x)
      try {
        const c = await api.getClass(x.class_id)
        setCls(c)
      } catch {
        setCls(null)
      }

      if (x.status !== 'published') {
        setPhase('closed')
        return
      }

      const mine = await api.listMyAttempts({ exam_id: examId })
      const existing = (mine || []).find((a) => a.exam_id === examId) || (mine || [])[0]

      if (existing?.status === 'submitted') {
        setAttempt(existing)
        setPhase('submitted')
        return
      }

      if (existing?.status === 'in_progress') {
        const started = await api.startAttempt(examId)
        const now = Date.now()
        violationsRef.current = started.violation_count || 0
        setViolations(started.violation_count || 0)
        setNeedsFullscreen(true) // a reloaded page is never in fullscreen
        setAttempt(started)
        setAnswers({ ...(started.answers || {}) })
        setDeadline(started.deadline)
        setServerNow(started.server_now)
        setReceivedAt(now)
        setPhase('taking')
        return
      }

      setPhase('before')
    } catch (err) {
      setError(err)
      setPhase('error')
    }
  }, [examId])

  useEffect(() => {
    load()
  }, [load])

  /* exam-mode body class */
  useEffect(() => {
    const on = phase === 'taking'
    document.body.classList.toggle('exam-mode', on)
    return () => document.body.classList.remove('exam-mode')
  }, [phase])

  /* online / offline */
  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  /* Warn on hard tab close; do not auto-forfeit on refresh (resume + re-lock). */
  useEffect(() => {
    if (phase !== 'taking') return undefined
    const onBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [phase])

  /* Block in-app link navigation while locked (sidebar is CSS-hidden; crumbs/other links) */
  useEffect(() => {
    if (phase !== 'taking') return undefined
    const onClick = (e) => {
      const a = e.target.closest?.('a[href]')
      if (!a) return
      const href = a.getAttribute('href') || ''
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return
      if (href.includes(`/exams/${examId}/take`)) return
      e.preventDefault()
      e.stopPropagation()
      askExit()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
    // askExit is stable enough via refs; eslint intentionally omitted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, examId])

  /* countdown timer — Worker + visibility sync; never gated on modal/hidden */
  useEffect(() => {
    if (phase !== 'taking' || !deadline || !serverNow || !receivedAt) return undefined

    const applyLeft = (s) => {
      setLeft(s)
      const at = attemptRef.current
      if (!at) return
      const w = warnedRef.current
      ;[
        [300, '5 minutes left'],
        [60, '1 minute left'],
      ].forEach(([thresh, msg]) => {
        const k = `${at.id}-${thresh}`
        if (s <= thresh && s > 0 && !w[k]) {
          w[k] = 1
          toastRef.current(`${msg}. Your answers are saved.`)
        }
      })
      if (s <= 0) {
        doSubmitRef.current(true)
      }
    }

    const tick = () => applyLeft(secondsLeft(deadline, serverNow, receivedAt))

    const endMs = new Date(deadline).getTime()
    const server = new Date(serverNow).getTime()
    const drift = receivedAt - server

    terminateExamTimerWorker(timerWorkerRef.current)
    timerWorkerRef.current = null
    let fallbackId = null

    const worker = createExamTimerWorker()
    if (worker) {
      timerWorkerRef.current = worker
      worker.onmessage = (e) => {
        const s = e?.data?.left
        if (typeof s === 'number') applyLeft(s)
      }
      worker.postMessage({ type: 'start', endMs, drift })
    } else {
      tick()
      fallbackId = setInterval(tick, 1000)
    }

    const onVis = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVis)
    tick()

    return () => {
      document.removeEventListener('visibilitychange', onVis)
      if (fallbackId) clearInterval(fallbackId)
      terminateExamTimerWorker(timerWorkerRef.current)
      timerWorkerRef.current = null
    }
  }, [phase, deadline, serverNow, receivedAt])

  const persistAnswer = useCallback(
    async (qid, value) => {
      const at = attemptRef.current
      if (!at || at.status === 'submitted') return
      const run = async () => {
        setSaveStatus('saving')
        try {
          const updated = await api.putAttemptAnswer(at.id, qid, value)
          setAttempt(updated)
          setSaveStatus('saved')
        } catch (err) {
          setSaveStatus('error')
          await new Promise((r) => setTimeout(r, 1200))
          try {
            const updated = await api.putAttemptAnswer(at.id, qid, value)
            setAttempt(updated)
            setSaveStatus('saved')
          } catch {
            setSaveStatus('error')
            toast(
              err instanceof ApiError ? err.message : 'Could not save answer. Check your connection.',
              { type: 'error' },
            )
          }
        }
      }
      const prev = saveChains.current[qid] || Promise.resolve()
      saveChains.current[qid] = prev.then(run, run)
      return saveChains.current[qid]
    },
    [toast],
  )

  const scheduleSave = useCallback(
    (qid, value) => {
      clearTimeout(saveTimers.current[qid])
      setSaveStatus('saving')
      saveTimers.current[qid] = setTimeout(() => {
        persistAnswer(qid, value)
      }, SAVE_DEBOUNCE_MS)
    },
    [persistAnswer],
  )

  function setAnswerLocal(qid, value) {
    setAnswers((prev) => {
      const next = { ...prev, [qid]: value }
      answersRef.current = next
      return next
    })
    scheduleSave(qid, value)
  }

  async function onStart() {
    setStarting(true)
    setFsError('')
    try {
      try {
        await requestExamFullscreen()
      } catch {
        setFsError(
          'Fullscreen is required to start. Allow fullscreen, or use a desktop browser that supports it.',
        )
        setStarting(false)
        return
      }
      const started = await api.startAttempt(examId)
      const now = Date.now()
      violationsRef.current = started.violation_count || 0
      setViolations(started.violation_count || 0)
      setLeaveWarning(false)
      setNeedsFullscreen(false)
      setAttempt(started)
      setAnswers({ ...(started.answers || {}) })
      setDeadline(started.deadline)
      setServerNow(started.server_now)
      setReceivedAt(now)
      setPhase('taking')
      goQ(0)
      toast(`Exam started. You have ${exam.duration_min} minutes. Stay in fullscreen.`)
    } catch (err) {
      try {
        await exitExamFullscreen()
      } catch {
        /* ignore */
      }
      toast(err instanceof ApiError ? err.message : 'Could not start the exam.', { type: 'error' })
    } finally {
      setStarting(false)
    }
  }

  async function returnToExam() {
    setFsError('')
    if (needsFullscreen) {
      try {
        await requestExamFullscreen()
      } catch {
        setFsError('Allow fullscreen to continue the exam.')
        return
      }
      setNeedsFullscreen(false)
      setLeaveWarning(false)
      return
    }
    const ok = await lock.reenterFullscreen()
    if (ok) setLeaveWarning(false)
    else setFsError('Allow fullscreen to continue the exam.')
  }

  /* re-check the exam window while the student waits on the start screen */
  useEffect(() => {
    if (phase !== 'before') return undefined
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [phase])

  function askSubmit() {
    if (!exam || !attempt || submittingRef.current) return
    const un = unansweredIndexes(questions, answersRef.current)
    const answeredN = questions.length - un.length
    openModal(
      <>
        <h3>Submit {exam.title}?</h3>
        <p className="small">
          {answeredN} of {questions.length} questions answered.{' '}
          {un.length ? (
            <b style={{ color: 'var(--color-destructive)' }}>
              Not answered: {un.map(([, i]) => `Q${i + 1}`).join(', ')}.
            </b>
          ) : null}{' '}
          You can&apos;t change answers after submitting.
        </p>
        {un.length ? (
          <div className="row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn small"
              onClick={() => {
                closeModal()
                goQ(un[0][1])
              }}
            >
              Go to Q{un[0][1] + 1}
            </button>
          </div>
        ) : null}
        <div className="acts">
          <button type="button" className="btn" onClick={closeModal}>
            Keep working
          </button>
          <button
            type="button"
            className="btn good"
            disabled={submitting}
            onClick={() => {
              closeModal()
              doSubmit(false)
            }}
          >
            Submit exam
          </button>
        </div>
      </>,
    )
  }

  const crumb = useMemo(() => {
    if (!cls || phase === 'taking') return null
    return (
      <>
        <Link to="/app/student">Home</Link> <span aria-hidden="true">/</span>{' '}
        <Link to={`/app/student/classes/${cls.id}`}>{cls.code}</Link>{' '}
        <span aria-hidden="true">/</span>{' '}
        <Link to={`/app/student/classes/${cls.id}?tab=exams`}>Exams</Link>
      </>
    )
  }, [cls, phase])

  if (phase === 'loading') return <ShellLoading label="Loading exam…" />
  if (phase === 'error') {
    return (
      <ShellError message={error?.message || 'Exam not found.'} onRetry={load} />
    )
  }
  if (!exam) return <ShellError message="Exam not found." onRetry={load} />

  if (phase === 'submitted') {
    return (
      <>
        <PageTop crumb={crumb} title={exam.title} />
        <div className="panel panel-b">
          You&apos;ve already submitted this exam.{' '}
          <Link className="btn small" to="/app/student/exams">
            My exams
          </Link>
        </div>
      </>
    )
  }

  if (phase === 'closed') {
    return (
      <>
        <PageTop crumb={crumb} title={exam.title} />
        <div className="panel panel-b">
          This exam is not open. It may have been closed by your teacher.
        </div>
      </>
    )
  }

  if (phase === 'before') {
    const counts = {}
    questions.forEach((qq) => {
      const label = qq.type || (isMcqQuestion(qq) ? 'MCQ' : 'Written')
      counts[label] = (counts[label] || 0) + 1
    })
    const mix = Object.entries(counts)
      .map(([label, n]) => `${n} ${label}`)
      .join(', ')
    const maxMarks = questions.reduce((s, qq) => s + (Number(qq.marks) || 0), 0)
    const win = windowState(exam.opens_at, exam.closes_at, now)
    const canFullscreen = fullscreenSupported()
    const canStart = agreed && canFullscreen && (win === 'open' || win === 'none')

    return (
      <>
        <PageTop crumb={crumb} title={exam.title} />
        <div className="panel" style={{ maxWidth: 680 }}>
          <div className="panel-b">
            <h2 style={{ fontSize: 20, marginBottom: 6 }}>Before you start</h2>
            <p style={{ color: 'var(--color-muted-foreground)', margin: '0 0 16px' }}>
              {exam.kind}
            </p>
            <div className="grid g3" style={{ gap: 10, marginBottom: 18 }}>
              <div className="sg">
                <span>Time limit</span>
                <b>{exam.duration_min} min</b>
              </div>
              <div className="sg">
                <span>Questions</span>
                <b>{questions.length}</b>
              </div>
              <div className="sg">
                <span>Total marks</span>
                <b>{maxMarks}</b>
              </div>
            </div>
            {win !== 'none' ? (
              <div className={`callout ${win === 'open' ? 'green' : win === 'closed' ? 'red' : 'blue'}`}>
                <Icon name="clock" />
                <div>
                  <b>Exam window:</b> {formatPktRange(exam.opens_at, exam.closes_at)}.{' '}
                  {win === 'upcoming' ? <>It opens at {formatPkt(exam.opens_at)}.</> : null}
                  {win === 'open' ? (
                    <>Everything is submitted when the window closes, even if your time limit isn&apos;t up.</>
                  ) : null}
                  {win === 'closed' ? <>This window has ended, so the exam can no longer be started.</> : null}
                </div>
              </div>
            ) : null}
            <p style={{ margin: '0 0 14px', color: 'var(--color-muted-foreground)' }}>{mix}.</p>

            <section className="exam-rules" aria-labelledby="rules-h">
              <h3 id="rules-h">
                <Icon name="warn" /> Read before you start
              </h3>
              <ul>
                <li>
                  The exam runs in <b>fullscreen</b>. Do not leave it until you submit.
                </li>
                <li>
                  <b>Leaving fullscreen, switching tabs or switching windows</b> hides the paper. The{' '}
                  <b>first time is your only warning</b>.
                </li>
                <li>
                  <b>The second time, your answers are submitted automatically</b> and you cannot
                  continue or retake the exam.
                </li>
                <li>
                  <b>Reloading or closing this page counts as leaving.</b>
                </li>
                <li>
                  The timer never pauses. You have <b>{exam.duration_min} minutes</b>
                  {win !== 'none' ? ', and everything ends when the exam window closes' : ''}.
                </li>
                <li>Answers save automatically and are submitted when time runs out.</li>
                <li>
                  Written answers must be your own. They are checked for AI-generated text and
                  reviewed by your teacher.
                </li>
              </ul>
              <label className="exam-agree" htmlFor="exam-agree">
                <input
                  id="exam-agree"
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>I have read these rules and understand that leaving the exam twice submits it.</span>
              </label>
            </section>

            {!canFullscreen ? (
              <div className="callout red" role="alert" style={{ marginBottom: 14 }}>
                <Icon name="alert" />
                <div>
                  <b>This device can&apos;t run the exam.</b> Use a laptop or desktop browser (Chrome or
                  Edge) for this exam.
                </div>
              </div>
            ) : null}
            {fsError ? (
              <div className="callout red" role="alert" style={{ marginBottom: 14 }}>
                <Icon name="alert" />
                <div>{fsError}</div>
              </div>
            ) : null}
            <div className="row">
              <button
                type="button"
                className="btn good"
                style={{ minHeight: 48, paddingInline: 22 }}
                disabled={starting || !canStart}
                onClick={onStart}
              >
                <Icon name="clock" className="sm" />
                {starting ? 'Starting…' : 'Start exam'}
              </button>
              <Link className="btn ghost" to="/app/student/exams">
                Not now
              </Link>
            </div>
          </div>
        </div>
      </>
    )
  }

  /* taking */
  if (leaveWarning || needsFullscreen) {
    return (
      <ExamLockScreen
        reopened={needsFullscreen}
        violations={violations}
        timerText={left == null ? '--:--' : formatMmSs(left)}
        busy={submitting}
        error={fsError}
        onReturn={returnToExam}
      />
    )
  }
  if (!q) {
    return <ShellError message="This exam has no questions." />
  }

  const a = answers[q.qid]
  const last = qi === questions.length - 1
  const wc = wordCount(a)
  const low = left != null && left < 300
  const timerText = left == null ? '--:--' : formatMmSs(left)

  return (
    <>
      <PageTop title={exam.title} />

      {offline ? (
        <div className="callout red" role="status">
          <Icon name="alert" />
          <div>
            <b>You are offline.</b> Answers will retry when your connection returns. Do not close
            this tab.
          </div>
        </div>
      ) : null}

      <div className="exambar" role="region" aria-label="Exam status">
        <div className="tl">
          <Icon name="clock" />
          <div>
            <div className="small" style={{ lineHeight: 1.2 }}>
              Time left
            </div>
            <div
              className={`timer num${low ? ' low' : ''}`}
              id="timer"
              role="timer"
              aria-live="off"
            >
              {timerText}
            </div>
          </div>
        </div>
        <div className="prog">
          <div className="small">
            <b style={{ color: 'var(--color-foreground)' }} id="ans-count">
              {answered} of {questions.length}
            </b>{' '}
            answered
            <span className="hide-sm"> · fullscreen lock</span>
          </div>
          <div className="bar" aria-hidden="true">
            <i
              id="ans-bar"
              style={{
                width: `${questions.length ? Math.round((answered / questions.length) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
        <button
          type="button"
          className="btn ghost"
          disabled={submitting}
          onClick={askExit}
        >
          Exit exam
        </button>
        <button
          type="button"
          className="btn good"
          disabled={submitting}
          onClick={askSubmit}
        >
          Submit exam…
        </button>
      </div>

      <div className="exam">
        <section className="panel" aria-labelledby="q-title">
          <div className="panel-h">
            <h2
              id="q-title"
              ref={titleRef}
              tabIndex={-1}
              style={{ fontSize: 17 }}
            >
              Question {qi + 1} of {questions.length}
            </h2>
            <Pill
              label={`${
                isMcqQuestion(q) ? 'Multiple choice' : q.type || 'Written'
              } · ${q.marks} marks`}
              tone="p-grey"
            />
          </div>
          <div className="panel-b">
            <p
              id="q-text"
              style={{
                fontSize: 17,
                fontWeight: 500,
                margin: '0 0 18px',
                maxWidth: '68ch',
              }}
            >
              {q.text}
            </p>

            {isMcqQuestion(q) ? (
              <>
                <div role="radiogroup" aria-labelledby="q-text">
                  {(q.options || []).map((o, k) => {
                    const sel = a === k
                    const tab = a == null ? k === 0 : sel
                    return (
                      <div
                        key={k}
                        className={`choice${sel ? ' sel' : ''}`}
                        role="radio"
                        aria-checked={sel}
                        tabIndex={tab ? 0 : -1}
                        onClick={() => setAnswerLocal(q.qid, k)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setAnswerLocal(q.qid, k)
                          }
                          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                            e.preventDefault()
                            const next = Math.min((q.options || []).length - 1, k + 1)
                            setAnswerLocal(q.qid, next)
                          }
                          if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                            e.preventDefault()
                            const prev = Math.max(0, k - 1)
                            setAnswerLocal(q.qid, prev)
                          }
                        }}
                      >
                        <span className="k" aria-hidden="true">
                          {LETTERS[k]}
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
                <p className="small" style={{ margin: '4px 0 0' }}>
                  Tip: use the arrow keys to move between options.
                </p>
              </>
            ) : (
              <>
                <label htmlFor="ans" className="sr-only">
                  Your answer to question {qi + 1}
                </label>
                <textarea
                  className="answerbox"
                  id="ans"
                  value={a == null ? '' : String(a)}
                  placeholder="Write your answer in your own words…"
                  onChange={(e) => setAnswerLocal(q.qid, e.target.value)}
                />
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="small" id="wc">
                    {wc} word{wc === 1 ? '' : 's'}
                  </span>
                  <span className="sp" />
                  <SaveStatus status={saveStatus} />
                </div>
              </>
            )}

            <div className="row mt">
              <button
                type="button"
                className="btn"
                disabled={qi === 0}
                onClick={() => goQ(qi - 1)}
              >
                <Icon name="left" className="sm" />
                Previous
              </button>
              <span className="sp" />
              {!last ? (
                <button type="button" className="btn primary" onClick={() => goQ(qi + 1)}>
                  Next <Icon name="right" className="sm" />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn good"
                  disabled={submitting}
                  onClick={askSubmit}
                >
                  Review and submit…
                </button>
              )}
            </div>
          </div>
        </section>

        <aside
          className="panel panel-b sticky"
          style={{ top: 'calc(var(--topbar-h) + 100px)' }}
          aria-label="Question navigator"
        >
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Questions</h3>
          <div className="qnav">
            {questions.map((qq, j) => {
              const done = isAnswered(answers[qq.qid])
              return (
                <button
                  key={qq.qid}
                  type="button"
                  className={`${done ? 'done' : ''} ${j === qi ? 'cur' : ''}`.trim()}
                  aria-label={`Question ${j + 1}, ${done ? 'answered' : 'not answered'}`}
                  aria-current={j === qi ? 'step' : undefined}
                  onClick={() => goQ(j)}
                >
                  {j + 1}
                </button>
              )
            })}
          </div>
          <div className="legend" aria-hidden="true">
            <span>
              <i className="d" />
              Answered
            </span>
            <span>
              <i className="c" />
              Current
            </span>
            <span>
              <i />
              Not answered
            </span>
          </div>
        </aside>
      </div>
    </>
  )
}
