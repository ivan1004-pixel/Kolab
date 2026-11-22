import { Field, ObjectType } from '@nestjs/graphql';
import { Usuario } from '../../users/schemas/usuario.schema';

@ObjectType()
export class AuthPayload {
  @Field({ nullable: true })
  accessToken?: string;

  @Field({ nullable: true })
  refreshToken?: string;

  @Field(() => Usuario, { nullable: true })
  usuario?: Usuario;

  @Field({ nullable: true })
  requiresVerification?: boolean;

  @Field({ nullable: true })
  correo?: string;

  @Field({ nullable: true })
  message?: string;
}

@ObjectType()
export class RegisterResponse {
  @Field()
  message: string;

  @Field()
  correo: string;

  @Field()
  requiereVerificacion: boolean;
}

@ObjectType()
export class ActionResponse {
  @Field()
  success: boolean;

  @Field()
  message: string;
}
