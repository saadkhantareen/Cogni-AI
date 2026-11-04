import { chromium } from '@playwright/test';
import fs from 'fs';

const BASE = 'https://frontend-six-vert-62.vercel.app';
const EXAM_ID = '6ae8fb095c52a1fbf54da850';
const OUT = new URL('./screenshots/vyceai-proof/', import.meta.url);
import { fileURLToPath } from 'url';
import path from 'path';
const outDir = fileURLToPath(OUT);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
async function shot(name) {
  const p = path.join(outDir, name + '.png');
  await page.screenshot({ path: p, fullPage: true });
  console.log('SHOT', p);
}
try {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(1000);
  // Select teacher role if dropdown
  const role = page.locator('select').first();
  if (await role.count()) {
    try { await role.selectOption({ label: 'Teacher' }); } catch {}
    try { await role.selectOption('teacher'); } catch {}
  }
  await page.locator('input[type="email"], input[name="email"]').first().fill('ammar@cuilahore.edu.pk');
  await page.locator('input[type="password"]').first().fill('ammar@12321');
  await page.getByRole('button', { name: /Sign in|Log in|Continue/i }).first().click();
  await page.waitForURL(/teacher/, { timeout: 90000 });
  await page.waitForTimeout(1500);
  await shot('01-teacher-home');

  await page.goto(BASE + '/app/teacher/settings', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2000);
  await shot('02-settings-platform-vyceai');

  await page.goto(BASE + '/app/teacher/exams/new?cls=6ae4f855908d53f659363b98', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2000);
  await shot('03-generate-form-platform-note');

  await page.goto(BASE + '/app/teacher/exams/' + EXAM_ID, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2500);
  await shot('04-exam-draft-success');
  console.log('DONE_OK', EXAM_ID);
} catch (e) {
  console.error('SCREENSHOT_FAIL', e);
  await shot('error-state');
  process.exitCode = 1;
} finally {
  await browser.close();
}
