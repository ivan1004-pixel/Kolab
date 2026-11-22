import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Recurso, RecursoSchema } from '../resources/schemas/recurso.schema';
import { AcademicResolver } from './academic.resolver';
import { AcademicService } from './academic.service';
import {
  Asignatura,
  AsignaturaSchema,
  CalendarioEvento,
  CalendarioEventoSchema,
  Carrera,
  CarreraSchema,
  Tema,
  TemaSchema,
} from './schemas/academic.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Carrera.name, schema: CarreraSchema },
      { name: Asignatura.name, schema: AsignaturaSchema },
      { name: Tema.name, schema: TemaSchema },
      { name: CalendarioEvento.name, schema: CalendarioEventoSchema },
      { name: Recurso.name, schema: RecursoSchema },
    ]),
  ],
  providers: [AcademicService, AcademicResolver],
  exports: [AcademicService, MongooseModule],
})
export class AcademicModule {}
