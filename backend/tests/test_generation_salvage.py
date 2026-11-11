"""Generation should survive the loose JSON models actually return."""

from app.services.exam_generator import normalize_raw_question, validate_question
from app.services.llm import _extract_json


def test_extract_json_keeps_complete_questions_when_the_outer_object_is_cut_off():
    text = (
        '{"questions":['
        '{"type":"MCQ","bloom":"Remember","topic":"Fission","clo":"CLO-1",'
        '"text":"Which particle is released?","options":["a","b","c","d"],"answer_index":1},'
        '{"type":"MCQ","text":"Second question that was cut off",'
    )
    data = _extract_json(text)
    assert len(data["questions"]) == 1
    assert data["questions"][0]["text"] == "Which particle is released?"


def test_extract_json_keeps_prompt_payload_instead_of_inner_chunks():
    import json

    payload = {
        "counts": {"MCQ": 1},
        "chunks": [{"idx": 0, "text": "Neutrons cause fission in the fuel."}],
    }
    text = "Generate exam questions from this course material.\n\n" + json.dumps(payload)
    data = _extract_json(text)
    assert data["counts"]["MCQ"] == 1
    assert data["chunks"][0]["text"].startswith("Neutrons")


def test_extract_json_strips_think_block_and_fence():
    text = "<think>planning the paper</think>\n```json\n{\"questions\": []}\n```"
    assert _extract_json(text) == {"questions": []}


def test_normalize_loose_mcq_passes_validation():
    formats = {"MCQ": "mcq", "Short Questions": "written"}
    raw = {
        "type": "mcq",
        "bloom": "understand",
        "question": "Which statement about fission is correct?",
        "options": ["One", "Two", "Three", "Four"],
        "answer_index": "2",
        "keywords": ["ignored"],
    }
    q = normalize_raw_question(raw, formats)
    assert validate_question(q, formats) is None
    assert q["type"] == "MCQ"
    assert q["bloom"] == "Understand"
    assert q["answer_index"] == 2
    assert q["clo"] == "CLO-1"


def test_normalize_written_keywords_from_strings_and_answer():
    formats = {"Short Questions": "written"}
    raw = {
        "type": "short",
        "bloom": "Apply",
        "text": "Explain a chain reaction.",
        "answer": "A chain reaction continues when each fission releases neutrons.",
        "keywords": ["neutron"],
    }
    q = normalize_raw_question(raw, formats)
    assert validate_question(q, formats) is None
    assert q["type"] == "Short Questions"
    assert len(q["keywords"]) >= 2
    assert q["model_answer"].startswith("A chain reaction")


def test_plainify_dt_fusion_latex():
    from app.services.exam_text import plainify_exam_text

    raw = (
        r"Why does the D–T fusion reaction ($^2_1\text{H} + ^3_1\text{H} "
        r"\to ^4_2\text{He} + ^1_0\text{n} + 17.6\text{ MeV}$) produce energetic neutrons?"
    )
    out = plainify_exam_text(raw)
    assert "\\text" not in out
    assert "$" not in out
    assert "→" in out
    assert "²" in out and "₁" in out
    assert "H" in out and "He" in out
    assert "MeV" in out
    assert "energetic neutrons" in out
    assert "{" not in out and "}" not in out


def test_normalize_strips_latex_from_stem():
    formats = {"MCQ": "mcq"}
    raw = {
        "type": "MCQ",
        "bloom": "Understand",
        "text": r"The reaction $^2_1\text{H}+^3_1\text{H}\to^4_2\text{He}$ releases energy.",
        "options": [r"\alpha decay", "Fission", "Capture", "Bonding"],
        "answer_index": 0,
    }
    q = normalize_raw_question(raw, formats)
    assert "\\text" not in q["text"]
    assert "→" in q["text"]
    assert q["options"][0] == "α decay"
