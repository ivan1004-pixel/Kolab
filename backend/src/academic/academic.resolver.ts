import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuario } from '../common/enums/kolab.enums';
import { GqlAuthGuard } from '../common/guards/gql-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AcademicService } from './academic.service';
import {
  CreateAsignaturaInput,
  CreateCalendarioEventoInput,
  CreateCarreraInput,
  CreateTemaInput,
} from './dto/academic.input';
import {
  Asignatura,
  CalendarioEvento,
  Carrera,
  Tema,
} from './schemas/academic.schema';

@Resolver()
export class AcademicResolver {
  constructor(private readonly academicService: AcademicService) {}

  @Query(() => [Carrera])
  async carreras(): Promise<Carrera[]> {
    return this.academicService.findAllCarreras();
  }

  @Mutation(() => Carrera, { description: 'RF-32: Crear carrera (Admin)' })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMINISTRADOR)
  async crearCarrera(@Args('input') input: CreateCarreraInput): Promise<Carrera> {
    return this.academicService.createCarrera(input);
  }

  @Query(() => [Asignatura])
  async asignaturas(
    @Args('idCarrera', { type: () => ID, nullable: true }) idCarrera?: string,
  ): Promise<Asignatura[]> {
    return this.academicService.findAsignaturas(idCarrera);
  }

  @Mutation(() => Asignatura, { description: 'RF-32: Crear asignatura (Admin)' })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMINISTRADOR)
  async crearAsignatura(
    @Args('input') input: CreateAsignaturaInput,
  ): Promise<Asignatura> {
    return this.academicService.createAsignatura(input);
  }

  @Mutation(() => Boolean, { description: 'RNF-18: Eliminar asignatura controlada' })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMINISTRADOR)
  async eliminarAsignatura(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.academicService.deleteAsignatura(id);
  }

  @Query(() => [Tema])
  async temas(
    @Args('idAsignatura', { type: () => ID, nullable: true })
    idAsignatura?: string,
  ): Promise<Tema[]> {
    return this.academicService.findTemas(idAsignatura);
  }

  @Mutation(() => Tema, { description: 'RF-32: Crear tema (Admin o Docente)' })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.DOCENTE)
  async crearTema(@Args('input') input: CreateTemaInput): Promise<Tema> {
    return this.academicService.createTema(input);
  }

  @Mutation(() => CalendarioEvento, {
    description: 'RF-77: Registrar fecha de examen o entrega (Docente)',
  })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(RolUsuario.DOCENTE, RolUsuario.ADMINISTRADOR)
  async registrarEventoCalendario(
    @CurrentUser() user: AuthenticatedUser,
    @Args('input') input: CreateCalendarioEventoInput,
  ): Promise<CalendarioEvento> {
    return this.academicService.createCalendarioEvento(user.userId, input);
  }

  @Query(() => [CalendarioEvento], {
    description: 'RF-78: Consultar calendario de exámenes y entregas',
  })
  @UseGuards(GqlAuthGuard)
  async calendarioEventos(
    @Args('asignaturaIds', { type: () => [ID], nullable: true })
    asignaturaIds?: string[],
  ): Promise<CalendarioEvento[]> {
    return this.academicService.findCalendarioEventos(asignaturaIds);
  }
}
