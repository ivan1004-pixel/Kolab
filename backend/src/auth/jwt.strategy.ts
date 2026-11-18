import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Usuario, UsuarioDocument } from '../users/schemas/usuario.schema';

export interface JwtPayload {
  sub: string;
  correo: string;
  rol: string;
  tokenVersion: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly inactivityMinutes: number;

  constructor(
    configService: ConfigService,
    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') || 'kolab_dev_secret',
    });
    this.inactivityMinutes = Number(
      configService.get<number>('SESSION_INACTIVITY_MINUTES') || 30,
    );
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.usuarioModel
      .findOne({ _id: payload.sub, deletedAt: { $exists: false } })
      .exec();

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Cuenta inactiva o inexistente');
    }

    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Sesión cerrada o token revocado');
    }

    // RF-06: Expirar sesión por inactividad
    if (user.lastActiveAt) {
      const diffMs = Date.now() - user.lastActiveAt.getTime();
      const maxInactivityMs = this.inactivityMinutes * 60 * 1000;
      if (diffMs > maxInactivityMs) {
        throw new UnauthorizedException(
          'Sesión expirada por inactividad. Inicia sesión nuevamente.',
        );
      }
    }

    // Actualizar última actividad
    user.lastActiveAt = new Date();
    await user.save();

    return {
      userId: user._id.toString(),
      correo: user.correo,
      rol: user.rol,
    };
  }
}
