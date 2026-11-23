import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Recurso,
  RecursoDocument,
} from '../resources/schemas/recurso.schema';
import {
  CreateAsignaturaInput,
  CreateCalendarioEventoInput,
  CreateCarreraInput,
  CreateTemaInput,
  UpdateAsignaturaInput,
  UpdateCarreraInput,
} from './dto/academic.input';
import {
  Asignatura,
  AsignaturaDocument,
  CalendarioEvento,
  CalendarioEventoDocument,
  Carrera,
  CarreraDocument,
  Tema,
  TemaDocument,
} from './schemas/academic.schema';

@Injectable()
export class AcademicService {
  constructor(
    @InjectModel(Carrera.name)
    private readonly carreraModel: Model<CarreraDocument>,
    @InjectModel(Asignatura.name)
    private readonly asignaturaModel: Model<AsignaturaDocument>,
    @InjectModel(Tema.name)
    private readonly temaModel: Model<TemaDocument>,
    @InjectModel(CalendarioEvento.name)
    private readonly calendarioModel: Model<CalendarioEventoDocument>,
    @InjectModel(Recurso.name)
    private readonly recursoModel: Model<RecursoDocument>,
  ) {}

  async createCarrera(input: CreateCarreraInput): Promise<CarreraDocument> {
    return new this.carreraModel(input).save();
  }

  async findAllCarreras(): Promise<CarreraDocument[]> {
    return this.carreraModel.find().sort({ nombre: 1 }).exec();
  }

  async updateCarrera(
    id: string,
    input: UpdateCarreraInput,
  ): Promise<CarreraDocument> {
    const updateData: Record<string, unknown> = {};
    if (input.nombre !== undefined) updateData.nombre = input.nombre.trim();
    if (input.descripcion !== undefined) {
      updateData.descripcion = input.descripcion.trim();
    }
    if (input.cuatrimestres !== undefined) {
      updateData.cuatrimestres = input.cuatrimestres;
    }

    const updated = await this.carreraModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Carrera no encontrada');
    return updated;
  }

  async deleteCarrera(id: string): Promise<boolean> {
    const objId = new Types.ObjectId(id);
    const asignaturasCount = await this.asignaturaModel
      .countDocuments({ idCarrera: objId })
      .exec();
    if (asignaturasCount > 0) {
      throw new BadRequestException(
        'No se puede eliminar la carrera porque tiene asignaturas asociadas. Elimina o reasigna sus asignaturas primero.',
      );
    }
    const res = await this.carreraModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Carrera no encontrada');
    return true;
  }

  async createAsignatura(
    input: CreateAsignaturaInput,
  ): Promise<AsignaturaDocument> {
    const carrera = await this.carreraModel.findById(input.idCarrera).exec();
    if (!carrera) throw new NotFoundException('Carrera no encontrada');
    return new this.asignaturaModel({
      ...input,
      idCarrera: new Types.ObjectId(input.idCarrera),
    }).save();
  }

  async findAsignaturas(idCarrera?: string): Promise<AsignaturaDocument[]> {
    const filter = idCarrera
      ? { idCarrera: new Types.ObjectId(idCarrera) }
      : {};
    return this.asignaturaModel.find(filter).sort({ nombre: 1 }).exec();
  }

  async updateAsignatura(
    id: string,
    input: UpdateAsignaturaInput,
  ): Promise<AsignaturaDocument> {
    const updateData: Record<string, unknown> = {};
    if (input.nombre !== undefined) updateData.nombre = input.nombre.trim();
    if (input.descripcion !== undefined) {
      updateData.descripcion = input.descripcion.trim();
    }
    if (input.cuatrimestre !== undefined) {
      updateData.cuatrimestre = input.cuatrimestre.trim();
    }
    if (input.idCarrera !== undefined) {
      const carrera = await this.carreraModel.findById(input.idCarrera).exec();
      if (!carrera) throw new NotFoundException('Carrera no encontrada');
      updateData.idCarrera = new Types.ObjectId(input.idCarrera);
    }

    const updated = await this.asignaturaModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Asignatura no encontrada');
    return updated;
  }

  async deleteAsignatura(id: string): Promise<boolean> {
    const objId = new Types.ObjectId(id);
    const [temasCount, recursosCount] = await Promise.all([
      this.temaModel.countDocuments({ idAsignatura: objId }).exec(),
      this.recursoModel
        .countDocuments({ idAsignatura: objId, eliminadoEn: { $exists: false } })
        .exec(),
    ]);
    if (temasCount > 0 || recursosCount > 0) {
      throw new BadRequestException(
        'No se puede eliminar la asignatura porque tiene temas o recursos asociados.',
      );
    }
    const res = await this.asignaturaModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Asignatura no encontrada');
    return true;
  }

  async createTema(input: CreateTemaInput): Promise<TemaDocument> {
    const asignatura = await this.asignaturaModel
      .findById(input.idAsignatura)
      .exec();
    if (!asignatura) throw new NotFoundException('Asignatura no encontrada');
    return new this.temaModel({
      ...input,
      idAsignatura: new Types.ObjectId(input.idAsignatura),
    }).save();
  }

  async findTemas(idAsignatura?: string): Promise<TemaDocument[]> {
    const filter = idAsignatura
      ? { idAsignatura: new Types.ObjectId(idAsignatura) }
      : {};
    return this.temaModel.find(filter).sort({ titulo: 1 }).exec();
  }

  async createCalendarioEvento(
    docenteId: string,
    input: CreateCalendarioEventoInput,
  ): Promise<CalendarioEventoDocument> {
    return new this.calendarioModel({
      titulo: input.titulo,
      tipo: input.tipo,
      fecha: new Date(input.fecha),
      descripcion: input.descripcion,
      idAsignatura: new Types.ObjectId(input.idAsignatura),
      idTema: input.idTema ? new Types.ObjectId(input.idTema) : undefined,
      idDocente: new Types.ObjectId(docenteId),
    }).save();
  }

  async findCalendarioEventos(
    asignaturaIds?: string[],
  ): Promise<CalendarioEventoDocument[]> {
    const filter =
      asignaturaIds && asignaturaIds.length > 0
        ? { idAsignatura: { $in: asignaturaIds.map((id) => new Types.ObjectId(id)) } }
        : {};
    return this.calendarioModel.find(filter).sort({ fecha: 1 }).exec();
  }
}
