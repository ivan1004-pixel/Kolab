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
import { QaService } from './qa.service';
import {
  Pregunta,
  RadarDificultadTema,
  Respuesta,
} from './schemas/qa.schema';

@Resolver()
export class QaResolver {
  constructor(private readonly qaService: QaService) {}

  @Mutation(() => Pregunta, {
    description: 'RF-09/RF-15/RF-46: Crear pregunta o pregunta colaborativa',
  })
  @UseGuards(GqlAuthGuard)
  async crearPregunta(
    @CurrentUser() user: AuthenticatedUser,
    @Args('texto') texto: string,
    @Args('idTema', { type: () => ID }) idTema: string,
    @Args('fragmentoRecurso', { nullable: true }) fragmentoRecurso?: string,
    @Args('idRecurso', { type: () => ID, nullable: true }) idRecurso?: string,
    @Args('etiquetas', { type: () => [String], nullable: true })
    etiquetas?: string[],
    @Args('esBancoColaborativo', { defaultValue: false })
    esBancoColaborativo?: boolean,
  ): Promise<Pregunta> {
    return this.qaService.crearPregunta(
      user.userId,
      texto,
      idTema,
      fragmentoRecurso,
      idRecurso,
      etiquetas || [],
      esBancoColaborativo,
    );
  }

  @Query(() => [Pregunta])
  @UseGuards(GqlAuthGuard)
  async preguntas(
    @Args('idTema', { type: () => ID, nullable: true }) idTema?: string,
  ): Promise<Pregunta[]> {
    return this.qaService.listarPreguntas(idTema);
  }

  @Mutation(() => Respuesta, { description: 'RF-16: Responder una pregunta' })
  @UseGuards(GqlAuthGuard)
  async responderPregunta(
    @CurrentUser() user: AuthenticatedUser,
    @Args('idPregunta', { type: () => ID }) idPregunta: string,
    @Args('texto') texto: string,
  ): Promise<Respuesta> {
    return this.qaService.responderPregunta(user.userId, idPregunta, texto);
  }

  @Query(() => [Respuesta])
  @UseGuards(GqlAuthGuard)
  async respuestas(
    @Args('idPregunta', { type: () => ID }) idPregunta: string,
  ): Promise<Respuesta[]> {
    return this.qaService.listarRespuestas(idPregunta);
  }

  @Mutation(() => Respuesta, {
    description: 'RF-17: Marcar respuesta como relevante (Docente)',
  })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(RolUsuario.DOCENTE, RolUsuario.ADMINISTRADOR)
  async marcarRespuestaRelevante(
    @Args('respuestaId', { type: () => ID }) respuestaId: string,
  ): Promise<Respuesta> {
    return this.qaService.marcarRespuestaRelevante(respuestaId);
  }

  @Mutation(() => Pregunta, {
    description: 'RF-18: Cerrar duda como resuelta',
  })
  @UseGuards(GqlAuthGuard)
  async cerrarPreguntaResuelta(
    @CurrentUser() user: AuthenticatedUser,
    @Args('preguntaId', { type: () => ID }) preguntaId: string,
  ): Promise<Pregunta> {
    return this.qaService.cerrarPreguntaResuelta(
      user.userId,
      user.rol,
      preguntaId,
    );
  }

  @Mutation(() => Pregunta, {
    description: 'RF-47: Validar pregunta del banco colaborativo (Docente)',
  })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(RolUsuario.DOCENTE, RolUsuario.ADMINISTRADOR)
  async validarPreguntaBanco(
    @Args('preguntaId', { type: () => ID }) preguntaId: string,
  ): Promise<Pregunta> {
    return this.qaService.validarPreguntaBanco(preguntaId);
  }

  @Mutation(() => Pregunta, { description: 'RF-48: Votar utilidad de pregunta' })
  @UseGuards(GqlAuthGuard)
  async votarPregunta(
    @Args('preguntaId', { type: () => ID }) preguntaId: string,
  ): Promise<Pregunta> {
    return this.qaService.votarUtilidadPregunta(preguntaId);
  }

  @Mutation(() => Respuesta, {
    description: 'RF-48: Votar utilidad de respuesta',
  })
  @UseGuards(GqlAuthGuard)
  async votarRespuesta(
    @Args('respuestaId', { type: () => ID }) respuestaId: string,
  ): Promise<Respuesta> {
    return this.qaService.votarUtilidadRespuesta(respuestaId);
  }

  @Query(() => [RadarDificultadTema], {
    description: 'RF-27/RF-28: Radar de dificultades por tema',
  })
  @UseGuards(GqlAuthGuard)
  async radarDificultades(
    @Args('idTema', { type: () => ID, nullable: true }) idTema?: string,
  ): Promise<RadarDificultadTema[]> {
    return this.qaService.radarDificultades(idTema);
  }
}
