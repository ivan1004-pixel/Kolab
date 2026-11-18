import { Field, ID, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@ObjectType()
@Schema({ timestamps: true, collection: 'carreras' })
export class Carrera {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true, trim: true })
  nombre: string;

  @Field({ nullable: true })
  @Prop()
  descripcion?: string;

  @Field(() => [String])
  @Prop({ type: [String], default: [] })
  cuatrimestres: string[];
}

export type CarreraDocument = Carrera & Document;
export const CarreraSchema = SchemaFactory.createForClass(Carrera);

@ObjectType()
@Schema({ timestamps: true, collection: 'asignaturas' })
export class Asignatura {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true, trim: true })
  nombre: string;

  @Field({ nullable: true })
  @Prop()
  descripcion?: string;

  @Field({ nullable: true })
  @Prop()
  cuatrimestre?: string;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Carrera', required: true })
  idCarrera: Types.ObjectId;
}

export type AsignaturaDocument = Asignatura & Document;
export const AsignaturaSchema = SchemaFactory.createForClass(Asignatura);

@ObjectType()
@Schema({ timestamps: true, collection: 'temas' })
export class Tema {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true, trim: true })
  titulo: string;

  @Field({ nullable: true })
  @Prop()
  descripcion?: string;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Asignatura', required: true })
  idAsignatura: Types.ObjectId;
}

export type TemaDocument = Tema & Document;
export const TemaSchema = SchemaFactory.createForClass(Tema);

@ObjectType()
@Schema({ timestamps: true, collection: 'calendario_eventos' })
export class CalendarioEvento {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true })
  titulo: string;

  @Field()
  @Prop({ required: true, enum: ['EXAMEN', 'ENTREGA', 'OTRO'] })
  tipo: string;

  @Field()
  @Prop({ required: true })
  fecha: Date;

  @Field({ nullable: true })
  @Prop()
  descripcion?: string;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Asignatura', required: true })
  idAsignatura: Types.ObjectId;

  @Field(() => ID, { nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'Tema' })
  idTema?: Types.ObjectId;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  idDocente: Types.ObjectId;
}

export type CalendarioEventoDocument = CalendarioEvento & Document;
export const CalendarioEventoSchema =
  SchemaFactory.createForClass(CalendarioEvento);
