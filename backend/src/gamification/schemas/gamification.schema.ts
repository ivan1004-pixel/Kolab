import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@ObjectType()
@Schema({ timestamps: true, collection: 'insignias' })
export class Insignia {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true, unique: true })
  nombre: string;

  @Field({ nullable: true })
  @Prop()
  descripcion?: string;

  @Field({ nullable: true })
  @Prop()
  iconoUrl?: string;

  @Field()
  @Prop({ required: true })
  criterioCodigo: string;
}

export type InsigniaDocument = Insignia & Document;
export const InsigniaSchema = SchemaFactory.createForClass(Insignia);

@ObjectType()
@Schema({ timestamps: true, collection: 'usuario_insignias' })
export class UsuarioInsignia {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  idUsuario: Types.ObjectId;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Insignia', required: true })
  idInsignia: Types.ObjectId;

  @Field(() => ID, { nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'GrupoEstudio' })
  idGrupo?: Types.ObjectId;

  @Field()
  @Prop({ default: Date.now })
  fechaObtencion: Date;
}

export type UsuarioInsigniaDocument = UsuarioInsignia & Document;
export const UsuarioInsigniaSchema =
  SchemaFactory.createForClass(UsuarioInsignia);

@ObjectType()
@Schema({ timestamps: true, collection: 'retos_comunitarios' })
export class RetoComunitario {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true })
  titulo: string;

  @Field({ nullable: true })
  @Prop()
  descripcion?: string;

  @Field(() => Int)
  @Prop({ default: 50 })
  xpRecompensa: number;

  @Field(() => Int)
  @Prop({ default: 100 })
  metaCantidad: number;

  @Field(() => Int)
  @Prop({ default: 0 })
  progresoActual: number;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'GrupoEstudio', required: true })
  idGrupo: Types.ObjectId;

  @Field(() => ID, { nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'Recurso' })
  idRecurso?: Types.ObjectId;

  @Field()
  @Prop({ default: false })
  completado: boolean;
}

export type RetoComunitarioDocument = RetoComunitario & Document;
export const RetoComunitarioSchema =
  SchemaFactory.createForClass(RetoComunitario);
