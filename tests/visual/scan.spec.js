const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Scan Page', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Scan page displays all elements correctly', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/scan.png', fullPage: true });

    // Verify warning banner about WhatsApp API limitations
    const warningBanner = page.locator('[role="alert"], [class*="warning"], [class*="banner"], [class*="alert"], text=WhatsApp').first();
    await expect(warningBanner).toBeVisible();

    // Verify group selection checkboxes
    const checkboxes = page.locator('input[type="checkbox"], [role="checkbox"]');
    const checkboxCount = await checkboxes.count();
    expect(checkboxCount).toBeGreaterThanOrEqual(1);

    // Verify period buttons
    const periodButtons = ['7 jours', '30 jours', '3 mois', 'Personnalisé'];
    for (const period of periodButtons) {
      const periodBtn = page.locator(`button:has-text("${period}"), [role="tab"]:has-text("${period}"), label:has-text("${period}")`).first();
      await expect(periodBtn).toBeVisible();
    }
  });

  test('Click "Lancer le scan" shows scan running state', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForTimeout(2000);

    // Click "Lancer le scan"
    const launchBtn = page.locator('button:has-text("Lancer le scan"), button:has-text("Lancer"), button:has-text("Démarrer")').first();
    await launchBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/scan-running.png', fullPage: true });
  });
});
