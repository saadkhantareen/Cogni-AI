import { useState } from 'react'
import Field from '../Field'
import { Icon } from '../IconSprite'
import { formatPktRange, isoToPktParts, pktToIso, windowState } from '../../utils/pkTime'

/** Shows when students may sit the paper (PKT) and lets the teacher change it before publishing. */
export default function ExamWindowCard({ exam, canEdit, busy, onSave }) {
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState('')

  const state = windowState(exam.opens_at, exam.closes_at)
  const unpublished = !['published', 'closed'].includes(exam.status)

  function openEditor() {
    const a = isoToPktParts(exam.opens_at)
    const b = isoToPktParts(exam.closes_at)
    setDate(a.date)
    setStart(a.time)
    setEnd(b.time)
    setError('')
    setEditing(true)
  }

  async function save() {
    if (!date || !start || !end) {
      setError('Set the date, start time and end time')
      return
    }
    const opens = pktToIso(date, start)
    const closes = pktToIso(date, end)
    if (!(new Date(closes) > new Date(opens))) {
      setError('End time must be after the start time')
      return
    }
    if ((new Date(closes) - new Date(opens)) / 60000 < exam.duration_min) {
      setError(`The window must be at least ${exam.duration_min} minutes, the length of the paper`)
      return
    }
    try {
      await onSave({ opens_at: opens, closes_at: closes })
      setEditing(false)
    } catch {
      /* the editor shows the error */
    }
  }

  const tone = unpublished && state === 'closed' ? 'red' : 'blue'

  return (
    <div className={`callout ${tone}`} data-testid="exam-window">
      <Icon name="clock" />
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <>
            <b>Exam window (Pakistan time)</b>
            <div className="grid g3" style={{ marginTop: 10 }}>
              <Field id="ew-date" label="Date" error={error}>
                <input id="ew-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field id="ew-start" label="Start time (PKT)">
                <input id="ew-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field id="ew-end" label="End time (PKT)">
                <input id="ew-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </Field>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn primary small" disabled={busy} onClick={save}>
                Save window
              </button>
              <button type="button" className="btn ghost small" disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              {state === 'none' ? (
                <>
                  <b>No exam window.</b> Students can start whenever the paper is published.
                </>
              ) : (
                <>
                  <b>Exam window:</b> {formatPktRange(exam.opens_at, exam.closes_at)}
                  {unpublished && state === 'closed' ? (
                    <> — this time has passed. Set a new window before publishing.</>
                  ) : null}
                </>
              )}
            </div>
            {canEdit ? (
              <button type="button" className="btn ghost small" disabled={busy} onClick={openEditor}>
                {state === 'none' ? 'Set window' : 'Change'}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
