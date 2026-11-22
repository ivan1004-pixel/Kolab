import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EstadoTutoria } from '../common/enums/kolab.enums';
import { Usuario, UsuarioDocument } from '../users/schemas/usuario.schema';
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
    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,
  ) {}

  private async getUserName(userId: string): Promise<string | undefined> {
    const u = await this.usuarioModel
      .findById(userId)
      .select('nombre apellidos')
      .exec();
    return u ? `${u.nombre} ${u.apellidos}`.trim() : undefined;
  }

  async crearGrupo(
    userId: string,
    nombre: string,
    idTema: string,
    descripcion?: string,
    esPrivado = true,
  ): Promise<GrupoEstudioDocument> {
    const nombreUsuario = await this.getUserName(userId);
    return new this.grupoModel({
      nombre,
      descripcion,
      esPrivado,
      idTema: new Types.ObjectId(idTema),
      miembros: [
        {
          idUsuario: new Types.ObjectId(userId),
          nombreUsuario,
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
      const nombreUsuario = await this.getUserName(userId);
      grupo.miembros.push({
        idUsuario: new Types.ObjectId(userId),
        nombreUsuario,
        rolGrupo: 'Miembro',
        fechaUnion: new Date(),
      });
      await grupo.save();
    }
    return grupo;
  }

  async listarGrupos(idTema?: string): Promise<GrupoEstudioDocument[]> {
    const filter = idTema ? { idTema: new Types.ObjectId(idTema) } : {};
    const grupos = await this.grupoModel.find(filter).sort({ createdAt: -1 }).exec();
    const missingIds = new Set<string>();
    for (const g of grupos) {
      for (const m of g.miembros || []) {
        if (!m.nombreUsuario && m.idUsuario) {
          missingIds.add(m.idUsuario.toString());
        }
      }
    }
    if (missingIds.size > 0) {
      const users = await this.usuarioModel
        .find({ _id: { $in: Array.from(missingIds).map((id) => new Types.ObjectId(id)) } })
        .select('nombre apellidos')
        .exec();
      const map = new Map(users.map((u) => [u._id.toString(), `${u.nombre} ${u.apellidos}`.trim()]));
      for (const g of grupos) {
        for (const m of g.miembros || []) {
          if (!m.nombreUsuario) {
            m.nombreUsuario = map.get(m.idUsuario.toString());
          }
        }
      }
    }
    return grupos;
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
