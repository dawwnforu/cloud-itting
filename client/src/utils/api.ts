const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '请求失败');
  }
  return data;
}

export const api = {
  // Auth
  register: (body: { username: string; password: string }) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),

  login: (body: { username: string; password: string }) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  resetPassword: (body: { username: string; newPassword: string }) =>
    request('/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }),

  getMe: () => request('/auth/me'),

  // Rooms
  createRoom: (body: { name: string; videoUrl: string; videoBvid: string; videoTitle: string }) =>
    request('/rooms', { method: 'POST', body: JSON.stringify(body) }),

  getRooms: () => request('/rooms'),

  getRoom: (id: string) => request(`/rooms/${id}`),

  // History
  getHistory: () => request('/history'),
};
