import { Field, ID, InputType } from '@nestjs/graphql';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

@InputType()
export class CreateCarreraInput {
  @Field()
  @IsString()
  nombre: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  cuatrimestres?: string[];
}

@InputType()
export class UpdateCarreraInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  nombre?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  cuatrimestres?: string[];
}

@InputType()
export class CreateAsignaturaInput {
  @Field()
  @IsString()
  nombre: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  cuatrimestre?: string;

  @Field(() => ID)
  @IsString()
  idCarrera: string;
}

@InputType()
export class UpdateAsignaturaInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  nombre?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  cuatrimestre?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsString()
  idCarrera?: string;
}

@InputType()
export class CreateTemaInput {
  @Field()
  @IsString()
  titulo: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @Field(() => ID)
  @IsString()
  idAsignatura: string;
}

@InputType()
export class CreateCalendarioEventoInput {
  @Field()
  @IsString()
  titulo: string;

  @Field()
  @IsIn(['EXAMEN', 'ENTREGA', 'OTRO'])
  tipo: string;

  @Field()
  @IsDateString()
  fecha: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @Field(() => ID)
  @IsString()
  idAsignatura: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  idTema?: string;
}
