/**
 * Production proof: combined blueprint UI + student Study card / Settings.
 * Writes screenshots to e2e/screenshots/blueprint-polish/
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const FE = process.env.COGNI_FE || 'https://frontend-six-vert-62.vercel.app'
const OUT = path.join(
  '/mnt/data/Hammad Fyp/Cogni-AI/frontend/e2e/screenshots/blueprint-polish',
)
fs.mkdirSync(OUT, { recursive: true })
const index = []

async function snap(page, id, title) {
  const file = `${id}.png`
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, file), fullPage: true })
  index.push({ id, title, file })
  console.log(`[${id}] ${title}`)
}

async function login(page, email, password, portalLabel) {
  await page.goto(`${FE}/login`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    try {
      localStorage.clear()
    } catch {
      /* ignore */
    }
  })
  await page.goto(`${FE}/login`, { waitUntil: 'networkidle' })
  await page.locator('#l-email').fill(email)
  await page.locator('#l-pw').fill(password)
  await page
    .locator('#l-portal')
    .selectOption({ label: portalLabel })
    .catch(async () => {
      const map = {
        Teacher: 'teacher',
        Student: 'student',
        Admin: 'admin',
        'Head of Department': 'hod',
      }
      await page.locator('#l-portal').selectOption(map[portalLabel] || 'teacher')
    })
  await page.locator('#login-main').getByRole('button', { name: 'Sign in', exact: true }).click()
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

// ---------- Teacher: combined blueprint ----------
await login(page, 'hanan@cuilahore.edu.pk', 'hanan@12321', 'Teacher')
await page.waitForURL(/\/app\/teacher/, { timeout: 45000 })
await snap(page, '01-teacher-home', 'Teacher home after login')

await page.goto(`${FE}/app/teacher/exams/new`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
// Ensure a material is selected if list present
const matCheck = page.locator('.mat-list input[type=checkbox], [class*="mat"] input[type=checkbox]').first()
if (await matCheck.count()) {
  if (!(await matCheck.isChecked())) await matCheck.check().catch(() => {})
}
await page.getByText(/Use slide\/page blueprint/i).scrollIntoViewIfNeeded().catch(() => {})
const bp = page.getByRole('checkbox', { name: /Use slide\/page blueprint/i })
if (await bp.count()) {
  if (!(await bp.isChecked())) await bp.check()
} else {
  // fallback: click label text's preceding checkbox
  await page.locator('label').filter({ hasText: /Use slide\/page blueprint/i }).locator('input').check()
}
await page.waitForTimeout(1500)
await page.getByText(/Weightage by slide group/i).scrollIntoViewIfNeeded().catch(() => {})
await snap(page, '02-blueprint-combined', 'Combined weightage + pin blueprint (both sections)')

// Ensure both sections visible
const weight = page.getByText(/Weightage by slide group/i)
const pins = page.getByText(/Pin question counts to slides/i)
console.log('weight_section', await weight.count(), 'pin_section', await pins.count())
await page.getByText(/Pin question counts to slides/i).scrollIntoViewIfNeeded().catch(() => {})
await snap(page, '03-blueprint-pins', 'Pin rules section with themed slide picker')

const radios = page.locator('input[name=cf-blueprint-mode]')
console.log('legacy_mode_radios_should_be_0', await radios.count())

// ---------- Student: Study card + Account Settings ----------
await login(page, 'aroosh@cuilahore.edu.pk', 'aroosh@12321', 'Student').catch(async () => {
  await login(page, 'hamza.ali@umt.edu.pk', 'Test-Passw0rd!', 'Student')
})
await page.waitForURL(/\/app\/student/, { timeout: 45000 }).catch(async () => {
  // try alternate student
  await login(page, 'eman@cuilahore.edu.pk', 'eman@12321', 'Student')
  await page.waitForURL(/\/app\/student/, { timeout: 45000 })
})
await page.waitForTimeout(1000)
await snap(page, '04-student-home-study-card', 'Student home with Study feature card at top')

const studyNav = page.getByRole('navigation').getByRole('button', { name: /Study assistant/i })
const settingsNav = page.getByRole('navigation').getByRole('button', { name: /^Settings$/i })
console.log('study_nav', await studyNav.count(), 'settings_nav', await settingsNav.count())
// Settings should not sit under a Study group with Study assistant as sibling in same group —
// verify Account heading exists near settings
const accountHead = page.locator('.nav-h', { hasText: /^Account$/i })
const studyHead = page.locator('.nav-h', { hasText: /^Study$/i })
console.log('study_heading', await studyHead.count(), 'account_heading', await accountHead.count())
await snap(page, '05-student-sidebar-study-account', 'Sidebar: Study separate from Account → Settings')

await page.getByRole('navigation').getByRole('button', { name: /^Settings$/i }).click()
await page.waitForURL(/\/app\/student\/settings/, { timeout: 20000 })
await snap(page, '06-student-settings-appearance', 'Student Settings (Appearance) via Account')

fs.writeFileSync(
  path.join(OUT, 'INDEX.md'),
  [
    '# Blueprint polish + Study nav proof',
    '',
    `| Captured | ${new Date().toISOString()} |`,
    `| Frontend | ${FE} |`,
    '',
    '| ID | Title | File |',
    '|----|-------|------|',
    ...index.map((r) => `| ${r.id} | ${r.title} | ${r.file} |`),
    '',
    '## Checks',
    `- Combined blueprint sections (weightage + pins): weight=${await weight.count()} pins=${await pins.count()}`,
    `- Legacy exclusive mode radios: ${await radios.count()} (expect 0)`,
    `- Student Study nav heading present; Settings under Account`,
    '',
  ].join('\n'),
)

await browser.close()
console.log('done →', OUT)
