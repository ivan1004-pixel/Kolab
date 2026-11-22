import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dns from 'dns';

const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'yopmail.com',
  'throwawaymail.com',
]);

@Injectable()
export class BrevoService {
  private readonly logger = new Logger(BrevoService.name);
  private readonly apiKey: string;
  private readonly senderEmail: string;
  private readonly senderName: string;
  private readonly frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('BREVO_API_KEY') || '';
    this.senderEmail =
      this.configService.get<string>('BREVO_SENDER_EMAIL') ||
      'no-reply@kolab.edu';
    this.senderName =
      this.configService.get<string>('BREVO_SENDER_NAME') ||
      'Kolab Plataforma Académica';
    this.frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
  }

  /**
   * Valida formato, que no sea dominio desechable y que el dominio tenga registros MX reales.
   */
  async validateEmailExistence(
    email: string,
  ): Promise<{ valid: boolean; reason?: string }> {
    const normalized = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized)) {
      return { valid: false, reason: 'El formato del correo no es válido.' };
    }

    const domain = normalized.split('@')[1];
    if (DISPOSABLE_DOMAINS.has(domain)) {
      return {
        valid: false,
        reason: 'No se permiten correos temporales o desechables.',
      };
    }

    try {
      const mxRecords = await dns.promises.resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        return {
          valid: false,
          reason: `El dominio ${domain} no tiene servidores de correo (MX) válidos.`,
        };
      }
      return { valid: true };
    } catch {
      return {
        valid: false,
        reason: `No se pudo comprobar la existencia del dominio ${domain}.`,
      };
    }
  }

  private async sendEmail(
    toEmail: string,
    toName: string,
    subject: string,
    htmlContent: string,
  ): Promise<boolean> {
    if (!this.apiKey) {
      this.logger.warn(
        `[MODO DESARROLLO - BREVO_API_KEY no configurada] Correo simulado a ${toEmail} | Asunto: ${subject}`,
      );
      return true;
    }

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': this.apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: this.senderName, email: this.senderEmail },
          to: [{ email: toEmail, name: toName }],
          subject,
          htmlContent,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `Error enviando correo con Brevo (${response.status}): ${errorBody}`,
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Fallo de red al conectar con Brevo API', error);
      return false;
    }
  }

  private buildKolabLogoHeader(subtitle?: string): string {
    const isPublicUrl =
      this.frontendUrl.startsWith('https://') &&
      !this.frontendUrl.includes('localhost') &&
      !this.frontendUrl.includes('127.0.0.1');

    const iconHtml = isPublicUrl
      ? `<img src="${this.frontendUrl}/assets/kolab-icon.png" alt="Kolab" width="40" height="40" style="display:block;width:40px;height:40px;border-radius:10px;" />`
      : `
        <table role="presentation" cellpadding="0" cellspacing="2" border="0" width="40" height="40" style="width:40px;height:40px;border-collapse:separate;">
          <tr>
            <td width="18" height="18" style="background:#0284c7;border-radius:8px 2px 8px 2px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="18" height="18" style="background:#f59e0b;border-radius:2px 8px 2px 8px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td width="18" height="18" style="background:#84cc16;border-radius:2px 8px 2px 8px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="18" height="18" style="background:#ec4899;border-radius:8px 2px 8px 2px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
        </table>
      `;

    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 20px auto;">
        <tr>
          <td style="vertical-align:middle;padding-right:10px;">
            ${iconHtml}
          </td>
          <td style="vertical-align:middle;text-align:left;">
            <span style="font-family:'Nunito Sans',Arial,sans-serif;font-size:28px;font-weight:900;color:#001f28;letter-spacing:-0.02em;line-height:1;">Kolab</span>
            ${
              subtitle
                ? `<div style="font-family:'Nunito Sans',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.14em;color:#00642b;text-transform:uppercase;margin-top:2px;">${subtitle}</div>`
                : ''
            }
          </td>
        </tr>
      </table>
    `;
  }

  async sendVerificationEmail(
    toEmail: string,
    nombre: string,
    code: string,
  ): Promise<boolean> {
    const verifyUrl = `${this.frontendUrl}/verify-email?token=${encodeURIComponent(code)}`;
    const digits = code.padEnd(8, '0').slice(0, 8).split('');
    const digitCells = digits
      .map(
        (d) => `
          <td align="center" style="padding:3px;">
            <div style="width:40px;height:46px;line-height:46px;background:#ffffff;border-radius:10px;font-family:'Nunito Sans',Arial,sans-serif;font-size:22px;font-weight:800;color:#00642b;text-align:center;box-shadow:0 1px 3px rgba(0,31,40,0.08);border:1px solid #d6f2ff;">
              ${d}
            </div>
          </td>
        `,
      )
      .join('');

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3fbff;font-family:'Nunito Sans',Arial,sans-serif;color:#001f28;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3fbff;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 12px 32px rgba(16,53,64,0.08);border:1px solid #d6f2ff;">
          <!-- Barra de espectro superior -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="25%" height="6" style="background:#006d30;font-size:0;line-height:0;">&nbsp;</td>
                  <td width="25%" height="6" style="background:#157f3c;font-size:0;line-height:0;">&nbsp;</td>
                  <td width="25%" height="6" style="background:#98da27;font-size:0;line-height:0;">&nbsp;</td>
                  <td width="25%" height="6" style="background:#bbefc5;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:36px 28px 28px 28px;text-align:center;">
              ${this.buildKolabLogoHeader()}

              <div style="display:inline-block;padding:6px 14px;border-radius:9999px;background:#e5f6ff;color:#00642b;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:14px;">
                Seguridad del Espacio de Trabajo
              </div>

              <h1 style="margin:0 0 12px 0;font-size:28px;line-height:1.2;font-weight:800;color:#001f28;">
                Verifica tu dirección de correo electrónico
              </h1>

              <p style="margin:0 0 6px 0;font-size:15px;color:#3f493f;">
                Hola <strong style="color:#001f28;">${nombre}</strong>,
              </p>
              <p style="margin:0 auto 24px auto;max-width:440px;font-size:14px;line-height:1.6;color:#3f493f;">
                Te damos la bienvenida a <strong style="color:#001f28;">Kolab</strong>. Para proteger tu cuenta y habilitar el acceso seguro a tu entorno colaborativo, ingresa el siguiente código de 8 dígitos:
              </p>

              <!-- Caja OTP de 8 dígitos -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;margin:0 auto 22px auto;background:#e5f6ff;border-radius:14px;">
                <tr>
                  <td style="padding:20px 14px;text-align:center;">
                    <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#396847;margin-bottom:12px;">
                      Código de Verificación Temporal
                    </div>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                      <tr>${digitCells}</tr>
                    </table>
                    <div style="margin-top:12px;font-size:12px;color:#396847;font-weight:600;">
                      ⏱ Este código y el enlace expiran en <strong>15 minutos</strong>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Botón principal -->
              <div style="margin:0 0 22px 0;">
                <a href="${verifyUrl}" style="display:inline-block;padding:14px 32px;border-radius:9999px;background:#157f3c;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;box-shadow:0 4px 14px rgba(21,127,60,0.3);">
                  Verificar mi cuenta →
                </a>
              </div>

              <!-- Enlace alternativo -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;margin:0 auto 18px auto;background:#ffffff;border:1px solid #e5f6ff;border-radius:12px;text-align:left;">
                <tr>
                  <td style="padding:14px 16px;">
                    <div style="font-size:13px;font-weight:700;color:#001f28;margin-bottom:4px;">¿Tienes problemas con el botón superior?</div>
                    <div style="font-size:12px;color:#3f493f;margin-bottom:8px;">Copia y pega este enlace de un solo uso en tu navegador:</div>
                    <div style="background:#e5f6ff;padding:10px;border-radius:8px;font-family:monospace;font-size:11px;color:#00642b;word-break:break-all;">
                      ${verifyUrl}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Aviso de seguridad -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;margin:0 auto 24px auto;background:#caeefd;border-radius:12px;text-align:left;">
                <tr>
                  <td style="padding:14px 16px;">
                    <div style="font-size:12px;font-weight:700;color:#001f28;margin-bottom:2px;">🛡️ Espacio Kolab Protegido</div>
                    <div style="font-size:12px;line-height:1.5;color:#3f493f;">
                      Este registro fue solicitado para <strong>${toEmail}</strong>. Si tú no iniciaste este proceso, puedes ignorar este mensaje de forma segura.
                    </div>
                  </td>
                </tr>
              </table>

              <div style="border-top:1px solid #d6f2ff;padding-top:16px;font-size:12px;color:#6f7a6e;">
                <div>Kolab Plataforma Académica • UTVT</div>
                <div style="margin-top:4px;font-size:11px;">Centro de Ayuda • Términos de Servicio • Privacidad</div>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return this.sendEmail(
      toEmail,
      nombre,
      'Kolab - Tu código de verificación de 8 dígitos',
      html,
    );
  }

  async sendWelcomeEmail(toEmail: string, nombre: string): Promise<boolean> {
    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3fbff;font-family:'Nunito Sans',Arial,sans-serif;color:#001f28;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3fbff;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 12px 32px rgba(16,53,64,0.08);border:1px solid #d6f2ff;">
          <!-- Barra superior degradada -->
          <tr>
            <td height="8" style="background:linear-gradient(90deg,#00642b 0%,#b2f746 50%,#bbefc5 100%);background-color:#157f3c;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <tr>
            <td style="padding:36px 28px 28px 28px;text-align:center;">
              ${this.buildKolabLogoHeader('WORKSPACE')}

              <div style="display:inline-block;padding:6px 14px;border-radius:9999px;background:#b8ecc2;color:#00642b;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:14px;">
                ● Bienvenido a bordo
              </div>

              <h1 style="margin:0 0 10px 0;font-size:30px;line-height:1.2;font-weight:800;color:#001f28;">
                ¡Te damos la bienvenida a Kolab!
              </h1>

              <p style="margin:0 auto 24px auto;max-width:460px;font-size:15px;line-height:1.6;color:#3f493f;">
                Hola <strong style="color:#001f28;">${nombre}</strong>, tu nuevo espacio de trabajo colaborativo está listo. Comienza a estudiar, compartir apuntes y resolver dudas en equipo en tiempo real.
              </p>

              <!-- Tarjeta Tu Espacio de Trabajo -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e5f6ff;border:1px solid #caeefd;border-radius:14px;text-align:left;margin-bottom:24px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid #caeefd;padding-bottom:10px;margin-bottom:14px;">
                      <tr>
                        <td style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#3f493f;">
                          Tu Espacio de Trabajo
                        </td>
                        <td align="right">
                          <span style="display:inline-block;padding:3px 10px;border-radius:9999px;background:#b2f746;color:#121f00;font-size:10px;font-weight:800;text-transform:uppercase;">
                            Cuenta Verificada
                          </span>
                        </td>
                      </tr>
                    </table>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="38" valign="top" style="padding-bottom:12px;">
                          <div style="width:30px;height:30px;line-height:30px;text-align:center;border-radius:9999px;background:#ffffff;color:#00642b;font-weight:800;font-size:14px;border:1px solid #caeefd;">✓</div>
                        </td>
                        <td valign="top" style="padding-bottom:12px;">
                          <div style="font-size:14px;font-weight:700;color:#001f28;">Perfil configurado</div>
                          <div style="font-size:12px;color:#3f493f;">${toEmail}</div>
                        </td>
                      </tr>
                      <tr>
                        <td width="38" valign="top" style="padding-bottom:12px;">
                          <div style="width:30px;height:30px;line-height:30px;text-align:center;border-radius:9999px;background:#ffffff;color:#00642b;font-weight:800;font-size:14px;border:1px solid #caeefd;">★</div>
                        </td>
                        <td valign="top" style="padding-bottom:12px;">
                          <div style="font-size:14px;font-weight:700;color:#001f28;">Gana XP y mantén tu racha</div>
                          <div style="font-size:12px;color:#3f493f;">Responde dudas, comparte recursos validados y desbloquea insignias.</div>
                        </td>
                      </tr>
                      <tr>
                        <td width="38" valign="top">
                          <div style="width:30px;height:30px;line-height:30px;text-align:center;border-radius:9999px;background:#ffffff;color:#00642b;font-weight:800;font-size:14px;border:1px solid #caeefd;">⚡</div>
                        </td>
                        <td valign="top">
                          <div style="font-size:14px;font-weight:700;color:#001f28;">Asistente Gemini AI &amp; Tableros</div>
                          <div style="font-size:12px;color:#3f493f;">Resúmenes con fuentes citadas y cuestionarios de práctica listos para usar.</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <div style="margin:0 0 8px 0;">
                <a href="${this.frontendUrl}" style="display:inline-block;padding:14px 32px;border-radius:9999px;background:#157f3c;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;box-shadow:0 4px 14px rgba(21,127,60,0.3);">
                  Ir a mi espacio de trabajo →
                </a>
              </div>
              <div style="font-size:12px;color:#3f493f;margin-bottom:22px;">
                Tu cuenta ya está activa y verificada en Kolab
              </div>

              <!-- Tarjeta de soporte -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e5f6ff;border:1px solid #caeefd;border-radius:14px;text-align:left;">
                <tr>
                  <td style="padding:16px 18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle">
                          <div style="font-size:14px;font-weight:700;color:#001f28;">¿Tienes dudas en el arranque?</div>
                          <div style="font-size:12px;color:#3f493f;">Nuestro equipo de soporte está disponible en español.</div>
                        </td>
                        <td align="right" valign="middle">
                          <a href="${this.frontendUrl}" style="display:inline-block;padding:9px 16px;border-radius:9999px;background:#ffffff;color:#00642b;font-size:13px;font-weight:700;text-decoration:none;border:1px solid #caeefd;">
                            Abrir Kolab
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#e5f6ff;border-top:1px solid #caeefd;padding:20px 24px;text-align:center;">
              <div style="font-size:14px;font-weight:800;color:#001f28;margin-bottom:6px;">● Kolab Technologies</div>
              <div style="font-size:12px;color:#3f493f;max-width:420px;margin:0 auto 8px auto;">
                Recibiste este correo porque verificaste tu cuenta en Kolab con la dirección <strong style="color:#00642b;">${toEmail}</strong>.
              </div>
              <div style="font-size:11px;color:#6f7a6e;">
                Centro de Ayuda • Términos de Servicio • Privacidad • © 2026 Kolab
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return this.sendEmail(
      toEmail,
      nombre,
      '¡Bienvenido a Kolab! Tu cuenta está lista',
      html,
    );
  }

  async sendPasswordResetEmail(
    toEmail: string,
    nombre: string,
    token: string,
  ): Promise<boolean> {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3fbff;font-family:'Nunito Sans',Arial,sans-serif;color:#001f28;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3fbff;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 12px 32px rgba(16,53,64,0.08);border:1px solid #d6f2ff;">
          <!-- Barra de espectro superior -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="25%" height="6" style="background:#006d30;font-size:0;line-height:0;">&nbsp;</td>
                  <td width="25%" height="6" style="background:#157f3c;font-size:0;line-height:0;">&nbsp;</td>
                  <td width="25%" height="6" style="background:#98da27;font-size:0;line-height:0;">&nbsp;</td>
                  <td width="25%" height="6" style="background:#bbefc5;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:36px 28px 28px 28px;text-align:center;">
              ${this.buildKolabLogoHeader('SEGURIDAD')}

              <div style="display:inline-block;padding:6px 14px;border-radius:9999px;background:#e5f6ff;color:#00642b;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:14px;">
                Recuperación de Acceso
              </div>

              <h1 style="margin:0 0 12px 0;font-size:28px;line-height:1.2;font-weight:800;color:#001f28;">
                Restablece tu contraseña
              </h1>

              <p style="margin:0 0 6px 0;font-size:15px;color:#3f493f;">
                Hola <strong style="color:#001f28;">${nombre}</strong>,
              </p>
              <p style="margin:0 auto 26px auto;max-width:450px;font-size:14px;line-height:1.6;color:#3f493f;">
                Recibimos una solicitud para crear una nueva contraseña en tu cuenta de <strong style="color:#001f28;">Kolab</strong>. Haz clic en el botón de abajo para abrir directamente la pantalla de restablecimiento:
              </p>

              <!-- Botón principal -->
              <div style="margin:0 0 12px 0;">
                <a href="${resetUrl}" style="display:inline-block;padding:15px 34px;border-radius:9999px;background:#157f3c;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;box-shadow:0 4px 14px rgba(21,127,60,0.3);">
                  Restablecer mi contraseña →
                </a>
              </div>
              <div style="font-size:12px;color:#396847;font-weight:600;margin-bottom:24px;">
                Este enlace seguro es de un solo uso y expira en <strong>1 hora</strong>
              </div>

              <!-- Enlace alternativo -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;margin:0 auto 18px auto;background:#ffffff;border:1px solid #e5f6ff;border-radius:12px;text-align:left;">
                <tr>
                  <td style="padding:14px 16px;">
                    <div style="font-size:13px;font-weight:700;color:#001f28;margin-bottom:4px;">¿Tienes problemas con el botón superior?</div>
                    <div style="font-size:12px;color:#3f493f;margin-bottom:8px;">Copia y pega este enlace directo en tu navegador:</div>
                    <div style="background:#e5f6ff;padding:10px;border-radius:8px;font-family:monospace;font-size:11px;color:#00642b;word-break:break-all;">
                      ${resetUrl}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Aviso de seguridad -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;margin:0 auto 24px auto;background:#caeefd;border-radius:12px;text-align:left;">
                <tr>
                  <td style="padding:14px 16px;">
                    <div style="font-size:12px;font-weight:700;color:#001f28;margin-bottom:2px;">Espacio Kolab Protegido</div>
                    <div style="font-size:12px;line-height:1.5;color:#3f493f;">
                      Esta solicitud corresponde a <strong>${toEmail}</strong>. Si no solicitaste cambiar tu contraseña, puedes ignorar este mensaje; tu contraseña actual seguirá segura.
                    </div>
                  </td>
                </tr>
              </table>

              <div style="border-top:1px solid #d6f2ff;padding-top:16px;font-size:12px;color:#6f7a6e;">
                <div>Kolab Plataforma Académica • UTVT</div>
                <div style="margin-top:4px;font-size:11px;">Centro de Ayuda • Términos de Servicio • Privacidad</div>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    return this.sendEmail(
      toEmail,
      nombre,
      'Kolab - Restablece tu contraseña',
      html,
    );
  }

  async sendStreakRiskEmail(
    toEmail: string,
    nombre: string,
    rachaActual: number,
  ): Promise<boolean> {
    const html = `
      <div style="font-family: 'Nunito Sans', Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; background: #ffffff; border-radius: 16px; border: 1px solid #d6f2ff;">
        <h2 style="color: #001f28;">¡Tu racha de ${rachaActual} días está en riesgo!</h2>
        <p style="color: #3f493f;">Hola ${nombre}, aún estás a tiempo hoy de completar un reto, cuestionario o responder una duda en Kolab para no perder tu racha.</p>
      </div>
    `;
    return this.sendEmail(
      toEmail,
      nombre,
      `Kolab - ¡No pierdas tu racha de ${rachaActual} días!`,
      html,
    );
  }

  async sendNotificationEmail(
    toEmail: string,
    nombre: string,
    subject: string,
    message: string,
  ): Promise<boolean> {
    const html = `
      <div style="font-family: 'Nunito Sans', Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; background: #ffffff; border-radius: 16px; border: 1px solid #d6f2ff;">
        <h3 style="color: #001f28;">Hola ${nombre},</h3>
        <p style="color: #3f493f;">${message}</p>
      </div>
    `;
    return this.sendEmail(toEmail, nombre, `Kolab - ${subject}`, html);
  }
}
