import { Field, ID, InputType } from '@nestjs/graphql';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { RolUsuario } from '../../common/enums/kolab.enums';

@InputType()
export class RegisterInput {
  @Field()
  @IsString()
  nombre: string;

  @Field()
  @IsString()
  apellidos: string;

  @Field()
  @IsEmail({}, { message: 'El formato del correo electrónico no es válido' })
  correo: string;

  @Field()
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/, {
    message:
      'La contraseña debe incluir al menos una mayúscula, una minúscula, un número y un carácter especial',
  })
  contrasena: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  idCarrera?: string;

  @Field(() => RolUsuario, { nullable: true })
  @IsOptional()
  @IsEnum(RolUsuario, { message: 'El rol seleccionado no es válido' })
  rol?: RolUsuario;

  @Field()
  @IsBoolean()
  aceptoPrivacidad: boolean;
}

@InputType()
export class LoginInput {
  @Field()
  @IsEmail({}, { message: 'El correo no es válido' })
  correo: string;

  @Field()
  @IsString()
  contrasena: string;
}

@InputType()
export class ResetPasswordInput {
  @Field()
  @IsString()
  token: string;

  @Field()
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/, {
    message:
      'La contraseña debe incluir al menos una mayúscula, una minúscula, un número y un carácter especial',
  })
  nuevaContrasena: string;
}
