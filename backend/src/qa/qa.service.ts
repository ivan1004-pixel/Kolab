import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  IntentoCuestionario,
  IntentoCuestionarioDocument,
} from '../ai/schemas/ai.schema';
import { TipoNotificacion } from '../common/enums/kolab.enums';
import { GamificationService } from '../gamification/gamification.service';
import { ModerationService } from '../moderation/moderation.service';
import { Usuario, UsuarioDocument } from '../users/schemas/usuario.schema';
import {
  Etiqueta,
  EtiquetaDocument,
  Pregunta,
  PreguntaDocument,
  RadarDificultadTema,
  Respuesta,
  RespuestaDocument,
} from './schemas/qa.schema';

const MAX_LIKES_PER_USER = 5;

@Injectable()
export class QaService {
  constructor(
    @InjectModel(Pregunta.name)
    private readonly preguntaModel: Model<PreguntaDocument>,
    @InjectModel(Respuesta.name)
    private readonly respuestaModel: Model<RespuestaDocument>,
    @InjectModel(Etiqueta.name)
    private readonly etiquetaModel: Model<EtiquetaDocument>,
    @InjectModel(IntentoCuestionario.name)
    private readonly intentoModel: Model<IntentoCuestionarioDocument>,
    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,
    private readonly gamificationService: GamificationService,
    private readonly moderationService: ModerationService,
  ) {}

  private async getUserInfoMap(
    ids: Array<Types.ObjectId | string>,
  ): Promise<Map<string, { nombre: string; fotoUrl?: string }>> {
    const unique = Array.from(new Set(ids.map((id) => id.toString()))).filter((id) =>
      Types.ObjectId.isValid(id),
    );
    if (unique.length === 0) return new Map();
    const users = await this.usuarioModel
      .find(
        { _id: { $in: unique.map((id) => new Types.ObjectId(id)) } },
        { nombre: 1, apellidos: 1, fotoUrl: 1 },
      )
      .lean()
      .exec();
    const map = new Map<string, { nombre: string; fotoUrl?: string }>();
    for (const u of users) {
      const fullName = `${u.nombre || ''} ${u.apellidos || ''}`.trim() || 'Usuario Kolab';
      map.set(u._id.toString(), { nombre: fullName, fotoUrl: u.fotoUrl || undefined });
    }
    return map;
  }

  private enrichDoc<T extends { idUsuario: Types.ObjectId; votosPorUsuario?: Record<string, number>; nombreAutor?: string; fotoAutor?: string }>(
    doc: T & { toObject?: () => any },
    userMap: Map<string, { nombre: string; fotoUrl?: string }>,
    viewerUserId?: string,
  ): any {
    const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
    const author = userMap.get(obj.idUsuario.toString());
    const misVotos = viewerUserId ? Number(obj.votosPorUsuario?.[viewerUserId] || 0) : 0;
    return {
      ...obj,
      nombreAutor: author?.nombre || obj.nombreAutor || 'Usuario Kolab',
      fotoAutor: author?.fotoUrl || obj.fotoAutor || undefined,
      misVotos,
    };
  }

  async crearPregunta(
    userId: string,
    texto: string,
    idTema: string,
    fragmentoRecurso?: string,
    idRecurso?: string,
    etiquetas: string[] = [],
    esBancoColaborativo = false,
  ): Promise<Pregunta> {
    if (!Types.ObjectId.isValid(idTema)) {
      throw new BadRequestException('Selecciona un tema válido para publicar tu pregunta.');
    }
    const cleanTexto = (texto || '').trim();
    if (!cleanTexto) {
      throw new BadRequestException('Escribe el texto de tu pregunta antes de publicar.');
    }

    const userMap = await this.getUserInfoMap([userId]);
    const recentDup = await this.preguntaModel
      .findOne({
        idUsuario: new Types.ObjectId(userId),
        idTema: new Types.ObjectId(idTema),
        texto: cleanTexto,
        createdAt: { $gte: new Date(Date.now() - 5000) },
      })
      .exec();
    if (recentDup) {
      return this.enrichDoc(recentDup, userMap, userId);
    }

    const author = userMap.get(userId);
    const p = await new this.preguntaModel({
      texto: cleanTexto,
      idTema: new Types.ObjectId(idTema),
      fragmentoRecurso,
      idRecurso: idRecurso && Types.ObjectId.isValid(idRecurso) ? new Types.ObjectId(idRecurso) : undefined,
      etiquetas,
      esBancoColaborativo,
      idUsuario: new Types.ObjectId(userId),
      nombreAutor: author?.nombre,
      fotoAutor: author?.fotoUrl,
    }).save();
    return this.enrichDoc(p, userMap, userId);
  }

  async listarPreguntas(idTema?: string, viewerUserId?: string): Promise<Pregunta[]> {
    const filter = idTema && Types.ObjectId.isValid(idTema) ? { idTema: new Types.ObjectId(idTema) } : {};
    const list = await this.preguntaModel.find(filter).sort({ createdAt: -1 }).exec();
    const userMap = await this.getUserInfoMap(list.map((p) => p.idUsuario));
    return list.map((p) => this.enrichDoc(p, userMap, viewerUserId));
  }

  async responderPregunta(
    userId: string,
    idPregunta: string,
    texto: string,
  ): Promise<Respuesta> {
    if (!Types.ObjectId.isValid(idPregunta)) {
      throw new BadRequestException('La pregunta seleccionada no es válida.');
    }
    const cleanTexto = (texto || '').trim();
    if (!cleanTexto) {
      throw new BadRequestException('Escribe una respuesta antes de enviarla.');
    }

    const pregunta = await this.preguntaModel.findById(idPregunta).exec();
    if (!pregunta) throw new NotFoundException('La pregunta ya no está disponible.');

    const userMap = await this.getUserInfoMap([userId]);
    const recentDup = await this.respuestaModel
      .findOne({
        idPregunta: pregunta._id,
        idUsuario: new Types.ObjectId(userId),
        texto: cleanTexto,
        createdAt: { $gte: new Date(Date.now() - 5000) },
      })
      .exec();
    if (recentDup) {
      return this.enrichDoc(recentDup, userMap, userId);
    }

    const author = userMap.get(userId);

    const respuesta = await new this.respuestaModel({
      texto: cleanTexto,
      idPregunta: pregunta._id,
      idUsuario: new Types.ObjectId(userId),
      nombreAutor: author?.nombre,
      fotoAutor: author?.fotoUrl,
      xpGanada: 15,
    }).save();

    await this.gamificationService.registrarActividadDiaria(userId, 15);

    if (pregunta.idUsuario.toString() !== userId) {
      void this.moderationService
        .notificarUsuario(
          pregunta.idUsuario.toString(),
          TipoNotificacion.RESPUESTA_PREGUNTA,
          'Nueva respuesta a tu duda',
          `${author?.nombre || 'Un compañero'} respondió a tu pregunta: "${pregunta.texto.slice(0, 60)}..."`,
        )
        .catch(() => {});
    }

    return this.enrichDoc(respuesta, userMap, userId);
  }

  async listarRespuestas(idPregunta: string, viewerUserId?: string): Promise<Respuesta[]> {
    const list = await this.respuestaModel
      .find({ idPregunta: new Types.ObjectId(idPregunta) })
      .sort({ esValida: -1, votosUtilidad: -1, createdAt: 1 })
      .exec();
    const userMap = await this.getUserInfoMap(list.map((r) => r.idUsuario));
    return list.map((r) => this.enrichDoc(r, userMap, viewerUserId));
  }

  async marcarRespuestaRelevante(
    respuestaId: string,
  ): Promise<RespuestaDocument> {
    const resp = await this.respuestaModel
      .findByIdAndUpdate(
        respuestaId,
        { $set: { esValida: true }, $inc: { xpGanada: 25 } },
        { new: true },
      )
      .exec();
    if (!resp) throw new NotFoundException('Respuesta no encontrada');

    await this.gamificationService.registrarActividadDiaria(
      resp.idUsuario.toString(),
      25,
    );
    await this.gamificationService.otorgarInsigniaPorCodigo(
      resp.idUsuario.toString(),
      'RESOLVEDOR_DUDAS',
      'Resolvedor de dudas',
      'Una de tus respuestas fue marcada como relevante por un docente.',
    );
    return resp;
  }

  async cerrarPreguntaResuelta(
    userId: string,
    rol: string,
    preguntaId: string,
  ): Promise<PreguntaDocument> {
    const pregunta = await this.preguntaModel.findById(preguntaId).exec();
    if (!pregunta) throw new NotFoundException('Pregunta no encontrada');

    if (
      pregunta.idUsuario.toString() !== userId &&
      rol !== 'DOCENTE' &&
      rol !== 'ADMINISTRADOR'
    ) {
      throw new ForbiddenException('No puedes cerrar esta pregunta');
    }

    pregunta.resuelta = true;
    return pregunta.save();
  }

  async validarPreguntaBanco(preguntaId: string): Promise<PreguntaDocument> {
    const p = await this.preguntaModel
      .findByIdAndUpdate(
        preguntaId,
        { $set: { validadaPorDocente: true } },
        { new: true },
      )
      .exec();
    if (!p) throw new NotFoundException('Pregunta no encontrada');
    return p;
  }

  async votarUtilidadPregunta(preguntaId: string, userId: string): Promise<Pregunta> {
    const key = `votosPorUsuario.${userId}`;
    const p = await this.preguntaModel
      .findOneAndUpdate(
        {
          _id: preguntaId,
          $or: [{ [key]: { $exists: false } }, { [key]: { $lt: MAX_LIKES_PER_USER } }],
        },
        { $inc: { votosUtilidad: 1, [key]: 1 } },
        { new: true },
      )
      .exec();

    if (!p) {
      const exists = await this.preguntaModel.exists({ _id: preguntaId });
      if (!exists) throw new NotFoundException('Pregunta no encontrada');
      throw new BadRequestException(
        `Has alcanzado el máximo de ${MAX_LIKES_PER_USER} likes permitidos por usuario en esta pregunta.`,
      );
    }

    const userMap = await this.getUserInfoMap([p.idUsuario]);
    return this.enrichDoc(p, userMap, userId);
  }

  async votarUtilidadRespuesta(respuestaId: string, userId: string): Promise<Respuesta> {
    const key = `votosPorUsuario.${userId}`;
    const r = await this.respuestaModel
      .findOneAndUpdate(
        {
          _id: respuestaId,
          $or: [{ [key]: { $exists: false } }, { [key]: { $lt: MAX_LIKES_PER_USER } }],
        },
        { $inc: { votosUtilidad: 1, [key]: 1 } },
        { new: true },
      )
      .exec();

    if (!r) {
      const exists = await this.respuestaModel.exists({ _id: respuestaId });
      if (!exists) throw new NotFoundException('Respuesta no encontrada');
      throw new BadRequestException(
        `Has alcanzado el máximo de ${MAX_LIKES_PER_USER} likes permitidos por usuario en esta respuesta.`,
      );
    }

    const userMap = await this.getUserInfoMap([r.idUsuario]);
    return this.enrichDoc(r, userMap, userId);
  }

  /**
   * RF-27 & RF-28: Radar de Dificultades por tema (dudas + errores de autoevaluación) y pregunta más debatida sin respuesta relevante.
   */
  async radarDificultades(idTema?: string): Promise<RadarDificultadTema[]> {
    const match = idTema ? { idTema: new Types.ObjectId(idTema) } : {};
    const [preguntas, intentos] = await Promise.all([
      this.preguntaModel.find(match).exec(),
      this.intentoModel.find(match).exec(),
    ]);

    const porTema = new Map<string, PreguntaDocument[]>();
    const erroresPorTema = new Map<string, { count: number; conceptos: Map<string, number> }>();

    for (const p of preguntas) {
      const key = p.idTema.toString();
      if (!porTema.has(key)) porTema.set(key, []);
      porTema.get(key)!.push(p);
    }

    for (const intento of intentos) {
      const key = intento.idTema.toString();
      if (!porTema.has(key)) porTema.set(key, []);
      const entry = erroresPorTema.get(key) ?? { count: 0, conceptos: new Map<string, number>() };
      const fallos = Math.max(0, (intento.totalReactivos || 0) - (intento.aciertos || 0));
      entry.count += fallos;
      for (const concepto of intento.conceptosPorReforzar || []) {
        entry.conceptos.set(concepto, (entry.conceptos.get(concepto) || 0) + 1);
      }
      erroresPorTema.set(key, entry);
    }

    const resultados: RadarDificultadTema[] = [];
    for (const [temaId, lista] of porTema.entries()) {
      const sinResolver = lista.filter((p) => !p.resuelta);
      let topDebatida: PreguntaDocument | undefined;
      let maxRespuestas = -1;

      for (const p of sinResolver) {
        const resps = await this.respuestaModel
          .find({ idPregunta: p._id })
          .exec();
        const tieneRelevante = resps.some((r) => r.esValida);
        if (!tieneRelevante && resps.length > maxRespuestas) {
          maxRespuestas = resps.length;
          topDebatida = p;
        }
      }

      const errInfo = erroresPorTema.get(temaId);
      const conceptosDebiles = errInfo
        ? Array.from(errInfo.conceptos.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([c]) => c)
        : [];

      resultados.push({
        idTema: new Types.ObjectId(temaId),
        totalPreguntas: lista.length,
        preguntasSinResolver: sinResolver.length,
        erroresAutoevaluacion: errInfo?.count ?? 0,
        conceptosDebiles,
        preguntaMasDebatidaSinSolucion: topDebatida,
      });
    }

    return resultados.sort(
      (a, b) =>
        b.preguntasSinResolver +
        b.erroresAutoevaluacion -
        (a.preguntasSinResolver + a.erroresAutoevaluacion),
    );
  }
}
