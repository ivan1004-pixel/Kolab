import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EstadoValidacionRecurso,
  RolUsuario,
  TipoNotificacion,
} from '../common/enums/kolab.enums';
import { GamificationService } from '../gamification/gamification.service';
import { ModerationService } from '../moderation/moderation.service';
import {
  CreateRecursoInput,
  FiltrarRecursosInput,
} from './dto/recurso.input';
import {
  ColeccionPersonal,
  ColeccionPersonalDocument,
  Recurso,
  RecursoDocument,
} from './schemas/recurso.schema';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB (RF-92, RNF-14)
const ALLOWED_MIME_OR_EXT = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'webp',
]);

@Injectable()
export class ResourcesService {
  constructor(
    @InjectModel(Recurso.name)
    private readonly recursoModel: Model<RecursoDocument>,
    @InjectModel(ColeccionPersonal.name)
    private readonly coleccionModel: Model<ColeccionPersonalDocument>,
    private readonly gamificationService: GamificationService,
    private readonly moderationService: ModerationService,
  ) {}

  async createRecurso(
    userId: string,
    rol: string,
    input: CreateRecursoInput,
  ): Promise<RecursoDocument> {
    if (input.tamanoBytes > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        'El archivo excede el tamaño máximo permitido de 10 MB (RF-92 / RNF-14).',
      );
    }

    if (!ALLOWED_MIME_OR_EXT.has(input.tipoArchivo.toLowerCase())) {
      throw new BadRequestException(
        'Formato no permitido. Solo se aceptan archivos PDF e imágenes (PNG, JPG, WEBP).',
      );
    }

    const esOficial =
      Boolean(input.esMaterialOficial) &&
      (rol === RolUsuario.DOCENTE || rol === RolUsuario.ADMINISTRADOR);

    const recurso = new this.recursoModel({
      titulo: input.titulo,
      descripcion: input.descripcion,
      archivoUrl: input.archivoUrl,
      tipoArchivo: input.tipoArchivo.toLowerCase(),
      tamanoBytes: input.tamanoBytes,
      contenidoTextoExtraido: input.contenidoTextoExtraido,
      idUsuario: new Types.ObjectId(userId),
      idTema: new Types.ObjectId(input.idTema),
      idAsignatura: input.idAsignatura
        ? new Types.ObjectId(input.idAsignatura)
        : undefined,
      palabrasClave: input.palabrasClave || [],
      esMaterialOficial: esOficial,
      estadoValidacion: esOficial
        ? EstadoValidacionRecurso.REVISADO_DOCENTE
        : EstadoValidacionRecurso.PENDIENTE,
      versiones: [
        {
          version: 1,
          archivoUrl: input.archivoUrl,
          idAutorCambio: new Types.ObjectId(userId),
          notaCambio: 'Versión inicial',
          fecha: new Date(),
        },
      ],
    });

    const saved = await recurso.save();
    await this.gamificationService.registrarActividadDiaria(userId, 20);
    return saved;
  }

  async buscarRecursos(
    filtros?: FiltrarRecursosInput,
  ): Promise<RecursoDocument[]> {
    const query: Record<string, unknown> = {
      eliminadoEn: { $exists: false },
      estadoValidacion: { $ne: EstadoValidacionRecurso.ARCHIVADO },
    };

    if (filtros) {
      if (filtros.texto) {
        const regex = new RegExp(filtros.texto, 'i');
        query.$or = [
          { titulo: regex },
          { descripcion: regex },
          { palabrasClave: regex },
        ];
      }
      if (filtros.palabrasClave && filtros.palabrasClave.length > 0) {
        query.palabrasClave = { $in: filtros.palabrasClave };
      }
      if (filtros.idAutor) {
        query.idUsuario = new Types.ObjectId(filtros.idAutor);
      }
      if (filtros.idTema) {
        query.idTema = new Types.ObjectId(filtros.idTema);
      }
      if (filtros.idAsignatura) {
        query.idAsignatura = new Types.ObjectId(filtros.idAsignatura);
      }
      if (filtros.estadoValidacion) {
        query.estadoValidacion = filtros.estadoValidacion;
      }
      if (filtros.calificacionMinima) {
        query.promedioCalificacion = { $gte: filtros.calificacionMinima };
      }
    }

    let sort: Record<string, 1 | -1> = { createdAt: -1 };
    if (filtros?.ordenarPor === 'MEJOR_CALIFICADOS') {
      sort = { promedioCalificacion: -1, totalCalificaciones: -1 };
    } else if (filtros?.ordenarPor === 'MAS_CONSULTADOS') {
      sort = { consultasCount: -1 };
    }

    return this.recursoModel.find(query).sort(sort).exec();
  }

  async verRecurso(id: string): Promise<RecursoDocument> {
    const recurso = await this.recursoModel
      .findByIdAndUpdate(id, { $inc: { consultasCount: 1 } }, { new: true })
      .exec();
    if (!recurso) throw new NotFoundException('Recurso no encontrado');
    return recurso;
  }

  async validarRecursoDocente(
    docenteId: string,
    recursoId: string,
    estado: EstadoValidacionRecurso,
    retroalimentacion?: string,
  ): Promise<RecursoDocument> {
    const recurso = await this.recursoModel
      .findByIdAndUpdate(
        recursoId,
        {
          $set: {
            estadoValidacion: estado,
            retroalimentacionDocente: retroalimentacion,
          },
        },
        { new: true },
      )
      .exec();
    if (!recurso) throw new NotFoundException('Recurso no encontrado');

    await this.moderationService.registrarAuditoria(
      'VALIDACION_DOCENTE',
      docenteId,
      'Recurso',
      `Recurso ${recursoId} marcado como ${estado}`,
    );

    if (estado === EstadoValidacionRecurso.REVISADO_DOCENTE) {
      await this.gamificationService.otorgarInsigniaPorCodigo(
        recurso.idUsuario.toString(),
        'PRIMER_RECURSO_VALIDADO',
        'Primer recurso validado',
        'Un docente validó uno de tus apuntes en Kolab.',
      );
    }

    await this.moderationService.notificarUsuario(
      recurso.idUsuario.toString(),
      TipoNotificacion.VALIDACION_RECURSO,
      'Actualización de tu recurso',
      `Tu recurso "${recurso.titulo}" fue marcado como ${estado}.`,
    );

    return recurso;
  }

  async invitarCoautor(
    userId: string,
    recursoId: string,
    coautorId: string,
  ): Promise<RecursoDocument> {
    const recurso = await this.recursoModel.findById(recursoId).exec();
    if (!recurso) throw new NotFoundException('Recurso no encontrado');
    if (recurso.idUsuario.toString() !== userId) {
      throw new ForbiddenException('Solo el autor principal puede invitar coautores');
    }
    return (await this.recursoModel
      .findByIdAndUpdate(
        recursoId,
        { $addToSet: { coautores: new Types.ObjectId(coautorId) } },
        { new: true },
      )
      .exec())!;
  }

  async agregarVersion(
    userId: string,
    recursoId: string,
    archivoUrl: string,
    notaCambio: string,
  ): Promise<RecursoDocument> {
    const recurso = await this.recursoModel.findById(recursoId).exec();
    if (!recurso) throw new NotFoundException('Recurso no encontrado');

    const esAutorOCoautor =
      recurso.idUsuario.toString() === userId ||
      recurso.coautores.some((c) => c.toString() === userId);
    if (!esAutorOCoautor) {
      throw new ForbiddenException('No tienes permisos para editar este recurso');
    }

    const nextVersion = (recurso.versiones?.length || 0) + 1;
    recurso.archivoUrl = archivoUrl;
    recurso.versiones.push({
      version: nextVersion,
      archivoUrl,
      idAutorCambio: new Types.ObjectId(userId),
      notaCambio,
      fecha: new Date(),
    });
    return recurso.save();
  }

  async calificarRecurso(
    userId: string,
    recursoId: string,
    estrellas: number,
  ): Promise<RecursoDocument> {
    if (estrellas < 1 || estrellas > 5) {
      throw new BadRequestException('La calificación debe ser entre 1 y 5 estrellas.');
    }
    const recurso = await this.recursoModel.findById(recursoId).exec();
    if (!recurso) throw new NotFoundException('Recurso no encontrado');

    if (recurso.idUsuario.toString() === userId) {
      throw new ForbiddenException(
        'No puedes calificar tus propios recursos (RF-91).',
      );
    }

    const yaCalifico = recurso.calificaciones.some(
      (c) => c.idUsuario.toString() === userId,
    );
    if (yaCalifico) {
      throw new BadRequestException(
        'Ya calificaste este recurso anteriormente (RF-89).',
      );
    }

    recurso.calificaciones.push({
      idUsuario: new Types.ObjectId(userId),
      estrellas,
      fecha: new Date(),
    });
    recurso.totalCalificaciones = recurso.calificaciones.length;
    const suma = recurso.calificaciones.reduce((acc, c) => acc + c.estrellas, 0);
    recurso.promedioCalificacion = Number(
      (suma / recurso.totalCalificaciones).toFixed(2),
    );
    return recurso.save();
  }

  async comentarRecurso(
    userId: string,
    recursoId: string,
    texto: string,
  ): Promise<RecursoDocument> {
    const updated = await this.recursoModel
      .findByIdAndUpdate(
        recursoId,
        {
          $push: {
            comentarios: {
              idUsuario: new Types.ObjectId(userId),
              texto,
              fecha: new Date(),
            },
          },
        },
        { new: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('Recurso no encontrado');
    return updated;
  }

  async moverAPapelera(userId: string, recursoId: string): Promise<RecursoDocument> {
    const recurso = await this.recursoModel.findById(recursoId).exec();
    if (!recurso) throw new NotFoundException('Recurso no encontrado');
    if (recurso.idUsuario.toString() !== userId) {
      throw new ForbiddenException('Solo el autor puede eliminar este recurso');
    }
    recurso.eliminadoEn = new Date();
    return recurso.save();
  }

  async guardarEnColeccion(
    userId: string,
    recursoId: string,
    nombreColeccion: string,
    esFavoritos = false,
  ): Promise<ColeccionPersonalDocument> {
    let col = await this.coleccionModel
      .findOne({
        idUsuario: new Types.ObjectId(userId),
        nombre: nombreColeccion,
      })
      .exec();

    if (!col) {
      col = new this.coleccionModel({
        nombre: nombreColeccion,
        idUsuario: new Types.ObjectId(userId),
        recursos: [new Types.ObjectId(recursoId)],
        esFavoritos,
      });
      return col.save();
    }

    return (await this.coleccionModel
      .findByIdAndUpdate(
        col._id,
        { $addToSet: { recursos: new Types.ObjectId(recursoId) } },
        { new: true },
      )
      .exec())!;
  }

  async misColecciones(userId: string): Promise<ColeccionPersonalDocument[]> {
    return this.coleccionModel
      .find({ idUsuario: new Types.ObjectId(userId) })
      .exec();
  }
}
