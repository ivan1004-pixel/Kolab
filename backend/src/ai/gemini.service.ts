import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as fs from 'fs';
import { Model, Types } from 'mongoose';
import * as path from 'path';
import {
  CalendarioEvento,
  CalendarioEventoDocument,
  Tema,
  TemaDocument,
} from '../academic/schemas/academic.schema';
import { EstadoValidacionRecurso } from '../common/enums/kolab.enums';
import { GamificationService } from '../gamification/gamification.service';
import { Pregunta, PreguntaDocument } from '../qa/schemas/qa.schema';
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
  PlanRepasoItem,
  PreguntaDelDia,
  ReactivoCuestionario,
} from './schemas/ai.schema';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly apiKey: string;
  private readonly fallbackModels = [
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
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
    @InjectModel(Tema.name)
    private readonly temaModel: Model<TemaDocument>,
    @InjectModel(CalendarioEvento.name)
    private readonly calendarioModel: Model<CalendarioEventoDocument>,
    @InjectModel(Pregunta.name)
    private readonly preguntaModel: Model<PreguntaDocument>,
    private readonly gamificationService: GamificationService,
  ) {
    this.apiKey = (this.configService.get<string>('GEMINI_API_KEY') || '').trim();
  }

  private buildMultimodalParts(
    prompt: string,
    materiales: RecursoDocument[],
  ): Array<Record<string, unknown>> {
    const parts: Array<Record<string, unknown>> = [];
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const maxInlineBytes = 5 * 1024 * 1024;
    let attached = 0;

    for (const m of materiales) {
      if (attached >= 3) break;
      const match = m.archivoUrl?.match(/\/uploads\/([^/?#]+)$/);
      if (!match) continue;
      const fileName = decodeURIComponent(match[1]);
      const safeName = path.basename(fileName);
      const fullPath = path.join(uploadsDir, safeName);
      if (!fs.existsSync(fullPath)) continue;

      try {
        const stat = fs.statSync(fullPath);
        if (stat.size <= 0 || stat.size > maxInlineBytes) continue;
        const ext = path.extname(safeName).toLowerCase();
        const mimeType =
          ext === '.pdf'
            ? 'application/pdf'
            : ext === '.png'
              ? 'image/png'
              : ext === '.webp'
                ? 'image/webp'
                : ext === '.jpg' || ext === '.jpeg'
                  ? 'image/jpeg'
                  : '';
        if (!mimeType) continue;

        const data = fs.readFileSync(fullPath).toString('base64');
        parts.push({ inlineData: { mimeType, data } });
        attached += 1;
      } catch {
        // Si no se puede leer el archivo físico, se usa su texto y metadatos
      }
    }

    parts.push({ text: prompt });
    return parts;
  }

  private async callGeminiRest(
    modelName: string,
    prompt: string,
    temperature: number,
    jsonMode = false,
    materiales: RecursoDocument[] = [],
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const parts = this.buildMultimodalParts(prompt, materiales);
    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature,
        ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(14000),
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
          this.configService.get<number>('AI_DAILY_LIMIT_PER_USER') || 10,
        ),
      }).save();
    } else if (cfg.modelo === 'gemini-3.8-flash' || cfg.modelo === 'gemini-3.5-flash') {
      cfg.modelo = 'gemini-3.1-flash-lite';
      await cfg.save();
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
    const filter = {
      idUsuario: new Types.ObjectId(userId),
      createdAt: { $gte: hoyInicio },
    };
    const [consultasCount, cuestionariosCount] = await Promise.all([
      this.consultaModel.countDocuments(filter).exec(),
      this.cuestionarioModel.countDocuments(filter).exec(),
    ]);
    if (consultasCount + cuestionariosCount >= limit) {
      throw new BadRequestException(
        `Has alcanzado tu límite diario de ${limit} consultas a la IA.`,
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
          'No encontré material autorizado o validado por docente para este tema en la plataforma, por lo que no puedo generar una respuesta inventada.',
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
          `[Fuente ${idx + 1} | ID:${m._id} | Título:${m.titulo}]: ${m.contenidoTextoExtraido || m.descripcion || m.titulo
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
              false,
              materiales,
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
    await this.checkDailyLimit(userId, cfg.limiteConsultasDiarias);
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
                materiales,
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
        const cleanedJson = generatedText
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        const parsed = JSON.parse(cleanedJson);
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

  /**
   * RF-74: Listar respuestas de IA marcadas como no útiles o pendientes de revisión docente.
   */
  async consultasIaPorRevisar(): Promise<ConsultaIaDocument[]> {
    return this.consultaModel
      .find({
        $or: [
          { calificacionUsuario: false },
          { correccionDocente: { $exists: true, $ne: '' } },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
  }

  /**
   * RF-43 & RF-45: Pregunta del día priorizando los temas con más errores (repaso espaciado).
   */
  async obtenerPreguntaDelDia(userId: string): Promise<PreguntaDelDia | null> {
    const [intentos, temas] = await Promise.all([
      this.intentoModel
        .find({ idUsuario: new Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .limit(30)
        .exec(),
      this.temaModel.find().sort({ createdAt: 1 }).exec(),
    ]);

    if (temas.length === 0) return null;

    // Calcular tema con mayor necesidad de repaso espaciado (menor promedio / más fallos)
    const statsByTema = new Map<string, { sumScore: number; count: number; weakConcept?: string }>();
    for (const i of intentos) {
      const key = i.idTema.toString();
      const s = statsByTema.get(key) ?? { sumScore: 0, count: 0 };
      s.sumScore += i.calificacion;
      s.count += 1;
      if (!s.weakConcept && i.conceptosPorReforzar?.length) {
        s.weakConcept = i.conceptosPorReforzar[0];
      }
      statsByTema.set(key, s);
    }

    let chosenTema = temas[0];
    let dificultad = 'INTERMEDIA';
    let motivoPrioridad = 'Tema sugerido del día según materiales autorizados.';
    let weakConcept: string | undefined;

    if (statsByTema.size > 0) {
      let lowestAvg = 101;
      for (const [temaId, s] of statsByTema.entries()) {
        const avg = s.sumScore / s.count;
        if (avg < lowestAvg) {
          lowestAvg = avg;
          const found = temas.find((t) => t._id.toString() === temaId);
          if (found) {
            chosenTema = found;
            weakConcept = s.weakConcept;
            dificultad = avg < 60 ? 'BASICA' : avg >= 85 ? 'AVANZADA' : 'INTERMEDIA';
            motivoPrioridad = `Repaso espaciado (RF-45): tu promedio reciente en este tema es ${Math.round(avg)}%.`;
          }
        }
      }
    } else {
      const dayIdx = new Date().getDate() % temas.length;
      chosenTema = temas[dayIdx];
    }

    const [bancoValidado, materiales] = await Promise.all([
      this.preguntaModel
        .findOne({ idTema: chosenTema._id, validadaPorDocente: true })
        .sort({ votosUtilidad: -1 })
        .exec(),
      this.getAuthorizedMaterials(chosenTema._id.toString()),
    ]);

    const fuenteTitulo = materiales[0]?.titulo;
    const pregunta =
      bancoValidado?.texto ||
      (weakConcept
        ? `Repasa este concepto clave de "${chosenTema.titulo}": ${weakConcept}`
        : fuenteTitulo
          ? `Con base en "${fuenteTitulo}", ¿cuáles son los conceptos fundamentales de ${chosenTema.titulo} y cómo se aplican en un caso práctico?`
          : `¿Qué concepto clave de "${chosenTema.titulo}" consideras más importante y cómo lo explicarías con un ejemplo?`);

    return {
      idTema: chosenTema._id,
      tituloTema: chosenTema.titulo,
      pregunta,
      dificultad,
      motivoPrioridad,
      fuenteTitulo,
    };
  }

  /**
   * RF-79: Plan de repaso recomendado antes de un examen según los temas con más errores.
   */
  async generarPlanDeRepaso(userId: string): Promise<PlanRepasoItem[]> {
    const ahora = new Date();
    const [eventos, intentos] = await Promise.all([
      this.calendarioModel
        .find({ fecha: { $gte: ahora } })
        .sort({ fecha: 1 })
        .limit(10)
        .exec(),
      this.intentoModel
        .find({ idUsuario: new Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .limit(30)
        .exec(),
    ]);

    const weakByTema = new Map<string, { avg: number; conceptos: string[] }>();
    const grouped = new Map<string, IntentoCuestionarioDocument[]>();
    for (const i of intentos) {
      const k = i.idTema.toString();
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k)!.push(i);
    }
    for (const [k, arr] of grouped.entries()) {
      const avg = arr.reduce((s, x) => s + x.calificacion, 0) / arr.length;
      const conceptos = Array.from(
        new Set(arr.flatMap((x) => x.conceptosPorReforzar || [])),
      ).slice(0, 4);
      weakByTema.set(k, { avg, conceptos });
    }

    return eventos.map((ev) => {
      const temaKey = ev.idTema?.toString();
      const weak = temaKey ? weakByTema.get(temaKey) : undefined;
      const diasRestantes = Math.max(
        0,
        Math.ceil((ev.fecha.getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const prioridad =
        diasRestantes <= 3 || (weak && weak.avg < 65)
          ? 'ALTA'
          : diasRestantes <= 7
            ? 'MEDIA'
            : 'NORMAL';
      const recomendacion = weak
        ? `Faltan ${diasRestantes} día(s). Tu promedio en este tema es ${Math.round(weak.avg)}%; dedica 2 sesiones de práctica y resuelve un cuestionario IA antes del evento.`
        : `Faltan ${diasRestantes} día(s). Revisa los recursos validados por docente y genera un cuestionario corto de diagnóstico.`;

      return {
        idEvento: ev._id,
        tituloEvento: ev.titulo,
        fechaEvento: ev.fecha,
        idAsignatura: ev.idAsignatura,
        idTema: ev.idTema,
        prioridad,
        recomendacion,
        conceptosClave: weak?.conceptos ?? [],
      };
    });
  }
}
