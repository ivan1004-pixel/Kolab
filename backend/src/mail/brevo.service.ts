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

  async sendVerificationEmail(
    toEmail: string,
    nombre: string,
    token: string,
  ): Promise<boolean> {
    const verifyUrl = `${this.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2>¡Hola ${nombre}! Verifica tu correo en Kolab</h2>
        <p>Antes de enviarte la bienvenida oficial, necesitamos confirmar que tu correo existe y te pertenece.</p>
        <p>Usa el siguiente código de verificación o haz clic en el botón:</p>
        <p style="font-size: 20px; font-weight: bold; letter-spacing: 2px; color: #2563eb;">${token}</p>
        <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">
          Verificar mi correo
        </a>
        <p style="margin-top:20px;font-size:12px;color:#666;">Este enlace expira en 24 horas.</p>
      </div>
    `;
    return this.sendEmail(
      toEmail,
      nombre,
      'Kolab - Verifica tu dirección de correo',
      html,
    );
  }

  async sendWelcomeEmail(toEmail: string, nombre: string): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2>¡Bienvenido(a) a Kolab, ${nombre}!</h2>
        <p>Tu correo ha sido verificado exitosamente. Ya puedes explorar apuntes, resolver dudas, ganar XP y mantener tu racha diaria.</p>
        <a href="${this.frontendUrl}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;">
          Ir a Kolab
        </a>
      </div>
    `;
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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2>Recuperación de contraseña - Kolab</h2>
        <p>Hola ${nombre}, recibimos una solicitud para restablecer tu contraseña.</p>
        <p>Token de recuperación: <strong>${token}</strong></p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px;">
          Restablecer contraseña
        </a>
        <p style="margin-top:20px;font-size:12px;color:#666;">Si no fuiste tú, ignora este mensaje. Expira en 1 hora.</p>
      </div>
    `;
    return this.sendEmail(
      toEmail,
      nombre,
      'Kolab - Recuperación de contraseña',
      html,
    );
  }

  async sendStreakRiskEmail(
    toEmail: string,
    nombre: string,
    rachaActual: number,
  ): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2>¡Tu racha de ${rachaActual} días está en riesgo!</h2>
        <p>Hola ${nombre}, aún estás a tiempo hoy de completar un reto, cuestionario o responder una duda en Kolab para no perder tu racha.</p>
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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h3>Hola ${nombre},</h3>
        <p>${message}</p>
      </div>
    `;
    return this.sendEmail(toEmail, nombre, `Kolab - ${subject}`, html);
  }
}
