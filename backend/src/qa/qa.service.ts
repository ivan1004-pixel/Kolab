import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TipoNotificacion } from '../common/enums/kolab.enums';
import { GamificationService } from '../gamification/gamification.service';
import { ModerationService } from '../moderation/moderation.service';
import {
  Etiqueta,
  EtiquetaDocument,
  Pregunta,
  PreguntaDocument,
  RadarDificultadTema,
  Respuesta,
  RespuestaDocument,
} from './schemas/qa.schema';

@Injectable()
export class QaService {
  constructor(
    @InjectModel(Pregunta.name)
    private readonly preguntaModel: Model<PreguntaDocument>,
    @InjectModel(Respuesta.name)
    private readonly respuestaModel: Model<RespuestaDocument>,
    @InjectModel(Etiqueta.name)
    private readonly etiquetaModel: Model<EtiquetaDocument>,
    private readonly gamificationService: GamificationService,
    private readonly moderationService: ModerationService,
  ) {}

  async crearPregunta(
    userId: string,
    texto: string,
    idTema: string,
    fragmentoRecurso?: string,
    idRecurso?: string,
    etiquetas: string[] = [],
    esBancoColaborativo = false,
  ): Promise<PreguntaDocument> {
    const p = await new this.preguntaModel({
      texto,
      idTema: new Types.ObjectId(idTema),
      fragmentoRecurso,
      idRecurso: idRecurso ? new Types.ObjectId(idRecurso) : undefined,
      etiquetas,
      esBancoColaborativo,
      idUsuario: new Types.ObjectId(userId),
    }).save();
    return p;
  }

  async listarPreguntas(idTema?: string): Promise<PreguntaDocument[]> {
    const filter = idTema ? { idTema: new Types.ObjectId(idTema) } : {};
    return this.preguntaModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async responderPregunta(
    userId: string,
    idPregunta: string,
    texto: string,
  ): Promise<RespuestaDocument> {
    const pregunta = await this.preguntaModel.findById(idPregunta).exec();
    if (!pregunta) throw new NotFoundException('Pregunta no encontrada');

    const respuesta = await new this.respuestaModel({
      texto,
      idPregunta: pregunta._id,
      idUsuario: new Types.ObjectId(userId),
      xpGanada: 15,
    }).save();

    await this.gamificationService.registrarActividadDiaria(userId, 15);

    if (pregunta.idUsuario.toString() !== userId) {
      await this.moderationService.notificarUsuario(
        pregunta.idUsuario.toString(),
        TipoNotificacion.RESPUESTA_PREGUNTA,
        'Nueva respuesta a tu duda',
        `Alguien respondió a tu pregunta: "${pregunta.texto.slice(0, 60)}..."`,
      );
    }

    return respuesta;
  }

  async listarRespuestas(idPregunta: string): Promise<RespuestaDocument[]> {
    return this.respuestaModel
      .find({ idPregunta: new Types.ObjectId(idPregunta) })
      .sort({ esValida: -1, votosUtilidad: -1, createdAt: 1 })
      .exec();
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

  async votarUtilidadPregunta(preguntaId: string): Promise<PreguntaDocument> {
    const p = await this.preguntaModel
      .findByIdAndUpdate(
        preguntaId,
        { $inc: { votosUtilidad: 1 } },
        { new: true },
      )
      .exec();
    if (!p) throw new NotFoundException('Pregunta no encontrada');
    return p;
  }

  async votarUtilidadRespuesta(respuestaId: string): Promise<RespuestaDocument> {
    const r = await this.respuestaModel
      .findByIdAndUpdate(
        respuestaId,
        { $inc: { votosUtilidad: 1 } },
        { new: true },
      )
      .exec();
    if (!r) throw new NotFoundException('Respuesta no encontrada');
    return r;
  }

  /**
   * RF-27 & RF-28: Radar de Dificultades por tema y pregunta más debatida sin respuesta relevante.
   */
  async radarDificultades(idTema?: string): Promise<RadarDificultadTema[]> {
    const match = idTema ? { idTema: new Types.ObjectId(idTema) } : {};
    const preguntas = await this.preguntaModel.find(match).exec();

    const porTema = new Map<string, PreguntaDocument[]>();
    for (const p of preguntas) {
      const key = p.idTema.toString();
      if (!porTema.has(key)) porTema.set(key, []);
      porTema.get(key)!.push(p);
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

      resultados.push({
        idTema: new Types.ObjectId(temaId),
        totalPreguntas: lista.length,
        preguntasSinResolver: sinResolver.length,
        preguntaMasDebatidaSinSolucion: topDebatida,
      });
    }

    return resultados;
  }
}
