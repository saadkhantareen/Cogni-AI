/** Inline SVG symbol sprite from reference/Cogni.ai-v7.html (icons used by the styleguide and theme button). */
export default function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <symbol id="i-sun" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </symbol>
      <symbol id="i-moon" viewBox="0 0 24 24">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </symbol>
      <symbol id="i-check" viewBox="0 0 24 24">
        <path d="M20 6 9 17l-5-5" />
      </symbol>
      <symbol id="i-alert" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </symbol>
      <symbol id="i-warn" viewBox="0 0 24 24">
        <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" />
        <path d="M12 9v4M12 17h.01" />
      </symbol>
      <symbol id="i-info" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </symbol>
      <symbol id="i-spark" viewBox="0 0 24 24">
        <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" />
        <path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z" />
      </symbol>
      <symbol id="i-clock" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </symbol>
      <symbol id="i-x" viewBox="0 0 24 24">
        <path d="M18 6 6 18M6 6l12 12" />
      </symbol>
      <symbol id="i-send" viewBox="0 0 24 24">
        <path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />
      </symbol>
    </svg>
  )
}

export function Icon({ name, className = '' }) {
  return (
    <svg className={`i${className ? ` ${className}` : ''}`} aria-hidden="true" focusable="false">
      <use href={`#i-${name}`} />
    </svg>
  )
}
