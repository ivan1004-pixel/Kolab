import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AcademicModule } from '../academic/academic.module';
import { QaModule } from '../qa/qa.module';
import { ResourcesModule } from '../resources/resources.module';
import { AiResolver } from './ai.resolver';
import { GeminiService } from './gemini.service';
import {
  AiConfig,
  AiConfigSchema,
  ConsultaIa,
  ConsultaIaSchema,
  Cuestionario,
  CuestionarioSchema,
  IntentoCuestionario,
  IntentoCuestionarioSchema,
} from './schemas/ai.schema';

@Module({
  imports: [
    ResourcesModule,
    AcademicModule,
    QaModule,
    MongooseModule.forFeature([
      { name: ConsultaIa.name, schema: ConsultaIaSchema },
      { name: Cuestionario.name, schema: CuestionarioSchema },
      { name: IntentoCuestionario.name, schema: IntentoCuestionarioSchema },
      { name: AiConfig.name, schema: AiConfigSchema },
    ]),
  ],
  providers: [GeminiService, AiResolver],
  exports: [GeminiService, MongooseModule],
})
export class AiModule {}
