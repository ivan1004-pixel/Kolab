const TECHNICAL_PATTERNS: Array<{ test: RegExp; friendly: string }> = [
  {
    test: /failed to fetch|networkerror|load failed|err_connection|econnrefused|network request failed|abort/i,
    friendly: 'No se pudo conectar con el servidor de Kolab. Verifica tu conexión e intenta de nuevo.',
  },
  {
    test: /unauthorized|jwt expired|invalid token|invalid signature|no autorizado|token inválido/i,
    friendly: 'Tu sesión expiró. Vuelve a iniciar sesión para continuar.',
  },
  {
    test: /forbidden resource|^forbidden$/i,
    friendly: 'No tienes permisos para realizar esta acción.',
  },
  {
    test: /throttler|too many requests|429/i,
    friendly: 'Realizaste demasiadas acciones seguidas. Espera unos segundos e intenta de nuevo.',
  },
  {
    test: /validation failed|is not a valid enum value|path [`'"].*[`'"] is required/i,
    friendly: 'Algunos datos no son válidos o están incompletos. Revisa la información e intenta de nuevo.',
  },
  {
    test: /cast to objectid failed|bsonerror|24 character hex string|invalid objectid/i,
    friendly: 'El elemento seleccionado no es válido o ya no está disponible.',
  },
  {
    test: /e11000|duplicate key/i,
    friendly: 'Este registro ya existe en la plataforma.',
  },
  {
    test: /cannot query field|unknown argument|expected type|syntax error.*graphql|graphql/i,
    friendly: 'El servicio se está actualizando. Recarga la página o intenta de nuevo en un momento.',
  },
  {
    test: /file too large|limit_file_size|payload too large|entity too large/i,
    friendly: 'El archivo supera el límite máximo permitido de 10 MB.',
  },
  {
    test: /internal server error|bad request exception|http exception|typeerror|referenceerror|syntaxerror|unexpected token/i,
    friendly: 'Ocurrió un inconveniente inesperado. Por favor, intenta de nuevo.',
  },
];

export function toFriendlyError(
  err: unknown,
  fallback = 'Ocurrió un inconveniente inesperado. Por favor, intenta de nuevo.',
): string {
  const raw =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string'
        ? (err as any).message
        : '';

  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  for (const rule of TECHNICAL_PATTERNS) {
    if (rule.test.test(trimmed)) {
      return rule.friendly;
    }
  }

  return trimmed;
}
