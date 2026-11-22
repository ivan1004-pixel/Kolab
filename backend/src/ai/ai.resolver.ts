import { UseGuards } from '@nestjs/common';
import { Args, Float, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuario } from '../common/enums/kolab.enums';
import { GqlAuthGuard } from '../common/guards/gql-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { GeminiService } from './gemini.service';
import {
  AiConfig,
  AnalisisDocumentoIa,
  ConsultaIa,
  Cuestionario,
  IntentoCuestionario,
  PlanRepasoItem,
  PreguntaDelDia,
} from './schemas/ai.schema';

@Resolver()
export class AiResolver {
  constructor(private readonly geminiService: GeminiService) {}

  @Mutation(() => AnalisisDocumentoIa, {
    description: 'Analizar un documento del repositorio de conocimientos con Gemini AI',
  })
  @UseGuards(GqlAuthGuard)
  async analizarDocumentoIa(
    @CurrentUser() user: AuthenticatedUser,
    @Args('idRecurso', { type: () => ID }) idRecurso: string,
  ): Promise<AnalisisDocumentoIa> {
    return this.geminiService.analizarDocumento(user.userId, idRecurso);
  }

  @Mutation(() => ConsultaIa, {
    description: 'Consultar a Gemini AI sobre un documento o tema',
  })
  @UseGuards(GqlAuthGuard)
  async consultarIa(
    @CurrentUser() user: AuthenticatedUser,
    @Args('idTema', { type: () => ID }) idTema: string,
    @Args('promptPregunta') promptPregunta: string,
    @Args('idRecurso', { type: () => ID, nullable: true }) idRecurso?: string,
  ): Promise<ConsultaIa> {
    return this.geminiService.consultarIaSobreTema(
      user.userId,
      idTema,
      promptPregunta,
      idRecurso,
    );
  }

  @Mutation(() => Cuestionario, {
    description: 'Generar cuestionario de práctica (1-15 reactivos)',
  })
  @UseGuards(GqlAuthGuard)
  async generarCuestionarioIa(
    @CurrentUser() user: AuthenticatedUser,
    @Args('idTema', { type: () => ID }) idTema: string,
    @Args('cantidadReactivos', { type: () => Int, defaultValue: 5 })
    cantidadReactivos: number,
    @Args('titulo', { nullable: true }) titulo?: string,
    @Args('idRecurso', { type: () => ID, nullable: true }) idRecurso?: string,
  ): Promise<Cuestionario> {
    return this.geminiService.generarCuestionario(
      user.userId,
      idTema,
      cantidadReactivos,
      titulo,
      idRecurso,
    );
  }

  @Mutation(() => IntentoCuestionario, {
    description: 'RF-25/RF-26: Responder cuestionario y guardar resultados',
  })
  @UseGuards(GqlAuthGuard)
  async responderCuestionario(
    @CurrentUser() user: AuthenticatedUser,
    @Args('cuestionarioId', { type: () => ID }) cuestionarioId: string,
    @Args('respuestas', { type: () => [String] }) respuestas: string[],
  ): Promise<IntentoCuestionario> {
    return this.geminiService.responderCuestionario(
      user.userId,
      cuestionarioId,
      respuestas,
    );
  }

  @Query(() => [IntentoCuestionario], {
    description: 'RF-26/RF-81: Historial de autoevaluaciones del estudiante',
  })
  @UseGuards(GqlAuthGuard)
  async miHistorialCuestionarios(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IntentoCuestionario[]> {
    return this.geminiService.historialIntentos(user.userId);
  }

  @Mutation(() => ConsultaIa, {
    description: 'RF-73: Calificar respuesta de la IA como útil o no útil',
  })
  @UseGuards(GqlAuthGuard)
  async calificarRespuestaIa(
    @Args('consultaId', { type: () => ID }) consultaId: string,
    @Args('util') util: boolean,
  ): Promise<ConsultaIa> {
    return this.geminiService.calificarConsultaIa(consultaId, util);
  }

  @Query(() => [ConsultaIa], {
    description: 'RF-74: Consultas de IA marcadas como incorrectas para revisión docente',
  })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(RolUsuario.DOCENTE, RolUsuario.ADMINISTRADOR)
  async consultasIaPorRevisar(): Promise<ConsultaIa[]> {
    return this.geminiService.consultasIaPorRevisar();
  }

  @Query(() => PreguntaDelDia, {
    nullable: true,
    description: 'RF-43/RF-45: Pregunta del día priorizando temas con más errores',
  })
  @UseGuards(GqlAuthGuard)
  async preguntaDelDia(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PreguntaDelDia | null> {
    return this.geminiService.obtenerPreguntaDelDia(user.userId);
  }

  @Query(() => [PlanRepasoItem], {
    description: 'RF-79: Plan de repaso recomendado antes de exámenes',
  })
  @UseGuards(GqlAuthGuard)
  async planDeRepaso(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PlanRepasoItem[]> {
    return this.geminiService.generarPlanDeRepaso(user.userId);
  }

  @Mutation(() => ConsultaIa, {
    description: 'RF-74: Corregir respuesta de IA marcada como incorrecta (Docente)',
  })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(RolUsuario.DOCENTE, RolUsuario.ADMINISTRADOR)
  async corregirRespuestaIa(
    @Args('consultaId', { type: () => ID }) consultaId: string,
    @Args('correccionDocente') correccionDocente: string,
  ): Promise<ConsultaIa> {
    return this.geminiService.corregirConsultaIaDocente(
      consultaId,
      correccionDocente,
    );
  }

  @Query(() => AiConfig, {
    description: 'RF-33: Ver configuración del motor de IA (Admin)',
  })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMINISTRADOR)
  async aiConfig(): Promise<AiConfig> {
    return this.geminiService.getOrCreateConfig();
  }

  @Mutation(() => AiConfig, {
    description: 'RF-33: Configurar parámetros del motor de IA (Admin)',
  })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMINISTRADOR)
  async configurarIa(
    @Args('modelo', { nullable: true }) modelo?: string,
    @Args('temperatura', { type: () => Float, nullable: true })
    temperatura?: number,
    @Args('limiteConsultasDiarias', { type: () => Int, nullable: true })
    limiteConsultasDiarias?: number,
  ): Promise<AiConfig> {
    return this.geminiService.updateConfig(
      modelo,
      temperatura,
      limiteConsultasDiarias,
    );
  }
}
