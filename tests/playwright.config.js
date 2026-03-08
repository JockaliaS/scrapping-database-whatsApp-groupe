module.exports = {
  testDir: './visual',
  timeout: 30000,
  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:3000',
    screenshot: 'on',
    video: 'retain-on-failure',
  },
  reporter: [['list'], ['html', { outputFolder: 'test-results' }]],
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
};
