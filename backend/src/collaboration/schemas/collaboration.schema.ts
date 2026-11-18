import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { EstadoTutoria } from '../../common/enums/kolab.enums';

@ObjectType()
export class MiembroGrupo {
  @Field(() => ID)
  idUsuario: Types.ObjectId;

  @Field()
  rolGrupo: string;

  @Field()
  fechaUnion: Date;
}

@ObjectType()
@Schema({ timestamps: true, collection: 'grupos_estudio' })
export class GrupoEstudio {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true, trim: true })
  nombre: string;

  @Field({ nullable: true })
  @Prop()
  descripcion?: string;

  @Field()
  @Prop({ default: true })
  esPrivado: boolean;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Tema', required: true })
  idTema: Types.ObjectId;

  @Field(() => ID, { nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'Cuestionario' })
  idCuestionario?: Types.ObjectId;

  @Field(() => [MiembroGrupo])
  @Prop({ type: [Object], default: [] })
  miembros: MiembroGrupo[];
}

export type GrupoEstudioDocument = GrupoEstudio & Document;
export const GrupoEstudioSchema = SchemaFactory.createForClass(GrupoEstudio);

@ObjectType()
@Schema({ timestamps: true, collection: 'solicitudes_tutoria' })
export class SolicitudTutoria {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field(() => EstadoTutoria)
  @Prop({
    type: String,
    enum: EstadoTutoria,
    default: EstadoTutoria.PENDIENTE,
  })
  estado: EstadoTutoria;

  @Field()
  @Prop({ default: false })
  esDuelo: boolean;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  idEstudiante: Types.ObjectId;

  @Field(() => ID, { nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'Usuario' })
  idTutor?: Types.ObjectId;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Tema', required: true })
  idTema: Types.ObjectId;

  @Field(() => ID, { nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'Cuestionario' })
  idCuestionario?: Types.ObjectId;

  @Field(() => Int, { nullable: true })
  @Prop()
  puntajeEstudiante?: number;

  @Field(() => Int, { nullable: true })
  @Prop()
  puntajeTutor?: number;

  @Field()
  createdAt: Date;
}

export type SolicitudTutoriaDocument = SolicitudTutoria & Document;
export const SolicitudTutoriaSchema =
  SchemaFactory.createForClass(SolicitudTutoria);
