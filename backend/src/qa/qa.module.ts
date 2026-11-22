import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  IntentoCuestionario,
  IntentoCuestionarioSchema,
} from '../ai/schemas/ai.schema';
import { Usuario, UsuarioSchema } from '../users/schemas/usuario.schema';
import { QaResolver } from './qa.resolver';
import { QaService } from './qa.service';
import {
  Etiqueta,
  EtiquetaSchema,
  Pregunta,
  PreguntaSchema,
  Respuesta,
  RespuestaSchema,
} from './schemas/qa.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Pregunta.name, schema: PreguntaSchema },
      { name: Respuesta.name, schema: RespuestaSchema },
      { name: Etiqueta.name, schema: EtiquetaSchema },
      { name: IntentoCuestionario.name, schema: IntentoCuestionarioSchema },
      { name: Usuario.name, schema: UsuarioSchema },
    ]),
  ],
  providers: [QaService, QaResolver],
  exports: [QaService, MongooseModule],
})
export class QaModule {}
