import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE = 'https://frontend-six-vert-62.vercel.app';
const TOKEN = fs.readFileSync('/tmp/vyce_teacher_token.txt','utf8').trim();
const EXAM_ID = fs.readFileSync('/tmp/vyce_exam_id.txt','utf8').trim();
const outDir = fileURLToPath(new URL('./screenshots/vyceai-proof/', import.meta.url));
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

async function shot(name) {
  const p = path.join(outDir, name + '.png');
  await page.screenshot({ path: p, fullPage: true });
  console.log('SHOT', p, fs.statSync(p).size);
}

// Find token key by probing common keys after injecting several
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate((token) => {
  const keys = ['cogni_token','token','access_token','cogni.ai.token','cogni_access_token','authToken'];
  for (const k of keys) localStorage.setItem(k, token);
  // also sessionStorage
  for (const k of keys) sessionStorage.setItem(k, token);
}, TOKEN);

// Read client bundle for TOKEN_KEY if needed
const keyGuess = await page.evaluate(async () => {
  // try fetch me with Authorization to confirm API works from browser origin
  return 'injected';
});
console.log('inject', keyGuess);

// Grep TOKEN_KEY from built assets is better - pass from env
const TOKEN_KEY = process.env.TOKEN_KEY || 'cogni_token';
await page.evaluate(([k,t]) => localStorage.setItem(k,t), [TOKEN_KEY, TOKEN]);

await page.goto(BASE + '/app/teacher', { waitUntil: 'networkidle', timeout: 120000 }).catch(()=>{});
await page.waitForTimeout(5000);
// if redirected to login, try again with other keys
if (page.url().includes('login') || page.url().includes('signin')) {
  console.log('still_login', page.url());
}
await shot('01-teacher-home');

await page.goto(BASE + '/app/teacher/settings', { waitUntil: 'networkidle', timeout: 120000 }).catch(()=>{});
await page.getByText(/Exam generation LLM|Platform default|VyceAI|Provider/i).first().waitFor({ timeout: 60000 }).catch(()=>{});
await page.waitForTimeout(3000);
await shot('02-settings-platform-vyceai');

await page.goto(BASE + '/app/teacher/exams/new?cls=6ae4f855908d53f659363b98', { waitUntil: 'networkidle', timeout: 120000 }).catch(()=>{});
await page.getByText(/Generate a draft|platform LLM|VyceAI|Source material/i).first().waitFor({ timeout: 60000 }).catch(()=>{});
await page.waitForTimeout(3000);
await shot('03-generate-form-platform-note');

await page.goto(BASE + '/app/teacher/exams/' + EXAM_ID, { waitUntil: 'networkidle', timeout: 120000 }).catch(()=>{});
await page.getByText(/VyceAI platform default|question|MCQ|Draft/i).first().waitFor({ timeout: 60000 }).catch(()=>{});
await page.waitForTimeout(4000);
await shot('04-exam-draft-success');
console.log('URL', page.url());
console.log('DONE');
await browser.close();
