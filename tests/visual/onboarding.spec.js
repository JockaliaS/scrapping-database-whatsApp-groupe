const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Onboarding Flow', () => {

  test('Onboarding / login page displays correctly', async ({ page }) => {
    await page.goto('/onboarding');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/onboarding-step1.png', fullPage: true });

    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      await expect(page.getByText('Connexion').first()).toBeVisible();
      await expect(page.getByText('Se connecter').first()).toBeVisible();
    }
  });

  test('Onboarding Step 3 — WhatsApp displays correctly', async ({ page }) => {
    await login(page);

    const base = process.env.FRONTEND_URL || 'http://localhost:3000';
    await page.goto(base + '/onboarding');
    await page.waitForTimeout(2000);

    // Go to step 3 (click Continuer twice)
    for (let i = 0; i < 2; i++) {
      const btn = page.getByText('Continuer').first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(1000);
      }
    }

    await page.screenshot({ path: 'screenshots/onboarding-step3.png', fullPage: true });

    // Step 3 can show: choice screen, connected state, or QR code
    const hasConnected = await page.getByText('connecte', { exact: false }).first().isVisible().catch(() => false);
    const hasChoice = await page.getByText("je n'ai pas", { exact: false }).first().isVisible().catch(() => false);
    const hasQR = await page.locator('img[src^="data:image"]').isVisible().catch(() => false);
    const hasScannez = await page.getByText('Scannez', { exact: false }).first().isVisible().catch(() => false);

    // At least one of these states must be true
    expect(hasConnected || hasChoice || hasQR || hasScannez).toBeTruthy();
  });

  test('Onboarding Step 3 — Existing instance list (Path B)', async ({ page }) => {
    await login(page);

    await page.goto(process.env.FRONTEND_URL + '/onboarding' || '/onboarding');
    await page.waitForTimeout(2000);

    // Go to step 3
    for (let i = 0; i < 2; i++) {
      const btn = page.getByText('Continuer').first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(1000);
      }
    }

    // Click "Oui, j'utilise deja un outil Jockalia" (Path B)
    const pathBBtn = page.getByText("j'utilise deja", { exact: false }).first();
    if (await pathBBtn.isVisible().catch(() => false)) {
      await pathBBtn.click();
      await page.waitForTimeout(3000);

      await page.screenshot({ path: 'screenshots/onboarding-step3-pathB.png', fullPage: true });

      // Verify instances list or input is visible
      const instanceInput = page.locator('input[placeholder*="instance"]');
      const inputVisible = await instanceInput.isVisible().catch(() => false);
      expect(inputVisible).toBeTruthy();
    }
  });
});
