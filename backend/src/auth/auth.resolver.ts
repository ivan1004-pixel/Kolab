import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { GqlAuthGuard } from '../common/guards/gql-auth.guard';
import { AuthService } from './auth.service';
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

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Mutation(() => RegisterResponse, {
    description:
      'RF-01/RF-02/RNF-22: Registro con validación de correo real (MX + Brevo) y contraseña segura',
  })
  async register(@Args('input') input: RegisterInput): Promise<RegisterResponse> {
    return this.authService.register(input);
  }

  @Mutation(() => AuthPayload, {
    description:
      'Verifica el código de 8 dígitos, envía el correo de bienvenida por Brevo e inicia sesión',
  })
  async verifyEmail(@Args('token') token: string): Promise<AuthPayload> {
    return this.authService.verifyEmail(token);
  }

  @Mutation(() => ActionResponse, {
    description: 'Reenvía el correo de verificación por Brevo',
  })
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  async resendVerificationEmail(
    @Args('correo') correo: string,
  ): Promise<ActionResponse> {
    return this.authService.resendVerificationEmail(correo);
  }

  @Mutation(() => AuthPayload, {
    description: 'RF-04/RNF-10: Inicio de sesión seguro con límite de intentos',
  })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(@Args('input') input: LoginInput): Promise<AuthPayload> {
    return this.authService.login(input);
  }

  @Mutation(() => AuthPayload, {
    description: 'Inicio de sesión con Google OAuth2 verificando idToken en backend',
  })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async loginWithGoogle(
    @Args('idToken') idToken: string,
  ): Promise<AuthPayload> {
    return this.authService.loginWithGoogle(idToken);
  }

  @Mutation(() => AuthPayload, {
    description: 'Renueva accessToken y refreshToken',
  })
  async refreshToken(
    @Args('refreshToken') refreshToken: string,
  ): Promise<AuthPayload> {
    return this.authService.refreshTokens(refreshToken);
  }

  @Mutation(() => ActionResponse, {
    description: 'RF-06: Cierra la sesión actual e invalida el token',
  })
  @UseGuards(GqlAuthGuard)
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<ActionResponse> {
    return this.authService.logout(user.userId);
  }

  @Mutation(() => ActionResponse, {
    description: 'RF-05: Solicita enlace temporal de recuperación por Brevo',
  })
  async forgotPassword(@Args('correo') correo: string): Promise<ActionResponse> {
    return this.authService.forgotPassword(correo);
  }

  @Mutation(() => ActionResponse, {
    description: 'RF-05: Restablece la contraseña con el token temporal',
  })
  async resetPassword(
    @Args('input') input: ResetPasswordInput,
  ): Promise<ActionResponse> {
    return this.authService.resetPassword(input);
  }
}
