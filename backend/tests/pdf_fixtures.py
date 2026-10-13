"""Builds minimal, valid, hand-written PDF bytes for tests, so real PDF
extraction is exercised without adding a PDF-generation dependency."""

import io


def build_pdf(pages_lines: list[list[str]]) -> bytes:
    """pages_lines: one list of text lines per page. Each page repeats a
    constant header/footer line so header/footer-stripping can be tested,
    and lines may end with a hyphen to test hyphenated line-break joining."""
    objects = []
    n_pages = len(pages_lines)
    font_obj_num = 3 + n_pages

    objects.append("<< /Type /Catalog /Pages 2 0 R >>")
    kids = " ".join(f"{3 + i} 0 R" for i in range(n_pages))
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {n_pages} >>")
    for i in range(n_pages):
        content_obj_num = font_obj_num + 1 + i
        objects.append(
            f"<< /Type /Page /Parent 2 0 R "
            f"/Resources << /Font << /F1 {font_obj_num} 0 R >> >> "
            f"/MediaBox [0 0 612 792] /Contents {content_obj_num} 0 R >>"
        )
    objects.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    for lines in pages_lines:
        ops = ["BT", "/F1 11 Tf", "72 740 Td"]
        for j, line in enumerate(lines):
            escaped = line.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
            if j == 0:
                ops.append(f"({escaped}) Tj")
            else:
                ops.append(f"0 -14 Td ({escaped}) Tj")
        ops.append("ET")
        stream = "\n".join(ops)
        objects.append(f"<< /Length {len(stream.encode())} >>\nstream\n{stream}\nendstream")

    buf = io.BytesIO()
    buf.write(b"%PDF-1.4\n")
    offsets = [0]
    for idx, obj in enumerate(objects, start=1):
        offsets.append(buf.tell())
        buf.write(f"{idx} 0 obj\n{obj}\nendobj\n".encode())
    xref_offset = buf.tell()
    total = len(objects) + 1
    buf.write(f"xref\n0 {total}\n".encode())
    buf.write(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        buf.write(f"{off:010d} 00000 n \n".encode())
    buf.write(f"trailer\n<< /Size {total} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF".encode())
    return buf.getvalue()


def sample_multipage_pdf() -> bytes:
    """A 3-page PDF with a repeated header/footer and a hyphenated word
    broken across a line, enough text to clear the scanned-PDF threshold."""
    filler = (
        "This course covers fundamental data structures used throughout "
        "computer science including trees graphs hash tables and queues."
    )
    pages = [
        [
            "COURSE NOTES — DATA STRUCTURES",
            "2.1 Hash Tables",
            "A hash table maps keys to array slots using a hash func-",
            "tion, giving O(1) average lookup time for most inputs.",
            filler,
            filler,
            "Confidential — do not distribute",
        ],
        [
            "COURSE NOTES — DATA STRUCTURES",
            "2.2 Collisions",
            "When two keys map to the same slot a collision occurs.",
            "Chaining stores a linked list in each slot for lookups.",
            filler,
            filler,
            "Confidential — do not distribute",
        ],
        [
            "COURSE NOTES — DATA STRUCTURES",
            "2.3 Open Addressing",
            "Open addressing probes for the next free slot instead of",
            "chaining, using linear or quadratic probing strategies.",
            filler,
            filler,
            "Confidential — do not distribute",
        ],
    ]
    return build_pdf(pages)


def sample_scanned_pdf() -> bytes:
    """A PDF with (almost) no extractable text, mimicking a scanned image."""
    return build_pdf([["x"]])
