export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/graphql';
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

export async function gqlRequest(query, variables = {}, token) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(payload.message || 'Ocurrió un error al conectar con el servidor');
  }

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new Error(payload.errors[0].message || 'Error en la operación GraphQL');
  }

  return payload.data;
}

export async function request(path, { method = 'GET', body, token } = {}) {
  const baseUrl = API_URL.replace(/\/graphql\/?$/, '');
  const res = await fetch(`${baseUrl}${path}`, {
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
