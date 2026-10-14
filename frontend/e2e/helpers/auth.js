/** Demo accounts matching backend seed (password always demo123). */
export const DEMO = {
  admin: { email: 'admin@cogni.pk', roleLabel: 'Admin', home: '/app/admin' },
  hod: {
    email: 'tariq.mehmood@umt.edu.pk',
    roleLabel: 'HOD',
    home: '/app/hod',
  },
  teacher: {
    email: 'ayesha.khan@umt.edu.pk',
    roleLabel: 'Teacher',
    home: '/app/teacher',
  },
  student: {
    email: 'hamza.ali@umt.edu.pk',
    roleLabel: 'Student',
    home: '/app/student',
  },
}

export const DEMO_PASSWORD = 'demo123'

/**
 * Wipe JWT and land on a fresh login screen.
 * Clear storage on a blank document first so AuthContext never hydrates an old user.
 */
export async function clearSession(page) {
  await page.goto('about:blank')
  await page.evaluate(() => {
    try {
      localStorage.clear()
    } catch {
      /* about:blank may block storage in some browsers — ignore */
    }
  })
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.removeItem('cogni-token')
  })
  // If a token was restored before clear, force one more load
  if (await page.getByRole('heading', { name: 'Sign in' }).count() === 0) {
    await page.evaluate(() => localStorage.removeItem('cogni-token'))
    await page.goto('/login')
  }
  await page.getByRole('heading', { name: 'Sign in' }).waitFor({ timeout: 20_000 })
  await page
    .getByRole('button', { name: /Sign in as /i })
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 })
}

/**
 * Sign in via demo-account button on /login.
 * @param {import('@playwright/test').Page} page
 * @param {'admin'|'hod'|'teacher'|'student'} role
 */
export async function loginAs(page, role) {
  const acct = DEMO[role]
  if (!acct) throw new Error(`Unknown role: ${role}`)

  await clearSession(page)

  const match = page.locator('button.acct').filter({ hasText: acct.email })
  await match.first().waitFor({ state: 'visible', timeout: 20_000 })
  await match.first().click()

  const rateLimited = page.getByText(/Too many requests/i)
  try {
    await page.waitForURL((url) => url.pathname.startsWith(acct.home), {
      timeout: 30_000,
    })
  } catch (err) {
    if (await rateLimited.isVisible().catch(() => false)) {
      throw new Error(
        `Login rate-limited while signing in as ${role}. ` +
          'Ensure LOGIN_RATE_LIMIT_MAX is raised for Playwright (see playwright.config.js).',
      )
    }
    throw err
  }
}

/**
 * Manual email/password login.
 * @param {import('@playwright/test').Page} page
 * @param {string} email
 * @param {string} password
 */
export async function loginWithPassword(page, email, password) {
  await clearSession(page)
  await page.locator('#l-email').fill(email)
  await page.locator('#l-pw').fill(password)
  await page.locator('#login-main > div').getByRole('button', { name: 'Sign in', exact: true }).click()
}

/**
 * Switch demo account from the AppShell account menu.
 * @param {import('@playwright/test').Page} page
 * @param {string} email
 */
export async function switchDemo(page, email) {
  const target = Object.values(DEMO).find((a) => a.email === email)
  const home = target?.home || '/app/'

  await page.getByRole('button', { name: /Account menu for/i }).click()
  await page.getByLabel('Switch demo account').waitFor()
  await page.locator('#switch').selectOption(email)
  const prefix = home.replace(/\/$/, '')
  await page.waitForURL((url) => url.pathname.startsWith(prefix), {
    timeout: 30_000,
  })
}

/**
 * Confirm the in-app modal (useConfirm / openModal).
 * @param {import('@playwright/test').Page} page
 * @param {string|RegExp} okName
 */
export async function confirmModal(page, okName) {
  const dialog = page.locator('#modal-box, .modal').first()
  await dialog.waitFor({ state: 'visible' })
  await dialog.getByRole('button', { name: okName }).click()
}
