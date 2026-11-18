import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EstadoValidacionRecurso } from '../common/enums/kolab.enums';
import { GamificationService } from '../gamification/gamification.service';
import {
  Recurso,
  RecursoDocument,
} from '../resources/schemas/recurso.schema';
import {
  AiConfig,
  AiConfigDocument,
  ConsultaIa,
  ConsultaIaDocument,
  Cuestionario,
  CuestionarioDocument,
  FuenteCitada,
  IntentoCuestionario,
  IntentoCuestionarioDocument,
  ReactivoCuestionario,
} from './schemas/ai.schema';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly apiKey: string;
  private readonly fallbackModels = [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.6-flash',
  ];

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(ConsultaIa.name)
    private readonly consultaModel: Model<ConsultaIaDocument>,
    @InjectModel(Cuestionario.name)
    private readonly cuestionarioModel: Model<CuestionarioDocument>,
    @InjectModel(IntentoCuestionario.name)
    private readonly intentoModel: Model<IntentoCuestionarioDocument>,
    @InjectModel(AiConfig.name)
    private readonly aiConfigModel: Model<AiConfigDocument>,
    @InjectModel(Recurso.name)
    private readonly recursoModel: Model<RecursoDocument>,
    private readonly gamificationService: GamificationService,
  ) {
    this.apiKey = (this.configService.get<string>('GEMINI_API_KEY') || '').trim();
  }

  private async callGeminiRest(
    modelName: string,
    prompt: string,
    temperature: number,
    jsonMode = false,
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`;
    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const errText = await res.text();
      const err: any = new Error(`Gemini ${res.status}: ${errText.slice(0, 150)}`);
      err.status = res.status;
      throw err;
    }

    const data = (await res.json()) as any;
    return (
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text || '')
        .join('')
        .trim() || ''
    );
  }

  async getOrCreateConfig(): Promise<AiConfigDocument> {
    let cfg = await this.aiConfigModel.findOne().exec();
    if (!cfg) {
      cfg = await new this.aiConfigModel({
        modelo:
          this.configService.get<string>('GEMINI_MODEL') ||
          'gemini-3.1-flash-lite',
        temperatura: 0.3,
        limiteConsultasDiarias: Number(
          this.configService.get<number>('AI_DAILY_LIMIT_PER_USER') || 20,
        ),
      }).save();
    }
    return cfg;
  }

  async updateConfig(
    modelo?: string,
    temperatura?: number,
    limiteConsultasDiarias?: number,
  ): Promise<AiConfigDocument> {
    const cfg = await this.getOrCreateConfig();
    if (modelo !== undefined) cfg.modelo = modelo;
    if (temperatura !== undefined) cfg.temperatura = temperatura;
    if (limiteConsultasDiarias !== undefined) {
      cfg.limiteConsultasDiarias = limiteConsultasDiarias;
    }
    return cfg.save();
  }

  private async checkDailyLimit(userId: string, limit: number): Promise<void> {
    const hoyInicio = new Date();
    hoyInicio.setHours(0, 0, 0, 0);
    const count = await this.consultaModel
      .countDocuments({
        idUsuario: new Types.ObjectId(userId),
        createdAt: { $gte: hoyInicio },
      })
      .exec();
    if (count >= limit) {
      throw new BadRequestException(
        `Has alcanzado tu límite diario de ${limit} consultas a la IA (RF-75).`,
      );
    }
  }

  private async getAuthorizedMaterials(idTema: string): Promise<RecursoDocument[]> {
    return this.recursoModel
      .find({
        idTema: new Types.ObjectId(idTema),
        eliminadoEn: { $exists: false },
        $or: [
          { estadoValidacion: EstadoValidacionRecurso.REVISADO_DOCENTE },
          { esMaterialOficial: true },
        ],
      })
      .limit(10)
      .exec();
  }

  /**
   * RF-23, RF-71, RF-72: Explica o resume un tema usando únicamente material autorizado.
   */
  async consultarIaSobreTema(
    userId: string,
    idTema: string,
    promptPregunta: string,
  ): Promise<ConsultaIaDocument> {
    const cfg = await this.getOrCreateConfig();
    await this.checkDailyLimit(userId, cfg.limiteConsultasDiarias);

    const materiales = await this.getAuthorizedMaterials(idTema);
    if (materiales.length === 0) {
      return new this.consultaModel({
        promptPregunta,
        respuestaIa:
          'No encontré material autorizado o validado por docente para este tema en la plataforma, por lo que no puedo generar una respuesta inventada (RF-72).',
        fuentesCitadas: [],
        esValida: true,
        generadoPorIa: true,
        idUsuario: new Types.ObjectId(userId),
        idTema: new Types.ObjectId(idTema),
      }).save();
    }

    const contexto = materiales
      .map(
        (m, idx) =>
          `[Fuente ${idx + 1} | ID:${m._id} | Título:${m.titulo}]: ${
            m.contenidoTextoExtraido || m.descripcion || m.titulo
          }`,
      )
      .join('\n\n');

    const systemPrompt = `Eres el asistente académico de Kolab.
REGLAS ESTRICTAS:
1. Responde ÚNICAMENTE usando el material autorizado proporcionado abajo.
2. Si la información no es suficiente, responde exactamente que no hay información suficiente en los materiales autorizados en lugar de inventar.
3. Cita siempre el título de las fuentes usadas.
4. Responde en español claro y académico.

MATERIAL AUTORIZADO:
${contexto}`;

    let respuestaTexto = '';
    try {
      if (!this.apiKey) {
        respuestaTexto = `[MODO DESARROLLO - GEMINI_API_KEY no configurada] Resumen basado en ${materiales.length} recurso(s) autorizado(s): ${materiales.map((m) => m.titulo).join(', ')}.`;
      } else {
        const candidates = Array.from(
          new Set([...this.fallbackModels, cfg.modelo]),
        );
        let lastErr: unknown;
        for (const modelName of candidates) {
          try {
            const text = await this.callGeminiRest(
              modelName,
              `${systemPrompt}\n\nPregunta del estudiante: ${promptPregunta}`,
              cfg.temperatura,
            );
            respuestaTexto =
              text || 'No se pudo obtener una respuesta del modelo de IA.';
            lastErr = null;
            break;
          } catch (err: any) {
            lastErr = err;
            const status = err?.status || err?.statusCode;
            if (
              status === 429 ||
              status === 503 ||
              status === 404 ||
              err?.name === 'TimeoutError'
            ) {
              this.logger.warn(
                `Modelo ${modelName} falló (${status || err?.name}), rotando al siguiente...`,
              );
              continue;
            }
            throw err;
          }
        }
        if (lastErr) throw lastErr;
      }
    } catch (error) {
      this.logger.error('Error al consultar Gemini API', error);
      throw new ServiceUnavailableException(
        'El servicio de IA no está disponible en este momento; el resto de Kolab sigue funcionando con normalidad (RNF-16).',
      );
    }

    const fuentesCitadas: FuenteCitada[] = materiales.map((m) => ({
      idRecurso: m._id,
      tituloRecurso: m.titulo,
      fragmento: (m.contenidoTextoExtraido || m.descripcion || m.titulo).slice(
        0,
        180,
      ),
    }));

    return new this.consultaModel({
      promptPregunta,
      respuestaIa: respuestaTexto,
      fuentesCitadas,
      esValida: true,
      generadoPorIa: true,
      idUsuario: new Types.ObjectId(userId),
      idTema: new Types.ObjectId(idTema),
    }).save();
  }

  /**
   * RF-24, RF-43..45: Genera un cuestionario de práctica (hasta 15 reactivos).
   */
  async generarCuestionario(
    userId: string,
    idTema: string,
    cantidadReactivos: number,
    titulo?: string,
  ): Promise<CuestionarioDocument> {
    if (cantidadReactivos < 1 || cantidadReactivos > 15) {
      throw new BadRequestException(
        'El cuestionario debe tener entre 1 y 15 reactivos (RF-24).',
      );
    }

    const cfg = await this.getOrCreateConfig();
    const materiales = await this.getAuthorizedMaterials(idTema);
    if (materiales.length === 0) {
      throw new BadRequestException(
        'No hay material autorizado en este tema para generar un cuestionario.',
      );
    }

    // RF-44: Adaptar dificultad según historial de intentos del estudiante
    const intentosPrevios = await this.intentoModel
      .find({
        idUsuario: new Types.ObjectId(userId),
        idTema: new Types.ObjectId(idTema),
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .exec();

    let dificultad = 'INTERMEDIA';
    if (intentosPrevios.length > 0) {
      const promedio =
        intentosPrevios.reduce((s, i) => s + i.calificacion, 0) /
        intentosPrevios.length;
      if (promedio < 60) dificultad = 'BASICA';
      else if (promedio >= 85) dificultad = 'AVANZADA';
    }

    let reactivos: ReactivoCuestionario[] = [];
    const contexto = materiales
      .map(
        (m) =>
          `${m.titulo}: ${m.contenidoTextoExtraido || m.descripcion || ''}`,
      )
      .join('\n');

    if (!this.apiKey) {
      reactivos = Array.from({ length: cantidadReactivos }, (_, idx) => ({
        numero: idx + 1,
        tipo: idx % 2 === 0 ? 'CERRADA' : 'ABIERTA',
        pregunta: `Pregunta de práctica #${idx + 1} (${dificultad}) sobre ${materiales[0].titulo}`,
        opciones: idx % 2 === 0 ? ['Opción A', 'Opción B', 'Opción C'] : [],
        respuestaCorrecta: idx % 2 === 0 ? 'Opción A' : 'Respuesta modelo',
        explicacion: `Basado en el recurso autorizado "${materiales[0].titulo}".`,
      }));
    } else {
      try {
        const prompt = `Genera exactamente ${cantidadReactivos} reactivos de dificultad ${dificultad} (combinando tipo CERRADA y ABIERTA) en formato JSON array válido con las claves: numero (int), tipo ("CERRADA"|"ABIERTA"), pregunta (string), opciones (string[]), respuestaCorrecta (string), explicacion (string). Usa SOLO este material:\n${contexto}`;
        const candidates = Array.from(
          new Set([...this.fallbackModels, cfg.modelo]),
        );
        let generatedText = '[]';
        let lastErr: unknown;
        for (const modelName of candidates) {
          try {
            generatedText =
              (await this.callGeminiRest(
                modelName,
                prompt,
                cfg.temperatura,
                true,
              )) || '[]';
            lastErr = null;
            break;
          } catch (err: any) {
            lastErr = err;
            const status = err?.status || err?.statusCode;
            if (
              status === 429 ||
              status === 503 ||
              status === 404 ||
              err?.name === 'TimeoutError'
            ) {
              this.logger.warn(
                `Modelo ${modelName} falló (${status || err?.name}) en cuestionario, rotando...`,
              );
              continue;
            }
            throw err;
          }
        }
        if (lastErr) throw lastErr;
        const parsed = JSON.parse(generatedText);
        reactivos = Array.isArray(parsed) ? parsed.slice(0, 15) : [];
      } catch (error) {
        this.logger.error('Error generando cuestionario con Gemini', error);
        throw new ServiceUnavailableException(
          'No se pudo generar el cuestionario con IA en este momento.',
        );
      }
    }

    return new this.cuestionarioModel({
      titulo: titulo || `Práctica (${dificultad}) - ${materiales[0].titulo}`,
      referenciaIa: cfg.modelo,
      idTema: new Types.ObjectId(idTema),
      idUsuario: new Types.ObjectId(userId),
      reactivos,
      dificultad,
      generadoPorIa: true,
    }).save();
  }

  /**
   * RF-25, RF-26: Evalúa el cuestionario, señala conceptos a reforzar y guarda historial.
   */
  async responderCuestionario(
    userId: string,
    cuestionarioId: string,
    respuestasUsuario: string[],
  ): Promise<IntentoCuestionarioDocument> {
    const cuestionario = await this.cuestionarioModel
      .findById(cuestionarioId)
      .exec();
    if (!cuestionario) {
      throw new NotFoundException('Cuestionario no encontrado');
    }

    let aciertos = 0;
    const conceptosPorReforzar: string[] = [];

    cuestionario.reactivos.forEach((r, idx) => {
      const resp = (respuestasUsuario[idx] || '').trim().toLowerCase();
      const correcta = r.respuestaCorrecta.trim().toLowerCase();
      if (resp && (resp === correcta || correcta.includes(resp))) {
        aciertos += 1;
      } else {
        conceptosPorReforzar.push(r.pregunta.slice(0, 100));
      }
    });

    const total = cuestionario.reactivos.length || 1;
    const calificacion = Number(((aciertos / total) * 100).toFixed(2));
    const retroalimentacion =
      calificacion >= 80
        ? '¡Excelente desempeño! Dominas la mayoría de los conceptos del tema.'
        : 'Buen intento. Te recomendamos repasar los conceptos señalados para reforzar.';

    const intento = await new this.intentoModel({
      idCuestionario: cuestionario._id,
      idUsuario: new Types.ObjectId(userId),
      idTema: cuestionario.idTema,
      aciertos,
      totalReactivos: total,
      calificacion,
      retroalimentacion,
      conceptosPorReforzar,
    }).save();

    await this.gamificationService.registrarActividadDiaria(
      userId,
      20 + aciertos * 5,
    );

    return intento;
  }

  async historialIntentos(userId: string): Promise<IntentoCuestionarioDocument[]> {
    return this.intentoModel
      .find({ idUsuario: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async calificarConsultaIa(
    consultaId: string,
    util: boolean,
  ): Promise<ConsultaIaDocument> {
    const c = await this.consultaModel
      .findByIdAndUpdate(
        consultaId,
        { $set: { calificacionUsuario: util } },
        { new: true },
      )
      .exec();
    if (!c) throw new NotFoundException('Consulta de IA no encontrada');
    return c;
  }

  async corregirConsultaIaDocente(
    consultaId: string,
    correccionDocente: string,
  ): Promise<ConsultaIaDocument> {
    const c = await this.consultaModel
      .findByIdAndUpdate(
        consultaId,
        { $set: { correccionDocente, esValida: false } },
        { new: true },
      )
      .exec();
    if (!c) throw new NotFoundException('Consulta de IA no encontrada');
    return c;
  }
}
