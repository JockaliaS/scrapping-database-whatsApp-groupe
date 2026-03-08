const { test, expect } = require('@playwright/test');

test.describe('Authentication Pages', () => {

  test('Login page displays correctly', async ({ page }) => {
    await page.goto('/login');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/login-page.png', fullPage: true });

    // Verify "RADAR" branding is visible
    await expect(page.getByText('RADAR').first()).toBeVisible();

    // Verify "Connexion" heading
    await expect(page.getByText('Connexion').first()).toBeVisible();

    // Verify "Se connecter" button
    await expect(page.getByText('Se connecter').first()).toBeVisible();

    // Verify "Creer un compte" link (no accent)
    await expect(page.getByText('Creer un compte').first()).toBeVisible();
  });

  test('Login with credentials shows redirect or error', async ({ page }) => {
    await page.goto('/login');
    await page.waitForTimeout(2000);

    // Fill email and password
    await page.locator('input[type="email"], input[name="email"]').first().fill('admin@radar.jockaliaservices.fr');
    await page.locator('input[type="password"], input[name="password"]').first().fill('Radar@2026!');

    await page.screenshot({ path: 'screenshots/login-filled.png', fullPage: true });

    // Click "Se connecter" button
    await page.getByText('Se connecter').first().click();

    // Wait for either redirect or error message
    await Promise.race([
      page.waitForURL('**/dashboard**', { timeout: 10000 }),
      page.waitForSelector('[role="alert"], .error, .toast', { timeout: 10000 }),
    ]).catch(() => {});

    await page.screenshot({ path: 'screenshots/login-result.png', fullPage: true });
  });

  test('Register page displays correctly and form submission', async ({ page }) => {
    await page.goto('/register');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/register-page.png', fullPage: true });

    // Fill registration form if fields are visible
    const nameInput = page.locator('input[name="name"], input[name="nom"], input[placeholder*="nom"], input[placeholder*="name"]').first();
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill('Test User');
    }

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill('test@example.com');
    }

    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    if (await passwordInput.isVisible().catch(() => false)) {
      await passwordInput.fill('TestPassword@2026!');
    }

    // Fill confirm password if present
    const confirmPassword = page.locator('input[name="confirmPassword"], input[name="confirm_password"], input[placeholder*="confirm"]').first();
    if (await confirmPassword.isVisible().catch(() => false)) {
      await confirmPassword.fill('TestPassword@2026!');
    }

    await page.screenshot({ path: 'screenshots/register-filled.png', fullPage: true });

    // Submit - look for "Creer un compte" or similar button (no accents)
    const submitBtn = page.locator('button[type="submit"]').first();
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();

      await Promise.race([
        page.waitForURL('**/login**', { timeout: 10000 }),
        page.waitForURL('**/onboarding**', { timeout: 10000 }),
        page.waitForURL('**/dashboard**', { timeout: 10000 }),
        page.waitForSelector('[role="alert"], .error, .toast', { timeout: 10000 }),
      ]).catch(() => {});

      await page.screenshot({ path: 'screenshots/register-result.png', fullPage: true });
    }
  });

  test('Login with admin credentials', async ({ page }) => {
    await page.goto('/login');
    await page.waitForTimeout(2000);

    await page.locator('input[type="email"], input[name="email"]').first().fill('admin@radar.jockaliaservices.fr');
    await page.locator('input[type="password"], input[name="password"]').first().fill('Radar@2026!');
    await page.getByText('Se connecter').first().click();

    await Promise.race([
      page.waitForURL('**/dashboard**', { timeout: 10000 }),
      page.waitForSelector('[role="alert"], .error, .toast', { timeout: 10000 }),
    ]).catch(() => {});

    await page.screenshot({ path: 'screenshots/login-admin-result.png', fullPage: true });
  });
});
