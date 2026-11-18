import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { ModerationResolver } from './moderation.resolver';
import { ModerationService } from './moderation.service';
import {
  AuditoriaLog,
  AuditoriaLogSchema,
  Notificacion,
  NotificacionSchema,
  Reporte,
  ReporteSchema,
} from './schemas/moderation.schema';

@Global()
@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: Reporte.name, schema: ReporteSchema },
      { name: AuditoriaLog.name, schema: AuditoriaLogSchema },
      { name: Notificacion.name, schema: NotificacionSchema },
    ]),
  ],
  providers: [ModerationService, ModerationResolver],
  exports: [ModerationService, MongooseModule],
})
export class ModerationModule {}
