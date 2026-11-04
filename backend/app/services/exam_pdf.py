"""Build a printable student-facing exam PDF (questions only, no answers)."""

from __future__ import annotations

import io
import re

import pymupdf

PAGE_WIDTH = 595  # A4
PAGE_HEIGHT = 842
MARGIN = 54
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN
HEADER_TOP = 36
LINE_GAP = 4
BODY_SIZE = 11
META_SIZE = 10
TITLE_SIZE = 15
SECTION_SIZE = 12
OPTION_LABELS = "ABCD"

SECTION_ORDER = (
    ("MCQ", "Section A - Multiple-Choice Questions", "Choose the one best answer for each question."),
    ("Short", "Section B - Short-Answer Questions", "Answer each question clearly and concisely."),
    (
        "Essay",
        "Section C - Long-Answer Questions",
        "Organise your responses into clear, well-developed paragraphs.",
    ),
)


def _safe_filename(title: str) -> str:
    base = re.sub(r"[^\w\s\-]+", "", title or "exam", flags=re.UNICODE).strip()
    base = re.sub(r"\s+", "-", base) or "exam"
    return f"{base[:80]}.pdf"


def _new_page(doc: pymupdf.Document) -> pymupdf.Page:
    return doc.new_page(width=PAGE_WIDTH, height=PAGE_HEIGHT)


def _ensure_space(
    doc: pymupdf.Document, page: pymupdf.Page, y: float, need: float
) -> tuple[pymupdf.Page, float]:
    if y + need <= PAGE_HEIGHT - MARGIN:
        return page, y
    return _new_page(doc), float(MARGIN + 18)


def _write_block(
    doc: pymupdf.Document,
    page: pymupdf.Page,
    y: float,
    text: str,
    *,
    fontsize: float = BODY_SIZE,
    fontname: str = "helv",
    width: float = CONTENT_WIDTH,
    x: float = MARGIN,
    align: int = 0,
) -> tuple[pymupdf.Page, float]:
    if not text:
        return page, y
    words = text.split()
    line = ""
    while words or line:
        if words:
            trial = f"{line} {words[0]}".strip() if line else words[0]
            if pymupdf.get_text_length(trial, fontname=fontname, fontsize=fontsize) <= width:
                line = trial
                words.pop(0)
                continue
        if not line and words:
            token = words.pop(0)
            cut = len(token)
            while cut > 1 and pymupdf.get_text_length(
                token[:cut], fontname=fontname, fontsize=fontsize
            ) > width:
                cut -= 1
            line = token[:cut]
            if cut < len(token):
                words.insert(0, token[cut:])
        page, y = _ensure_space(doc, page, y, fontsize + LINE_GAP + 2)
        draw_x = x
        if align == 1:  # center
            tw = pymupdf.get_text_length(line, fontname=fontname, fontsize=fontsize)
            draw_x = max(MARGIN, (PAGE_WIDTH - tw) / 2)
        page.insert_text((draw_x, y + fontsize), line, fontsize=fontsize, fontname=fontname)
        y += fontsize + LINE_GAP
        line = ""
    return page, y


def _field_line(label: str, fill: float) -> str:
    """Return a label + underscore fill approximating `fill` character width."""
    underscores = max(8, int(fill))
    return f"{label} {'_' * underscores}"


def _marks_phrase(count: int, per: float | None, total: float) -> str:
    if per is not None and count > 0:
        per_s = str(int(per)) if float(per).is_integer() else str(per)
        tot_s = str(int(total)) if float(total).is_integer() else str(total)
        return f"({count} × {per_s} = {tot_s} marks)"
    tot_s = str(int(total)) if float(total).is_integer() else str(total)
    return f"({tot_s} marks)"


def _group_questions(questions: list) -> dict[str, list]:
    groups: dict[str, list] = {"MCQ": [], "Short": [], "Essay": [], "Other": []}
    for q in questions:
        qtype = str(q.get("type") or "")
        if qtype == "MCQ":
            groups["MCQ"].append(q)
        elif qtype == "Short":
            groups["Short"].append(q)
        elif qtype == "Essay":
            groups["Essay"].append(q)
        else:
            groups["Other"].append(q)
    return groups


def _stamp_headers(doc: pymupdf.Document, *, class_code: str, title: str) -> None:
    short_title = (title or "Exam").strip()
    if len(short_title) > 40:
        short_title = short_title[:37] + "..."
    code = (class_code or "").strip() or "EXAM"
    n = doc.page_count
    for i in range(n):
        page = doc[i]
        header = f"{code} | {short_title}   Page {i + 1}"
        page.insert_text(
            (MARGIN, HEADER_TOP),
            header,
            fontsize=8,
            fontname="helv",
            color=(0.35, 0.35, 0.35),
        )
        page.draw_line(
            pymupdf.Point(MARGIN, HEADER_TOP + 6),
            pymupdf.Point(PAGE_WIDTH - MARGIN, HEADER_TOP + 6),
            width=0.4,
            color=(0.7, 0.7, 0.7),
        )
        footer = f"- {i + 1} of {n} -"
        tw = pymupdf.get_text_length(footer, fontname="helv", fontsize=8)
        page.insert_text(
            ((PAGE_WIDTH - tw) / 2, PAGE_HEIGHT - 28),
            footer,
            fontsize=8,
            fontname="helv",
            color=(0.45, 0.45, 0.45),
        )


def build_exam_pdf(
    exam: dict,
    *,
    class_label: str | None = None,
    class_code: str | None = None,
    class_name: str | None = None,
) -> tuple[bytes, str]:
    """Return (pdf_bytes, filename) for a formal student paper — no answers/blanks."""
    doc = pymupdf.open()
    page = _new_page(doc)
    y = float(MARGIN + 14)

    title = str(exam.get("title") or "Exam")
    duration = exam.get("duration_min")
    questions = list(exam.get("questions") or [])
    code = (class_code or "").strip()
    if not code and class_label:
        code = class_label.split("·")[0].strip()
    name = (class_name or "").strip()
    if not name and class_label and "·" in class_label:
        name = class_label.split("·", 1)[1].strip()

    total_marks = sum(float(q.get("marks") or 0) for q in questions)
    total_s = str(int(total_marks)) if float(total_marks).is_integer() else str(total_marks)

    exam_heading = f"{title.strip().upper()} EXAMINATION"
    page, y = _write_block(
        doc, page, y, exam_heading, fontsize=TITLE_SIZE, fontname="hebo", align=1
    )
    y += 4

    meta_parts = []
    if code:
        meta_parts.append(f"Course Code: {code}")
    if duration is not None:
        meta_parts.append(f"Duration: {duration} minutes")
    meta_parts.append(f"Total Marks: {total_s}")
    page, y = _write_block(
        doc, page, y, " | ".join(meta_parts), fontsize=META_SIZE, align=1
    )
    y += 10

    # Student identity fields only (not answer blanks).
    page, y = _write_block(
        doc,
        page,
        y,
        f"{_field_line('Student Name:', 42)}  {_field_line('Roll No.:', 18)}",
        fontsize=META_SIZE,
    )
    y += 2
    section_label = name or code or "________"
    page, y = _write_block(
        doc,
        page,
        y,
        f"{_field_line(f'Class / Section ({section_label}):', 28)}  {_field_line('Date:', 16)}",
        fontsize=META_SIZE,
    )
    y += 10

    page, y = _write_block(doc, page, y, "Instructions", fontsize=SECTION_SIZE, fontname="hebo")
    y += 2
    instructions = [
        "1. Attempt all questions.",
        "2. For Section A, select one best answer for each question by circling or clearly marking A, B, C or D.",
        "3. For Sections B and C, write clear, relevant answers. Marks for each question are shown beside the question.",
        "4. Manage your time according to the marks available for each section.",
    ]
    for line in instructions:
        page, y = _write_block(doc, page, y, line, fontsize=META_SIZE)
    y += 12

    groups = _group_questions(questions)
    qnum = 1

    for qtype, section_title, blurb in SECTION_ORDER:
        qs = groups.get(qtype) or []
        if not qs:
            continue
        count = len(qs)
        marks_list = [float(q.get("marks") or 0) for q in qs]
        section_total = sum(marks_list)
        per = marks_list[0] if marks_list and all(m == marks_list[0] for m in marks_list) else None
        heading = f"{section_title} {_marks_phrase(count, per, section_total)}"

        page, y = _ensure_space(doc, page, y, 36)
        page, y = _write_block(doc, page, y, heading, fontsize=SECTION_SIZE, fontname="hebo")
        y += 2
        page, y = _write_block(doc, page, y, blurb, fontsize=META_SIZE)
        y += 8

        for q in qs:
            marks = q.get("marks")
            marks_bit = ""
            if marks is not None:
                m = float(marks)
                ms = str(int(m)) if m.is_integer() else str(m)
                marks_bit = f" ({ms} mark{'s' if m != 1 else ''})"

            stem = str(q.get("text") or "").strip()
            page, y = _write_block(
                doc,
                page,
                y,
                f"Q{qnum}.{marks_bit} {stem}".strip(),
                fontsize=BODY_SIZE,
            )
            y += 2

            options = q.get("options")
            if qtype == "MCQ" and isinstance(options, list) and options:
                for oi, opt in enumerate(options):
                    label = OPTION_LABELS[oi] if oi < len(OPTION_LABELS) else str(oi + 1)
                    page, y = _write_block(
                        doc,
                        page,
                        y,
                        f"    {label}) {opt}",
                        fontsize=BODY_SIZE,
                    )
            # Short / Essay: question text only — no handwritten answer blanks.
            y += 8
            qnum += 1

        y += 6

    other = groups.get("Other") or []
    if other:
        page, y = _ensure_space(doc, page, y, 28)
        page, y = _write_block(
            doc, page, y, "Additional Questions", fontsize=SECTION_SIZE, fontname="hebo"
        )
        y += 6
        for q in other:
            marks = q.get("marks")
            marks_bit = ""
            if marks is not None:
                m = float(marks)
                ms = str(int(m)) if m.is_integer() else str(m)
                marks_bit = f" ({ms} mark{'s' if m != 1 else ''})"
            stem = str(q.get("text") or "").strip()
            page, y = _write_block(
                doc, page, y, f"Q{qnum}.{marks_bit} {stem}".strip(), fontsize=BODY_SIZE
            )
            options = q.get("options")
            if isinstance(options, list) and options:
                for oi, opt in enumerate(options):
                    label = OPTION_LABELS[oi] if oi < len(OPTION_LABELS) else str(oi + 1)
                    page, y = _write_block(
                        doc, page, y, f"    {label}) {opt}", fontsize=BODY_SIZE
                    )
            y += 8
            qnum += 1

    y += 6
    page, y = _ensure_space(doc, page, y, 20)
    page, y = _write_block(
        doc,
        page,
        y,
        "End of Examination - Please check that you have attempted all questions.",
        fontsize=META_SIZE,
        fontname="hebo",
        align=1,
    )

    _stamp_headers(doc, class_code=code, title=title)

    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue(), _safe_filename(title)
