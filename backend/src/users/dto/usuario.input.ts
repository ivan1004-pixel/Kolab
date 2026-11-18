import { Field, ID, InputType } from '@nestjs/graphql';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { RolUsuario } from '../../common/enums/kolab.enums';

@InputType()
export class UpdatePerfilInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  nombre?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  apellidos?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  fotoUrl?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  idCarrera?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  cuatrimestre?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  grupo?: string;
}

@InputType()
export class UpdatePreferenciasInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  notificacionesPlataforma?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  notificacionesCorreo?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  mostrarEnRanking?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  temaOscuro?: boolean;
}

@InputType()
export class AdminCreateUsuarioInput {
  @Field()
  @IsString()
  nombre: string;

  @Field()
  @IsString()
  apellidos: string;

  @Field()
  @IsEmail()
  correo: string;

  @Field()
  @IsString()
  @MinLength(8)
  contrasena: string;

  @Field(() => RolUsuario)
  @IsEnum(RolUsuario)
  rol: RolUsuario;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  idCarrera?: string;
}

@InputType()
export class AdminUpdateUsuarioInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  nombre?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  apellidos?: string;

  @Field(() => RolUsuario, { nullable: true })
  @IsOptional()
  @IsEnum(RolUsuario)
  rol?: RolUsuario;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
