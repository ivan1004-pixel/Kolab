import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { EstadoReporte, RolUsuario } from '../common/enums/kolab.enums';
import { GqlAuthGuard } from '../common/guards/gql-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ModerationService } from './moderation.service';
import {
  AuditoriaLog,
  Notificacion,
  Reporte,
} from './schemas/moderation.schema';

@Resolver()
export class ModerationResolver {
  constructor(private readonly moderationService: ModerationService) {}

  @Mutation(() => Reporte, {
    description: 'RF-29: Reportar contenido inapropiado o inexacto',
  })
  @UseGuards(GqlAuthGuard)
  async reportarContenido(
    @CurrentUser() user: AuthenticatedUser,
    @Args('tipoObjetivo') tipoObjetivo: string,
    @Args('idObjetivo', { type: () => ID }) idObjetivo: string,
    @Args('motivo') motivo: string,
  ): Promise<Reporte> {
    return this.moderationService.crearReporte(
      user.userId,
      tipoObjetivo,
      idObjetivo,
      motivo,
    );
  }

  @Query(() => [Reporte], {
    description: 'RF-30: Listar reportes para moderación (Admin)',
  })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMINISTRADOR)
  async reportes(
    @Args('estado', { type: () => EstadoReporte, nullable: true })
    estado?: EstadoReporte,
  ): Promise<Reporte[]> {
    return this.moderationService.listarReportes(estado);
  }

  @Mutation(() => Reporte, {
    description: 'RF-30: Resolver un reporte (Admin)',
  })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMINISTRADOR)
  async resolverReporte(
    @CurrentUser() user: AuthenticatedUser,
    @Args('reporteId', { type: () => ID }) reporteId: string,
    @Args('estado', { type: () => EstadoReporte }) estado: EstadoReporte,
    @Args('resolucionAdmin') resolucionAdmin: string,
  ): Promise<Reporte> {
    return this.moderationService.resolverReporte(
      user.userId,
      reporteId,
      estado,
      resolucionAdmin,
    );
  }

  @Query(() => [AuditoriaLog], {
    description: 'RF-34 / RNF-17: Bitácora de auditoría (Admin)',
  })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMINISTRADOR)
  async auditoriaLogs(): Promise<AuditoriaLog[]> {
    return this.moderationService.listarAuditoria();
  }

  @Query(() => [Notificacion], {
    description: 'RF-55..58: Mis notificaciones',
  })
  @UseGuards(GqlAuthGuard)
  async misNotificaciones(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Notificacion[]> {
    return this.moderationService.misNotificaciones(user.userId);
  }

  @Mutation(() => Notificacion)
  @UseGuards(GqlAuthGuard)
  async marcarNotificacionLeida(
    @CurrentUser() user: AuthenticatedUser,
    @Args('notificacionId', { type: () => ID }) notificacionId: string,
  ): Promise<Notificacion> {
    return this.moderationService.marcarNotificacionLeida(
      user.userId,
      notificacionId,
    );
  }
}
