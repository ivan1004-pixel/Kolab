import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { BrevoService } from '../mail/brevo.service';
import { Usuario, UsuarioDocument } from '../users/schemas/usuario.schema';
import {
  Insignia,
  InsigniaDocument,
  RetoComunitario,
  RetoComunitarioDocument,
  UsuarioInsignia,
  UsuarioInsigniaDocument,
} from './schemas/gamification.schema';

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(
    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,
    @InjectModel(Insignia.name)
    private readonly insigniaModel: Model<InsigniaDocument>,
    @InjectModel(UsuarioInsignia.name)
    private readonly usuarioInsigniaModel: Model<UsuarioInsigniaDocument>,
    @InjectModel(RetoComunitario.name)
    private readonly retoModel: Model<RetoComunitarioDocument>,
    private readonly brevoService: BrevoService,
  ) {}

  /**
   * RF-35, RF-36, RF-40: Registra actividad válida diaria, actualiza racha y suma XP.
   */
  async registrarActividadDiaria(
    userId: string,
    xpGanada: number,
  ): Promise<UsuarioDocument> {
    const user = await this.usuarioModel.findById(userId).exec();
    if (!user) throw new BadRequestException('Usuario no encontrado');

    const ahora = new Date();
    const hoyInicio = new Date(
      ahora.getFullYear(),
      ahora.getMonth(),
      ahora.getDate(),
    );

    let rachaIncrementada = false;
    if (!user.ultimaActividad) {
      user.rachaActual = 1;
      rachaIncrementada = true;
    } else {
      const ult = new Date(user.ultimaActividad);
      const ultInicio = new Date(
        ult.getFullYear(),
        ult.getMonth(),
        ult.getDate(),
      );
      const diffDias = Math.round(
        (hoyInicio.getTime() - ultInicio.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (diffDias === 1) {
        user.rachaActual += 1;
        rachaIncrementada = true;
      } else if (diffDias > 1) {
        const congelada =
          user.rachaCongeladaHasta && user.rachaCongeladaHasta >= hoyInicio;
        user.rachaActual = congelada ? user.rachaActual + 1 : 1;
        rachaIncrementada = true;
      }
    }

    if (user.rachaActual > user.rachaMasLarga) {
      user.rachaMasLarga = user.rachaActual;
    }

    user.ultimaActividad = ahora;
    user.xpTotal += xpGanada + (rachaIncrementada ? 10 : 0);
    await user.save();

    if (user.rachaActual >= 7) {
      await this.otorgarInsigniaPorCodigo(
        userId,
        'RACHA_7_DIAS',
        'Racha de 7 días',
        'Mantuviste una racha diaria de estudio durante 7 días seguidos.',
      );
    }

    return user;
  }

  /**
   * RF-38: Congelar la racha (comodín) un número limitado de veces al mes.
   */
  async congelarRacha(userId: string): Promise<UsuarioDocument> {
    const user = await this.usuarioModel.findById(userId).exec();
    if (!user) throw new BadRequestException('Usuario no encontrado');
    if (user.comodinesMes <= 0) {
      throw new BadRequestException(
        'Ya agotaste tus comodines para congelar racha este mes.',
      );
    }
    user.comodinesMes -= 1;
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    manana.setHours(23, 59, 59, 999);
    user.rachaCongeladaHasta = manana;
    return user.save();
  }

  async otorgarInsigniaPorCodigo(
    userId: string,
    criterioCodigo: string,
    nombrePorDefecto: string,
    descripcionPorDefecto: string,
    idGrupo?: string,
  ): Promise<void> {
    let insignia = await this.insigniaModel.findOne({ criterioCodigo }).exec();
    if (!insignia) {
      insignia = await new this.insigniaModel({
        nombre: nombrePorDefecto,
        descripcion: descripcionPorDefecto,
        criterioCodigo,
      }).save();
    }

    const yaLaTiene = await this.usuarioInsigniaModel
      .findOne({
        idUsuario: new Types.ObjectId(userId),
        idInsignia: insignia._id,
      })
      .exec();

    if (!yaLaTiene) {
      await new this.usuarioInsigniaModel({
        idUsuario: new Types.ObjectId(userId),
        idInsignia: insignia._id,
        idGrupo: idGrupo ? new Types.ObjectId(idGrupo) : undefined,
        fechaObtencion: new Date(),
      }).save();
    }
  }

  async getMisInsignias(userId: string): Promise<UsuarioInsigniaDocument[]> {
    return this.usuarioInsigniaModel
      .find({ idUsuario: new Types.ObjectId(userId) })
      .exec();
  }

  /**
   * RF-42: Ranking por grupo/asignatura respetando privacidad del usuario.
   */
  async getRanking(
    grupo?: string,
    asignaturaId?: string,
  ): Promise<UsuarioDocument[]> {
    const filter: Record<string, unknown> = {
      isActive: true,
      deletedAt: { $exists: false },
      'preferencias.mostrarEnRanking': true,
    };
    if (grupo) filter.grupo = grupo;
    if (asignaturaId) {
      filter.asignaturasInscritas = new Types.ObjectId(asignaturaId);
    }
    return this.usuarioModel
      .find(filter)
      .sort({ xpTotal: -1 })
      .limit(50)
      .exec();
  }

  /**
   * RF-49: Retos semanales comunitarios.
   */
  async crearRetoComunitario(
    titulo: string,
    descripcion: string,
    xpRecompensa: number,
    metaCantidad: number,
    idGrupo: string,
  ): Promise<RetoComunitarioDocument> {
    return new this.retoModel({
      titulo,
      descripcion,
      xpRecompensa,
      metaCantidad,
      idGrupo: new Types.ObjectId(idGrupo),
    }).save();
  }

  async listarRetos(idGrupo?: string): Promise<RetoComunitarioDocument[]> {
    const filter = idGrupo ? { idGrupo: new Types.ObjectId(idGrupo) } : {};
    return this.retoModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  /**
   * RF-37 & RF-39: Cron diario para recordar rachas en riesgo y reiniciar rachas perdidas.
   */
  @Cron(CronExpression.EVERY_DAY_AT_8PM)
  async revisarRachasEnRiesgo(): Promise<void> {
    const hoyInicio = new Date();
    hoyInicio.setHours(0, 0, 0, 0);

    const usuariosEnRiesgo = await this.usuarioModel
      .find({
        isActive: true,
        rachaActual: { $gt: 0 },
        ultimaActividad: { $lt: hoyInicio },
        'preferencias.notificacionesCorreo': true,
      })
      .exec();

    for (const u of usuariosEnRiesgo) {
      await this.brevoService.sendStreakRiskEmail(
        u.correo,
        u.nombre,
        u.rachaActual,
      );
    }
    this.logger.log(
      `Recordatorios de racha enviados: ${usuariosEnRiesgo.length}`,
    );
  }
}
