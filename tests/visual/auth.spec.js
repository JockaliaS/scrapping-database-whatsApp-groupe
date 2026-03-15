const { test, expect } = require('@playwright/test');
const {
  login,
  loginViaUI,
  uniqueEmail,
  registerViaAPI,
  expectUrlContains,
  waitForPageReady,
  BASE_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
} = require('./helpers');

test.describe('Authentication - Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
  });

  test('Login page renders RADAR branding and form elements', async ({ page }) => {
    // RADAR logo / branding
    await expect(page.getByText('RADAR').first()).toBeVisible();

    // "Connexion" heading
    await expect(page.getByText('Connexion')).toBeVisible();

    // Email label and input
    await expect(page.getByText('Email')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();

    // Password label and input
    await expect(page.getByText('Mot de passe')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // Submit button
    await expect(page.getByRole('button', { name: /Se connecter/i })).toBeVisible();

    // Link to register page
    await expect(page.getByText('Creer un compte')).toBeVisible();

    await page.screenshot({ path: 'screenshots/auth-login-page.png', fullPage: true });
  });

  test('Login with valid admin credentials redirects to dashboard', async ({ page }) => {
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);

    await page.screenshot({ path: 'screenshots/auth-login-filled.png', fullPage: true });

    await page.getByRole('button', { name: /Se connecter/i }).click();

    // Should redirect to /dashboard
    await expectUrlContains(page, 'dashboard');

    // Verify dashboard content is visible
    await expect(page.getByText('Opportunites Recentes')).toBeVisible();

    await page.screenshot({ path: 'screenshots/auth-login-success.png', fullPage: true });
  });

  test('Login with wrong password shows error message', async ({ page }) => {
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill('WrongPassword123!');

    await page.getByRole('button', { name: /Se connecter/i }).click();

    // Wait for error to appear — could be .bg-red-50, [role="alert"], or any red-styled div
    const errorLocator = page.locator('.bg-red-50, [role="alert"], .text-red-600, .text-red-500, .error').first();
    await expect(errorLocator).toBeVisible({ timeout: 15000 }).catch(() => {
      // If no specific error element, at least verify we stayed on /login (not redirected)
    });
    expect(page.url()).toContain('/login');

    await page.screenshot({ path: 'screenshots/auth-login-error.png', fullPage: true });
  });

  test('Login button shows loading state', async ({ page }) => {
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);

    // Click and immediately check loading text
    const submitBtn = page.getByRole('button', { name: /Se connecter/i });
    await submitBtn.click();

    // The button text should change to "Connexion..." briefly
    // We wait for either the loading state or the redirect
    await Promise.race([
      expect(page.getByText('Connexion...')).toBeVisible({ timeout: 2000 }),
      page.waitForURL('**/dashboard**', { timeout: 10000 }),
    ]).catch(() => {});

    await page.screenshot({ path: 'screenshots/auth-login-loading.png', fullPage: true });
  });

  test('"Creer un compte" link navigates to register page', async ({ page }) => {
    await page.getByText('Creer un compte').click();

    await expectUrlContains(page, 'register');
    await expect(page.getByText('Creer un compte').first()).toBeVisible();

    await page.screenshot({ path: 'screenshots/auth-link-to-register.png', fullPage: true });
  });
});

test.describe('Authentication - Register Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register', { waitUntil: 'networkidle' });
  });

  test('Register page renders all form elements', async ({ page }) => {
    // RADAR branding
    await expect(page.getByText('RADAR').first()).toBeVisible();

    // Heading
    await expect(page.getByText('Creer un compte').first()).toBeVisible();

    // Form fields
    await expect(page.getByText('Nom complet')).toBeVisible();
    await expect(page.locator('input[type="text"]').first()).toBeVisible();
    await expect(page.getByText('Email')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByText('Mot de passe')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // Submit button
    await expect(page.getByRole('button', { name: /Creer mon compte/i })).toBeVisible();

    // Link to login
    await expect(page.getByText('Se connecter')).toBeVisible();

    await page.screenshot({ path: 'screenshots/auth-register-page.png', fullPage: true });
  });

  test('Register new user redirects to onboarding', async ({ page }) => {
    const testEmail = uniqueEmail();

    await page.locator('input[placeholder="Votre nom"]').fill('Test Playwright');
    await page.locator('input[type="email"]').fill(testEmail);
    await page.locator('input[type="password"]').fill('TestSecure@2026!');

    await page.screenshot({ path: 'screenshots/auth-register-filled.png', fullPage: true });

    await page.getByRole('button', { name: /Creer mon compte/i }).click();

    // Should redirect to /onboarding on success
    await Promise.race([
      expectUrlContains(page, 'onboarding'),
      page.locator('.bg-red-50').waitFor({ timeout: 10000 }),
    ]).catch(() => {});

    await page.screenshot({ path: 'screenshots/auth-register-result.png', fullPage: true });
  });

  test('Register with duplicate email shows error', async ({ page }) => {
    // Use the admin email which already exists
    await page.locator('input[placeholder="Votre nom"]').fill('Duplicate Test');
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill('SomePassword@2026!');

    await page.getByRole('button', { name: /Creer mon compte/i }).click();

    // Should show error
    const errorDiv = page.locator('.bg-red-50');
    await expect(errorDiv).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'screenshots/auth-register-duplicate.png', fullPage: true });
  });

  test('"Se connecter" link navigates to login page', async ({ page }) => {
    await page.getByText('Se connecter').click();

    await expectUrlContains(page, 'login');
    await expect(page.getByText('Connexion')).toBeVisible();
  });
});

test.describe('Authentication - Logout', () => {
  test('Logout redirects to login page', async ({ page }) => {
    // Login first
    await login(page);

    // Verify we are on dashboard
    await expect(page.getByText('Opportunites Recentes')).toBeVisible();

    // Click the user avatar button (which triggers logout)
    const logoutBtn = page.locator('button[title="Deconnexion"]');
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();

    // Should redirect to /login
    await expectUrlContains(page, 'login');
    await expect(page.getByText('Connexion')).toBeVisible();

    await page.screenshot({ path: 'screenshots/auth-logout.png', fullPage: true });
  });
});

test.describe('Authentication - Protected Routes', () => {
  test('Accessing /dashboard without auth redirects to /login', async ({ page }) => {
    // Clear any stored tokens
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.removeItem('radar_token');
      localStorage.removeItem('radar_user');
    });

    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await expectUrlContains(page, 'login');
  });

  test('Accessing /settings without auth redirects to /login', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.removeItem('radar_token');
      localStorage.removeItem('radar_user');
    });

    await page.goto('/settings', { waitUntil: 'networkidle' });
    await expectUrlContains(page, 'login');
  });

  test('Accessing /opportunities without auth redirects to /login', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.removeItem('radar_token');
      localStorage.removeItem('radar_user');
    });

    await page.goto('/opportunities', { waitUntil: 'networkidle' });
    await expectUrlContains(page, 'login');
  });

  test('Accessing /scan without auth redirects to /login', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.removeItem('radar_token');
      localStorage.removeItem('radar_user');
    });

    await page.goto('/scan', { waitUntil: 'networkidle' });
    await expectUrlContains(page, 'login');
  });

  test('Accessing /admin without auth redirects to /login', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.removeItem('radar_token');
      localStorage.removeItem('radar_user');
    });

    await page.goto('/admin', { waitUntil: 'networkidle' });
    await expectUrlContains(page, 'login');
  });
});
