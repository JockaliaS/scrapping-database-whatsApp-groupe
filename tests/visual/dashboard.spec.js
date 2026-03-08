const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Dashboard', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Dashboard displays all sections correctly', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/dashboard.png', fullPage: true });

    // Verify 4 stat cards are visible
    const statCards = page.locator('[class*="stat"], [class*="card"], [class*="Card"]');
    const cardCount = await statCards.count();
    expect(cardCount).toBeGreaterThanOrEqual(4);

    // Verify "Opportunites Recentes" section
    const recentOpportunities = page.locator('text=Opportunités Récentes, text=Opportunites Recentes, text=Récentes').first();
    await expect(recentOpportunities).toBeVisible();

    // Verify "Groupes les plus actifs" section
    const activeGroups = page.locator('text=Groupes les plus actifs, text=plus actifs, text=Groupes actifs').first();
    await expect(activeGroups).toBeVisible();

    // Verify "Scan manuel" floating button
    const scanButton = page.locator('button:has-text("Scan manuel"), button:has-text("Scan"), [class*="fab"], [class*="float"]').first();
    await expect(scanButton).toBeVisible();

    // Verify "SURVEILLANCE ACTIVE" badge
    const badge = page.locator('text=SURVEILLANCE ACTIVE, text=Surveillance Active, text=surveillance active').first();
    await expect(badge).toBeVisible();
  });

  test('Scan manuel button navigates to /scan', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);

    // Click "Scan manuel" button
    const scanButton = page.locator('button:has-text("Scan manuel"), button:has-text("Scan"), [class*="fab"], [class*="float"]').first();
    await scanButton.click();

    // Verify navigation to /scan
    await page.waitForURL('**/scan**', { timeout: 10000 });
    await page.screenshot({ path: 'screenshots/dashboard-to-scan.png', fullPage: true });
  });
});
