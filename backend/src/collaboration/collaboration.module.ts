import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CollaborationResolver } from './collaboration.resolver';
import { CollaborationService } from './collaboration.service';
import {
  GrupoEstudio,
  GrupoEstudioSchema,
  SolicitudTutoria,
  SolicitudTutoriaSchema,
} from './schemas/collaboration.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GrupoEstudio.name, schema: GrupoEstudioSchema },
      { name: SolicitudTutoria.name, schema: SolicitudTutoriaSchema },
    ]),
  ],
  providers: [CollaborationService, CollaborationResolver],
  exports: [CollaborationService, MongooseModule],
})
export class CollaborationModule {}
