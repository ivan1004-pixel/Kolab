import { BadRequestException } from '@nestjs/common';
import { ContentSecurityService } from './content-security.service';

describe('ContentSecurityService', () => {
  let service: ContentSecurityService;

  beforeEach(() => {
    service = new ContentSecurityService();
  });

  it('debe bloquear archivos o scripts .sql, .py y .js', async () => {
    await expect(
      service.validatePayload({ titulo: 'hack.sql' }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.validatePayload({ texto: 'import os; os.system("rm -rf")' }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.validatePayload({ archivoUrl: 'https://evil.com/payload.js' }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.validatePayload({ descripcion: 'script.py' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('debe bloquear inyección SQL y XSS', async () => {
    await expect(
      service.validatePayload({ texto: 'SELECT * FROM usuarios' }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.validatePayload({ texto: '<script>alert(1)</script>' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('debe filtrar palabras altisonantes consumiendo la API (o respaldo)', async () => {
    await expect(
      service.validatePayload({ texto: 'eres un pendejo' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('debe permitir texto académico normal', async () => {
    await expect(
      service.validatePayload({
        texto: '¿Cómo funciona la tercera forma normal en bases de datos?',
      }),
    ).resolves.toBeUndefined();
  });
});
