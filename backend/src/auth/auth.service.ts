import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { Model, Types } from 'mongoose';
import { RolUsuario } from '../common/enums/kolab.enums';
import { BrevoService } from '../mail/brevo.service';
import { Usuario, UsuarioDocument } from '../users/schemas/usuario.schema';
import {
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from './dto/auth.input';
import {
  ActionResponse,
  AuthPayload,
  RegisterResponse,
} from './dto/auth.payload';
import { JwtPayload } from './jwt.strategy';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;
  private readonly googleClientId: string;

  constructor(
    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly brevoService: BrevoService,
  ) {
    this.googleClientId = (
      this.configService.get<string>('GOOGLE_CLIENT_ID') || ''
    ).trim();
    this.googleClient = new OAuth2Client(this.googleClientId);
  }

  async register(input: RegisterInput): Promise<RegisterResponse> {
    if (!input.aceptoPrivacidad) {
      throw new BadRequestException(
        'Debes aceptar el aviso de privacidad y los términos de uso (RNF-22).',
      );
    }

    const correo = input.correo.trim().toLowerCase();
    const existing = await this.usuarioModel.findOne({ correo }).exec();
    if (existing) {
      throw new BadRequestException('El correo ya se encuentra registrado.');
    }

    // Validar que el dominio del correo exista (registros MX) antes de enviar verificación
    const mxCheck = await this.brevoService.validateEmailExistence(correo);
    if (!mxCheck.valid) {
      throw new BadRequestException(
        mxCheck.reason || 'El correo electrónico no es válido o no existe.',
      );
    }

    const contrasenaHash = await bcrypt.hash(input.contrasena, 10);
    const verificationToken = this.generateEightDigitToken();
    const verificationExpires = new Date(Date.now() + 15 * 60 * 1000);

    const newUser = new this.usuarioModel({
      nombre: input.nombre.trim(),
      apellidos: input.apellidos.trim(),
      correo,
      contrasenaHash,
      rol: RolUsuario.ESTUDIANTE,
      idCarrera: input.idCarrera
        ? new Types.ObjectId(input.idCarrera)
        : undefined,
      aceptoPrivacidad: true,
      emailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires,
    });

    await newUser.save();

    // Enviar correo de verificación mediante Brevo (el correo de bienvenida se envía tras verificar)
    await this.brevoService.sendVerificationEmail(
      correo,
      newUser.nombre,
      verificationToken,
    );

    return {
      message:
        'Registro exitoso. Revisa tu correo para verificar que existe y recibir tu bienvenida.',
      correo,
      requiereVerificacion: true,
    };
  }

  async verifyEmail(token: string): Promise<AuthPayload> {
    const normalizedToken = token?.trim();
    if (!normalizedToken) {
      throw new BadRequestException(
        'El código de verificación es inválido, ya fue utilizado o ha expirado.',
      );
    }

    const user = await this.usuarioModel
      .findOneAndUpdate(
        {
          emailVerificationToken: normalizedToken,
          emailVerificationExpires: { $gt: new Date() },
          deletedAt: { $exists: false },
        },
        {
          $set: { emailVerified: true, lastActiveAt: new Date() },
          $unset: { emailVerificationToken: 1, emailVerificationExpires: 1 },
        },
        { new: true },
      )
      .exec();

    if (!user) {
      throw new BadRequestException(
        'El código de verificación es inválido, ya fue utilizado o ha expirado.',
      );
    }

    // Una vez comprobado que el correo existe, enviar correo de bienvenida con Brevo
    await this.brevoService.sendWelcomeEmail(user.correo, user.nombre);

    const tokens = await this.generateTokens(user);
    return {
      ...tokens,
      requiresVerification: false,
      correo: user.correo,
      message:
        'Correo verificado exitosamente. Te hemos enviado tu correo de bienvenida.',
    };
  }

  async resendVerificationEmail(correo: string): Promise<ActionResponse> {
    const normalized = correo.trim().toLowerCase();
    const user = await this.usuarioModel
      .findOne({ correo: normalized, deletedAt: { $exists: false } })
      .exec();

    if (!user) {
      return {
        success: true,
        message: 'Si el correo existe, se envió un nuevo enlace de verificación.',
      };
    }

    if (user.emailVerified) {
      throw new BadRequestException('Este correo ya fue verificado.');
    }

    const token = this.generateEightDigitToken();
    user.emailVerificationToken = token;
    user.emailVerificationExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    await this.brevoService.sendVerificationEmail(
      user.correo,
      user.nombre,
      token,
    );

    return {
      success: true,
      message: 'Correo de verificación reenviado.',
    };
  }

  async login(input: LoginInput): Promise<AuthPayload> {
    const correo = input.correo.trim().toLowerCase();
    const user = await this.usuarioModel
      .findOne({ correo, deletedAt: { $exists: false } })
      .exec();

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    if (user.lockUntil && user.lockUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockUntil.getTime() - Date.now()) / 60000,
      );
      throw new ForbiddenException(
        `Cuenta bloqueada temporalmente por múltiples intentos fallidos. Intenta en ${minutesLeft} minuto(s).`,
      );
    }

    const isPasswordValid = await bcrypt.compare(
      input.contrasena,
      user.contrasenaHash,
    );

    if (!isPasswordValid) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(
          Date.now() + LOCK_DURATION_MINUTES * 60 * 1000,
        );
        user.failedLoginAttempts = 0;
      }
      await user.save();
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    if (!user.emailVerified) {
      throw new ForbiddenException(
        'Debes verificar tu correo electrónico antes de iniciar sesión.',
      );
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    user.lastActiveAt = new Date();
    await user.save();

    return this.generateTokens(user);
  }

  async loginWithGoogle(idToken: string): Promise<AuthPayload> {
    if (!this.googleClientId) {
      throw new BadRequestException(
        'GOOGLE_CLIENT_ID no está configurado en el servidor.',
      );
    }

    let payload: any;
    if (idToken.split('.').length === 3) {
      try {
        const ticket = await this.googleClient.verifyIdToken({
          idToken,
          audience: this.googleClientId,
        });
        payload = ticket.getPayload();
      } catch {
        throw new UnauthorizedException('Token de Google inválido o expirado.');
      }
    } else {
      try {
        const userInfoRes = await fetch(
          'https://www.googleapis.com/oauth2/v3/userinfo',
          {
            headers: { Authorization: `Bearer ${idToken}` },
            signal: AbortSignal.timeout(5000),
          },
        );
        if (!userInfoRes.ok) {
          throw new UnauthorizedException('Token de Google inválido.');
        }
        payload = await userInfoRes.json();
      } catch {
        throw new UnauthorizedException('Token de Google inválido o expirado.');
      }
    }

    if (!payload?.email || !payload.email_verified) {
      throw new UnauthorizedException(
        'La cuenta de Google no tiene un correo verificado.',
      );
    }

    const correo = payload.email.trim().toLowerCase();
    let user = await this.usuarioModel.findOne({ correo }).exec();

    if (user && (user.deletedAt || !user.isActive)) {
      throw new ForbiddenException('Esta cuenta se encuentra deshabilitada.');
    }

    if (!user) {
      const randomSecret = crypto.randomBytes(32).toString('hex');
      const contrasenaHash = await bcrypt.hash(randomSecret, 10);
      const otpCode = this.generateEightDigitToken();
      user = new this.usuarioModel({
        nombre: payload.given_name || payload.name || 'Estudiante',
        apellidos: payload.family_name || 'Kolab',
        correo,
        contrasenaHash,
        rol: RolUsuario.ESTUDIANTE,
        fotoUrl: payload.picture || undefined,
        aceptoPrivacidad: true,
        emailVerified: false,
        emailVerificationToken: otpCode,
        emailVerificationExpires: new Date(Date.now() + 15 * 60 * 1000),
        isActive: true,
      });
      await user.save();
      await this.brevoService.sendVerificationEmail(
        user.correo,
        user.nombre,
        otpCode,
      );
      return {
        requiresVerification: true,
        correo: user.correo,
        message:
          'Te enviamos un código de 8 dígitos a tu correo para verificar tu cuenta.',
      };
    }

    if (!user.emailVerified) {
      const otpCode = this.generateEightDigitToken();
      user.emailVerificationToken = otpCode;
      user.emailVerificationExpires = new Date(Date.now() + 15 * 60 * 1000);
      if (!user.fotoUrl && payload.picture) {
        user.fotoUrl = payload.picture;
      }
      await user.save();
      await this.brevoService.sendVerificationEmail(
        user.correo,
        user.nombre,
        otpCode,
      );
      return {
        requiresVerification: true,
        correo: user.correo,
        message:
          'Tu cuenta aún no está verificada. Te enviamos un código de 8 dígitos a tu correo.',
      };
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    user.lastActiveAt = new Date();
    if (!user.fotoUrl && payload.picture) {
      user.fotoUrl = payload.picture;
    }
    await user.save();

    const tokens = await this.generateTokens(user);
    return {
      ...tokens,
      requiresVerification: false,
      correo: user.correo,
    };
  }

  async refreshTokens(refreshToken: string): Promise<AuthPayload> {
    try {
      const secret =
        this.configService.get<string>('JWT_REFRESH_SECRET') ||
        'kolab_dev_refresh_secret';
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        { secret },
      );

      const user = await this.usuarioModel
        .findOne({ _id: payload.sub, deletedAt: { $exists: false } })
        .exec();

      if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
        throw new UnauthorizedException('Refresh token inválido o revocado.');
      }

      user.lastActiveAt = new Date();
      await user.save();

      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado.');
    }
  }

  async logout(userId: string): Promise<ActionResponse> {
    await this.usuarioModel
      .findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } })
      .exec();
    return { success: true, message: 'Sesión cerrada correctamente.' };
  }

  async forgotPassword(correo: string): Promise<ActionResponse> {
    const user = await this.usuarioModel
      .findOne({
        correo: correo.trim().toLowerCase(),
        deletedAt: { $exists: false },
      })
      .exec();

    if (user && user.isActive) {
      const token = this.generateEightDigitToken();
      user.resetPasswordToken = token;
      user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();
      await this.brevoService.sendPasswordResetEmail(
        user.correo,
        user.nombre,
        token,
      );
    }

    return {
      success: true,
      message:
        'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.',
    };
  }

  async resetPassword(input: ResetPasswordInput): Promise<ActionResponse> {
    const normalizedToken = input.token?.trim();
    if (!normalizedToken) {
      throw new BadRequestException(
        'El token de recuperación es inválido, ya fue utilizado o ha expirado.',
      );
    }

    const contrasenaHash = await bcrypt.hash(input.nuevaContrasena, 10);
    const user = await this.usuarioModel
      .findOneAndUpdate(
        {
          resetPasswordToken: normalizedToken,
          resetPasswordExpires: { $gt: new Date() },
          deletedAt: { $exists: false },
        },
        {
          $set: { contrasenaHash },
          $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 },
          $inc: { tokenVersion: 1 },
        },
        { new: true },
      )
      .exec();

    if (!user) {
      throw new BadRequestException(
        'El token de recuperación es inválido, ya fue utilizado o ha expirado.',
      );
    }

    return {
      success: true,
      message: 'Contraseña restablecida correctamente.',
    };
  }

  private generateEightDigitToken(): string {
    return crypto.randomInt(0, 100_000_000).toString().padStart(8, '0');
  }

  private async generateTokens(user: UsuarioDocument): Promise<AuthPayload> {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      correo: user.correo,
      rol: user.rol,
      tokenVersion: user.tokenVersion,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      'kolab_dev_refresh_secret';
    const refreshExpiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: refreshSecret,
      expiresIn: refreshExpiresIn as any,
    });

    return {
      accessToken,
      refreshToken,
      usuario: user,
    };
  }
}
