import { assertNoScriptInjection } from '../utils/inputSecurity';
import { toFriendlyError } from '../utils/friendlyError';

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/graphql';
export const USE_MOCK: boolean = import.meta.env.VITE_USE_MOCK !== 'false';

export async function gqlRequest<T = any>(
  query: string,
  variables: Record<string, any> = {},
  token?: string,
): Promise<T> {
  assertNoScriptInjection(variables, 'formulario');

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    throw new Error(toFriendlyError(err));
  }

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      toFriendlyError(payload.message, 'No se pudo completar la operación. Intenta de nuevo.'),
    );
  }

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new Error(
      toFriendlyError(
        payload.errors[0].message,
        'No se pudo completar la operación. Intenta de nuevo.',
      ),
    );
  }

  return payload.data as T;
}

export async function request<T = any>(
  path: string,
  { method = 'GET', body, token }: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  if (body) {
    assertNoScriptInjection(body, 'formulario');
  }
  const baseUrl = API_URL.replace(/\/graphql\/?$/, '');
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(toFriendlyError(err));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(toFriendlyError(data.message, 'Ocurrió un inconveniente, intenta de nuevo.'));
  }
  return data as T;
}

export async function uploadResourceFile(
  file: File,
  token: string,
): Promise<{ url: string; filename: string; tipoArchivo: string; tamanoBytes: number }> {
  const baseUrl = API_URL.replace(/\/graphql\/?$/, '');
  const formData = new FormData();
  formData.append('file', file);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/uploads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
  } catch (err) {
    throw new Error(toFriendlyError(err, 'No se pudo subir el archivo. Verifica tu conexión.'));
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(toFriendlyError(data.message, 'No se pudo subir el archivo al servidor.'));
  }
  return data;
}
