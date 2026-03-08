const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Admin Page', () => {

  test.beforeEach(async ({ page }) => {
    // Login with admin credentials
    await login(page, 'admin@radar.jockaliaservices.fr', 'Radar@2026!');
  });

  test('Admin page displays all sections', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/admin.png', fullPage: true });

    // Verify "Integrations" section (Evolution API, Gemini API cards)
    const integrationsSection = page.locator('text=Intégrations, text=Integrations').first();
    await expect(integrationsSection).toBeVisible();

    const evolutionApi = page.locator('text=Evolution API, text=Evolution').first();
    await expect(evolutionApi).toBeVisible();

    const geminiApi = page.locator('text=Gemini API, text=Gemini').first();
    await expect(geminiApi).toBeVisible();

    // Verify "Utilisateurs & Profils" table
    const usersSection = page.locator('text=Utilisateurs, text=Users').first();
    await expect(usersSection).toBeVisible();

    // Verify "Etat du Systeme" health cards
    const systemHealth = page.locator('text=État du Système, text=Etat du Système, text=Système, text=Health').first();
    await expect(systemHealth).toBeVisible();

    // Verify "Mode Collaboratif" section
    const collaborativeMode = page.locator('text=Mode Collaboratif, text=Collaboratif').first();
    await expect(collaborativeMode).toBeVisible();

    // Verify "Modeles de Notification" section
    const notificationTemplates = page.locator('text=Modèles de Notification, text=Notification').first();
    await expect(notificationTemplates).toBeVisible();
  });
});
