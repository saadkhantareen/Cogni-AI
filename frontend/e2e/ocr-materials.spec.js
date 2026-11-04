import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PDF = path.join(__dirname, 'fixtures/ocr/scanned-notes.pdf')
const SHOTS = path.join(__dirname, 'screenshots/ocr')
const API = 'http://127.0.0.1:8000/api'

test.setTimeout(240_000)
const snap = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })

test('scanned PDF is read by Tesseract at upload and feeds exam generation', async ({ page, request }) => {
  fs.mkdirSync(SHOTS, { recursive: true })
  const tag = Date.now().toString().slice(-6)
  const examTitle = `OCR scan exam ${tag}`

  await loginAs(page, 'teacher')
  await page.goto('/app/teacher/materials')
  await expect(page.getByRole('heading', { name: 'Course material', exact: true })).toBeVisible()
  if (await page.locator('#mat-cls').count()) {
    const opts = await page.locator('#mat-cls option').allTextContents()
    const idx = opts.findIndex((t) => /CS-201-A/i.test(t))
    if (idx >= 0) await page.locator('#mat-cls').selectOption({ index: idx })
  }
  await page.locator('input[type=file]').setInputFiles(PDF)
  await snap(page, 'materials-scanned-selected')
  await page.getByRole('button', { name: 'Process material', exact: true }).click()
  await expect(page.getByText(/file saved|Material saved/i)).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText(/scanned-notes/i).first()).toBeVisible()
  await snap(page, 'materials-scanned-saved')

  // The stored chunks must contain the text Tesseract read from the image-only PDF.
  const login = await request.post(`${API}/auth/login`, {
    data: { email: 'ayesha.khan@umt.edu.pk', password: 'Test-Passw0rd!', role: 'teacher' },
  })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  const classes = await (await request.get(`${API}/classes`, { headers })).json()
  const cls = classes.find((c) => /CS-201-A/i.test(c.code))
  const mats = await (await request.get(`${API}/classes/${cls.id}/materials`, { headers })).json()
  const mat = mats.find((m) => /scanned-notes/i.test(m.name))
  expect(mat.chunk_count).toBeGreaterThan(0)
  const full = await (await request.get(`${API}/materials/${mat.id}`, { headers })).json()
  expect(JSON.stringify(full).toLowerCase()).toContain('primary key')

  // Generate a draft exam from only that OCR'd material.
  await page.goto('/app/teacher/exams/new')
  await expect(page.getByRole('heading', { name: /Generate a draft paper/i })).toBeVisible({ timeout: 20_000 })
  const cs = page.locator('#cf-cls')
  const opts = await cs.locator('option').allTextContents()
  await cs.selectOption({ index: opts.findIndex((t) => /CS-201-A/i.test(t)) })
  const boxes = page.getByRole('checkbox')
  await expect(boxes.first()).toBeVisible({ timeout: 20_000 })
  const scanned = page.getByRole('checkbox', { name: /scanned-notes/i })
  if (!(await scanned.isChecked())) await scanned.check({ force: true })
  await expect(scanned).toBeChecked()
  await page.locator('#cf-title').fill(examTitle)
  await page.locator('#cf-kind').selectOption({ index: 0 })
  await snap(page, 'exam-generate-from-scan')
  await Promise.all([
    page.waitForURL((u) => /\/app\/teacher\/exams\/(?!new)[^/]+\/?$/.test(u.pathname), { timeout: 90_000 }),
    page.getByRole('button', { name: 'Generate draft paper' }).click(),
  ])
  await expect(page.getByText(examTitle).first()).toBeVisible({ timeout: 30_000 })
  await snap(page, 'exam-draft-from-scan')
})
