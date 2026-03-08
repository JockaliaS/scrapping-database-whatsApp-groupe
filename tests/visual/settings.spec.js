const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Settings Page', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Settings page displays all sections', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/settings-full.png', fullPage: true });

    // Verify all sections are present
    const sections = [
      'Mon Profil',
      'Mon Profil IA',
      'Ma Connexion WhatsApp',
      "Mon Modèle d'Alerte",
      'Mes Groupes',
      'Partage Collaboratif',
      'Zone de Danger',
    ];

    for (const section of sections) {
      const sectionEl = page.locator(`text=${section}`).first();
      await expect(sectionEl).toBeVisible();
    }
  });

  test('Scroll to each section and screenshot', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForTimeout(2000);

    const sections = [
      { name: 'Mon Profil', slug: 'profil' },
      { name: 'Mon Profil IA', slug: 'profil-ia' },
      { name: 'Ma Connexion WhatsApp', slug: 'connexion-whatsapp' },
      { name: "Mon Modèle d'Alerte", slug: 'modele-alerte' },
      { name: 'Mes Groupes', slug: 'groupes' },
      { name: 'Partage Collaboratif', slug: 'partage-collaboratif' },
      { name: 'Zone de Danger', slug: 'zone-danger' },
    ];

    for (const section of sections) {
      const sectionEl = page.locator(`text=${section.name}`).first();
      if (await sectionEl.isVisible().catch(() => false)) {
        await sectionEl.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        await page.screenshot({ path: `screenshots/settings-${section.slug}.png`, fullPage: false });
      }
    }
  });
});
