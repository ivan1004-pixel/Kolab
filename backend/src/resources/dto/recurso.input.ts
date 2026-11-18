import { Field, Float, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { EstadoValidacionRecurso } from '../../common/enums/kolab.enums';

@InputType()
export class CreateRecursoInput {
  @Field()
  @IsString()
  titulo: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @Field()
  @IsString()
  archivoUrl: string;

  @Field()
  @IsString()
  tipoArchivo: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  tamanoBytes: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  contenidoTextoExtraido?: string;

  @Field(() => ID)
  @IsString()
  idTema: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  idAsignatura?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  palabrasClave?: string[];

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  esMaterialOficial?: boolean;
}

@InputType()
export class FiltrarRecursosInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  texto?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  palabrasClave?: string[];

  @Field(() => ID, { nullable: true })
  @IsOptional()
  idAutor?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  idTema?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  idAsignatura?: string;

  @Field(() => EstadoValidacionRecurso, { nullable: true })
  @IsOptional()
  @IsEnum(EstadoValidacionRecurso)
  estadoValidacion?: EstadoValidacionRecurso;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @Min(1)
  @Max(5)
  calificacionMinima?: number;

  @Field({ nullable: true, defaultValue: 'RECIENTES' })
  @IsOptional()
  @IsString()
  ordenarPor?: 'RECIENTES' | 'MEJOR_CALIFICADOS' | 'MAS_CONSULTADOS';
}
