import BloomTag from './BloomTag'
import Pill from './Pill'
import { Icon } from './IconSprite'

function AiChip({ children = 'AI draft' }) {
  return (
    <span className="chip-ai">
      <Icon name="spark" />
      {children}
    </span>
  )
}

function HumanChip({ children = 'Edited by teacher' }) {
  return (
    <span className="chip-human">
      <Icon name="check" />
      {children}
    </span>
  )
}

/**
 * Question card matching v7 `qCard`.
 * Read-only view now; edit mode lands in F5 (props reserved).
 */
export default function QuestionCard({
  question,
  index = 0,
  editable = false,
  editing = false,
  repeats = false,
  onEdit,
  onRegen,
  onDelete,
}) {
  const q = question || {}
  const type = q.type || 'MCQ'
  const marks = q.marks ?? 0
  const text = q.text || ''
  const opts = q.options || q.opts || []
  const ans = q.answer_index ?? q.ans
  const model = q.model_answer ?? q.model ?? ''
  const bloom = q.bloom
  const topic = q.topic || ''
  const clo = q.clo || ''
  const src = q.source || q.src || ''
  const human = typeof src === 'string' && src.endsWith('*')
  const qid = q.qid || q.id || String(index)

  const tags = (
    <div className="qtags">
      <span className="mono" style={{ color: 'var(--color-muted-foreground)' }}>
        Q{index + 1}
      </span>
      {human ? <HumanChip /> : <AiChip />}
      <Pill tone="p-grey">
        {type} · {marks} marks
      </Pill>
      <BloomTag level={bloom} />
      <span className="small">
        {topic}
        {clo ? ` · ${clo}` : ''}
      </span>
    </div>
  )

  // Edit mode shell for F5 — not wired yet
  if (editable && editing) {
    return (
      <div className="qcard editing" id={`qc-${qid}`} role="group" aria-label={`Editing question ${index + 1}`}>
        <div className="qtop">
          {tags}
          <span className="small" style={{ color: 'var(--color-ring)', fontWeight: 600 }}>
            Editing
          </span>
        </div>
        <p className="small">Edit mode is implemented in a later phase.</p>
      </div>
    )
  }

  return (
    <div className={`qcard ${human ? 'human-card' : 'ai-card'}`} id={`qc-${qid}`}>
      <div className="qtop">
        {tags}
        {editable ? (
          <div className="row" style={{ gap: 6 }}>
            <button
              type="button"
              className="btn small ghost"
              onClick={() => onEdit?.(qid)}
              aria-label={`Edit question ${index + 1}`}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn small ghost"
              onClick={() => onRegen?.(qid)}
              aria-label={`Regenerate question ${index + 1}`}
            >
              Regenerate
            </button>
            <span className="vsep" aria-hidden="true" />
            <button
              type="button"
              className="btn small ghost icon"
              style={{ color: 'var(--color-destructive)' }}
              onClick={() => onDelete?.(qid)}
              aria-label={`Remove question ${index + 1}`}
              title="Remove question"
            >
              <Icon name="trash" className="sm" />
            </button>
          </div>
        ) : null}
      </div>
      <div className="qtext">{text}</div>
      {type === 'MCQ' ? (
        <ul className="opts">
          {opts.map((o, k) => (
            <li key={k} className={k === ans ? 'ans' : ''}>
              <span>
                <span className="mono">{'ABCD'[k]}.</span> {o}
              </span>
              {k === ans ? (
                <span className="ok">
                  <Icon name="check" className="sm" />
                  Correct
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="model">
          <b style={{ color: 'var(--color-muted-foreground)' }}>Model answer:</b> {model}
        </div>
      )}
      <div className="checks" aria-label="Automatic checks">
        <span className="ck">Answerable from source</span>
        {type === 'MCQ' ? (
          <span className="ck">Distractors verified wrong</span>
        ) : (
          <span className="ck">Model answer set</span>
        )}
        <span className="ck">Bloom level confirmed</span>
        {repeats ? (
          <span className="ck w">Used in an earlier paper for this class</span>
        ) : (
          <span className="ck">Not repeated</span>
        )}
      </div>
    </div>
  )
}
