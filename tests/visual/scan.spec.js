const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Scan Page', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Scan page displays all elements correctly', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'screenshots/scan.png', fullPage: true });

    // Verify page heading "Scan historique"
    await expect(page.getByText('Scan historique').first()).toBeVisible();

    // Verify warning banner about WhatsApp API limitations
    await expect(page.getByText("Limites de l'API WhatsApp").first()).toBeVisible();

    // Verify "Configurer le scan" section
    await expect(page.getByText('Configurer le scan').first()).toBeVisible();

    // Verify "Selectionner les groupes" label
    await expect(page.getByText('Selectionner les groupes').first()).toBeVisible();

    // Verify period buttons (no accent on Personnalise)
    const periodButtons = ['7 jours', '30 jours', '3 mois', 'Personnalise'];
    for (const period of periodButtons) {
      await expect(page.getByText(period, { exact: false }).first()).toBeVisible();
    }

    // Verify "Lancer le scan historique" button
    await expect(page.getByText('Lancer le scan historique').first()).toBeVisible();

    // Verify "Dernier resume de scan" section
    await expect(page.getByText('Dernier resume de scan').first()).toBeVisible();
  });

  test('Click "Lancer le scan historique" button', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForTimeout(3000);

    // The button may be disabled when no groups are available, use force click
    const launchBtn = page.getByText('Lancer le scan historique').first();
    await launchBtn.click({ force: true });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/scan-running.png', fullPage: true });
  });
});
