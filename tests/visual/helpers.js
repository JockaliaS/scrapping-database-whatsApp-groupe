const { expect } = require('@playwright/test');

const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:8000';

const ADMIN_EMAIL = 'admin@radar.jockaliaservices.fr';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'RadarAdmin2026';

/**
 * Login via API and inject token into localStorage so the SPA
 * treats the browser as authenticated.
 */
async function login(page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  // Get token via API
  const response = await page.request.post(`${API_URL}/auth/login`, {
    data: { email, password },
  });

  if (!response.ok()) {
    throw new Error(`Login API returned ${response.status()}`);
  }

  const data = await response.json();

  if (!data.token) {
    throw new Error('Login failed: no token returned');
  }

  // Navigate to frontend domain first so localStorage is scoped correctly
  await page.goto(BASE_URL + '/login', { waitUntil: 'domcontentloaded' });

  // Inject token + user into localStorage
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('radar_token', token);
    localStorage.setItem('radar_user', JSON.stringify(user));
  }, { token: data.token, user: data.user });

  // Navigate to dashboard to activate the authenticated session
  await page.goto(BASE_URL + '/dashboard', { waitUntil: 'networkidle' });

  return data;
}

/**
 * Login via the UI form (for auth flow tests).
 */
async function loginViaUI(page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Se connecter/i }).click();
}

/**
 * Generate a unique test email to avoid collisions.
 */
function uniqueEmail() {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  return `test_${ts}_${rand}@radar-test.local`;
}

/**
 * Register a new user via API.
 */
async function registerViaAPI(page, { name, email, password }) {
  const response = await page.request.post(`${API_URL}/auth/register`, {
    data: { name, email, password },
  });
  return { response, data: await response.json().catch(() => null) };
}

/**
 * Assert page has navigated to a path containing the given substring.
 */
async function expectUrlContains(page, substring, timeout = 10000) {
  await page.waitForURL(`**/${substring}**`, { timeout });
  expect(page.url()).toContain(substring);
}

/**
 * Wait for content to be ready after navigation (network idle).
 */
async function waitForPageReady(page) {
  await page.waitForLoadState('networkidle');
}

module.exports = {
  login,
  loginViaUI,
  uniqueEmail,
  registerViaAPI,
  expectUrlContains,
  waitForPageReady,
  BASE_URL,
  API_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
};
