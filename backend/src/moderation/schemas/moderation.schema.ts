import { Field, ID, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  EstadoReporte,
  TipoNotificacion,
} from '../../common/enums/kolab.enums';

@ObjectType()
@Schema({ timestamps: true, collection: 'reportes' })
export class Reporte {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true })
  motivo: string;

  @Field()
  @Prop({
    required: true,
    enum: ['RECURSO', 'PREGUNTA', 'RESPUESTA', 'SOLICITUD_TUTORIA', 'IA'],
  })
  tipoObjetivo: string;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, required: true })
  idObjetivo: Types.ObjectId;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  idUsuarioReporta: Types.ObjectId;

  @Field(() => EstadoReporte)
  @Prop({
    type: String,
    enum: EstadoReporte,
    default: EstadoReporte.PENDIENTE,
  })
  estado: EstadoReporte;

  @Field({ nullable: true })
  @Prop()
  resolucionAdmin?: string;

  @Field()
  createdAt: Date;
}

export type ReporteDocument = Reporte & Document;
export const ReporteSchema = SchemaFactory.createForClass(Reporte);

@ObjectType()
@Schema({ timestamps: true, collection: 'auditoria_logs' })
export class AuditoriaLog {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true })
  accion: string;

  @Field(() => ID, { nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'Usuario' })
  idUsuario?: Types.ObjectId;

  @Field({ nullable: true })
  @Prop()
  entidad?: string;

  @Field({ nullable: true })
  @Prop()
  detalles?: string;

  @Field()
  createdAt: Date;
}

export type AuditoriaLogDocument = AuditoriaLog & Document;
export const AuditoriaLogSchema = SchemaFactory.createForClass(AuditoriaLog);

@ObjectType()
@Schema({ timestamps: true, collection: 'notificaciones' })
export class Notificacion {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  idUsuario: Types.ObjectId;

  @Field(() => TipoNotificacion)
  @Prop({ type: String, enum: TipoNotificacion, required: true })
  tipo: TipoNotificacion;

  @Field()
  @Prop({ required: true })
  titulo: string;

  @Field()
  @Prop({ required: true })
  mensaje: string;

  @Field()
  @Prop({ default: false })
  leida: boolean;

  @Field()
  createdAt: Date;
}

export type NotificacionDocument = Notificacion & Document;
export const NotificacionSchema = SchemaFactory.createForClass(Notificacion);
