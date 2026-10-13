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
