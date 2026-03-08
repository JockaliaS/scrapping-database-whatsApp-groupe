const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Dashboard', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Dashboard displays all sections correctly', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'screenshots/dashboard.png', fullPage: true });

    // Verify stat card labels are visible (no accents in UI)
    await expect(page.getByText('GROUPES MONITORES').first()).toBeVisible();
    await expect(page.getByText('OPPORTUNITES (24H)').first()).toBeVisible();
    await expect(page.getByText('SCORE MOYEN').first()).toBeVisible();
    await expect(page.getByText('TAUX DE REPONSE').first()).toBeVisible();

    // Verify "Opportunites Recentes" section
    await expect(page.getByText('Opportunites Recentes').first()).toBeVisible();

    // Verify "Groupes les plus actifs" section
    await expect(page.getByText('Groupes les plus actifs').first()).toBeVisible();

    // Verify "Mots-cles declenches" section
    await expect(page.getByText('Mots-cles declenches').first()).toBeVisible();

    // Verify "Scan manuel" floating button
    await expect(page.getByText('Scan manuel').first()).toBeVisible();

    // Verify "DECONNECTE" badge (not "SURVEILLANCE ACTIVE")
    await expect(page.getByText('DECONNECTE').first()).toBeVisible();
  });

  test('Scan manuel button navigates to /scan', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(3000);

    // Click "Scan manuel" button
    await page.getByText('Scan manuel').first().click();

    // Verify navigation to /scan
    await page.waitForURL('**/scan**', { timeout: 10000 });
    await page.screenshot({ path: 'screenshots/dashboard-to-scan.png', fullPage: true });
  });
});
