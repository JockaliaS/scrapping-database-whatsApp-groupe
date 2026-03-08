const { test, expect } = require('@playwright/test');

test.describe('Onboarding Flow', () => {

  test('Complete onboarding flow', async ({ page }) => {
    // Step 1: Navigate to onboarding
    await page.goto('/onboarding');
    await page.screenshot({ path: 'screenshots/onboarding-step1.png', fullPage: true });

    // Verify progress bar is visible (25%)
    const progressBar = page.locator('[role="progressbar"], .progress, .progress-bar, [class*="progress"]').first();
    await expect(progressBar).toBeVisible();

    // Fill the textarea with profile description
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible();
    await textarea.fill('Je suis consultant CRM Salesforce pour les PME');

    // Click "Analyser mon profil"
    const analyzeBtn = page.locator('button:has-text("Analyser mon profil"), button:has-text("Analyser")').first();
    await analyzeBtn.click();

    // Wait for the analysis response
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'screenshots/onboarding-step1-analyzed.png', fullPage: true });

    // Click "Continuer" to go to step 2
    const continueBtn1 = page.locator('button:has-text("Continuer"), button:has-text("Suivant")').first();
    await continueBtn1.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'screenshots/onboarding-step2.png', fullPage: true });

    // Step 2: Alert settings
    // Fill alert number if input is visible
    const alertInput = page.locator('input[type="number"], input[name*="alert"], input[name*="nombre"]').first();
    if (await alertInput.isVisible().catch(() => false)) {
      await alertInput.fill('10');
    }

    // Verify score slider is visible
    const slider = page.locator('input[type="range"], [role="slider"], [class*="slider"]').first();
    await expect(slider).toBeVisible();

    // Click "Continuer" to go to step 3
    const continueBtn2 = page.locator('button:has-text("Continuer"), button:has-text("Suivant")').first();
    await continueBtn2.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'screenshots/onboarding-step3.png', fullPage: true });

    // Step 3: WhatsApp QR
    // Click "Continuer" to go to step 4
    const continueBtn3 = page.locator('button:has-text("Continuer"), button:has-text("Suivant"), button:has-text("Passer")').first();
    await continueBtn3.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'screenshots/onboarding-step4.png', fullPage: true });
  });
});
