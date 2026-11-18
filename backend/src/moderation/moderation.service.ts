import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EstadoReporte,
  TipoNotificacion,
} from '../common/enums/kolab.enums';
import { BrevoService } from '../mail/brevo.service';
import { Usuario, UsuarioDocument } from '../users/schemas/usuario.schema';
import {
  AuditoriaLog,
  AuditoriaLogDocument,
  Notificacion,
  NotificacionDocument,
  Reporte,
  ReporteDocument,
} from './schemas/moderation.schema';

@Injectable()
export class ModerationService {
  constructor(
    @InjectModel(Reporte.name)
    private readonly reporteModel: Model<ReporteDocument>,
    @InjectModel(AuditoriaLog.name)
    private readonly auditModel: Model<AuditoriaLogDocument>,
    @InjectModel(Notificacion.name)
    private readonly notifModel: Model<NotificacionDocument>,
    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,
    private readonly brevoService: BrevoService,
  ) {}

  async crearReporte(
    userId: string,
    tipoObjetivo: string,
    idObjetivo: string,
    motivo: string,
  ): Promise<ReporteDocument> {
    return new this.reporteModel({
      motivo,
      tipoObjetivo,
      idObjetivo: new Types.ObjectId(idObjetivo),
      idUsuarioReporta: new Types.ObjectId(userId),
    }).save();
  }

  async listarReportes(estado?: EstadoReporte): Promise<ReporteDocument[]> {
    const filter = estado ? { estado } : {};
    return this.reporteModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async resolverReporte(
    adminId: string,
    reporteId: string,
    estado: EstadoReporte,
    resolucionAdmin: string,
  ): Promise<ReporteDocument> {
    const reporte = await this.reporteModel
      .findByIdAndUpdate(
        reporteId,
        { $set: { estado, resolucionAdmin } },
        { new: true },
      )
      .exec();
    if (!reporte) throw new NotFoundException('Reporte no encontrado');

    await this.registrarAuditoria(
      'MODERACION_REPORTE',
      adminId,
      'Reporte',
      `Reporte ${reporteId} marcado como ${estado}: ${resolucionAdmin}`,
    );
    return reporte;
  }

  async registrarAuditoria(
    accion: string,
    idUsuario?: string,
    entidad?: string,
    detalles?: string,
  ): Promise<void> {
    await new this.auditModel({
      accion,
      idUsuario: idUsuario ? new Types.ObjectId(idUsuario) : undefined,
      entidad,
      detalles,
    }).save();
  }

  async listarAuditoria(): Promise<AuditoriaLogDocument[]> {
    return this.auditModel.find().sort({ createdAt: -1 }).limit(200).exec();
  }

  async notificarUsuario(
    userId: string,
    tipo: TipoNotificacion,
    titulo: string,
    mensaje: string,
  ): Promise<void> {
    const user = await this.usuarioModel.findById(userId).exec();
    if (!user) return;

    if (user.preferencias?.notificacionesPlataforma !== false) {
      await new this.notifModel({
        idUsuario: user._id,
        tipo,
        titulo,
        mensaje,
      }).save();
    }

    if (user.preferencias?.notificacionesCorreo !== false) {
      await this.brevoService.sendNotificationEmail(
        user.correo,
        user.nombre,
        titulo,
        mensaje,
      );
    }
  }

  async misNotificaciones(userId: string): Promise<NotificacionDocument[]> {
    return this.notifModel
      .find({ idUsuario: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
  }

  async marcarNotificacionLeida(
    userId: string,
    notifId: string,
  ): Promise<NotificacionDocument> {
    const notif = await this.notifModel
      .findOneAndUpdate(
        { _id: notifId, idUsuario: new Types.ObjectId(userId) },
        { $set: { leida: true } },
        { new: true },
      )
      .exec();
    if (!notif) throw new NotFoundException('Notificación no encontrada');
    return notif;
  }
}
