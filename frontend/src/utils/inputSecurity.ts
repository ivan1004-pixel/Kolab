const SCRIPT_INJECTION_PATTERNS: RegExp[] = [
  /\b[\w-]+\.(sql|py|js)\b/i,
  /<\s*script\b/i,
  /<\s*\/\s*script\s*>/i,
  /javascript\s*:/i,
  /\bon(load|error|click|mouseover|focus|submit)\s*=/i,
  /\b(eval\s*\(|Function\s*\(|document\.cookie|window\.location|localStorage\.|sessionStorage\.)/i,
  /\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+.+\s+SET|DELETE\s+FROM|DROP\s+(TABLE|DATABASE)|ALTER\s+TABLE|TRUNCATE\s+TABLE|UNION\s+SELECT)\b/i,
  /(;\s*(DROP|DELETE|INSERT|UPDATE|SELECT)\b|--\s*$)/im,
  /\b(import\s+(os|sys|subprocess|shutil)|from\s+(os|sys|subprocess)\s+import|__import__\s*\(|subprocess\.(run|Popen|call))\b/i,
];

const SKIP_KEYS = new Set([
  'password',
  'contrasena',
  'nuevaContrasena',
  'token',
  'accessToken',
  'refreshToken',
  'fotoUrl',
  'foto_url',
]);

export function hasScriptInjection(text: string): boolean {
  return SCRIPT_INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

export function assertNoScriptInjection(
  value: unknown,
  fieldName = 'formulario',
): void {
  if (value === null || value === undefined) return;

  if (typeof value === 'string') {
    if (!SKIP_KEYS.has(fieldName) && hasScriptInjection(value)) {
      throw new Error(
        `Entrada bloqueada por seguridad en "${fieldName}": no se permiten scripts (.sql, .py, .js) ni código ejecutable.`,
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoScriptInjection(item, fieldName);
    }
    return;
  }

  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      assertNoScriptInjection(v, k);
    }
  }
}
