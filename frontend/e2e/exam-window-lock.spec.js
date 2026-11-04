/**
 * Exam window (PKT) + strict lock: one warning, then auto-submit.
 * Screenshots → e2e/screenshots/exam-window/
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loginAs, WORLD_PASSWORD } from './helpers/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, 'screenshots/exam-window')
const API = process.env.E2E_API || 'http://127.0.0.1:8000/api'
const TEACHER = 'ayesha.khan@umt.edu.pk'
const STUDENT = 'hamza.ali@umt.edu.pk'

test.describe.configure({ mode: 'serial' })
test.setTimeout(150_000)

async function snap(page, id) {
  fs.mkdirSync(OUT, { recursive: true })
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, `${id}.png`), fullPage: true })
}

async function token(request, email, role) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password: WORLD_PASSWORD, role } })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()).access_token
}

/** Publish a quiz on CS-201-A whose window starts/ends `fromMin`/`toMin` minutes from now. */
async function publishQuiz(request, title, fromMin, toMin) {
  const headers = { Authorization: `Bearer ${await token(request, TEACHER, 'teacher')}` }
  const classes = await (await request.get(`${API}/classes`, { headers })).json()
  const cls = classes.find((c) => c.code === 'CS-201-A')
  const mats = await (await request.get(`${API}/classes/${cls.id}/materials`, { headers })).json()
  const at = (m) => new Date(Date.now() + m * 60_000).toISOString()
  const gen = await request.post(`${API}/exams/generate`, {
    headers,
    data: {
      class_id: cls.id,
      title,
      kind: 'Quiz',
      duration_min: 20,
      opens_at: at(fromMin),
      closes_at: at(toMin),
      material_ids: [mats[0].id],
      counts: { MCQ: 1, Short: 1 },
    },
  })
  expect(gen.ok(), await gen.text()).toBeTruthy()
  const exam = (await gen.json()).exam
  const pub = await request.post(`${API}/exams/${exam.id}/publish`, { headers })
  expect(pub.ok(), await pub.text()).toBeTruthy()
  return exam.id
}

async function myAttempt(request, examId) {
  const headers = { Authorization: `Bearer ${await token(request, STUDENT, 'student')}` }
  const mine = await (await request.get(`${API}/attempts/mine?exam_id=${examId}`, { headers })).json()
  return mine[0]
}

async function openStartScreen(page, examId) {
  await loginAs(page, 'student')
  await page.goto(`/app/student/exams/${examId}/take`)
  await expect(page.getByRole('heading', { name: 'Before you start', exact: true })).toBeVisible()
}

async function startExam(page) {
  await page.locator('#exam-agree').check()
  await page.getByRole('button', { name: /Start exam/ }).click()
  await expect(page.locator('#q-title')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(900) // the lock arms after 600 ms
}

const leaveFullscreen = (page) => page.evaluate(() => document.exitFullscreen())
const hideTab = (page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })

test('teacher sets the exam window in Pakistan time when generating', async ({ page }) => {
  await loginAs(page, 'teacher')
  await page.goto('/app/teacher/exams/new')
  await expect(page.locator('#cf-date')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('When students can sit it')).toBeVisible()
  await expect(page.locator('#cf-start')).toHaveValue(/^\d\d:00$/)
  await page.locator('#cf-start').fill('20:00')
  await page.locator('#cf-end').fill('22:00')
  await expect(page.getByText(/8:00 PM – 10:00 PM PKT/)).toBeVisible()
  await page.locator('#cf-date').scrollIntoViewIfNeeded()
  await snap(page, 'W01-generate-window')
})

test('before the window opens the student cannot start', async ({ page, request }) => {
  const examId = await publishQuiz(request, `Window later ${Date.now()}`, 120, 240)
  await openStartScreen(page, examId)
  await expect(page.getByText(/It opens at/)).toBeVisible()
  await page.locator('#exam-agree').check()
  await expect(page.getByRole('button', { name: /Start exam/ })).toBeDisabled()
  await snap(page, 'W02-before-window-locked')
})

test('rules must be accepted; first leave warns, second submits', async ({ page, request }) => {
  const examId = await publishQuiz(request, `Window strict ${Date.now()}`, -10, 120)
  await openStartScreen(page, examId)
  await expect(page.getByRole('heading', { name: /Read before you start/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Start exam/ })).toBeDisabled()
  await snap(page, 'W03-rules-disclaimer')

  await startExam(page)
  await snap(page, 'W04-taking-fullscreen')

  await leaveFullscreen(page)
  await expect(page.getByRole('heading', { name: 'You left the exam' })).toBeVisible()
  await expect(page.getByText(/This is your only warning/)).toBeVisible()
  await expect(page.locator('#q-title')).toHaveCount(0) // the paper is not on the page
  await snap(page, 'W05-first-leave-warning')
  expect((await myAttempt(request, examId)).violation_count).toBe(1)

  await page.getByRole('button', { name: /Return to fullscreen/ }).click()
  await expect(page.locator('#q-title')).toBeVisible()
  await page.waitForTimeout(500)

  await hideTab(page)
  await page.waitForURL(/\/attempts\/[^/]+\/done/, { timeout: 30_000 })
  await snap(page, 'W06-second-leave-submitted')
  const attempt = await myAttempt(request, examId)
  expect(attempt.status).toBe('submitted')
  expect(attempt.end_reason).toBe('violations')
  expect(attempt.violation_count).toBe(2)
})

test('reloading the exam counts as leaving', async ({ page, request }) => {
  const examId = await publishQuiz(request, `Window reload ${Date.now()}`, -10, 120)
  await openStartScreen(page, examId)
  await startExam(page)

  page.on('dialog', (d) => d.accept()) // "Leave site?" prompt
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your exam was reopened' })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByText(/This is your only warning/)).toBeVisible()
  await snap(page, 'W07-reload-counts-as-leave')
  const attempt = await myAttempt(request, examId)
  expect(attempt.status).toBe('in_progress')
  expect(attempt.violation_count).toBe(1)
})

test('a device without fullscreen is blocked', async ({ browser, request }) => {
  const examId = await publishQuiz(request, `Window phone ${Date.now()}`, -10, 120)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  // iPhone Safari has no element fullscreen; emulate that in Chromium.
  await ctx.addInitScript(() => {
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false })
    Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: () => false })
  })
  const page = await ctx.newPage()
  await openStartScreen(page, examId)
  await page.locator('#exam-agree').check()
  await expect(page.getByText(/This device can.t run the exam/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Start exam/ })).toBeDisabled()
  await snap(page, 'W08-phone-blocked')
  await ctx.close()
})
