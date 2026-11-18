import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
    ]),
  ],
  providers: [QaService, QaResolver],
  exports: [QaService, MongooseModule],
})
export class QaModule {}
