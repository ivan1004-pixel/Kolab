export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

export async function request(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Ocurrió un error, intenta de nuevo');
  return data;
}
