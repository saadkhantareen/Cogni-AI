/** Turn LLM LaTeX / Markdown leftovers into readable exam text. */

const SUP = {
  0: '⁰',
  1: '¹',
  2: '²',
  3: '³',
  4: '⁴',
  5: '⁵',
  6: '⁶',
  7: '⁷',
  8: '⁸',
  9: '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  n: 'ⁿ',
  i: 'ⁱ',
}
const SUB = {
  0: '₀',
  1: '₁',
  2: '₂',
  3: '₃',
  4: '₄',
  5: '₅',
  6: '₆',
  7: '₇',
  8: '₈',
  9: '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
}

const NAMED = [
  [/\\longrightarrow/g, '→'],
  [/\\rightarrow/g, '→'],
  [/\\leftarrow/g, '←'],
  [/\\leftrightarrow/g, '↔'],
  [/\\Rightarrow/g, '⇒'],
  [/\\to\b/g, '→'],
  [/\\times/g, '×'],
  [/\\cdot/g, '·'],
  [/\\bullet/g, '·'],
  [/\\pm/g, '±'],
  [/\\mp/g, '∓'],
  [/\\approx/g, '≈'],
  [/\\simeq/g, '≈'],
  [/\\neq/g, '≠'],
  [/\\ne\b/g, '≠'],
  [/\\leq/g, '≤'],
  [/\\le\b/g, '≤'],
  [/\\geq/g, '≥'],
  [/\\ge\b/g, '≥'],
  [/\\infty/g, '∞'],
  [/\\propto/g, '∝'],
  [/\\partial/g, '∂'],
  [/\\nabla/g, '∇'],
  [/\\hbar/g, 'ℏ'],
  [/\\ell\b/g, 'ℓ'],
  [/\\deg\b/g, '°'],
  [/\\circ\b/g, '°'],
  [/\\degree/g, '°'],
  [/\\ldots/g, '…'],
  [/\\dots/g, '…'],
  [/\\cdots/g, '…'],
  [/\\alpha/g, 'α'],
  [/\\beta/g, 'β'],
  [/\\gamma/g, 'γ'],
  [/\\delta/g, 'δ'],
  [/\\epsilon/g, 'ε'],
  [/\\varepsilon/g, 'ε'],
  [/\\theta/g, 'θ'],
  [/\\lambda/g, 'λ'],
  [/\\mu\b/g, 'μ'],
  [/\\nu\b/g, 'ν'],
  [/\\pi\b/g, 'π'],
  [/\\rho/g, 'ρ'],
  [/\\sigma/g, 'σ'],
  [/\\tau/g, 'τ'],
  [/\\phi/g, 'φ'],
  [/\\varphi/g, 'φ'],
  [/\\chi/g, 'χ'],
  [/\\psi/g, 'ψ'],
  [/\\omega/g, 'ω'],
  [/\\Gamma/g, 'Γ'],
  [/\\Delta/g, 'Δ'],
  [/\\Theta/g, 'Θ'],
  [/\\Lambda/g, 'Λ'],
  [/\\Pi\b/g, 'Π'],
  [/\\Sigma/g, 'Σ'],
  [/\\Phi/g, 'Φ'],
  [/\\Psi/g, 'Ψ'],
  [/\\Omega/g, 'Ω'],
  [/\\sum\b/g, 'Σ'],
  [/\\int\b/g, '∫'],
  [/\\%/g, '%'],
  [/\\&/g, '&'],
  [/\\_/g, '_'],
  [/\\\{/g, '{'],
  [/\\\}/g, '}'],
]

function mapChars(inner, table) {
  let out = ''
  for (const ch of inner) {
    if (ch === ' ') continue
    if (table[ch] == null) return null
    out += table[ch]
  }
  return out
}

function superScript(inner) {
  const mapped = mapChars(String(inner || '').trim(), SUP)
  return mapped == null ? String(inner || '').trim() : mapped
}

function subScript(inner) {
  const trimmed = String(inner || '').trim()
  const mapped = mapChars(trimmed, SUB)
  if (mapped == null) return trimmed ? `_${trimmed}` : ''
  return mapped
}

function plainifyMath(input) {
  let s = String(input || '')
  for (let i = 0; i < 4; i += 1) {
    const nxt = s
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1/$2')
      .replace(/\\sqrt\{([^{}]+)\}/g, '√$1')
      .replace(/\\text\{([^{}]*)\}/g, '$1')
      .replace(/\\mathrm\{([^{}]*)\}/g, '$1')
      .replace(/\\textrm\{([^{}]*)\}/g, '$1')
      .replace(/\\mathbf\{([^{}]*)\}/g, '$1')
      .replace(/\\textbf\{([^{}]*)\}/g, '$1')
      .replace(/\\mathit\{([^{}]*)\}/g, '$1')
      .replace(/\\textit\{([^{}]*)\}/g, '$1')
      .replace(/\\operatorname\{([^{}]*)\}/g, '$1')
      .replace(/\\ce\{([^{}]*)\}/g, '$1')
    if (nxt === s) break
    s = nxt
  }
  for (const [pat, repl] of NAMED) s = s.replace(pat, repl)
  s = s.replace(/\\left\s*/g, '').replace(/\\right\s*/g, '')
  s = s.replace(/\\,|\\;|\\!|\\quad|\\qquad|\\hspace\{[^{}]*\}/g, ' ')
  s = s.replace(/\\\\/g, ' ')
  s = s.replace(/\^\{([^{}]*)\}/g, (_, inner) => superScript(inner))
  s = s.replace(/_\{([^{}]*)\}/g, (_, inner) => subScript(inner))
  s = s.replace(/\^([0-9+\-n])/g, (_, ch) => superScript(ch))
  s = s.replace(/_([0-9+\-])/g, (_, ch) => subScript(ch))
  s = s.replace(/\\[a-zA-Z]+\*?/g, '')
  for (let i = 0; i < 4; i += 1) {
    const nxt = s.replace(/\{([^{}]+)\}/g, '$1')
    if (nxt === s) break
    s = nxt
  }
  return s.replace(/[{}]/g, '')
}

export function plainifyExamText(text) {
  if (!text) return ''
  let s = String(text).replace(/\r\n/g, '\n')
  s = s.replace(/\$\$(.+?)\$\$/gs, (_, inner) => plainifyMath(inner))
  s = s.replace(/\\\((.+?)\\\)/gs, (_, inner) => plainifyMath(inner))
  s = s.replace(/\\\[(.+?)\\\]/gs, (_, inner) => plainifyMath(inner))
  s = s.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/gs, (_, inner) => plainifyMath(inner))
  s = plainifyMath(s)
  s = s.replace(/\*\*(.+?)\*\*/g, '$1')
  s = s.replace(/__(.+?)__/g, '$1')
  s = s.replace(/`([^`]+)`/g, '$1')
  s = s.replace(/[ \t]{2,}/g, ' ')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}
