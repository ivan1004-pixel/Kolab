import { BadRequestException, Injectable, Logger } from '@nestjs/common';

const SKIP_PROFANITY_FIELDS = new Set([
  'contrasena',
  'nuevaContrasena',
  'password',
  'accessToken',
  'refreshToken',
  'token',
  'idToken',
  'archivoUrl',
  'fotoUrl',
  'iconoUrl',
]);

const SKIP_SCRIPT_FIELDS = new Set([
  'contrasena',
  'nuevaContrasena',
  'password',
  'accessToken',
  'refreshToken',
  'token',
  'idToken',
]);

const SPANISH_PROFANITY_LIST = [
  'pendejo',
  'pendeja',
  'puto',
  'puta',
  'cabron',
  'cabrona',
  'chingar',
  'chingada',
  'verga',
  'culero',
  'culera',
  'mierda',
  'joder',
  'imbecil',
  'estupido',
  'estupida',
  'idiota',
  'maricon',
  'zorra',
  'pinche',
  'mamada',
  'huevon',
  'ojete',
  'naco',
];

const SCRIPT_INJECTION_PATTERNS: RegExp[] = [
  // Extensiones de scripts peligrosos (.sql, .py, .js)
  /\b[\w-]+\.(sql|py|js)\b/i,
  // Inyección HTML / JavaScript
  /<\s*script\b/i,
  /<\s*\/\s*script\s*>/i,
  /javascript\s*:/i,
  /\bon(load|error|click|mouseover|focus|submit)\s*=/i,
  /\b(eval\s*\(|Function\s*\(|document\.cookie|window\.location|localStorage\.|sessionStorage\.)/i,
  // Inyección SQL
  /\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+.+\s+SET|DELETE\s+FROM|DROP\s+(TABLE|DATABASE)|ALTER\s+TABLE|TRUNCATE\s+TABLE|UNION\s+SELECT)\b/i,
  /(;\s*(DROP|DELETE|INSERT|UPDATE|SELECT)\b|--\s*$)/im,
  // Inyección Python
  /\b(import\s+(os|sys|subprocess|shutil)|from\s+(os|sys|subprocess)\s+import|__import__\s*\(|subprocess\.(run|Popen|call))\b/i,
];

@Injectable()
export class ContentSecurityService {
  private readonly logger = new Logger(ContentSecurityService.name);

  async validatePayload(value: unknown, fieldName = ''): Promise<void> {
    if (value === null || value === undefined) return;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return;

      if (!SKIP_SCRIPT_FIELDS.has(fieldName)) {
        this.assertNoScriptInjection(trimmed, fieldName);
      }

      if (!SKIP_PROFANITY_FIELDS.has(fieldName) && trimmed.length >= 2) {
        await this.assertNoProfanity(trimmed);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        await this.validatePayload(item, fieldName);
      }
      return;
    }

    if (typeof value === 'object') {
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        await this.validatePayload(val, key);
      }
    }
  }

  assertNoScriptInjection(text: string, fieldName = 'campo'): void {
    for (const pattern of SCRIPT_INJECTION_PATTERNS) {
      if (pattern.test(text)) {
        throw new BadRequestException(
          `Entrada bloqueada por seguridad en "${fieldName || 'formulario'}": no se permiten scripts (.sql, .py, .js) ni código ejecutable.`,
        );
      }
    }
  }

  async assertNoProfanity(text: string): Promise<void> {
    const normalized = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const words = normalized.split(/\W+/).filter(Boolean);
    if (words.some((w) => SPANISH_PROFANITY_LIST.includes(w))) {
      throw new BadRequestException(
        'Tu mensaje contiene palabras altisonantes no permitidas en Kolab.',
      );
    }

    // Consumo de API externa (PurgoMalum) para palabras altisonantes adicionales
    try {
      const url = `https://www.purgomalum.com/service/containsprofanity?text=${encodeURIComponent(
        normalized,
      )}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const body = (await res.text()).trim().toLowerCase();
        if (body === 'true') {
          throw new BadRequestException(
            'Tu mensaje contiene palabras altisonantes no permitidas en Kolab.',
          );
        }
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(
        'API de filtrado de palabras altisonantes no disponible, aplicando filtro local de respaldo.',
      );
    }
  }
}
