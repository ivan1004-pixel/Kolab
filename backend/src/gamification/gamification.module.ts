import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { GamificationResolver } from './gamification.resolver';
import { GamificationService } from './gamification.service';
import {
  Insignia,
  InsigniaSchema,
  RetoComunitario,
  RetoComunitarioSchema,
  UsuarioInsignia,
  UsuarioInsigniaSchema,
} from './schemas/gamification.schema';

@Global()
@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: Insignia.name, schema: InsigniaSchema },
      { name: UsuarioInsignia.name, schema: UsuarioInsigniaSchema },
      { name: RetoComunitario.name, schema: RetoComunitarioSchema },
    ]),
  ],
  providers: [GamificationService, GamificationResolver],
  exports: [GamificationService, MongooseModule],
})
export class GamificationModule {}
