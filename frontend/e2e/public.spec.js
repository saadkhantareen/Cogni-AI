import { expect, test } from '@playwright/test'
import { DEMO, DEMO_PASSWORD, loginAs, loginWithPassword } from './helpers/auth.js'

test.describe('Public pages', () => {
  test('landing page loads and links to sign in', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Try the demo|Open the demo/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /cogni\.ai/i }).first()).toBeVisible()
  })

  test('login page shows demo accounts', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Demo accounts' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Sign in as .*, Admin/i }).first(),
    ).toBeVisible({ timeout: 20_000 })
  })

  test('demo teacher sign-in lands on teacher home', async ({ page }) => {
    await loginAs(page, 'teacher')
    await expect(page).toHaveURL(/\/app\/teacher\/?$/)
    await expect(page.getByText(/TEACHER PORTAL/i).first()).toBeVisible()
  })

  test('wrong password shows an error', async ({ page }) => {
    await loginWithPassword(page, DEMO.admin.email, 'not-the-password')
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('manual login with demo password works', async ({ page }) => {
    await loginWithPassword(page, DEMO.student.email, DEMO_PASSWORD)
    await page.waitForURL(/\/app\/student/, { timeout: 30_000 })
    await expect(page.getByText(/STUDENT PORTAL/i).first()).toBeVisible()
  })
})
