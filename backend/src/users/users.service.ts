import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import { ModerationService } from '../moderation/moderation.service';
import {
  AdminCreateUsuarioInput,
  AdminUpdateUsuarioInput,
  UpdatePerfilInput,
  UpdatePreferenciasInput,
} from './dto/usuario.input';
import { Usuario, UsuarioDocument } from './schemas/usuario.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,
    @Optional() private readonly moderationService?: ModerationService,
  ) {}

  async findById(id: string): Promise<UsuarioDocument> {
    const user = await this.usuarioModel
      .findOne({ _id: id, deletedAt: { $exists: false } })
      .exec();
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }

  async findByEmail(correo: string): Promise<UsuarioDocument | null> {
    return this.usuarioModel
      .findOne({
        correo: correo.trim().toLowerCase(),
        deletedAt: { $exists: false },
      })
      .exec();
  }

  async findAll(): Promise<UsuarioDocument[]> {
    return this.usuarioModel
      .find({ deletedAt: { $exists: false } })
      .sort({ createdAt: -1 })
      .exec();
  }

  async updatePerfil(
    userId: string,
    input: UpdatePerfilInput,
  ): Promise<UsuarioDocument> {
    const updateData: Record<string, unknown> = { ...input };
    if (input.idCarrera) {
      updateData.idCarrera = new Types.ObjectId(input.idCarrera);
    }
    const updated = await this.usuarioModel
      .findByIdAndUpdate(userId, { $set: updateData }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Usuario no encontrado');
    return updated;
  }

  async updatePreferencias(
    userId: string,
    input: UpdatePreferenciasInput,
  ): Promise<UsuarioDocument> {
    const user = await this.findById(userId);
    const nuevasPreferencias = {
      ...user.preferencias,
      ...input,
    };
    user.preferencias = nuevasPreferencias;
    return user.save();
  }

  async enrollAsignatura(
    userId: string,
    asignaturaId: string,
  ): Promise<UsuarioDocument> {
    const updated = await this.usuarioModel
      .findByIdAndUpdate(
        userId,
        { $addToSet: { asignaturasInscritas: new Types.ObjectId(asignaturaId) } },
        { new: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('Usuario no encontrado');
    return updated;
  }

  async softDeleteAccount(userId: string): Promise<boolean> {
    const user = await this.findById(userId);
    user.isActive = false;
    user.deletedAt = new Date();
    user.tokenVersion += 1;
    await user.save();
    return true;
  }

  async adminCreateUsuario(
    input: AdminCreateUsuarioInput,
  ): Promise<UsuarioDocument> {
    const existing = await this.findByEmail(input.correo);
    if (existing) {
      throw new BadRequestException('El correo ya está registrado');
    }
    const contrasenaHash = await bcrypt.hash(input.contrasena, 10);
    const created = new this.usuarioModel({
      nombre: input.nombre,
      apellidos: input.apellidos,
      correo: input.correo.trim().toLowerCase(),
      contrasenaHash,
      rol: input.rol,
      idCarrera: input.idCarrera
        ? new Types.ObjectId(input.idCarrera)
        : undefined,
      emailVerified: true,
      aceptoPrivacidad: true,
      isActive: true,
    });
    return created.save();
  }

  async adminUpdateUsuario(
    id: string,
    input: AdminUpdateUsuarioInput,
    adminId?: string,
  ): Promise<UsuarioDocument> {
    const prev = await this.usuarioModel.findById(id).exec();
    if (!prev) throw new NotFoundException('Usuario no encontrado');

    const updated = await this.usuarioModel
      .findByIdAndUpdate(id, { $set: input }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Usuario no encontrado');

    if (input.rol && input.rol !== prev.rol) {
      await this.moderationService
        ?.registrarAuditoria(
          'CAMBIO_ROL',
          adminId,
          'Usuario',
          `Rol de ${updated.correo} cambiado de ${prev.rol} a ${input.rol}`,
        )
        .catch(() => {});
    } else if (input.isActive === false) {
      await this.moderationService
        ?.registrarAuditoria(
          'BAJA_USUARIO',
          adminId,
          'Usuario',
          `Usuario ${updated.correo} desactivado`,
        )
        .catch(() => {});
    }

    return updated;
  }

  async adminDeleteUsuario(id: string, adminId?: string): Promise<boolean> {
    const user = await this.findById(id);
    user.isActive = false;
    user.deletedAt = new Date();
    user.tokenVersion += 1;
    await user.save();
    await this.moderationService
      ?.registrarAuditoria(
        'BAJA_USUARIO',
        adminId,
        'Usuario',
        `Usuario ${user.correo} dado de baja por administrador`,
      )
      .catch(() => {});
    return true;
  }

  async addXp(userId: string, amount: number): Promise<void> {
    await this.usuarioModel
      .findByIdAndUpdate(userId, { $inc: { xpTotal: amount } })
      .exec();
  }
}
