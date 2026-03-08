async function login(page, email = 'admin@radar.jockaliaservices.fr', password = 'RadarAdmin2026') {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const apiUrl = process.env.API_URL || 'http://localhost:8000';

  // Get token via API first
  const response = await page.request.post(`${apiUrl}/auth/login`, {
    data: { email, password }
  });
  const data = await response.json();

  if (!data.token) {
    throw new Error('Login failed: no token');
  }

  // Navigate to frontend and inject token
  await page.goto(baseUrl + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Set localStorage on the frontend domain
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('radar_token', token);
    localStorage.setItem('radar_user', JSON.stringify(user));
  }, { token: data.token, user: data.user });

  // Reload to pick up the token
  await page.goto(baseUrl + '/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
}

module.exports = { login };
