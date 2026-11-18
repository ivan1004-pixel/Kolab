import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuario } from '../common/enums/kolab.enums';
import { GqlAuthGuard } from '../common/guards/gql-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Usuario } from '../users/schemas/usuario.schema';
import { GamificationService } from './gamification.service';
import {
  RetoComunitario,
  UsuarioInsignia,
} from './schemas/gamification.schema';

@Resolver()
export class GamificationResolver {
  constructor(private readonly gamificationService: GamificationService) {}

  @Mutation(() => Usuario, {
    description: 'RF-38: Congela la racha usando un comodín mensual',
  })
  @UseGuards(GqlAuthGuard)
  async congelarMiRacha(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Usuario> {
    return this.gamificationService.congelarRacha(user.userId);
  }

  @Query(() => [UsuarioInsignia], {
    description: 'RF-41: Lista las insignias obtenidas por el usuario',
  })
  @UseGuards(GqlAuthGuard)
  async misInsignias(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UsuarioInsignia[]> {
    return this.gamificationService.getMisInsignias(user.userId);
  }

  @Query(() => [Usuario], {
    description: 'RF-42: Ranking por grupo o asignatura',
  })
  @UseGuards(GqlAuthGuard)
  async ranking(
    @Args('grupo', { nullable: true }) grupo?: string,
    @Args('asignaturaId', { type: () => ID, nullable: true })
    asignaturaId?: string,
  ): Promise<Usuario[]> {
    return this.gamificationService.getRanking(grupo, asignaturaId);
  }

  @Mutation(() => RetoComunitario, {
    description: 'RF-49: Crear reto semanal comunitario',
  })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(RolUsuario.DOCENTE, RolUsuario.ADMINISTRADOR)
  async crearRetoComunitario(
    @Args('titulo') titulo: string,
    @Args('descripcion') descripcion: string,
    @Args('xpRecompensa', { type: () => Int }) xpRecompensa: number,
    @Args('metaCantidad', { type: () => Int }) metaCantidad: number,
    @Args('idGrupo', { type: () => ID }) idGrupo: string,
  ): Promise<RetoComunitario> {
    return this.gamificationService.crearRetoComunitario(
      titulo,
      descripcion,
      xpRecompensa,
      metaCantidad,
      idGrupo,
    );
  }

  @Query(() => [RetoComunitario], {
    description: 'RF-49: Listar retos comunitarios',
  })
  @UseGuards(GqlAuthGuard)
  async retosComunitarios(
    @Args('idGrupo', { type: () => ID, nullable: true }) idGrupo?: string,
  ): Promise<RetoComunitario[]> {
    return this.gamificationService.listarRetos(idGrupo);
  }
}
