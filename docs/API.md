# API

Endpoints are documented here as they're built, one row per route. Every
error response uses the uniform shape `{"detail": "...", "code": "..."}`.

| Method | Path | Role(s) | Request | Response |
|--------|------|---------|---------|----------|
| GET | /api/health | public | — | `{status}` |
| POST | /api/auth/login | public | `{email, password}` | `{access_token, token_type, user{id,name,email,role,dept_id}}`. 401 `UNAUTHORIZED` on wrong email/password (generic message). 403 `FORBIDDEN` if the account is inactive. |
| GET | /api/auth/me | any authenticated user | — (Bearer token) | `{id,name,email,role,dept_id,status}` |
| GET | /api/auth/demo-accounts | public | — | `[{id,name,email,role,dept_name,status}]` — the first 3 users of each role, in insertion order (12 total), for the login page's click-to-sign-in list. Never includes password hashes. |
| GET | /api/admin/users | admin | query `?role=&q=` (both optional; `q` matches name or email, case-insensitive) | `[UserOut]` |
| POST | /api/admin/users | admin | `{name, email, role, dept_id}` (`dept_id` required unless `role=admin`, which forces it to `null`) | `UserOut`, 201. 409 `CONFLICT` on duplicate email. 400 `BAD_REQUEST` if a non-admin role has no `dept_id`. If the new user is `hod` and their department has no head, they become it (notified); otherwise, if the department has a head and the new user isn't a student, the head is notified. |
| PATCH | /api/admin/users/{id} | admin | `{role?, dept_id?, status?}` (only provided fields change) | `UserOut`. Moving a user away from `hod` clears their department's `hod_id`. Setting `role=hod` makes them head of their (possibly new) department if it has none, notifying them. Setting `role=admin` forces `dept_id` to `null`. A role change notifies the user. |
| POST | /api/admin/users/{id}/reset-password | admin | — | 204. Password becomes `demo123`; the user is notified. |
| GET | /api/admin/departments | admin | — | `[DepartmentOut]` |
| POST | /api/admin/departments | admin | `{code, name}` | `DepartmentOut`, 201. 409 `CONFLICT` on duplicate code. `hod_id` starts `null`; policy defaults to `{min_clo:2, higher_order_pct:25, max_repeats:2}`. |
| PATCH | /api/admin/departments/{id} | admin | `{hod_id}` (nullable) | `DepartmentOut`. Promoting a user makes their role `hod` (notified); demoting the previous head makes them a `teacher` (notified). |
| GET | /api/admin/classes | admin | — | `[ClassOut]` (all classes, with `student_count`/`exam_count`) |
| PATCH | /api/admin/classes/{id} | admin | `{teacher_id}` | `ClassOut`. 400 `BAD_REQUEST` if the target isn't an active teacher in the class's department. Moves the class's exams to the new teacher; notifies both teachers. |
| GET | /api/admin/settings | admin | — | `SettingsOut` |
| PUT | /api/admin/settings | admin | `{approval, max_upload_mb, ai_threshold_default}` | `SettingsOut`. `max_upload_mb` floored at 1; `ai_threshold_default` clamped to 50-95. If `approval` changes, every teacher and HOD is notified. |
| GET | /api/admin/activity | admin | query `?role=&limit=` (`limit` default 50) | `[ActivityLogOut]`, newest first |
| GET | /api/admin/summary | admin | — | `{users_by_role, classes, papers_by_status, recent_activity}` |
| GET | /api/classes | any authenticated user | — | `[ClassOut]`, scoped to the caller: teacher's own classes, student's enrolled classes, HOD's department classes, admin sees all. Each entry includes `student_count` and `exam_count`. |
| POST | /api/classes | teacher | `{name, code, content_library?}` | `ClassOut`, 201. 409 `CONFLICT` on duplicate code. Generates a unique `join_code` (e.g. `DSX-4K2`); department comes from the teacher. Notifies the department's HOD, if any. `content_library` is accepted but unused (material seeding is out of scope for this phase). |
| GET | /api/classes/{id} | teacher (owner), hod (same dept), student (enrolled), admin | — | `ClassOut`. 403 `FORBIDDEN` otherwise. Students receive `student_ids` as an empty list (roster hidden). |
| POST | /api/classes/{id}/students | teacher (owner) | `{email}` | `ClassOut`. 403 if the caller doesn't own the class. 404 if no such user. 400 if the user isn't a student. 409 `CONFLICT` if already enrolled. Notifies the student. |
| DELETE | /api/classes/{id}/students/{student_id} | teacher (owner) | — | 204. 403 if the caller doesn't own the class. 404 if the student isn't enrolled. Notifies the removed student. |
| POST | /api/classes/join | student | `{join_code}` | `ClassOut`. 404 `NOT_FOUND` if no class uses the code. 409 `CONFLICT` if already enrolled. Notifies the class's teacher. |
| GET | /api/requests | teacher, hod | — | `[RequestOut]`, teacher sees their own, HOD sees the ones they created |
| POST | /api/requests | hod | `{teacher_id, class_id, kind, due, note}` | `RequestOut`, 201. 400 `BAD_REQUEST` if the class doesn't belong to that teacher or isn't in the HOD's department. Notifies the teacher. |
| GET | /api/hod/policy | hod | — | `{min_clo, higher_order_pct, max_repeats}` for the caller's own department |
| PUT | /api/hod/policy | hod | `{min_clo, higher_order_pct, max_repeats}` | Same shape, echoed back. Notifies every teacher in the department. |
| GET | /api/notifications | any authenticated user | — | `{items: [NotificationOut], unread_count}`, newest first |
| POST | /api/notifications/{id}/read | any authenticated user | — | 204. 404 `NOT_FOUND` if the notification doesn't exist or isn't the caller's. |
| POST | /api/notifications/read-all | any authenticated user | — | 204. Marks every unread notification of the caller as read. |
| POST | /api/classes/{class_id}/materials | teacher (owner) | Either `multipart/form-data` with a `file` (PDF, magic bytes `%PDF`) and optional `name`, or `application/json` `{name, text}` | `MaterialOut` summary (no `text`/`chunks`), 201. 403 if the caller doesn't own the class. 400 if the file isn't a PDF, exceeds `settings.max_upload_mb`, extracts to under 200 characters (`SCANNED_PDF` code), or pasted `text` is under 300 characters. Extracted/pasted text is split into page-tagged, heading-tagged chunks of roughly 600-900 words. Notifies every enrolled student and logs the activity. |
| GET | /api/classes/{class_id}/materials | teacher (owner), hod (same dept), student (enrolled), admin | — | `[MaterialSummaryOut]` (`id, class_id, owner_id, name, kind, chunk_count, word_count, created_at` — no `text`/`chunks`), newest first. 403 `FORBIDDEN` otherwise. |
| GET | /api/materials/{id} | same access as the list route, via the material's class | — | `MaterialOut` (includes `text` and `chunks[{idx,page,heading,text}]`). 404 if not found. |
| DELETE | /api/materials/{id} | teacher (owner of the material's class) | — | 204. 403 if the caller doesn't own the class. 409 `CONFLICT` if a non-draft exam references the material via `material_ids`. Logs the activity. |
| POST | /api/exams/generate | teacher (owns the class) | `{class_id, title, kind, duration_min, material_ids[], counts{MCQ,Short,Essay}, request_id?}` | `{exam: ExamOut, warnings[]}`, 201. Draft exam with LLM-generated, validated, deduplicated, Bloom-tagged questions; history gets `"Draft generated from <material names>"`. 400 if counts total 0 or exceed 40, no material selected, a material isn't in the class, or the material has no usable content. 403 if the caller doesn't own the class. 404 if a material (or `request_id`) isn't found. 400 if `request_id` isn't open and addressed to this teacher (it's linked to the new exam on success). 502 `LLM_FAILED` if the AI provider errors or returns unparseable JSON twice. |
| GET | /api/exams | any authenticated user | query `?status=&class_id=` | `[ExamOut]`. Teacher: own exams. HOD: exams in their department's classes. Student: `published` exams in their classes, each question stripped of `answer_index`, `model_answer`, `keywords`. Admin: all. |
| GET | /api/exams/{id} | same visibility rules as the list route | — | `ExamOut` (stripped for students as above). 403/404 outside the caller's access; a non-`published` exam 404s for students. |
| PATCH | /api/exams/{id} | teacher (owner) | `{title?, duration_min?, ai_threshold?}` | `ExamOut`. 403 if not the owner. 400 `BAD_REQUEST` unless the exam is `draft` or `returned`. |
| DELETE | /api/exams/{id} | teacher (owner) | — | 204. 400 unless the exam is `draft`. If linked to a request, the request reopens (`status: open`, `exam_id: null`). |
| PATCH | /api/exams/{id}/questions/{qid} | teacher (owner) | `{text?, options?, answer_index?, model_answer?, bloom?, marks?}` | `ExamOut`. 403 if not the owner. 400 unless `draft`/`returned`, or if the edited question becomes an invalid MCQ. 404 if the question doesn't exist. |
| DELETE | /api/exams/{id}/questions/{qid} | teacher (owner) | — | `ExamOut`. 400 if it would delete the last question, or unless `draft`/`returned`. 404 if the question doesn't exist. |
| POST | /api/exams/{id}/questions/{qid}/regenerate | teacher (owner) | — | `ExamOut` with that one question replaced by a newly generated one of the same type (same topic/clo preferred, avoiding existing questions). 400 unless `draft`/`returned`, or if the AI couldn't produce a valid replacement. 502 `LLM_FAILED` on provider failure. |
| POST | /api/exams/{id}/questions | teacher (owner) | `{type}` | `{exam: ExamOut, warnings[]}`, 201. Appends one newly generated question of `type`. 400 unless `draft`/`returned`, at 40 questions already, or if the AI couldn't produce a valid question. 502 `LLM_FAILED` on provider failure. |
