const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function getToken() {
  return localStorage.getItem('radar_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem('radar_token');
    localStorage.removeItem('radar_user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Erreur réseau' }));
    throw new Error(error.error || error.detail || error.message || `HTTP ${res.status}`);
  }

  return res.json();
}

// Auth
export const login = (email, password) =>
  request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const register = (data) =>
  request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });

// Profile
export const getProfile = () => request('/api/profile');
export const updateProfile = (data) =>
  request('/api/profile', { method: 'PUT', body: JSON.stringify(data) });
export const generateKeywords = (raw_text) =>
  request('/api/profile/generate-keywords', {
    method: 'POST',
    body: JSON.stringify({ raw_text }),
  });

// Groups
export const getGroups = () => request('/api/groups');
export const syncGroups = () => request('/api/groups/sync', { method: 'POST' });
export const toggleGroup = (id) =>
  request(`/api/groups/${id}/toggle`, { method: 'PUT' });

// Opportunities
export const getOpportunities = () => request('/api/opportunities');
export const getOpportunity = (id) => request(`/api/opportunities/${id}`);
export const updateOpportunityStatus = (id, status) =>
  request(`/api/opportunities/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

// Contacts
export const getContactHistory = (phone) =>
  request(`/api/contacts/${encodeURIComponent(phone)}/history`);

// Scan
export const startHistoricalScan = (group_ids) =>
  request('/api/scan/historical', {
    method: 'POST',
    body: JSON.stringify({ group_ids }),
  });
export const getScanStatus = (scan_id) =>
  request(`/api/scan/status/${scan_id}`);

// WhatsApp
export const connectWhatsApp = () =>
  request('/api/whatsapp/connect', { method: 'POST' });
export const getWhatsAppQR = () => request('/api/whatsapp/qr');
export const getWhatsAppStatus = () => request('/api/whatsapp/status');
export const disconnectWhatsApp = () =>
  request('/api/whatsapp/disconnect', { method: 'DELETE' });
export const connectExistingWhatsApp = (instance_name) =>
  request('/api/whatsapp/connect-existing', { method: 'POST', body: JSON.stringify({ instance_name }) });
export const listInstances = () => request('/api/whatsapp/instances');
export const testAlert = () =>
  request('/api/whatsapp/test-alert', { method: 'POST' });

// Admin
export const getAdminUsers = () => request('/api/admin/users');
export const updateAdminUser = (id, data) =>
  request(`/api/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
export const getAdminConfig = () => request('/api/admin/config');
export const updateAdminConfig = (data) =>
  request('/api/admin/config', { method: 'PUT', body: JSON.stringify(data) });
export const getHubSpokeTokens = () =>
  request('/api/admin/hub-spoke-tokens');
export const createHubSpokeToken = () =>
  request('/api/admin/hub-spoke-tokens', { method: 'POST' });
export const deleteHubSpokeToken = (id) =>
  request(`/api/admin/hub-spoke-tokens/${id}`, { method: 'DELETE' });

// Webhook Stats
export const getWebhookStats = () => request('/api/webhook-stats');

// Health
export const getHealth = () =>
  fetch(`${API_URL}/health`).then((r) => r.json());
