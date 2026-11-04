/**
 * Verify PDF download, admin Add staff merge, notification mark-all-on-open.
 * Screenshots → e2e/screenshots/feature-proof/
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loginAs, WORLD_PASSWORD } from './helpers/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, 'screenshots/feature-proof')
const API = 'http://127.0.0.1:8000/api'
const INDEX = []

async function snap(page, id, title) {
  fs.mkdirSync(OUT, { recursive: true })
  const file = path.join(OUT, `${id}.png`)
  await page.waitForTimeout(350)
  await page.screenshot({ path: file, fullPage: true })
  INDEX.push({ id, title, file: `${id}.png` })
  // eslint-disable-next-line no-console
  console.log(`[${id}] ${title} → e2e/screenshots/feature-proof/${id}.png`)
}

async function apiLogin(request, email, role) {
  const login = await request.post(`${API}/auth/login`, {
    data: { email, password: WORLD_PASSWORD, role },
  })
  expect(login.ok()).toBeTruthy()
  return (await login.json()).access_token
}

test.describe.configure({ mode: 'serial' })

test.describe('Feature proof — PDF, admin merge, notifications', () => {
  test.setTimeout(180_000)

  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true })
  })

  test.afterAll(() => {
    const lines = [
      '# Feature proof screenshots',
      '',
      '| ID | Title | File |',
      '|----|-------|------|',
      ...INDEX.map((r) => `| ${r.id} | ${r.title} | ${r.file} |`),
      '',
    ]
    fs.writeFileSync(path.join(OUT, 'INDEX.md'), lines.join('\n'))
  })

  test('FEAT01 teacher exam editor Download PDF', async ({ page, request }) => {
    const token = await apiLogin(request, 'ayesha.khan@umt.edu.pk', 'teacher')
    const exams = await (
      await request.get(`${API}/exams`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json()
    const exam = (exams || []).find((e) => e.status === 'published') || (exams || [])[0]
    expect(exam?.id).toBeTruthy()

    await loginAs(page, 'teacher')
    await page.goto(`/app/teacher/exams/${exam.id}`)
    const downloadBtn = page.getByRole('button', { name: /Download PDF/i })
    await expect(downloadBtn).toBeVisible({ timeout: 20_000 })

    await snap(page, 'FEAT01-teacher-download-pdf', 'Teacher exam editor shows Download PDF')

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      downloadBtn.click(),
    ])
    const suggested = download.suggestedFilename()
    expect(suggested.toLowerCase()).toMatch(/\.pdf$/)
    const dest = path.join(OUT, 'FEAT01-downloaded.pdf')
    await download.saveAs(dest)
    const buf = fs.readFileSync(dest)
    expect(buf.slice(0, 4).toString()).toBe('%PDF')
  })

  test('FEAT02 HOD review Download PDF', async ({ page, request }) => {
    const token = await apiLogin(request, 'tariq.mehmood@umt.edu.pk', 'hod')
    const approvals = await (
      await request.get(`${API}/hod/approvals`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json()
    const list = Array.isArray(approvals) ? approvals : approvals?.items || []
    let examId = list[0]?.id || list[0]?.exam_id
    if (!examId) {
      const exams = await (
        await request.get(`${API}/exams`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).json()
      examId = (exams || []).find((e) => e.status === 'pending')?.id || (exams || [])[0]?.id
    }
    expect(examId).toBeTruthy()

    await loginAs(page, 'hod')
    await page.goto(`/app/hod/approvals/${examId}`)
    const downloadBtn = page.getByRole('button', { name: /Download PDF/i })
    await expect(downloadBtn).toBeVisible({ timeout: 20_000 })

    await snap(page, 'FEAT02-hod-download-pdf', 'HOD review shows Download PDF')

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      downloadBtn.click(),
    ])
    expect(download.suggestedFilename().toLowerCase()).toMatch(/\.pdf$/)
  })

  test('FEAT03 admin single Add staff with student role', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/app/admin/users')
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible({ timeout: 20_000 })

    await expect(page.getByRole('button', { name: /^Add staff$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Add user$/i })).toHaveCount(0)

    await snap(page, 'FEAT03-admin-users-single-add', 'Users page has single Add staff button')

    await page.getByRole('button', { name: /^Add staff$/i }).click()
    await expect(page).toHaveURL(/\/app\/admin\/users\/new/)
    await expect(page.getByRole('heading', { name: /Add staff/i })).toBeVisible()
    await expect(page.getByRole('radio', { name: /Student/i })).toBeVisible()
    await expect(page.getByRole('radio', { name: /Teacher/i })).toBeVisible()
    await expect(page.getByRole('radio', { name: /Admin/i })).toBeVisible()

    await snap(page, 'FEAT03-admin-add-staff-roles', 'Add staff form includes student role')
  })

  test('FEAT04 opening notifications clears unread badge', async ({ page, request }) => {
    // Ensure unread notifications exist for the seeded student.
    const token = await apiLogin(request, 'hamza.ali@umt.edu.pk', 'student')
    let notes = await (
      await request.get(`${API}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json()
    if ((notes.unread_count || 0) === 0) {
      // Create a fresh unread note via another actor if needed — password reset style
      // is heavy; instead re-seed is handled by globalSetup. Force unread by inserting
      // through admin activity: join/leave is heavy. Skip create if already unread from seed.
      // Seeded world should have unread for hamza; if zero, mark-all then rely on poll after
      // a teacher action. Fallback: POST read-all then use API to confirm we can still test UI.
    }
    notes = await (
      await request.get(`${API}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json()
    // If somehow all read, create one via teacher adding/removing is complex — assert seed.
    expect((notes.items || []).length).toBeGreaterThan(0)

    // Make sure at least one is unread for the badge (mark all then create via notify is hard).
    // Re-open unread by calling the DB isn't available; use seed unread_count.
    // If unread is 0, re-mark isn't possible from API. Force unread: the world seeds unread.
    // As a safety net, if unread_count is 0, still open panel and assert no badge.

    await loginAs(page, 'student')
    await page.goto('/app/student')
    await expect(page.getByText(/STUDENT PORTAL|STUDENT/i).first()).toBeVisible({
      timeout: 20_000,
    })

    const bell = page.locator('button.bellbtn')
    await expect(bell).toBeVisible()

    // Ensure unread via API after login (poll may have refreshed)
    notes = await (
      await request.get(`${API}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json()
    if ((notes.unread_count || 0) === 0) {
      // Seed may have been cleared by a prior run in same worker; create unread by
      // marking is one-way. Use admin reset password notification path:
      const adminTok = await apiLogin(request, 'admin@cogni.pk', 'admin')
      const users = await (
        await request.get(`${API}/admin/users`, {
          headers: { Authorization: `Bearer ${adminTok}` },
        })
      ).json()
      const hamza = (users || []).find((u) => /hamza\.ali@umt\.edu\.pk/i.test(u.email))
      expect(hamza?.id).toBeTruthy()
      const reset = await request.post(`${API}/admin/users/${hamza.id}/reset-password`, {
        headers: { Authorization: `Bearer ${adminTok}` },
      })
      expect(reset.ok()).toBeTruthy()
      // Refresh page so bell picks up new unread
      await page.reload()
      await expect(bell).toBeVisible({ timeout: 15_000 })
    }

    await expect(page.locator('.bellbtn .dotc')).toBeVisible({ timeout: 20_000 })
    await snap(page, 'FEAT04-notifications-badge-before', 'Unread badge visible before opening panel')

    const readAll = page.waitForResponse(
      (r) => r.url().includes('/api/notifications/read-all') && r.request().method() === 'POST',
      { timeout: 15_000 },
    )
    await bell.click()
    await expect(page.getByRole('region', { name: 'Notifications' })).toBeVisible()
    await readAll

    await expect(page.locator('.bellbtn .dotc')).toHaveCount(0, { timeout: 10_000 })
    await expect(page.getByRole('button', { name: /Mark all read/i })).toHaveCount(0)

    await snap(page, 'FEAT04-notifications-drawer-open', 'Panel open — badge cleared, no Mark all read')

    // Close panel — badge must stay gone
    await page.keyboard.press('Escape')
    await expect(page.getByRole('region', { name: 'Notifications' })).toHaveCount(0)
    await expect(page.locator('.bellbtn .dotc')).toHaveCount(0)

    await snap(page, 'FEAT04-notifications-badge-after-close', 'Badge stays clear after closing panel')
  })
})
