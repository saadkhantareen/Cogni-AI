import { useEffect } from 'react'

/**
 * Classroom-style open dialog for non-PDF originals (DOCX / PPTX).
 * Browsers cannot inline Office files reliably, so we offer Open / Download
 * while still showing the real filename + extension.
 */
export default function FileAttachmentViewer({
  title,
  subtitle,
  filename,
  kindLabel,
  url,
  onClose,
  onDownload,
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const ext = (filename || '').includes('.')
    ? filename.split('.').pop().toUpperCase()
    : (kindLabel || 'FILE').toUpperCase()

  return (
    <div
      className="pdf-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Document'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="pdf-viewer-card" style={{ maxWidth: 480, height: 'auto' }}>
        <div className="pdf-viewer-bar">
          <div className="pdf-viewer-meta">
            <b className="pdf-viewer-title">{title || 'Document'}</b>
            {subtitle ? <span className="pdf-viewer-sub small">{subtitle}</span> : null}
          </div>
          <button type="button" className="btn small primary" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="pdf-viewer-body" style={{ padding: 28, display: 'grid', placeItems: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 320 }}>
            <div
              aria-hidden="true"
              style={{
                width: 72,
                height: 88,
                margin: '0 auto 16px',
                borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'var(--panel)',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                letterSpacing: 0.04,
                fontSize: 14,
                color: 'var(--accent)',
              }}
            >
              {ext}
            </div>
            <b style={{ display: 'block', wordBreak: 'break-word' }}>{filename || title}</b>
            <p className="small" style={{ marginTop: 8 }}>
              Opens as the original {ext} file, same as Google Classroom attachments.
            </p>
            <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 18 }}>
              {url ? (
                <a className="btn small" href={url} target="_blank" rel="noreferrer">
                  Open
                </a>
              ) : null}
              {onDownload ? (
                <button type="button" className="btn small primary" onClick={onDownload}>
                  Download
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="pdf-viewer-foot small">Press ESC to close</div>
      </div>
    </div>
  )
}
