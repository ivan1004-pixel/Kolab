import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { EstadoValidacionRecurso } from '../../common/enums/kolab.enums';

@ObjectType()
export class VersionRecurso {
  @Field(() => Int)
  version: number;

  @Field()
  archivoUrl: string;

  @Field(() => ID)
  idAutorCambio: Types.ObjectId;

  @Field({ nullable: true })
  notaCambio?: string;

  @Field()
  fecha: Date;
}

@ObjectType()
export class CalificacionRecurso {
  @Field(() => ID)
  idUsuario: Types.ObjectId;

  @Field(() => Int)
  estrellas: number;

  @Field()
  fecha: Date;
}

@ObjectType()
export class ComentarioRecurso {
  @Field(() => ID)
  idUsuario: Types.ObjectId;

  @Field()
  texto: string;

  @Field()
  fecha: Date;
}

@ObjectType()
@Schema({ timestamps: true, collection: 'recursos' })
export class Recurso {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true, trim: true })
  titulo: string;

  @Field({ nullable: true })
  @Prop()
  descripcion?: string;

  @Field()
  @Prop({ required: true })
  archivoUrl: string;

  @Field()
  @Prop({ required: true })
  tipoArchivo: string;

  @Field(() => Int)
  @Prop({ default: 0 })
  tamanoBytes: number;

  @Field({ nullable: true })
  @Prop()
  contenidoTextoExtraido?: string;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  idUsuario: Types.ObjectId;

  @Field(() => [ID])
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Usuario' }], default: [] })
  coautores: Types.ObjectId[];

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Tema', required: true })
  idTema: Types.ObjectId;

  @Field(() => ID, { nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'Asignatura' })
  idAsignatura?: Types.ObjectId;

  @Field(() => [String])
  @Prop({ type: [String], default: [] })
  palabrasClave: string[];

  @Field(() => EstadoValidacionRecurso)
  @Prop({
    type: String,
    enum: EstadoValidacionRecurso,
    default: EstadoValidacionRecurso.PENDIENTE,
  })
  estadoValidacion: EstadoValidacionRecurso;

  @Field({ nullable: true })
  @Prop()
  retroalimentacionDocente?: string;

  @Field()
  @Prop({ default: false })
  esMaterialOficial: boolean;

  @Field(() => [VersionRecurso])
  @Prop({ type: [Object], default: [] })
  versiones: VersionRecurso[];

  @Prop({ type: [Object], default: [] })
  calificaciones: CalificacionRecurso[];

  @Field(() => Float)
  @Prop({ default: 0 })
  promedioCalificacion: number;

  @Field(() => Int)
  @Prop({ default: 0 })
  totalCalificaciones: number;

  @Field(() => Int)
  @Prop({ default: 0 })
  consultasCount: number;

  @Field(() => [ComentarioRecurso])
  @Prop({ type: [Object], default: [] })
  comentarios: ComentarioRecurso[];

  @Field({ nullable: true })
  @Prop()
  eliminadoEn?: Date;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

export type RecursoDocument = Recurso & Document;
export const RecursoSchema = SchemaFactory.createForClass(Recurso);

@ObjectType()
@Schema({ timestamps: true, collection: 'colecciones_recursos' })
export class ColeccionPersonal {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true })
  nombre: string;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  idUsuario: Types.ObjectId;

  @Field(() => [ID])
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Recurso' }], default: [] })
  recursos: Types.ObjectId[];

  @Field()
  @Prop({ default: false })
  esFavoritos: boolean;
}

export type ColeccionPersonalDocument = ColeccionPersonal & Document;
export const ColeccionPersonalSchema =
  SchemaFactory.createForClass(ColeccionPersonal);
