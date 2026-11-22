import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { ResourcesResolver } from './resources.resolver';
import { ResourcesService } from './resources.service';
import { UploadsController } from './uploads.controller';
import {
  ColeccionPersonal,
  ColeccionPersonalSchema,
  Recurso,
  RecursoSchema,
} from './schemas/recurso.schema';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: Recurso.name, schema: RecursoSchema },
      { name: ColeccionPersonal.name, schema: ColeccionPersonalSchema },
    ]),
  ],
  controllers: [UploadsController],
  providers: [ResourcesService, ResourcesResolver],
  exports: [ResourcesService, MongooseModule],
})
export class ResourcesModule {}
