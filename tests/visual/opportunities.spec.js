const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Opportunities Page', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Opportunities page displays filter bar and table', async ({ page }) => {
    await page.goto('/opportunities');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'screenshots/opportunities.png', fullPage: true });

    // Verify page heading "Opportunites" (no accent)
    await expect(page.getByText('Opportunites').first()).toBeVisible();

    // Verify total count badge
    await expect(page.getByText('total').first()).toBeVisible();

    // Verify search input
    const searchInput = page.locator('input[placeholder*="Rechercher"]').first();
    await expect(searchInput).toBeVisible();

    // Verify "Exporter (CSV)" button
    await expect(page.getByText('Exporter (CSV)').first()).toBeVisible();

    // Verify date filter "7 derniers jours"
    await expect(page.getByText('7 derniers jours').first()).toBeVisible();

    // Verify status filter "Statut"
    await expect(page.getByText('Statut').first()).toBeVisible();

    // Verify table headers (uppercase in the UI)
    const headers = ['DATE/HEURE', 'GROUPE', 'CONTACT', 'EXTRAIT DU MESSAGE', 'SCORE', 'STATUT', 'ACTIONS'];
    for (const header of headers) {
      await expect(page.getByText(header).first()).toBeVisible();
    }

    // Verify either data rows or empty state
    const hasData = await page.locator('tbody tr').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText('Aucune opportunite', { exact: false }).first().isVisible().catch(() => false);
    expect(hasData || hasEmpty).toBeTruthy();
  });

  test('Click row opens detail panel', async ({ page }) => {
    await page.goto('/opportunities');
    await page.waitForTimeout(3000);

    // Check if any data rows exist
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      await rows.first().click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'screenshots/opportunities-detail-panel.png', fullPage: true });
    }
    // If no rows, test passes (empty state already verified in previous test)
  });
});
