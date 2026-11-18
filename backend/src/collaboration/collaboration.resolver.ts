import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { GqlAuthGuard } from '../common/guards/gql-auth.guard';
import { CollaborationService } from './collaboration.service';
import {
  GrupoEstudio,
  SolicitudTutoria,
} from './schemas/collaboration.schema';

@Resolver()
export class CollaborationResolver {
  constructor(private readonly collaborationService: CollaborationService) {}

  @Mutation(() => GrupoEstudio, {
    description: 'RF-68: Crear grupo de estudio privado por tema/asignatura',
  })
  @UseGuards(GqlAuthGuard)
  async crearGrupoEstudio(
    @CurrentUser() user: AuthenticatedUser,
    @Args('nombre') nombre: string,
    @Args('idTema', { type: () => ID }) idTema: string,
    @Args('descripcion', { nullable: true }) descripcion?: string,
    @Args('esPrivado', { defaultValue: true }) esPrivado?: boolean,
  ): Promise<GrupoEstudio> {
    return this.collaborationService.crearGrupo(
      user.userId,
      nombre,
      idTema,
      descripcion,
      esPrivado,
    );
  }

  @Mutation(() => GrupoEstudio, { description: 'Unirse a un grupo de estudio' })
  @UseGuards(GqlAuthGuard)
  async unirseAGrupo(
    @CurrentUser() user: AuthenticatedUser,
    @Args('grupoId', { type: () => ID }) grupoId: string,
  ): Promise<GrupoEstudio> {
    return this.collaborationService.unirseAGrupo(user.userId, grupoId);
  }

  @Query(() => [GrupoEstudio])
  @UseGuards(GqlAuthGuard)
  async gruposEstudio(
    @Args('idTema', { type: () => ID, nullable: true }) idTema?: string,
  ): Promise<GrupoEstudio[]> {
    return this.collaborationService.listarGrupos(idTema);
  }

  @Mutation(() => SolicitudTutoria, {
    description: 'RF-50/RF-70: Solicitar tutoría entre pares o iniciar modo duelo',
  })
  @UseGuards(GqlAuthGuard)
  async solicitarTutoriaODuelo(
    @CurrentUser() user: AuthenticatedUser,
    @Args('idTema', { type: () => ID }) idTema: string,
    @Args('esDuelo', { defaultValue: false }) esDuelo?: boolean,
    @Args('idCuestionario', { type: () => ID, nullable: true })
    idCuestionario?: string,
  ): Promise<SolicitudTutoria> {
    return this.collaborationService.solicitarTutoriaODuelo(
      user.userId,
      idTema,
      esDuelo,
      idCuestionario,
    );
  }

  @Mutation(() => SolicitudTutoria, {
    description: 'Aceptar tutoría entre pares o duelo',
  })
  @UseGuards(GqlAuthGuard)
  async aceptarTutoriaODuelo(
    @CurrentUser() user: AuthenticatedUser,
    @Args('solicitudId', { type: () => ID }) solicitudId: string,
  ): Promise<SolicitudTutoria> {
    return this.collaborationService.aceptarTutoriaODuelo(
      user.userId,
      solicitudId,
    );
  }

  @Query(() => [SolicitudTutoria])
  @UseGuards(GqlAuthGuard)
  async solicitudesTutoria(
    @Args('esDuelo', { nullable: true }) esDuelo?: boolean,
  ): Promise<SolicitudTutoria[]> {
    return this.collaborationService.listarSolicitudes(esDuelo);
  }
}
