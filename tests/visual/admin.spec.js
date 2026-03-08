const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Admin Page', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Admin page displays all sections', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'screenshots/admin.png', fullPage: true });

    // Verify page title (no accents)
    await expect(page.getByText('Parametres & Administration').first()).toBeVisible();

    // Verify "Integrations" section
    await expect(page.getByText('Integrations').first()).toBeVisible();

    // Verify Evolution API and Gemini API cards
    await expect(page.getByText('Evolution API').first()).toBeVisible();
    await expect(page.getByText('Gemini API').first()).toBeVisible();

    // Verify "Utilisateurs & Profils" section
    await expect(page.getByText('Utilisateurs & Profils').first()).toBeVisible();

    // Verify "Etat du Systeme" section (no accents)
    await expect(page.getByText('Etat du Systeme').first()).toBeVisible();

    // Verify "Mode Collaboratif" section
    await expect(page.getByText('Mode Collaboratif').first()).toBeVisible();

    // Verify "Modeles de Notification" section (no accents)
    await expect(page.getByText('Modeles de Notification').first()).toBeVisible();
  });
});
