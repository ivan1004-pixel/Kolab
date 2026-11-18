import { Field, ObjectType } from '@nestjs/graphql';
import { Usuario } from '../../users/schemas/usuario.schema';

@ObjectType()
export class AuthPayload {
  @Field()
  accessToken: string;

  @Field()
  refreshToken: string;

  @Field(() => Usuario)
  usuario: Usuario;
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
