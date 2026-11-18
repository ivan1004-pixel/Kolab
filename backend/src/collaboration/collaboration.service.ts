import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EstadoTutoria } from '../common/enums/kolab.enums';
import {
  GrupoEstudio,
  GrupoEstudioDocument,
  SolicitudTutoria,
  SolicitudTutoriaDocument,
} from './schemas/collaboration.schema';

@Injectable()
export class CollaborationService {
  constructor(
    @InjectModel(GrupoEstudio.name)
    private readonly grupoModel: Model<GrupoEstudioDocument>,
    @InjectModel(SolicitudTutoria.name)
    private readonly tutoriaModel: Model<SolicitudTutoriaDocument>,
  ) {}

  async crearGrupo(
    userId: string,
    nombre: string,
    idTema: string,
    descripcion?: string,
    esPrivado = true,
  ): Promise<GrupoEstudioDocument> {
    return new this.grupoModel({
      nombre,
      descripcion,
      esPrivado,
      idTema: new Types.ObjectId(idTema),
      miembros: [
        {
          idUsuario: new Types.ObjectId(userId),
          rolGrupo: 'Administrador',
          fechaUnion: new Date(),
        },
      ],
    }).save();
  }

  async unirseAGrupo(
    userId: string,
    grupoId: string,
  ): Promise<GrupoEstudioDocument> {
    const grupo = await this.grupoModel.findById(grupoId).exec();
    if (!grupo) throw new NotFoundException('Grupo de estudio no encontrado');

    const yaEsMiembro = grupo.miembros.some(
      (m) => m.idUsuario.toString() === userId,
    );
    if (!yaEsMiembro) {
      grupo.miembros.push({
        idUsuario: new Types.ObjectId(userId),
        rolGrupo: 'Miembro',
        fechaUnion: new Date(),
      });
      await grupo.save();
    }
    return grupo;
  }

  async listarGrupos(idTema?: string): Promise<GrupoEstudioDocument[]> {
    const filter = idTema ? { idTema: new Types.ObjectId(idTema) } : {};
    return this.grupoModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async solicitarTutoriaODuelo(
    userId: string,
    idTema: string,
    esDuelo = false,
    idCuestionario?: string,
  ): Promise<SolicitudTutoriaDocument> {
    return new this.tutoriaModel({
      idEstudiante: new Types.ObjectId(userId),
      idTema: new Types.ObjectId(idTema),
      esDuelo,
      idCuestionario: idCuestionario
        ? new Types.ObjectId(idCuestionario)
        : undefined,
      estado: EstadoTutoria.PENDIENTE,
    }).save();
  }

  async aceptarTutoriaODuelo(
    tutorId: string,
    solicitudId: string,
  ): Promise<SolicitudTutoriaDocument> {
    const s = await this.tutoriaModel
      .findByIdAndUpdate(
        solicitudId,
        {
          $set: {
            idTutor: new Types.ObjectId(tutorId),
            estado: EstadoTutoria.ACEPTADA,
          },
        },
        { new: true },
      )
      .exec();
    if (!s) throw new NotFoundException('Solicitud no encontrada');
    return s;
  }

  async listarSolicitudes(esDuelo?: boolean): Promise<SolicitudTutoriaDocument[]> {
    const filter = esDuelo !== undefined ? { esDuelo } : {};
    return this.tutoriaModel.find(filter).sort({ createdAt: -1 }).exec();
  }
}
