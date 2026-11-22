import { UseGuards } from '@nestjs/common';
import {
  Args,
  ID,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  EstadoValidacionRecurso,
  RolUsuario,
} from '../common/enums/kolab.enums';
import { GqlAuthGuard } from '../common/guards/gql-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CreateRecursoInput,
  FiltrarRecursosInput,
} from './dto/recurso.input';
import { ResourcesService } from './resources.service';
import { ColeccionPersonal, Recurso } from './schemas/recurso.schema';

@Resolver(() => Recurso)
export class ResourcesResolver {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Mutation(() => Recurso, {
    description: 'RF-11/RF-92: Subir recurso (PDF o imagen <= 10 MB)',
  })
  @UseGuards(GqlAuthGuard)
  async subirRecurso(
    @CurrentUser() user: AuthenticatedUser,
    @Args('input') input: CreateRecursoInput,
  ): Promise<Recurso> {
    return this.resourcesService.createRecurso(user.userId, user.rol, input);
  }

  @Query(() => [Recurso], {
    description: 'RF-14/RF-59/RF-85..88: Buscar y filtrar recursos',
  })
  @UseGuards(GqlAuthGuard)
  async recursos(
    @Args('filtros', { nullable: true }) filtros?: FiltrarRecursosInput,
  ): Promise<Recurso[]> {
    return this.resourcesService.buscarRecursos(filtros);
  }

  @Query(() => Recurso, { description: 'Ver detalle de un recurso' })
  @UseGuards(GqlAuthGuard)
  async recurso(@Args('id', { type: () => ID }) id: string): Promise<Recurso> {
    return this.resourcesService.verRecurso(id);
  }

  @Mutation(() => Recurso, {
    description: 'RF-19..21: Validación y retroalimentación docente',
  })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(RolUsuario.DOCENTE, RolUsuario.ADMINISTRADOR)
  async validarRecurso(
    @CurrentUser() user: AuthenticatedUser,
    @Args('recursoId', { type: () => ID }) recursoId: string,
    @Args('estado', { type: () => EstadoValidacionRecurso })
    estado: EstadoValidacionRecurso,
    @Args('retroalimentacion', { nullable: true }) retroalimentacion?: string,
  ): Promise<Recurso> {
    return this.resourcesService.validarRecursoDocente(
      user.userId,
      recursoId,
      estado,
      retroalimentacion,
    );
  }

  @Mutation(() => Recurso, {
    description: 'RF-65: Invitar coautor a un recurso',
  })
  @UseGuards(GqlAuthGuard)
  async invitarCoautor(
    @CurrentUser() user: AuthenticatedUser,
    @Args('recursoId', { type: () => ID }) recursoId: string,
    @Args('coautorId', { type: () => ID }) coautorId: string,
  ): Promise<Recurso> {
    return this.resourcesService.invitarCoautor(
      user.userId,
      recursoId,
      coautorId,
    );
  }

  @Mutation(() => Recurso, {
    description: 'RF-13/RF-66: Agregar nueva versión de un recurso',
  })
  @UseGuards(GqlAuthGuard)
  async agregarVersionRecurso(
    @CurrentUser() user: AuthenticatedUser,
    @Args('recursoId', { type: () => ID }) recursoId: string,
    @Args('archivoUrl') archivoUrl: string,
    @Args('notaCambio') notaCambio: string,
  ): Promise<Recurso> {
    return this.resourcesService.agregarVersion(
      user.userId,
      recursoId,
      archivoUrl,
      notaCambio,
    );
  }

  @Mutation(() => Recurso, {
    description: 'RF-89..91: Calificar recurso (1 a 5 estrellas)',
  })
  @UseGuards(GqlAuthGuard)
  async calificarRecurso(
    @CurrentUser() user: AuthenticatedUser,
    @Args('recursoId', { type: () => ID }) recursoId: string,
    @Args('estrellas', { type: () => Int }) estrellas: number,
  ): Promise<Recurso> {
    return this.resourcesService.calificarRecurso(
      user.userId,
      recursoId,
      estrellas,
    );
  }

  @Mutation(() => Recurso, {
    description: 'RF-69: Comentar en un recurso de forma general',
  })
  @UseGuards(GqlAuthGuard)
  async comentarRecurso(
    @CurrentUser() user: AuthenticatedUser,
    @Args('recursoId', { type: () => ID }) recursoId: string,
    @Args('texto') texto: string,
  ): Promise<Recurso> {
    return this.resourcesService.comentarRecurso(user.userId, recursoId, texto);
  }

  @Mutation(() => Recurso, {
    description: 'RF-67: Enviar recurso a papelera de reciclaje (30 días)',
  })
  @UseGuards(GqlAuthGuard)
  async moverRecursoAPapelera(
    @CurrentUser() user: AuthenticatedUser,
    @Args('recursoId', { type: () => ID }) recursoId: string,
  ): Promise<Recurso> {
    return this.resourcesService.moverAPapelera(user.userId, recursoId);
  }

  @Mutation(() => ColeccionPersonal, {
    description: 'RF-61/RF-62: Guardar en favoritos o colección personal',
  })
  @UseGuards(GqlAuthGuard)
  async guardarRecursoEnColeccion(
    @CurrentUser() user: AuthenticatedUser,
    @Args('recursoId', { type: () => ID }) recursoId: string,
    @Args('nombreColeccion', { defaultValue: 'Favoritos' })
    nombreColeccion: string,
    @Args('esFavoritos', { defaultValue: false }) esFavoritos: boolean,
  ): Promise<ColeccionPersonal> {
    return this.resourcesService.guardarEnColeccion(
      user.userId,
      recursoId,
      nombreColeccion,
      esFavoritos,
    );
  }

  @Query(() => [ColeccionPersonal])
  @UseGuards(GqlAuthGuard)
  async misColecciones(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ColeccionPersonal[]> {
    return this.resourcesService.misColecciones(user.userId);
  }

  @Query(() => [Recurso], {
    description: 'RF-63: Sugerir recursos relacionados por tema',
  })
  @UseGuards(GqlAuthGuard)
  async recursosRelacionados(
    @Args('recursoId', { type: () => ID }) recursoId: string,
  ): Promise<Recurso[]> {
    return this.resourcesService.recursosRelacionados(recursoId);
  }

  @Query(() => [Recurso], {
    description: 'RF-67: Ver papelera de reciclaje personal (últimos 30 días)',
  })
  @UseGuards(GqlAuthGuard)
  async miPapelera(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Recurso[]> {
    return this.resourcesService.miPapelera(user.userId);
  }

  @Mutation(() => Recurso, {
    description: 'RF-67: Restaurar recurso desde la papelera de reciclaje',
  })
  @UseGuards(GqlAuthGuard)
  async restaurarRecurso(
    @CurrentUser() user: AuthenticatedUser,
    @Args('recursoId', { type: () => ID }) recursoId: string,
  ): Promise<Recurso> {
    return this.resourcesService.restaurarRecurso(user.userId, recursoId);
  }

  @ResolveField(() => String, { nullable: true })
  async nombreAutor(@Parent() recurso: Recurso): Promise<string | undefined> {
    if (recurso.nombreAutor) return recurso.nombreAutor;
    return this.resourcesService.resolveNombreAutor(
      recurso.idUsuario.toString(),
    );
  }
}
