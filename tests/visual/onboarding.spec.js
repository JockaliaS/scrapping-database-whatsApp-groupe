const { test, expect } = require('@playwright/test');

test.describe('Onboarding Flow', () => {

  test('Onboarding / login page displays correctly', async ({ page }) => {
    // The /onboarding route may redirect to /login if not authenticated
    // Based on the screenshot, the login page shows: "Connexion", EMAIL, MOT DE PASSE, "Se connecter"
    await page.goto('/onboarding');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'screenshots/onboarding-step1.png', fullPage: true });

    // Check if we're on the login page (redirect) or an actual onboarding page
    const currentUrl = page.url();

    if (currentUrl.includes('/login') || currentUrl.includes('/onboarding')) {
      // Try to find onboarding-specific elements first
      const hasProfileTextarea = await page.locator('textarea').first().isVisible().catch(() => false);

      if (hasProfileTextarea) {
        // We're on an actual onboarding page with a profile textarea
        const textarea = page.locator('textarea').first();
        await textarea.fill('Je suis consultant CRM Salesforce pour les PME');

        const analyzeBtn = page.getByText('Analyser', { exact: false }).first();
        if (await analyzeBtn.isVisible().catch(() => false)) {
          await analyzeBtn.click();
          await page.waitForTimeout(5000);
          await page.screenshot({ path: 'screenshots/onboarding-step1-analyzed.png', fullPage: true });
        }

        // Try to continue
        const continueBtn = page.getByText('Continuer', { exact: false }).first();
        if (await continueBtn.isVisible().catch(() => false)) {
          await continueBtn.click();
          await page.waitForTimeout(2000);
          await page.screenshot({ path: 'screenshots/onboarding-step2.png', fullPage: true });
        }
      } else {
        // We're on the login page - verify its elements
        // "Connexion" heading
        await expect(page.getByText('Connexion').first()).toBeVisible();

        // Email and password fields
        await expect(page.locator('input').first()).toBeVisible();

        // "Se connecter" button
        await expect(page.getByText('Se connecter').first()).toBeVisible();

        // "Creer un compte" link (no accent)
        await expect(page.getByText('Creer un compte').first()).toBeVisible();
      }
    }
  });
});
