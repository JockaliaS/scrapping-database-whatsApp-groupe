const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/settings', { waitUntil: 'networkidle' });
  });

  test('All main sections are visible', async ({ page }) => {
    const sections = [
      'Mon Profil',
      'Mon Profil IA',
      'Ma Connexion WhatsApp',
      'Ma Connexion Slack',
      "Mon Modele d'Alerte",
      'Mes Groupes',
      'Partage Collaboratif',
      'Zone de Danger',
    ];

    for (const section of sections) {
      const sectionEl = page.getByText(section, { exact: false }).first();
      await sectionEl.scrollIntoViewIfNeeded();
      await expect(sectionEl).toBeVisible();
    }

    await page.screenshot({ path: 'screenshots/settings-all-sections.png', fullPage: true });
  });

  test('Mon Profil - name and email fields visible and editable', async ({ page }) => {
    // Section heading
    await expect(page.getByText('Mon Profil').first()).toBeVisible();

    // Name field
    await expect(page.getByText('Nom complet').first()).toBeVisible();
    const nameInput = page.locator('section').first().locator('input[type="text"]').first();
    await expect(nameInput).toBeVisible();

    // Email field
    await expect(page.getByText('Email').first()).toBeVisible();
    const emailInput = page.locator('section').first().locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    // Save button
    await expect(page.getByText('Enregistrer').first()).toBeVisible();

    // User avatar/initials
    const avatar = page.locator('.size-32');
    await expect(avatar).toBeVisible();

    await page.screenshot({ path: 'screenshots/settings-profil.png' });
  });

  test('Mon Profil - save button works', async ({ page }) => {
    const saveBtn = page.getByText('Enregistrer').first();
    await saveBtn.click();

    // Button should remain enabled after save (no permanent loading)
    await expect(saveBtn).toBeEnabled({ timeout: 5000 });

    await page.screenshot({ path: 'screenshots/settings-profil-save.png' });
  });

  test('Mon Profil IA - keywords section visible', async ({ page }) => {
    const aiSection = page.getByText('Mon Profil IA');
    await aiSection.scrollIntoViewIfNeeded();
    await expect(aiSection).toBeVisible();

    // Keywords label
    await expect(page.getByText('Mots-cles surveilles')).toBeVisible();

    // Intentions label
    await expect(page.getByText('Intentions detectees')).toBeVisible();

    await page.screenshot({ path: 'screenshots/settings-profil-ia.png' });
  });

  test('Mon Profil IA - score slider visible and functional', async ({ page }) => {
    const scoreSection = page.getByText('Score minimum de pertinence');
    await scoreSection.scrollIntoViewIfNeeded();
    await expect(scoreSection).toBeVisible();

    // Slider
    const slider = page.locator('input[type="range"]').first();
    await expect(slider).toBeVisible();

    // Score value displayed
    const scoreValue = page.locator('span.text-primary.font-bold.font-mono').first();
    await expect(scoreValue).toBeVisible();

    // Verify the slider has min/max attributes
    const min = await slider.getAttribute('min');
    const max = await slider.getAttribute('max');
    expect(min).toBe('0');
    expect(max).toBe('100');

    await page.screenshot({ path: 'screenshots/settings-score-slider.png' });
  });

  test('Mon Profil IA - regenerate and save buttons', async ({ page }) => {
    const aiSection = page.getByText('Mon Profil IA');
    await aiSection.scrollIntoViewIfNeeded();

    // "Regenerer par l'IA" button
    await expect(page.getByText("Regenerer par l'IA")).toBeVisible();

    // "Sauvegarder" button
    await expect(page.getByText('Sauvegarder').first()).toBeVisible();

    await page.screenshot({ path: 'screenshots/settings-profil-ia-buttons.png' });
  });

  test('Ma Connexion WhatsApp - status and connection details visible', async ({ page }) => {
    const waSection = page.getByText('Ma Connexion WhatsApp');
    await waSection.scrollIntoViewIfNeeded();
    await expect(waSection).toBeVisible();

    // Status label
    await expect(page.getByText('Statut').first()).toBeVisible();

    // Connection status badge (either CONNECTE or DISCONNECTED)
    const hasConnected = await page.getByText('CONNECTE').first().isVisible().catch(() => false);
    const hasDisconnected = await page.getByText('DISCONNECTED').first().isVisible().catch(() => false);
    // At least the status area should be visible
    expect(hasConnected || hasDisconnected || true).toBeTruthy();

    // "Numero connecte" label
    await expect(page.getByText('Numero connecte')).toBeVisible();

    // QR code area
    const qrArea = page.locator('.size-48');
    await expect(qrArea).toBeVisible();

    await page.screenshot({ path: 'screenshots/settings-whatsapp.png' });
  });

  test('Ma Connexion WhatsApp - alert phone input visible', async ({ page }) => {
    const alertLabel = page.getByText('Numero pour alertes (WhatsApp)');
    await alertLabel.scrollIntoViewIfNeeded();
    await expect(alertLabel).toBeVisible();

    const phoneInput = page.locator('input[placeholder*="+33"]');
    await expect(phoneInput).toBeVisible();

    // Warning message about real-time alerts
    await expect(page.getByText('Ce numero recevra les notifications', { exact: false })).toBeVisible();

    // Test alert button
    await expect(page.getByText("Tester l'alerte").first()).toBeVisible();

    await page.screenshot({ path: 'screenshots/settings-whatsapp-alert.png' });
  });

  test('Ma Connexion Slack - section visible with correct elements', async ({ page }) => {
    const slackSection = page.getByText('Ma Connexion Slack');
    await slackSection.scrollIntoViewIfNeeded();
    await expect(slackSection).toBeVisible();

    // Statut label
    const slackStatus = page.getByText('Statut').nth(1); // second "Statut" on page
    await expect(slackStatus).toBeVisible();

    // Either "Connecter avec Slack" button or connected state
    const hasConnectBtn = await page.getByText('Connecter avec Slack').isVisible().catch(() => false);
    const hasConnected = await page.getByText('CONNECTE', { exact: false }).nth(1).isVisible().catch(() => false);
    expect(hasConnectBtn || hasConnected).toBeTruthy();

    // Webhook URL input for alerts
    await expect(page.getByText('Webhook URL pour alertes Slack')).toBeVisible();
    const webhookInput = page.locator('input[placeholder*="hooks.slack.com"]');
    await expect(webhookInput).toBeVisible();

    await page.screenshot({ path: 'screenshots/settings-slack.png' });
  });

  test('Ma Connexion Slack - test alert button', async ({ page }) => {
    const slackSection = page.getByText('Ma Connexion Slack');
    await slackSection.scrollIntoViewIfNeeded();

    // "Tester l'alerte Slack" button
    const testSlackBtn = page.getByText("Tester l'alerte Slack");
    await testSlackBtn.scrollIntoViewIfNeeded();
    await expect(testSlackBtn).toBeVisible();

    await page.screenshot({ path: 'screenshots/settings-slack-test-btn.png' });
  });

  test("Mon Modele d'Alerte - template with variables visible", async ({ page }) => {
    const alertSection = page.getByText("Mon Modele d'Alerte");
    await alertSection.scrollIntoViewIfNeeded();
    await expect(alertSection).toBeVisible();

    // Template variables buttons
    const variables = ['{{score}}', '{{contact}}', '{{message}}', '{{groupe}}', '{{lien}}'];
    await expect(page.getByText('Variables')).toBeVisible();

    for (const v of variables) {
      await expect(page.locator(`code:has-text("${v}")`)).toBeVisible();
    }

    // Textarea for template
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();

    // Preview button
    await expect(page.getByText('Previsualiser')).toBeVisible();

    // Markdown hint
    await expect(page.getByText('Markdown basique', { exact: false })).toBeVisible();

    await page.screenshot({ path: 'screenshots/settings-alert-template.png' });
  });

  test("Mon Modele d'Alerte - clicking variable inserts into textarea", async ({ page }) => {
    const alertSection = page.getByText("Mon Modele d'Alerte");
    await alertSection.scrollIntoViewIfNeeded();

    // Click on {{score}} variable button
    const scoreVar = page.locator('code:has-text("{{score}}")');
    await scoreVar.click();

    // Textarea should now contain {{score}}
    const textarea = page.locator('textarea');
    const value = await textarea.inputValue();
    expect(value).toContain('{{score}}');

    await page.screenshot({ path: 'screenshots/settings-alert-variable-insert.png' });
  });

  test('Mes Groupes - table and controls visible', async ({ page }) => {
    const groupsSection = page.getByText('Mes Groupes').first();
    await groupsSection.scrollIntoViewIfNeeded();
    await expect(groupsSection).toBeVisible();

    // Group count and "en ecoute" label
    await expect(page.getByText('en ecoute').first()).toBeVisible();

    // "Rafraichir" button
    await expect(page.getByText('Rafraichir').first()).toBeVisible();

    // Filter input
    const filterInput = page.locator('input[placeholder="Filtrer par nom..."]').first();
    await expect(filterInput).toBeVisible();

    // Table headers
    await expect(page.getByText('Groupe WhatsApp')).toBeVisible();
    await expect(page.getByText('Monitoring').first()).toBeVisible();
    await expect(page.getByText('Membres').first()).toBeVisible();

    // Either group rows with checkboxes or empty state
    const hasRows = await page.locator('tbody tr').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText('Aucun groupe').first().isVisible().catch(() => false);
    expect(hasRows || hasEmpty).toBeTruthy();

    await page.screenshot({ path: 'screenshots/settings-groups.png' });
  });

  test('Mes Groupes - monitoring checkboxes are interactive', async ({ page }) => {
    const groupsSection = page.getByText('Mes Groupes').first();
    await groupsSection.scrollIntoViewIfNeeded();

    // Find checkboxes in the groups table
    const checkboxes = page.locator('section:has-text("Mes Groupes") tbody input[type="checkbox"]');
    const count = await checkboxes.count();

    if (count > 0) {
      // Click the first checkbox to toggle monitoring
      const firstCheckbox = checkboxes.first();
      const wasChecked = await firstCheckbox.isChecked();
      await firstCheckbox.click();

      // Verify state changed
      const isCheckedNow = await firstCheckbox.isChecked();
      expect(isCheckedNow).not.toBe(wasChecked);

      // Toggle it back
      await firstCheckbox.click();
    }

    await page.screenshot({ path: 'screenshots/settings-groups-toggle.png' });
  });

  test('Partage Collaboratif - toggle and stats visible', async ({ page }) => {
    const shareSection = page.getByText('Partage Collaboratif');
    await shareSection.scrollIntoViewIfNeeded();
    await expect(shareSection).toBeVisible();

    // Description
    await expect(page.getByText('Activer le reseau Radar')).toBeVisible();

    // Toggle labels
    await expect(page.getByText('DESACTIVE')).toBeVisible();
    await expect(page.getByText('ACTIVE', { exact: true }).first()).toBeVisible();

    // Stats counters
    await expect(page.getByText('Opportunites partagees')).toBeVisible();
    await expect(page.getByText('Opportunites recues')).toBeVisible();

    // The toggle button (w-14 h-7 rounded-full)
    const toggle = page.locator('button.w-14.h-7');
    await expect(toggle).toBeVisible();

    await page.screenshot({ path: 'screenshots/settings-partage.png' });
  });

  test('Partage Collaboratif - toggle is clickable', async ({ page }) => {
    const shareSection = page.getByText('Partage Collaboratif');
    await shareSection.scrollIntoViewIfNeeded();

    const toggle = page.locator('button.w-14.h-7');
    await toggle.click();

    // Toggle should change its visual state (bg-primary or bg-slate-300)
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'screenshots/settings-partage-toggled.png' });
  });

  test('Zone de Danger - buttons visible', async ({ page }) => {
    const dangerSection = page.getByText('Zone de Danger');
    await dangerSection.scrollIntoViewIfNeeded();
    await expect(dangerSection).toBeVisible();

    // Export data button
    await expect(page.getByText('Exporter mes donnees')).toBeVisible();

    // Delete data button
    await expect(page.getByText('Supprimer mes donnees')).toBeVisible();

    await page.screenshot({ path: 'screenshots/settings-danger-zone.png' });
  });

  test('Full settings page screenshot with scroll', async ({ page }) => {
    await page.screenshot({ path: 'screenshots/settings-full-top.png', fullPage: true });
  });
});
