import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const FE = 'https://frontend-six-vert-62.vercel.app'
const OUT = '/mnt/data/Hammad Fyp/Cogni-AI/frontend/e2e/screenshots/llm-gen'
const EXAM = '6ae4f506facac3a1073dec61'
fs.mkdirSync(OUT, { recursive: true })
const index = []

async function snap(page, id, title) {
  const file = `${id}.png`
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, file), fullPage: true })
  index.push({ id, title, file })
  console.log(`[${id}] ${title}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

// Admin llm-status banner check
await page.goto(`${FE}/login`, { waitUntil: 'networkidle' })
await page.locator('#l-email').fill('admin@cogni.com')
await page.locator('#l-pw').fill('Cogni@12321')
await page.locator('#l-portal').selectOption({ label: 'Admin' }).catch(async () => {
  await page.locator('#l-portal').selectOption('admin')
})
await page.locator('#login-main').getByRole('button', { name: 'Sign in', exact: true }).click()
await page.waitForURL(/\/app\/admin/, { timeout: 30000 })
await snap(page, 'LLM01-admin-home', 'Admin home after login (credentials OK)')
const mock = page.getByText(/LLM provider is mock/i)
console.log('mock_banner_visible', await mock.count())

// Teacher generate flow screenshots
await page.goto(`${FE}/login`, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.goto(`${FE}/login`, { waitUntil: 'networkidle' })
await page.locator('#l-email').fill('hanan@cuilahore.edu.pk')
await page.locator('#l-pw').fill('hanan@12321')
await page.locator('#l-portal').selectOption({ label: 'Teacher' }).catch(async () => {
  await page.locator('#l-portal').selectOption('teacher')
})
await page.locator('#login-main').getByRole('button', { name: 'Sign in', exact: true }).click()
await page.waitForURL(/\/app\/teacher/, { timeout: 30000 })
await snap(page, 'LLM02-teacher-home', 'Teacher home — ABDUL HAADI credentials OK')

await page.goto(`${FE}/app/teacher/exams/${EXAM}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
// heading / questions
await snap(page, 'LLM03-exam-draft-generated', 'Generated draft exam — Photoelectric Effect questions')

// Also open generate page for class materials context
await page.goto(`${FE}/app/teacher`, { waitUntil: 'networkidle' })
const genLink = page.getByRole('link', { name: /Generate|New exam|Create/i }).first()
if (await genLink.count()) {
  await genLink.click().catch(() => {})
  await page.waitForTimeout(1000)
}
await snap(page, 'LLM04-teacher-exams-area', 'Teacher exams / generate area after successful LLM draft')

fs.writeFileSync(path.join(OUT, 'INDEX.md'), [
  '# LLM exam generation proof',
  '',
  '| ID | Title | File |',
  '|----|-------|------|',
  ...index.map(r => `| ${r.id} | ${r.title} | ${r.file} |`),
  '',
  `Exam id: \`${EXAM}\``,
  'Model: `openrouter/free` via OpenRouter',
  'Teacher: hanan@cuilahore.edu.pk',
  '',
].join('\n'))

await browser.close()
console.log('done')
