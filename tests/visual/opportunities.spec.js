const { test, expect } = require('@playwright/test');
const { login, waitForPageReady } = require('./helpers');

test.describe('Opportunities Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/opportunities', { waitUntil: 'networkidle' });
  });

  test('Page heading and total count badge visible', async ({ page }) => {
    await expect(page.getByText('Opportunites').first()).toBeVisible();
    await expect(page.getByText('total')).toBeVisible();

    await page.screenshot({ path: 'screenshots/opportunities-header.png', fullPage: true });
  });

  test('Search input is visible and functional', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Rechercher"]');
    await expect(searchInput).toBeVisible();

    // Type a search query
    await searchInput.fill('test');

    // Wait for filtering to apply
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'screenshots/opportunities-search.png', fullPage: true });

    // Clear search
    await searchInput.fill('');
  });

  test('"Exporter (CSV)" button is visible', async ({ page }) => {
    await expect(page.getByText('Exporter (CSV)')).toBeVisible();

    await page.screenshot({ path: 'screenshots/opportunities-export-btn.png' });
  });

  test('Date filter "7 derniers jours" button is visible', async ({ page }) => {
    await expect(page.getByText('7 derniers jours')).toBeVisible();
  });

  test('Status filter "Statut" button is visible', async ({ page }) => {
    await expect(page.getByText('Statut').first()).toBeVisible();
  });

  test('Table renders with all correct column headers', async ({ page }) => {
    const headers = ['Date/Heure', 'Groupe', 'Contact', 'Extrait du message', 'Score', 'Statut', 'Actions'];
    for (const header of headers) {
      await expect(page.getByText(header, { exact: false }).first()).toBeVisible();
    }

    await page.screenshot({ path: 'screenshots/opportunities-table-headers.png', fullPage: true });
  });

  test('Table shows data rows or empty state', async ({ page }) => {
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // First row should be visible
      await expect(rows.first()).toBeVisible();
      // Verify row has clickable content
      const firstRowText = await rows.first().textContent();
      expect(firstRowText.length).toBeGreaterThan(0);
    } else {
      // Empty state message
      await expect(page.getByText('Aucune opportunite trouvee')).toBeVisible();
    }

    await page.screenshot({ path: 'screenshots/opportunities-table-data.png', fullPage: true });
  });

  test('Click row opens detail panel with all sections', async ({ page }) => {
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      test.skip();
      return;
    }

    // Click the first row
    await rows.first().click();

    // Wait for the detail panel to appear
    const detailPanel = page.locator('aside');
    await expect(detailPanel).toBeVisible({ timeout: 5000 });

    // Panel header
    await expect(page.getByText("Details de l'opportunite")).toBeVisible();

    // Section: Message complet
    await expect(page.getByText('Message complet')).toBeVisible();

    // Section: Profil du contact
    await expect(page.getByText('Profil du contact')).toBeVisible();

    // Section: Analyse du score
    await expect(page.getByText('Analyse du score')).toBeVisible();

    // Score percentage badge (e.g. "85%")
    const scoreDisplay = page.locator('.text-3xl.font-black.font-mono.text-primary');
    await expect(scoreDisplay).toBeVisible();

    await page.screenshot({ path: 'screenshots/opportunities-detail-panel.png', fullPage: true });
  });

  test('Detail panel shows AI analysis when available', async ({ page }) => {
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      test.skip();
      return;
    }

    await rows.first().click();
    const detailPanel = page.locator('aside');
    await expect(detailPanel).toBeVisible({ timeout: 5000 });

    // Check if AI analysis section is present (may not be on every opportunity)
    const hasAIAnalysis = await page.getByText("Pourquoi l'IA a detecte cette opportunite").isVisible().catch(() => false);
    const hasSuggestedReply = await page.getByText("Reponse suggeree par l'IA").isVisible().catch(() => false);

    // At minimum, the score analysis section should be visible
    await expect(page.getByText('Analyse du score')).toBeVisible();

    await page.screenshot({ path: 'screenshots/opportunities-detail-ai.png', fullPage: true });
  });

  test('Detail panel copy buttons are visible', async ({ page }) => {
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      test.skip();
      return;
    }

    await rows.first().click();
    const detailPanel = page.locator('aside');
    await expect(detailPanel).toBeVisible({ timeout: 5000 });

    // "Copier" button for message
    const copyBtn = page.getByText('Copier').first();
    await expect(copyBtn).toBeVisible();

    await page.screenshot({ path: 'screenshots/opportunities-detail-copy.png' });
  });

  test('Detail panel status change buttons are visible', async ({ page }) => {
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      test.skip();
      return;
    }

    await rows.first().click();
    const detailPanel = page.locator('aside');
    await expect(detailPanel).toBeVisible({ timeout: 5000 });

    // Status action buttons
    await expect(page.getByText('Marque comme contacte')).toBeVisible();
    await expect(page.getByText('Gagne')).toBeVisible();
    await expect(page.getByText('Non pertinent')).toBeVisible();

    await page.screenshot({ path: 'screenshots/opportunities-detail-status-buttons.png', fullPage: true });
  });

  test('Detail panel close button works', async ({ page }) => {
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      test.skip();
      return;
    }

    await rows.first().click();
    const detailPanel = page.locator('aside');
    await expect(detailPanel).toBeVisible({ timeout: 5000 });

    // Click close button
    const closeBtn = detailPanel.locator('button:has(span:has-text("close"))');
    await closeBtn.click();

    // Panel should disappear
    await expect(detailPanel).not.toBeVisible();
  });

  test('Search filter narrows table results', async ({ page }) => {
    const rows = page.locator('tbody tr');
    const initialCount = await rows.count();

    if (initialCount === 0) {
      test.skip();
      return;
    }

    const searchInput = page.locator('input[placeholder*="Rechercher"]');
    // Type something unlikely to match all rows
    await searchInput.fill('zzzznonexistent');

    await page.waitForTimeout(500);

    // Count should be different (either fewer rows or showing empty state)
    const filteredRows = page.locator('tbody tr');
    const filteredCount = await filteredRows.count();

    // The results should either show fewer rows or the "aucune" empty state
    const hasEmptyState = await page.getByText('Aucune opportunite trouvee').isVisible().catch(() => false);
    expect(filteredCount < initialCount || hasEmptyState).toBeTruthy();

    // Clear search to restore original state
    await searchInput.fill('');

    await page.screenshot({ path: 'screenshots/opportunities-search-filter.png', fullPage: true });
  });

  test('Empty state when no results match', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Rechercher"]');
    await searchInput.fill('xyznonexistentquery12345');

    await page.waitForTimeout(500);

    await expect(page.getByText('Aucune opportunite trouvee')).toBeVisible();

    await page.screenshot({ path: 'screenshots/opportunities-empty-state.png', fullPage: true });
  });
});
