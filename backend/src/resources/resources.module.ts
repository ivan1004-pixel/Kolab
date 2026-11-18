import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ResourcesResolver } from './resources.resolver';
import { ResourcesService } from './resources.service';
import {
  ColeccionPersonal,
  ColeccionPersonalSchema,
  Recurso,
  RecursoSchema,
} from './schemas/recurso.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Recurso.name, schema: RecursoSchema },
      { name: ColeccionPersonal.name, schema: ColeccionPersonalSchema },
    ]),
  ],
  providers: [ResourcesService, ResourcesResolver],
  exports: [ResourcesService, MongooseModule],
})
export class ResourcesModule {}
