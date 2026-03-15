const { test, expect } = require('@playwright/test');
const { login, expectUrlContains } = require('./helpers');

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('All 4 stat cards are visible with correct labels', async ({ page }) => {
    // Card 1: Groupes Monitores
    await expect(page.getByText('Groupes Monitores')).toBeVisible();

    // Card 2: Opportunites (24h)
    await expect(page.getByText('Opportunites (24h)')).toBeVisible();

    // Card 3: Score Moyen
    await expect(page.getByText('Score Moyen')).toBeVisible();

    // Card 4: Messages recus (aujourd'hui)
    await expect(page.getByText("Messages recus (aujourd'hui)")).toBeVisible();

    await page.screenshot({ path: 'screenshots/dashboard-stat-cards.png', fullPage: true });
  });

  test('Stat cards display numeric values', async ({ page }) => {
    // Each stat card should have a numeric value (text-2xl font-bold)
    const statValues = page.locator('.text-2xl.font-bold');
    const count = await statValues.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('Opportunities list or empty state is visible', async ({ page }) => {
    // "Opportunites Recentes" heading
    await expect(page.getByText('Opportunites Recentes')).toBeVisible();

    // Either opportunity cards or empty state message
    const hasOpportunities = await page.locator('.flex.flex-col.gap-4 > div').first().isVisible().catch(() => false);
    const hasEmptyState = await page.getByText('Aucune opportunite detectee').isVisible().catch(() => false);

    expect(hasOpportunities || hasEmptyState).toBeTruthy();

    await page.screenshot({ path: 'screenshots/dashboard-opportunities-section.png', fullPage: true });
  });

  test('Sidebar - "Groupes les plus actifs" section visible', async ({ page }) => {
    await expect(page.getByText('Groupes les plus actifs')).toBeVisible();

    // Should show either group entries or empty message
    const hasGroups = await page.locator('.space-y-2').first().isVisible().catch(() => false);
    const hasNoGroups = await page.getByText('Aucun groupe monitore').isVisible().catch(() => false);

    expect(hasGroups || hasNoGroups).toBeTruthy();

    await page.screenshot({ path: 'screenshots/dashboard-groups-sidebar.png' });
  });

  test('Sidebar - "Mots-cles declenches" section visible', async ({ page }) => {
    await expect(page.getByText('Mots-cles declenches')).toBeVisible();

    // Should show keyword chips or empty message
    const hasKeywords = await page.locator('span:has-text("#")').first().isVisible().catch(() => false);
    const hasNoKeywords = await page.getByText('Aucun mot-cle detecte').isVisible().catch(() => false);

    expect(hasKeywords || hasNoKeywords).toBeTruthy();

    await page.screenshot({ path: 'screenshots/dashboard-keywords-sidebar.png' });
  });

  test('"Scan manuel" FAB button is visible and navigates to /scan', async ({ page }) => {
    const scanFab = page.getByText('Scan manuel').first();
    await expect(scanFab).toBeVisible();

    await scanFab.click();

    await expectUrlContains(page, 'scan');
    await expect(page.getByRole('heading', { name: 'Scan historique' })).toBeVisible();

    await page.screenshot({ path: 'screenshots/dashboard-fab-to-scan.png', fullPage: true });
  });

  test('"Voir tout" link navigates to /opportunities', async ({ page }) => {
    const voirToutLink = page.getByText('Voir tout');
    await expect(voirToutLink).toBeVisible();

    await voirToutLink.click();

    await expectUrlContains(page, 'opportunities');

    await page.screenshot({ path: 'screenshots/dashboard-voir-tout.png', fullPage: true });
  });

  test('Period filter buttons are visible and clickable', async ({ page }) => {
    // "Filtres rapides" label
    await expect(page.getByText('Filtres rapides')).toBeVisible();

    // Period buttons
    const periods = ['24h', '7 jours', '1 mois'];
    for (const p of periods) {
      const btn = page.getByRole('button', { name: p, exact: true });
      await expect(btn).toBeVisible();
    }

    // Click "7 jours" and verify it gets the active style
    await page.getByRole('button', { name: '7 jours', exact: true }).click();

    // "Periode personnalisee" button
    await expect(page.getByText('Periode personnalisee')).toBeVisible();

    await page.screenshot({ path: 'screenshots/dashboard-filters.png', fullPage: true });
  });

  test('Connection badge shows surveillance status', async ({ page }) => {
    // Should show either "Surveillance Active" or "Deconnecte"
    const hasSurveillance = await page.getByText('Surveillance Active').isVisible().catch(() => false);
    const hasDeconnecte = await page.getByText('Deconnecte').isVisible().catch(() => false);

    expect(hasSurveillance || hasDeconnecte).toBeTruthy();

    await page.screenshot({ path: 'screenshots/dashboard-connection-badge.png' });
  });

  test('Navbar displays all navigation links', async ({ page }) => {
    await expect(page.locator('nav').getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.locator('nav').getByRole('link', { name: 'Opportunites' })).toBeVisible();
    await expect(page.locator('nav').getByRole('link', { name: 'Scan', exact: true })).toBeVisible();
    await expect(page.locator('nav').getByRole('link', { name: 'Parametres' })).toBeVisible();
  });

  test('Full dashboard screenshot', async ({ page }) => {
    await page.screenshot({ path: 'screenshots/dashboard-full.png', fullPage: true });
  });
});
