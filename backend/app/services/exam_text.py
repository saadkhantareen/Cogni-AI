"""Turn LLM LaTeX / Markdown leftovers into readable exam text."""

from __future__ import annotations

import re

_SUP = str.maketrans("0123456789+-=()ni", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ")
_SUB = str.maketrans("0123456789+-=()", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎")

_NAMED: list[tuple[str, str]] = [
    (r"\\longrightarrow", "→"),
    (r"\\rightarrow", "→"),
    (r"\\leftarrow", "←"),
    (r"\\leftrightarrow", "↔"),
    (r"\\Rightarrow", "⇒"),
    (r"\\to\b", "→"),
    (r"\\times", "×"),
    (r"\\cdot", "·"),
    (r"\\bullet", "·"),
    (r"\\pm", "±"),
    (r"\\mp", "∓"),
    (r"\\approx", "≈"),
    (r"\\simeq", "≈"),
    (r"\\neq", "≠"),
    (r"\\ne\b", "≠"),
    (r"\\leq", "≤"),
    (r"\\le\b", "≤"),
    (r"\\geq", "≥"),
    (r"\\ge\b", "≥"),
    (r"\\infty", "∞"),
    (r"\\propto", "∝"),
    (r"\\partial", "∂"),
    (r"\\nabla", "∇"),
    (r"\\hbar", "ℏ"),
    (r"\\ell\b", "ℓ"),
    (r"\\deg\b", "°"),
    (r"\\circ\b", "°"),
    (r"\\degree", "°"),
    (r"\\ldots", "…"),
    (r"\\dots", "…"),
    (r"\\cdots", "…"),
    (r"\\alpha", "α"),
    (r"\\beta", "β"),
    (r"\\gamma", "γ"),
    (r"\\delta", "δ"),
    (r"\\epsilon", "ε"),
    (r"\\varepsilon", "ε"),
    (r"\\theta", "θ"),
    (r"\\lambda", "λ"),
    (r"\\mu\b", "μ"),
    (r"\\nu\b", "ν"),
    (r"\\pi\b", "π"),
    (r"\\rho", "ρ"),
    (r"\\sigma", "σ"),
    (r"\\tau", "τ"),
    (r"\\phi", "φ"),
    (r"\\varphi", "φ"),
    (r"\\chi", "χ"),
    (r"\\psi", "ψ"),
    (r"\\omega", "ω"),
    (r"\\Gamma", "Γ"),
    (r"\\Delta", "Δ"),
    (r"\\Theta", "Θ"),
    (r"\\Lambda", "Λ"),
    (r"\\Pi\b", "Π"),
    (r"\\Sigma", "Σ"),
    (r"\\Phi", "Φ"),
    (r"\\Psi", "Ψ"),
    (r"\\Omega", "Ω"),
    (r"\\sum\b", "Σ"),
    (r"\\int\b", "∫"),
    (r"\\%", "%"),
    (r"\\&", "&"),
    (r"\\_", "_"),
    (r"\\\{", "{"),
    (r"\\\}", "}"),
]

_BOXED = [
    (r"\\text\{([^{}]*)\}", r"\1"),
    (r"\\mathrm\{([^{}]*)\}", r"\1"),
    (r"\\textrm\{([^{}]*)\}", r"\1"),
    (r"\\mathbf\{([^{}]*)\}", r"\1"),
    (r"\\textbf\{([^{}]*)\}", r"\1"),
    (r"\\mathit\{([^{}]*)\}", r"\1"),
    (r"\\textit\{([^{}]*)\}", r"\1"),
    (r"\\mathrmbf\{([^{}]*)\}", r"\1"),
    (r"\\operatorname\{([^{}]*)\}", r"\1"),
    (r"\\ce\{([^{}]*)\}", r"\1"),
    (r"\\mathrm\{([^{}]*)\}", r"\1"),
]


def _super(inner: str) -> str:
    inner = inner.strip()
    if inner and all(c in "0123456789+-=()ni " for c in inner):
        return inner.replace(" ", "").translate(_SUP)
    return inner


def _sub(inner: str) -> str:
    inner = inner.strip()
    if inner and all(c in "0123456789+-=() " for c in inner):
        return inner.replace(" ", "").translate(_SUB)
    return f"_{inner}" if inner else ""


def _plainify_math(s: str) -> str:
    for _ in range(4):
        nxt = s
        nxt = re.sub(r"\\frac\{([^{}]+)\}\{([^{}]+)\}", r"\1/\2", nxt)
        nxt = re.sub(r"\\sqrt\{([^{}]+)\}", r"√\1", nxt)
        for pat, repl in _BOXED:
            nxt = re.sub(pat, repl, nxt)
        if nxt == s:
            break
        s = nxt
    for pat, repl in _NAMED:
        s = re.sub(pat, repl, s)
    s = re.sub(r"\\left\s*", "", s)
    s = re.sub(r"\\right\s*", "", s)
    s = re.sub(r"\\,|\\;|\\!|\\quad|\\qquad|\\hspace\{[^{}]*\}", " ", s)
    s = re.sub(r"\\\\", " ", s)
    s = re.sub(r"\^\{([^{}]*)\}", lambda m: _super(m.group(1)), s)
    s = re.sub(r"_\{([^{}]*)\}", lambda m: _sub(m.group(1)), s)
    s = re.sub(r"\^([0-9+\-n])", lambda m: _super(m.group(1)), s)
    s = re.sub(r"_([0-9+\-])", lambda m: _sub(m.group(1)), s)
    s = re.sub(r"\\[a-zA-Z]+\*?", "", s)
    for _ in range(4):
        nxt = re.sub(r"\{([^{}]+)\}", r"\1", s)
        if nxt == s:
            break
        s = nxt
    s = s.replace("{", "").replace("}", "")
    return s


def plainify_exam_text(text: str | None) -> str:
    """Make generated question/option/answer text readable for students."""
    if not text:
        return ""
    s = str(text).replace("\r\n", "\n")
    s = re.sub(r"\$\$(.+?)\$\$", lambda m: _plainify_math(m.group(1)), s, flags=re.S)
    s = re.sub(r"\\\((.+?)\\\)", lambda m: _plainify_math(m.group(1)), s, flags=re.S)
    s = re.sub(r"\\\[(.+?)\\\]", lambda m: _plainify_math(m.group(1)), s, flags=re.S)
    s = re.sub(
        r"(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)",
        lambda m: _plainify_math(m.group(1)),
        s,
        flags=re.S,
    )
    s = _plainify_math(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"__(.+?)__", r"\1", s)
    s = re.sub(r"`([^`]+)`", r"\1", s)
    s = re.sub(r"[ \t]{2,}", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()
