import { useEffect } from 'react'

/**
 * Centered same-page PDF viewer. `url` is an object URL the caller revokes on close.
 */
export default function PdfViewer({
  title,
  subtitle,
  url,
  onClose,
  onDownload,
  downloading = false,
}) {
  // Hash params help Chrome's PDF plugin show toolbar/scroll chrome.
  const viewerSrc = url ? `${url}#toolbar=1&navpanes=0&scrollbar=1&view=FitH` : ''

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

  return (
    <div
      className="pdf-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={title || 'PDF viewer'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="pdf-viewer-card">
        <div className="pdf-viewer-bar">
          <div className="pdf-viewer-meta">
            <b className="pdf-viewer-title">{title || 'Document'}</b>
            {subtitle ? <span className="pdf-viewer-sub small">{subtitle}</span> : null}
          </div>
          <div className="row pdf-viewer-actions">
            {url ? (
              <a className="btn small" href={url} target="_blank" rel="noreferrer">
                Open in new tab
              </a>
            ) : null}
            {onDownload ? (
              <button
                type="button"
                className="btn small"
                onClick={onDownload}
                disabled={downloading}
              >
                {downloading ? 'Downloading…' : 'Download'}
              </button>
            ) : null}
            <button type="button" className="btn small primary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="pdf-viewer-body">
          {viewerSrc ? (
            <iframe
              className="pdf-viewer-frame"
              title={title || 'PDF'}
              src={viewerSrc}
            />
          ) : null}
        </div>
        <div className="pdf-viewer-foot small">Press ESC to close</div>
      </div>
    </div>
  )
}
