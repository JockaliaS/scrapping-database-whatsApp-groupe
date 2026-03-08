const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Opportunities Page', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Opportunities page displays filter bar and table', async ({ page }) => {
    await page.goto('/opportunities');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/opportunities.png', fullPage: true });

    // Verify filter bar elements
    // Search input
    const searchInput = page.locator('input[type="search"], input[placeholder*="Rechercher"], input[placeholder*="search"], input[name*="search"]').first();
    await expect(searchInput).toBeVisible();

    // Date filter
    const dateFilter = page.locator('input[type="date"], [class*="date"], button:has-text("Date"), select:has-text("Date")').first();
    await expect(dateFilter).toBeVisible();

    // Groups filter
    const groupsFilter = page.locator('select:has-text("Groupe"), button:has-text("Groupe"), [class*="group"]').first();
    await expect(groupsFilter).toBeVisible();

    // Score filter
    const scoreFilter = page.locator('select:has-text("Score"), button:has-text("Score"), input[name*="score"], [class*="score"]').first();
    await expect(scoreFilter).toBeVisible();

    // Status filter
    const statusFilter = page.locator('select:has-text("Statut"), button:has-text("Statut"), [class*="status"]').first();
    await expect(statusFilter).toBeVisible();

    // Verify table headers
    const headers = ['Date', 'Groupe', 'Contact', 'Extrait', 'Score', 'Statut', 'Actions'];
    for (const header of headers) {
      const headerEl = page.locator(`th:has-text("${header}"), [role="columnheader"]:has-text("${header}")`).first();
      await expect(headerEl).toBeVisible();
    }
  });

  test('Click row opens detail panel', async ({ page }) => {
    await page.goto('/opportunities');
    await page.waitForTimeout(2000);

    // Check if rows exist
    const rows = page.locator('tbody tr, [role="row"]');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // Click the first row
      await rows.first().click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'screenshots/opportunities-detail-panel.png', fullPage: true });

      // Verify detail panel has expected content
      const detailPanel = page.locator('[class*="panel"], [class*="drawer"], [class*="detail"], [class*="slide"]').first();
      await expect(detailPanel).toBeVisible();

      // Message bubble
      const messageBubble = page.locator('[class*="message"], [class*="bubble"], [class*="Message"]').first();
      await expect(messageBubble).toBeVisible();

      // Contact profile
      const contactProfile = page.locator('text=Contact, text=Profil, [class*="contact"], [class*="profile"]').first();
      await expect(contactProfile).toBeVisible();

      // Score analysis
      const scoreAnalysis = page.locator('text=Score, text=Analyse, [class*="score"], [class*="analysis"]').first();
      await expect(scoreAnalysis).toBeVisible();

      // Suggested reply
      const suggestedReply = page.locator('text=Réponse suggérée, text=Suggestion, [class*="reply"], [class*="suggestion"]').first();
      await expect(suggestedReply).toBeVisible();
    }
  });
});
