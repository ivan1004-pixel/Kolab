import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@ObjectType()
export class FuenteCitada {
  @Field(() => ID)
  idRecurso: Types.ObjectId;

  @Field()
  tituloRecurso: string;

  @Field()
  fragmento: string;
}

@ObjectType()
export class AnalisisDocumentoIa {
  @Field(() => ID)
  idRecurso: Types.ObjectId;

  @Field()
  tituloRecurso: string;

  @Field()
  resumen: string;

  @Field(() => [String])
  temasClave: string[];

  @Field()
  mensajeBienvenida: string;
}

@ObjectType()
export class RecursoRecomendado {
  @Field(() => ID)
  idRecurso: Types.ObjectId;

  @Field()
  titulo: string;

  @Field()
  motivo: string;

  @Field({ nullable: true })
  archivoUrl?: string;
}

@ObjectType()
@Schema({ timestamps: true, collection: 'consultas_ia' })
export class ConsultaIa {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true })
  promptPregunta: string;

  @Field()
  @Prop({ required: true })
  respuestaIa: string;

  @Field({ nullable: true })
  @Prop()
  respuestaRecurso?: string;

  @Field({ nullable: true })
  @Prop()
  respuestaComplementaria?: string;

  @Field(() => ID, { nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'Recurso' })
  idRecurso?: Types.ObjectId;

  @Field(() => [FuenteCitada])
  @Prop({ type: [Object], default: [] })
  fuentesCitadas: FuenteCitada[];

  @Field()
  @Prop({ default: true })
  esValida: boolean;

  @Field({ nullable: true })
  @Prop()
  calificacionUsuario?: boolean;

  @Field({ nullable: true })
  @Prop()
  correccionDocente?: string;

  @Field()
  @Prop({ default: true })
  generadoPorIa: boolean;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  idUsuario: Types.ObjectId;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Tema', required: true })
  idTema: Types.ObjectId;

  @Field()
  createdAt: Date;
}

export type ConsultaIaDocument = ConsultaIa & Document;
export const ConsultaIaSchema = SchemaFactory.createForClass(ConsultaIa);

@ObjectType()
export class ReactivoCuestionario {
  @Field(() => Int)
  numero: number;

  @Field()
  tipo: string; // 'CERRADA' | 'ABIERTA'

  @Field()
  pregunta: string;

  @Field(() => [String])
  opciones: string[];

  @Field()
  respuestaCorrecta: string;

  @Field()
  explicacion: string;
}

@ObjectType()
@Schema({ timestamps: true, collection: 'cuestionarios' })
export class Cuestionario {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true })
  titulo: string;

  @Field({ nullable: true })
  @Prop()
  referenciaIa?: string;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Tema', required: true })
  idTema: Types.ObjectId;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  idUsuario: Types.ObjectId;

  @Field(() => [ReactivoCuestionario])
  @Prop({ type: [Object], default: [] })
  reactivos: ReactivoCuestionario[];

  @Field({ nullable: true })
  @Prop()
  dificultad?: string;

  @Field()
  @Prop({ default: true })
  generadoPorIa: boolean;

  @Field()
  createdAt: Date;
}

export type CuestionarioDocument = Cuestionario & Document;
export const CuestionarioSchema = SchemaFactory.createForClass(Cuestionario);

@ObjectType()
@Schema({ timestamps: true, collection: 'intentos_cuestionario' })
export class IntentoCuestionario {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Cuestionario', required: true })
  idCuestionario: Types.ObjectId;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  idUsuario: Types.ObjectId;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Tema', required: true })
  idTema: Types.ObjectId;

  @Field({ nullable: true })
  @Prop()
  tituloCuestionario?: string;

  @Field(() => Int)
  @Prop({ required: true })
  aciertos: number;

  @Field(() => Int)
  @Prop({ required: true })
  totalReactivos: number;

  @Field(() => Float)
  @Prop({ required: true })
  calificacion: number;

  @Field()
  @Prop({ required: true })
  retroalimentacion: string;

  @Field(() => [String])
  @Prop({ type: [String], default: [] })
  conceptosPorReforzar: string[];

  @Field(() => [RecursoRecomendado])
  @Prop({ type: [Object], default: [] })
  recursosRecomendados: RecursoRecomendado[];

  @Field()
  createdAt: Date;
}

export type IntentoCuestionarioDocument = IntentoCuestionario & Document;
export const IntentoCuestionarioSchema =
  SchemaFactory.createForClass(IntentoCuestionario);

@ObjectType()
@Schema({ timestamps: true, collection: 'ai_config' })
export class AiConfig {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ default: 'gemini-3.1-flash-lite' })
  modelo: string;

  @Field(() => Float)
  @Prop({ default: 0.3 })
  temperatura: number;

  @Field(() => Int)
  @Prop({ default: 10 })
  limiteConsultasDiarias: number;
}

export type AiConfigDocument = AiConfig & Document;
export const AiConfigSchema = SchemaFactory.createForClass(AiConfig);

@ObjectType()
export class PreguntaDelDia {
  @Field(() => ID)
  idTema: Types.ObjectId;

  @Field()
  tituloTema: string;

  @Field()
  pregunta: string;

  @Field()
  dificultad: string;

  @Field()
  motivoPrioridad: string;

  @Field({ nullable: true })
  fuenteTitulo?: string;
}

@ObjectType()
export class PlanRepasoItem {
  @Field(() => ID)
  idEvento: Types.ObjectId;

  @Field()
  tituloEvento: string;

  @Field()
  fechaEvento: Date;

  @Field(() => ID)
  idAsignatura: Types.ObjectId;

  @Field(() => ID, { nullable: true })
  idTema?: Types.ObjectId;

  @Field()
  prioridad: string;

  @Field()
  recomendacion: string;

  @Field(() => [String])
  conceptosClave: string[];
}
