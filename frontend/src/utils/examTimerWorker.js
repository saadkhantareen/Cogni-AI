/**
 * Background countdown worker — less throttled than a page setInterval when the
 * tab is hidden, so time-up still fires and the UI can sync on return.
 */

const WORKER_SRC = `
let timerId = null;
self.onmessage = (e) => {
  const data = e.data || {};
  if (data.type === 'stop') {
    if (timerId) clearInterval(timerId);
    timerId = null;
    return;
  }
  if (data.type === 'start') {
    if (timerId) clearInterval(timerId);
    const endMs = Number(data.endMs) || 0;
    const drift = Number(data.drift) || 0;
    const tick = () => {
      const nowCorrected = Date.now() - drift;
      const left = Math.max(0, Math.round((endMs - nowCorrected) / 1000));
      self.postMessage({ left });
    };
    tick();
    timerId = setInterval(tick, 1000);
  }
};
`

export function createExamTimerWorker() {
  try {
    const blob = new Blob([WORKER_SRC], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    const worker = new Worker(url)
    worker._objectUrl = url
    return worker
  } catch {
    return null
  }
}

export function terminateExamTimerWorker(worker) {
  if (!worker) return
  try {
    worker.postMessage({ type: 'stop' })
  } catch {
    /* ignore */
  }
  try {
    worker.terminate()
  } catch {
    /* ignore */
  }
  if (worker._objectUrl) {
    try {
      URL.revokeObjectURL(worker._objectUrl)
    } catch {
      /* ignore */
    }
  }
}
