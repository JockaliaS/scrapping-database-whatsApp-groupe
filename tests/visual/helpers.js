async function login(page, email = 'admin@radar.jockaliaservices.fr', password = 'Radar@2026!') {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const apiUrl = process.env.API_URL || 'http://localhost:8000';

  // First navigate to the frontend domain so localStorage is accessible
  await page.goto(baseUrl + '/login', { waitUntil: 'domcontentloaded' });

  // Call API to get token
  const response = await page.request.post(`${apiUrl}/auth/login`, {
    data: { email, password }
  });
  const data = await response.json();

  if (data.token) {
    // Now we're on the frontend domain, localStorage is accessible
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('radar_token', token);
      localStorage.setItem('radar_user', JSON.stringify(user));
    }, { token: data.token, user: data.user });
  }
  return data;
}

module.exports = { login };
