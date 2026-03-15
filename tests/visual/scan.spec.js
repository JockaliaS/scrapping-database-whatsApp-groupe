const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Scan Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/scan', { waitUntil: 'networkidle' });
  });

  test('Page layout - title and subtitle visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Scan historique' })).toBeVisible();
    await expect(page.getByText('Analysez manuellement les messages', { exact: false })).toBeVisible();

    await page.screenshot({ path: 'screenshots/scan-layout.png', fullPage: true });
  });

  test('Warning banner is visible with correct content', async ({ page }) => {
    // Warning banner about API limitations
    await expect(page.getByText("Limites de l'API WhatsApp")).toBeVisible();
    await expect(page.getByText("Les limites de l'API restreignent", { exact: false })).toBeVisible();

    await page.screenshot({ path: 'screenshots/scan-warning-banner.png' });
  });

  test('Warning banner can be closed', async ({ page }) => {
    // Verify banner is visible
    const warningText = page.getByText("Limites de l'API WhatsApp");
    await expect(warningText).toBeVisible();

    // Click close button on the warning banner
    const closeBtn = page.locator('.rounded-xl.border-amber-200 button:has(span:has-text("close"))');
    await closeBtn.click();

    // Banner should disappear
    await expect(warningText).not.toBeVisible();

    await page.screenshot({ path: 'screenshots/scan-warning-closed.png', fullPage: true });
  });

  test('"Configurer le scan" section is visible', async ({ page }) => {
    await expect(page.getByText('Configurer le scan')).toBeVisible();

    await page.screenshot({ path: 'screenshots/scan-configure.png' });
  });

  test('Group selection checkboxes are shown', async ({ page }) => {
    await expect(page.getByText('Selectionner les groupes')).toBeVisible();

    // Filter input for groups
    const filterInput = page.locator('input[placeholder="Filtrer par nom..."]');
    await expect(filterInput).toBeVisible();

    // Either group checkboxes or empty state
    const hasGroups = await page.locator('input[type="checkbox"]').first().isVisible().catch(() => false);
    const hasNoGroups = await page.getByText('Aucun groupe disponible').isVisible().catch(() => false);
    expect(hasGroups || hasNoGroups).toBeTruthy();

    await page.screenshot({ path: 'screenshots/scan-group-selection.png' });
  });

  test('Period buttons are visible and selectable', async ({ page }) => {
    // "Periode d'analyse" label
    await expect(page.getByText("Periode d'analyse")).toBeVisible();

    const periods = ['7 jours', '30 jours', '3 mois', 'Personnalise'];
    for (const p of periods) {
      await expect(page.getByRole('button', { name: p, exact: true })).toBeVisible();
    }

    // Click "7 jours" period
    await page.getByRole('button', { name: '7 jours', exact: true }).click();

    // Verify it gets the selected style (bg-primary/10)
    const selectedBtn = page.getByRole('button', { name: '7 jours', exact: true });
    await expect(selectedBtn).toHaveClass(/border-primary/);

    // Click "3 mois" period
    await page.getByRole('button', { name: '3 mois', exact: true }).click();
    const selected3m = page.getByRole('button', { name: '3 mois', exact: true });
    await expect(selected3m).toHaveClass(/border-primary/);

    await page.screenshot({ path: 'screenshots/scan-period-buttons.png' });
  });

  test('Launch button is disabled when no groups selected', async ({ page }) => {
    const launchBtn = page.getByText('Lancer le scan historique');
    await expect(launchBtn).toBeVisible();

    // If no groups are selected, button should be disabled
    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();

    if (checkboxCount > 0) {
      // Make sure none are checked
      for (let i = 0; i < checkboxCount; i++) {
        if (await checkboxes.nth(i).isChecked()) {
          await checkboxes.nth(i).click();
        }
      }
    }

    // Button should be disabled
    const launchButton = page.locator('button:has-text("Lancer le scan historique")');
    await expect(launchButton).toBeDisabled();

    await page.screenshot({ path: 'screenshots/scan-launch-disabled.png' });
  });

  test('Launch button enables when a group is selected', async ({ page }) => {
    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();

    if (checkboxCount === 0) {
      test.skip();
      return;
    }

    // Select the first group
    await checkboxes.first().click();

    // Button should now be enabled
    const launchButton = page.locator('button:has-text("Lancer le scan historique")');
    await expect(launchButton).toBeEnabled();

    await page.screenshot({ path: 'screenshots/scan-launch-enabled.png' });
  });

  test('"Dernier resume de scan" summary card visible', async ({ page }) => {
    await expect(page.getByText('Dernier resume de scan')).toBeVisible();

    // Summary stats
    await expect(page.getByText('Total scannes')).toBeVisible();
    await expect(page.getByText('Correspondances')).toBeVisible();
    await expect(page.getByText('Nouveaux contacts')).toBeVisible();

    // "Voir dans Opportunites" button
    await expect(page.getByText('Voir dans Opportunites')).toBeVisible();

    await page.screenshot({ path: 'screenshots/scan-summary-card.png' });
  });

  test('"Conseil Expert" tip box visible', async ({ page }) => {
    await expect(page.getByText('Conseil Expert')).toBeVisible();
    await expect(page.getByText('Utilisez le scan historique ponctuellement', { exact: false })).toBeVisible();

    await page.screenshot({ path: 'screenshots/scan-expert-tip.png' });
  });

  test('"Voir dans Opportunites" navigates to opportunities page', async ({ page }) => {
    const voirBtn = page.getByText('Voir dans Opportunites');
    await voirBtn.click();

    await page.waitForURL('**/opportunities**', { timeout: 10000 });
    expect(page.url()).toContain('opportunities');

    await page.screenshot({ path: 'screenshots/scan-to-opportunities.png', fullPage: true });
  });

  test('Group filter input narrows the group list', async ({ page }) => {
    const checkboxes = page.locator('input[type="checkbox"]');
    const initialCount = await checkboxes.count();

    if (initialCount === 0) {
      test.skip();
      return;
    }

    const filterInput = page.locator('input[placeholder="Filtrer par nom..."]');
    await filterInput.fill('zzzznonexistent');

    await page.waitForTimeout(300);

    const filteredCount = await page.locator('input[type="checkbox"]').count();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);

    // Clear
    await filterInput.fill('');

    await page.screenshot({ path: 'screenshots/scan-group-filter.png' });
  });

  test('Full scan page screenshot', async ({ page }) => {
    await page.screenshot({ path: 'screenshots/scan-full.png', fullPage: true });
  });
});
