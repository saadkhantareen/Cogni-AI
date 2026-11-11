import { useEffect } from 'react'

/**
 * Full-screen PDF viewer. `url` is an object URL the caller revokes on close.
 */
export default function PdfViewer({ title, url, onClose, onDownload, downloading = false }) {
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
    <div className="pdf-viewer" role="dialog" aria-modal="true" aria-label={title || 'PDF viewer'}>
      <div className="pdf-viewer-bar">
        <b className="pdf-viewer-title">{title || 'Document'}</b>
        <div className="row" style={{ gap: 8 }}>
          {onDownload ? (
            <button type="button" className="btn small" onClick={onDownload} disabled={downloading}>
              {downloading ? 'Downloading…' : 'Download'}
            </button>
          ) : null}
          <button type="button" className="btn small primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <iframe className="pdf-viewer-frame" title={title || 'PDF'} src={url} />
    </div>
  )
}
