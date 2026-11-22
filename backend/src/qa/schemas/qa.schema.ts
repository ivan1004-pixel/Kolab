import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@ObjectType()
@Schema({ timestamps: true, collection: 'etiquetas' })
export class Etiqueta {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true, unique: true, trim: true })
  nombre: string;

  @Field({ nullable: true })
  @Prop()
  categoria?: string;
}

export type EtiquetaDocument = Etiqueta & Document;
export const EtiquetaSchema = SchemaFactory.createForClass(Etiqueta);

@ObjectType()
@Schema({ timestamps: true, collection: 'preguntas' })
export class Pregunta {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true })
  texto: string;

  @Field({ nullable: true })
  @Prop()
  fragmentoRecurso?: string;

  @Field()
  @Prop({ default: false })
  resuelta: boolean;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  idUsuario: Types.ObjectId;

  @Field({ nullable: true })
  @Prop()
  nombreAutor?: string;

  @Field({ nullable: true })
  @Prop()
  fotoAutor?: string;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Tema', required: true })
  idTema: Types.ObjectId;

  @Field(() => ID, { nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'Recurso' })
  idRecurso?: Types.ObjectId;

  @Field(() => [String])
  @Prop({ type: [String], default: [] })
  etiquetas: string[];

  @Field(() => Int)
  @Prop({ default: 0 })
  votosUtilidad: number;

  @Prop({ type: Object, default: {} })
  votosPorUsuario?: Record<string, number>;

  @Field(() => Int, { defaultValue: 0 })
  misVotos?: number;

  @Field()
  @Prop({ default: false })
  esBancoColaborativo: boolean;

  @Field()
  @Prop({ default: false })
  validadaPorDocente: boolean;

  @Field()
  createdAt: Date;
}

export type PreguntaDocument = Pregunta & Document;
export const PreguntaSchema = SchemaFactory.createForClass(Pregunta);

@ObjectType()
@Schema({ timestamps: true, collection: 'respuestas' })
export class Respuesta {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true })
  texto: string;

  @Field()
  @Prop({ default: false })
  esValida: boolean;

  @Field(() => Int)
  @Prop({ default: 0 })
  xpGanada: number;

  @Field(() => Int)
  @Prop({ default: 0 })
  votosUtilidad: number;

  @Prop({ type: Object, default: {} })
  votosPorUsuario?: Record<string, number>;

  @Field(() => Int, { defaultValue: 0 })
  misVotos?: number;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Pregunta', required: true })
  idPregunta: Types.ObjectId;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  idUsuario: Types.ObjectId;

  @Field({ nullable: true })
  @Prop()
  nombreAutor?: string;

  @Field({ nullable: true })
  @Prop()
  fotoAutor?: string;

  @Field()
  createdAt: Date;
}

export type RespuestaDocument = Respuesta & Document;
export const RespuestaSchema = SchemaFactory.createForClass(Respuesta);

@ObjectType()
export class RadarDificultadTema {
  @Field(() => ID)
  idTema: Types.ObjectId;

  @Field(() => Int)
  totalPreguntas: number;

  @Field(() => Int)
  preguntasSinResolver: number;

  @Field(() => Int)
  erroresAutoevaluacion: number;

  @Field(() => [String])
  conceptosDebiles: string[];

  @Field(() => Pregunta, { nullable: true })
  preguntaMasDebatidaSinSolucion?: Pregunta;
}
