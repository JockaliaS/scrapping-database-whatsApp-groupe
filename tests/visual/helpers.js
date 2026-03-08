async function login(page, email = 'admin@radar.jockaliaservices.fr', password = 'Radar@2026!') {
  const apiUrl = process.env.API_URL || 'http://localhost:8000';
  const response = await page.request.post(`${apiUrl}/auth/login`, {
    data: { email, password }
  });
  const data = await response.json();
  if (data.token) {
    await page.evaluate((token) => {
      localStorage.setItem('radar_token', token);
    }, data.token);
  }
  return data;
}

module.exports = { login };
