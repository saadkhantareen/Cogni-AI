import { useEffect, useRef, useState } from 'react'
import { Icon } from './IconSprite'

const STEP_MS = 380
const DONE_PAUSE_MS = 250

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Animated LLM pipeline matching v7 `pipeHTML` + `runPipe`.
 * Driven by an async `promise` plus `minDisplayMs` so the UI never flashes.
 *
 * When `promise` is null/undefined the steps stay idle ("Ready").
 * When set, steps animate spinner→check in parallel with the promise;
 * `onDone(result)` fires after both animation and min display time.
 */
export default function PipelineSteps({
  steps = [],
  promise = null,
  minDisplayMs = 2400,
  onDone,
  onError,
  readyLabel = 'Ready',
}) {
  const [status, setStatus] = useState(readyLabel)
  const [active, setActive] = useState(-1) // index currently running; >= length => all done
  const [times, setTimes] = useState([])
  const onDoneRef = useRef(onDone)
  const onErrorRef = useRef(onError)
  onDoneRef.current = onDone
  onErrorRef.current = onError

  useEffect(() => {
    if (promise == null) {
      setStatus(readyLabel)
      setActive(-1)
      setTimes([])
      return undefined
    }

    let cancelled = false
    const started = Date.now()

    async function animate() {
      setTimes([])
      for (let i = 0; i < steps.length; i += 1) {
        if (cancelled) return
        setActive(i)
        setStatus(`Step ${i + 1} of ${steps.length}…`)
        await delay(STEP_MS)
        if (cancelled) return
        setTimes((prev) => {
          const next = prev.slice()
          next[i] = `${(0.3 + Math.random() * 3).toFixed(1)} s`
          return next
        })
      }
      if (cancelled) return
      setActive(steps.length)
      setStatus('Done')
    }

    async function run() {
      let result
      let err
      const work = Promise.resolve(promise).then(
        (r) => {
          result = r
        },
        (e) => {
          err = e
        },
      )

      await Promise.all([animate(), work])
      if (cancelled) return

      const elapsed = Date.now() - started
      if (elapsed < minDisplayMs) await delay(minDisplayMs - elapsed)
      if (cancelled) return
      await delay(DONE_PAUSE_MS)
      if (cancelled) return

      if (err) onErrorRef.current?.(err)
      else onDoneRef.current?.(result)
    }

    run()
    return () => {
      cancelled = true
    }
  }, [promise, steps, minDisplayMs, readyLabel])

  const progress =
    active < 0 ? 0 : Math.round((Math.min(active, steps.length) / Math.max(1, steps.length)) * 100)

  return (
    <div className="pipe">
      <div className="pprog" aria-hidden="true">
        <i style={{ width: `${progress}%` }} />
      </div>
      <span className="sr-only" role="status">
        {status}
      </span>
      {steps.map((label, i) => {
        let cls = 'st wait'
        let dotCls = 'dot'
        let dotInner = null
        if (active > i) {
          cls = 'st'
          dotCls = 'dot ok'
          dotInner = <Icon name="check" />
        } else if (active === i) {
          cls = 'st'
          dotCls = 'dot run'
        }
        return (
          <div key={i} className={cls}>
            <span className={dotCls} aria-hidden="true">
              {dotInner}
            </span>
            <span>{label}</span>
            <span className="small mono">{times[i] || ''}</span>
          </div>
        )
      })}
    </div>
  )
}

export const DEFAULT_GEN_STEPS = [
  'Retrieve topic chunks from material',
  'Generate questions per topic',
  'Check each question is answerable from source',
  'Verify MCQ distractors are wrong',
  'Confirm Bloom level with a second check',
  'Remove duplicates and assemble paper',
]
