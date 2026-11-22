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
  AnalisisDocumentoIa,
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
  RecursoRecomendado,
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
    timeoutMs = 24000,
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
      signal: AbortSignal.timeout(timeoutMs),
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

  private async callGeminiWithFallback(
    prompt: string,
    temperature: number,
    jsonMode: boolean,
    materiales: RecursoDocument[],
    preferredModel: string,
  ): Promise<string> {
    const candidates = Array.from(new Set([...this.fallbackModels, preferredModel]));
    let lastErr: unknown;
    for (const modelName of candidates) {
      try {
        return await this.callGeminiRest(
          modelName,
          prompt,
          temperature,
          jsonMode,
          materiales,
        );
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
    throw lastErr || new Error('Sin respuesta del modelo de IA');
  }

  private parseJsonSafe<T = any>(raw: string): T | null {
    const cleaned = (raw || '')
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try {
          return JSON.parse(objMatch[0]) as T;
        } catch {
          // ignore
        }
      }
      const arrMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        try {
          return JSON.parse(arrMatch[0]) as T;
        } catch {
          // ignore
        }
      }
      return null;
    }
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
    if (!Types.ObjectId.isValid(idTema)) return [];
    const authorized = await this.recursoModel
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
    if (authorized.length > 0) return authorized;

    return this.recursoModel
      .find({
        idTema: new Types.ObjectId(idTema),
        eliminadoEn: { $exists: false },
      })
      .sort({ createdAt: -1 })
      .limit(6)
      .exec();
  }

  private async resolveTargetMaterials(
    idTema: string,
    idRecurso?: string,
  ): Promise<{ materiales: RecursoDocument[]; effectiveTemaId: string }> {
    if (idRecurso && Types.ObjectId.isValid(idRecurso)) {
      const recurso = await this.recursoModel
        .findOne({ _id: new Types.ObjectId(idRecurso), eliminadoEn: { $exists: false } })
        .exec();
      if (!recurso) {
        throw new NotFoundException('El documento seleccionado ya no está disponible.');
      }
      return {
        materiales: [recurso],
        effectiveTemaId: recurso.idTema?.toString() || idTema,
      };
    }

    const materiales = await this.getAuthorizedMaterials(idTema);
    return { materiales, effectiveTemaId: idTema };
  }

  async analizarDocumento(
    _userId: string,
    idRecurso: string,
  ): Promise<AnalisisDocumentoIa> {
    if (!Types.ObjectId.isValid(idRecurso)) {
      throw new BadRequestException('Selecciona un documento válido del repositorio.');
    }
    const recurso = await this.recursoModel
      .findOne({ _id: new Types.ObjectId(idRecurso), eliminadoEn: { $exists: false } })
      .exec();
    if (!recurso) {
      throw new NotFoundException('No se encontró el documento seleccionado.');
    }

    const cfg = await this.getOrCreateConfig();
    const metaContext = [
      `Título: ${recurso.titulo}`,
      recurso.descripcion ? `Descripción: ${recurso.descripcion}` : '',
      recurso.palabrasClave?.length ? `Palabras clave: ${recurso.palabrasClave.join(', ')}` : '',
      recurso.contenidoTextoExtraido ? `Contenido previo: ${recurso.contenidoTextoExtraido}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    let resumen =
      recurso.descripcion ||
      `Documento "${recurso.titulo}" listo para consulta académica.`;
    let temasClave: string[] = (recurso.palabrasClave || []).slice(0, 5);

    if (this.apiKey) {
      try {
        const prompt = `Analiza el documento adjunto (PDF/imagen) y sus metadatos para preparar una sesión de estudio con un estudiante en español.
Devuelve EXCLUSIVAMENTE un JSON válido con esta estructura exacta:
{
  "resumen": "Resumen breve y claro de 2 a 3 oraciones sobre de qué trata el documento",
  "temasClave": ["Concepto 1", "Concepto 2", "Concepto 3", "Concepto 4"],
  "extractoClave": "Síntesis detallada de los puntos principales, definiciones y datos del documento (máximo 1200 caracteres)"
}

METADATOS DEL DOCUMENTO:
${metaContext}`;

        const raw = await this.callGeminiWithFallback(
          prompt,
          0.2,
          true,
          [recurso],
          cfg.modelo,
        );
        const parsed = this.parseJsonSafe<{
          resumen?: string;
          temasClave?: string[];
          extractoClave?: string;
        }>(raw);

        if (parsed?.resumen) resumen = String(parsed.resumen).trim();
        if (Array.isArray(parsed?.temasClave) && parsed.temasClave.length > 0) {
          temasClave = parsed.temasClave.map((t) => String(t).trim()).filter(Boolean).slice(0, 5);
        }
        if (parsed?.extractoClave && !recurso.contenidoTextoExtraido) {
          await this.recursoModel
            .updateOne(
              { _id: recurso._id },
              { $set: { contenidoTextoExtraido: String(parsed.extractoClave).slice(0, 3000) } },
            )
            .catch(() => {});
        }
      } catch (err) {
        this.logger.warn(`Análisis rápido fallback para ${recurso.titulo}: ${(err as Error).message}`);
      }
    }

    return {
      idRecurso: recurso._id,
      tituloRecurso: recurso.titulo,
      resumen,
      temasClave,
      mensajeBienvenida: `Ya analicé "${recurso.titulo}". Pregunta lo que quieras.`,
    };
  }

  /**
   * Consulta a Gemini AI devolviendo dos bloques diferenciados: Respuesta del recurso y Respuesta de la IA.
   */
  async consultarIaSobreTema(
    userId: string,
    idTema: string,
    promptPregunta: string,
    idRecurso?: string,
  ): Promise<ConsultaIaDocument> {
    const cfg = await this.getOrCreateConfig();
    await this.checkDailyLimit(userId, cfg.limiteConsultasDiarias);

    const { materiales, effectiveTemaId } = await this.resolveTargetMaterials(
      idTema,
      idRecurso,
    );

    if (materiales.length === 0) {
      const msg =
        'No encontré documentos disponibles para este tema. Selecciona un documento en «Documento a leer» o sube material en el repositorio.';
      return new this.consultaModel({
        promptPregunta,
        respuestaIa: msg,
        respuestaRecurso: msg,
        respuestaComplementaria:
          'Cuando selecciones un documento del repositorio, podré explicarte su contenido y complementarlo con ejemplos claros.',
        fuentesCitadas: [],
        esValida: true,
        generadoPorIa: true,
        idUsuario: new Types.ObjectId(userId),
        idTema: new Types.ObjectId(effectiveTemaId),
      }).save();
    }

    const contexto = materiales
      .map(
        (m, idx) =>
          `[Documento ${idx + 1} | Título: ${m.titulo}]: ${
            m.contenidoTextoExtraido || m.descripcion || m.titulo
          }${m.palabrasClave?.length ? ` | Palabras clave: ${m.palabrasClave.join(', ')}` : ''}`,
      )
      .join('\n\n');

    const prompt = `Eres el asistente académico de Kolab. El estudiante ha seleccionado un documento del repositorio y te hace una pregunta.
Analiza el archivo adjunto (si existe) y el contexto del documento proporcionado abajo.

Devuelve EXCLUSIVAMENTE un objeto JSON válido en español con EXACTAMENTE estas dos claves:
{
  "respuestaRecurso": "Respuesta basada ESTRICTAMENTE en lo que dice el documento/recurso adjunto o su texto. Cita el título del recurso y explica qué aporta concretamente sobre la pregunta. Si el documento no cubre algún detalle, indícalo con honestidad.",
  "respuestaComplementaria": "Respuesta propia de la IA en tono claro y didáctico que complementa el tema con una explicación más amplia, un ejemplo práctico o analogía para que el estudiante lo comprenda mejor."
}

DOCUMENTO(S) DE REFERENCIA:
${contexto}

PREGUNTA DEL ESTUDIANTE:
${promptPregunta}`;

    let respuestaRecurso = '';
    let respuestaComplementaria = '';

    try {
      if (!this.apiKey) {
        respuestaRecurso = `Resumen basado en "${materiales[0].titulo}": ${materiales[0].contenidoTextoExtraido || materiales[0].descripcion || materiales[0].titulo}.`;
        respuestaComplementaria = `Explicación complementaria de la IA sobre tu pregunta "${promptPregunta}".`;
      } else {
        const raw = await this.callGeminiWithFallback(
          prompt,
          cfg.temperatura,
          true,
          materiales,
          cfg.modelo,
        );
        const parsed = this.parseJsonSafe<{
          respuestaRecurso?: string;
          respuestaComplementaria?: string;
        }>(raw);

        if (parsed?.respuestaRecurso || parsed?.respuestaComplementaria) {
          respuestaRecurso = (
            parsed.respuestaRecurso ||
            `Según "${materiales[0].titulo}", no se encontró un apartado textual exacto para esa pregunta.`
          ).trim();
          respuestaComplementaria = (
            parsed.respuestaComplementaria ||
            'Puedes hacer una pregunta más específica para profundizar con ejemplos paso a paso.'
          ).trim();
        } else {
          respuestaRecurso = (raw || 'No se pudo obtener una respuesta del documento.').trim();
          respuestaComplementaria =
            'Complemento generado con base en el contexto académico del tema seleccionado.';
        }
      }
    } catch (error) {
      this.logger.error('Error al consultar Gemini API', error);
      throw new ServiceUnavailableException(
        'El servicio de IA no está disponible en este momento; el resto de Kolab sigue funcionando con normalidad.',
      );
    }

    const respuestaTexto = `Respuesta del recurso:\n${respuestaRecurso}\n\nRespuesta de la IA:\n${respuestaComplementaria}`;

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
      respuestaRecurso,
      respuestaComplementaria,
      idRecurso: idRecurso && Types.ObjectId.isValid(idRecurso) ? new Types.ObjectId(idRecurso) : materiales[0]._id,
      fuentesCitadas,
      esValida: true,
      generadoPorIa: true,
      idUsuario: new Types.ObjectId(userId),
      idTema: new Types.ObjectId(effectiveTemaId),
    }).save();
  }

  /**
   * Genera un cuestionario de práctica paso a paso (1 a 15 reactivos) usando el documento elegido o el tema.
   */
  async generarCuestionario(
    userId: string,
    idTema: string,
    cantidadReactivos: number,
    titulo?: string,
    idRecurso?: string,
  ): Promise<CuestionarioDocument> {
    if (cantidadReactivos < 1 || cantidadReactivos > 15) {
      throw new BadRequestException(
        'El cuestionario debe tener entre 1 y 15 reactivos.',
      );
    }

    const cfg = await this.getOrCreateConfig();
    await this.checkDailyLimit(userId, cfg.limiteConsultasDiarias);

    const { materiales, effectiveTemaId } = await this.resolveTargetMaterials(
      idTema,
      idRecurso,
    );
    if (materiales.length === 0) {
      throw new BadRequestException(
        'No hay documentos disponibles para generar el cuestionario. Selecciona un documento en «Documento a leer».',
      );
    }

    const intentosPrevios = await this.intentoModel
      .find({
        idUsuario: new Types.ObjectId(userId),
        idTema: new Types.ObjectId(effectiveTemaId),
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
          `${m.titulo}: ${m.contenidoTextoExtraido || m.descripcion || m.titulo}`,
      )
      .join('\n');

    if (!this.apiKey) {
      reactivos = Array.from({ length: cantidadReactivos }, (_, idx) => ({
        numero: idx + 1,
        tipo: 'CERRADA',
        pregunta: `Pregunta de práctica #${idx + 1} (${dificultad}) sobre ${materiales[0].titulo}`,
        opciones: ['Opción A', 'Opción B', 'Opción C', 'Opción D'],
        respuestaCorrecta: 'Opción A',
        explicacion: `Basado en el recurso "${materiales[0].titulo}".`,
      }));
    } else {
      try {
        const prompt = `Genera exactamente ${cantidadReactivos} reactivos de evaluación de dificultad ${dificultad} en español basados en el documento adjunto y el contexto.
REGLAS:
- Usa principalmente preguntas de tipo "CERRADA" con exactamente 4 opciones claras en "opciones" (y puedes incluir como máximo 1 pregunta "ABIERTA" con "opciones": [] si son 5 o más reactivos).
- En preguntas "CERRADA", "respuestaCorrecta" DEBE coincidir exactamente con uno de los textos del arreglo "opciones".
- Devuelve EXCLUSIVAMENTE un JSON array válido de objetos con las claves:
  numero (int empezando en 1), tipo ("CERRADA"|"ABIERTA"), pregunta (string), opciones (string[]), respuestaCorrecta (string), explicacion (string).

MATERIAL DE REFERENCIA:
${contexto}`;

        const generatedText = await this.callGeminiWithFallback(
          prompt,
          cfg.temperatura,
          true,
          materiales,
          cfg.modelo,
        );
        const parsed = this.parseJsonSafe<any>(generatedText);
        const rawArray = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.reactivos)
            ? parsed.reactivos
            : [];

        reactivos = rawArray.slice(0, cantidadReactivos).map((item: any, idx: number) => {
          const opciones = Array.isArray(item?.opciones)
            ? item.opciones.map((o: any) => String(o).trim()).filter(Boolean)
            : [];
          const tipo = opciones.length > 0 ? 'CERRADA' : 'ABIERTA';
          let respuestaCorrecta = String(item?.respuestaCorrecta || '').trim();
          if (tipo === 'CERRADA' && opciones.length > 0 && !opciones.includes(respuestaCorrecta)) {
            const match = opciones.find(
              (o: string) => o.toLowerCase() === respuestaCorrecta.toLowerCase(),
            );
            respuestaCorrecta = match || opciones[0];
          }
          return {
            numero: idx + 1,
            tipo,
            pregunta: String(item?.pregunta || `Pregunta #${idx + 1}`).trim(),
            opciones,
            respuestaCorrecta: respuestaCorrecta || 'Respuesta esperada',
            explicacion: String(
              item?.explicacion || `Basado en "${materiales[0].titulo}".`,
            ).trim(),
          };
        });

        if (reactivos.length === 0) {
          throw new Error('No se generaron reactivos válidos');
        }
      } catch (error) {
        this.logger.error('Error generando cuestionario con Gemini', error);
        throw new ServiceUnavailableException(
          'No se pudo generar el cuestionario con IA en este momento. Intenta de nuevo.',
        );
      }
    }

    return new this.cuestionarioModel({
      titulo: titulo || `Autoevaluación: ${materiales[0].titulo}`,
      referenciaIa: cfg.modelo,
      idTema: new Types.ObjectId(effectiveTemaId),
      idUsuario: new Types.ObjectId(userId),
      reactivos,
      dificultad,
      generadoPorIa: true,
    }).save();
  }

  /**
   * Evalúa el cuestionario con análisis de IA, genera retroalimentación personalizada, recomienda recursos reales y guarda el historial.
   */
  async responderCuestionario(
    userId: string,
    cuestionarioId: string,
    respuestasUsuario: string[],
  ): Promise<IntentoCuestionarioDocument> {
    if (!Types.ObjectId.isValid(cuestionarioId)) {
      throw new BadRequestException('El cuestionario seleccionado no es válido.');
    }
    const cuestionario = await this.cuestionarioModel
      .findById(cuestionarioId)
      .exec();
    if (!cuestionario) {
      throw new NotFoundException('No se encontró el cuestionario para calificar.');
    }

    const total = cuestionario.reactivos.length || 1;
    let aciertos = 0;
    const fallosFallback: string[] = [];
    const detalleReactivos = cuestionario.reactivos.map((r, idx) => {
      const respRaw = (respuestasUsuario[idx] || '').trim();
      const resp = respRaw.toLowerCase();
      const correcta = (r.respuestaCorrecta || '').trim().toLowerCase();
      const esCerrada = r.opciones && r.opciones.length > 0;
      let esCorrecta = false;

      if (esCerrada) {
        esCorrecta = Boolean(resp && resp === correcta);
      } else {
        esCorrecta = Boolean(
          resp &&
            (resp === correcta ||
              (resp.length >= 4 && correcta.includes(resp)) ||
              (correcta.length >= 4 && resp.includes(correcta))),
        );
      }

      if (esCorrecta) {
        aciertos += 1;
      } else {
        fallosFallback.push(r.pregunta.slice(0, 90));
      }

      return {
        numero: r.numero || idx + 1,
        tipo: esCerrada ? 'CERRADA' : 'ABIERTA',
        pregunta: r.pregunta,
        respuestaEstudiante: respRaw || '(Sin responder)',
        respuestaCorrecta: r.respuestaCorrecta,
        explicacion: r.explicacion,
        aciertoInicial: esCorrecta,
      };
    });

    // Buscar recursos reales del repositorio para recomendar al estudiante
    const catalogoRecursos = await this.recursoModel
      .find({ eliminadoEn: { $exists: false } })
      .sort({ esMaterialOficial: -1, promedioCalificacion: -1, createdAt: -1 })
      .limit(12)
      .exec();

    const resourceById = new Map(catalogoRecursos.map((r) => [r._id.toString(), r]));

    let retroalimentacion = '';
    let conceptosPorReforzar: string[] = fallosFallback.slice(0, 4);
    let recursosRecomendados: RecursoRecomendado[] = [];

    if (this.apiKey) {
      try {
        const cfg = await this.getOrCreateConfig();
        const catalogoTexto = catalogoRecursos
          .map(
            (r) =>
              `- ID: ${r._id.toString()} | Título: "${r.titulo}" | Descripción: ${r.descripcion || 'Sin descripción'} | Claves: ${(r.palabrasClave || []).join(', ')}`,
          )
          .join('\n');

        const evalPrompt = `Eres un tutor académico de Kolab analizando las respuestas de un estudiante en el cuestionario "${cuestionario.titulo}".

RESULTADOS DEL ESTUDIANTE:
${JSON.stringify(detalleReactivos, null, 2)}

RECURSOS DISPONIBLES EN EL REPOSITORIO DE KOLAB:
${catalogoTexto || '(No hay recursos disponibles)'}

TAREA:
1. Para preguntas de tipo "ABIERTA", evalúa si la respuesta del estudiante demuestra comprensión correcta aunque no use las mismas palabras exactas. Incluye los números de preguntas ABIERTAS correctas en "abiertasCorrectas".
2. Redacta "retroalimentacion" en español claro, motivador y específico (3 a 5 oraciones): reconoce lo que contestó bien, explica brevemente en qué falló y dale una guía práctica para mejorar.
3. Lista en "conceptosPorReforzar" de 0 a 4 conceptos puntuales (frases cortas, no la pregunta completa) que debe repasar.
4. Selecciona en "recursosRecomendados" de 1 a 3 recursos del listado de RECURSOS DISPONIBLES (usando su ID exacto) que mejor le ayuden a reforzar sus respuestas, indicando en "motivo" por qué le conviene leer cada recurso.

Devuelve EXCLUSIVAMENTE un JSON válido:
{
  "abiertasCorrectas": [2],
  "retroalimentacion": "...",
  "conceptosPorReforzar": ["..."],
  "recursosRecomendados": [
    { "idRecurso": "ID_EXACTO", "motivo": "..." }
  ]
}`;

        const rawEval = await this.callGeminiWithFallback(
          evalPrompt,
          0.25,
          true,
          [],
          cfg.modelo,
        );
        const parsedEval = this.parseJsonSafe<{
          abiertasCorrectas?: number[];
          retroalimentacion?: string;
          conceptosPorReforzar?: string[];
          recursosRecomendados?: Array<{ idRecurso?: string; motivo?: string }>;
        }>(rawEval);

        if (parsedEval) {
          if (Array.isArray(parsedEval.abiertasCorrectas)) {
            const openNums = new Set(parsedEval.abiertasCorrectas.map((n) => Number(n)));
            for (const det of detalleReactivos) {
              if (det.tipo === 'ABIERTA' && !det.aciertoInicial && openNums.has(det.numero)) {
                aciertos += 1;
              }
            }
          }
          if (parsedEval.retroalimentacion?.trim()) {
            retroalimentacion = parsedEval.retroalimentacion.trim();
          }
          if (Array.isArray(parsedEval.conceptosPorReforzar)) {
            conceptosPorReforzar = parsedEval.conceptosPorReforzar
              .map((c) => String(c).trim())
              .filter(Boolean)
              .slice(0, 5);
          }
          if (Array.isArray(parsedEval.recursosRecomendados)) {
            for (const rec of parsedEval.recursosRecomendados) {
              const found = rec?.idRecurso ? resourceById.get(String(rec.idRecurso).trim()) : undefined;
              if (found && !recursosRecomendados.some((x) => x.idRecurso.toString() === found._id.toString())) {
                recursosRecomendados.push({
                  idRecurso: found._id,
                  titulo: found.titulo,
                  motivo: String(rec.motivo || 'Te ayudará a reforzar los conceptos evaluados en este cuestionario.').trim(),
                  archivoUrl: found.archivoUrl,
                });
              }
            }
          }
        }
      } catch (err) {
        this.logger.warn(`Evaluación detallada con Gemini falló, usando fallback: ${(err as Error).message}`);
      }
    }

    const calificacion = Number(((Math.min(aciertos, total) / total) * 100).toFixed(2));
    if (!retroalimentacion) {
      retroalimentacion =
        calificacion >= 80
          ? `¡Excelente trabajo! Obtuviste ${aciertos} de ${total} aciertos. Dominas la mayoría de los conceptos evaluados.`
          : `Buen avance: lograste ${aciertos} de ${total} aciertos. Revisa los conceptos señalados y apóyate en los recursos recomendados para dominar el tema.`;
    }

    if (recursosRecomendados.length === 0 && catalogoRecursos.length > 0) {
      const sameTopic = catalogoRecursos.filter(
        (r) => r.idTema?.toString() === cuestionario.idTema.toString(),
      );
      const picks = (sameTopic.length > 0 ? sameTopic : catalogoRecursos).slice(0, 2);
      recursosRecomendados = picks.map((r) => ({
        idRecurso: r._id,
        titulo: r.titulo,
        motivo:
          calificacion >= 80
            ? 'Ideal para profundizar y consolidar lo que ya dominas en este tema.'
            : 'Recomendado para repasar los fundamentos y reforzar los reactivos donde hubo dudas.',
        archivoUrl: r.archivoUrl,
      }));
    }

    const intento = await new this.intentoModel({
      idCuestionario: cuestionario._id,
      idUsuario: new Types.ObjectId(userId),
      idTema: cuestionario.idTema,
      tituloCuestionario: cuestionario.titulo,
      aciertos: Math.min(aciertos, total),
      totalReactivos: total,
      calificacion,
      retroalimentacion,
      conceptosPorReforzar,
      recursosRecomendados,
    }).save();

    try {
      await this.gamificationService.registrarActividadDiaria(
        userId,
        20 + Math.min(aciertos, total) * 5,
      );
    } catch {
      // No interrumpir el guardado del intento
    }

    return intento;
  }

  async historialIntentos(userId: string): Promise<IntentoCuestionario[]> {
    const list = await this.intentoModel
      .find({ idUsuario: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
    return list.map((doc) => {
      const obj = doc.toObject();
      return {
        ...obj,
        conceptosPorReforzar: obj.conceptosPorReforzar ?? [],
        recursosRecomendados: obj.recursosRecomendados ?? [],
      };
    });
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
            motivoPrioridad = `Repaso espaciado: tu promedio reciente en este tema es ${Math.round(avg)}%.`;
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
