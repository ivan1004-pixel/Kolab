import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { RolUsuario } from '../../common/enums/kolab.enums';

@ObjectType()
export class PreferenciasUsuario {
  @Field({ defaultValue: true })
  notificacionesPlataforma: boolean;

  @Field({ defaultValue: true })
  notificacionesCorreo: boolean;

  @Field({ defaultValue: true })
  mostrarEnRanking: boolean;

  @Field({ defaultValue: false })
  temaOscuro: boolean;
}

@ObjectType()
@Schema({ timestamps: true, collection: 'usuarios' })
export class Usuario {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true, trim: true })
  nombre: string;

  @Field()
  @Prop({ required: true, trim: true })
  apellidos: string;

  @Field()
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  correo: string;

  // Nunca se expone en GraphQL
  @Prop({ required: true })
  contrasenaHash: string;

  @Field(() => RolUsuario)
  @Prop({
    type: String,
    enum: RolUsuario,
    default: RolUsuario.ESTUDIANTE,
  })
  rol: RolUsuario;

  @Field({ nullable: true })
  @Prop()
  fotoUrl?: string;

  @Field(() => Int)
  @Prop({ default: 0 })
  xpTotal: number;

  @Field(() => ID, { nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'Carrera' })
  idCarrera?: Types.ObjectId;

  @Field({ nullable: true })
  @Prop()
  cuatrimestre?: string;

  @Field({ nullable: true })
  @Prop()
  grupo?: string;

  // Rachas y gamificación (RF-35 a RF-42)
  @Field(() => Int)
  @Prop({ default: 0 })
  rachaActual: number;

  @Field(() => Int)
  @Prop({ default: 0 })
  rachaMasLarga: number;

  @Field(() => Int)
  @Prop({ default: 2 })
  comodinesMes: number;

  @Field({ nullable: true })
  @Prop()
  ultimaActividad?: Date;

  @Field({ nullable: true })
  @Prop()
  rachaCongeladaHasta?: Date;

  // Verificación de correo y seguridad (Brevo + Auth)
  @Field()
  @Prop({ default: false })
  emailVerified: boolean;

  @Prop()
  emailVerificationToken?: string;

  @Prop()
  emailVerificationExpires?: Date;

  @Prop()
  resetPasswordToken?: string;

  @Prop()
  resetPasswordExpires?: Date;

  @Prop({ default: 0 })
  failedLoginAttempts: number;

  @Prop()
  lockUntil?: Date;

  @Prop({ default: 0 })
  tokenVersion: number;

  @Prop()
  lastActiveAt?: Date;

  @Field()
  @Prop({ default: true })
  isActive: boolean;

  @Field()
  @Prop({ default: false })
  aceptoPrivacidad: boolean;

  @Field(() => PreferenciasUsuario)
  @Prop({
    type: Object,
    default: {
      notificacionesPlataforma: true,
      notificacionesCorreo: true,
      mostrarEnRanking: true,
      temaOscuro: false,
    },
  })
  preferencias: PreferenciasUsuario;

  @Field(() => [ID])
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Asignatura' }], default: [] })
  asignaturasInscritas: Types.ObjectId[];

  @Field({ nullable: true })
  @Prop()
  deletedAt?: Date;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

export type UsuarioDocument = Usuario & Document;
export const UsuarioSchema = SchemaFactory.createForClass(Usuario);
