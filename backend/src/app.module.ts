import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { AcademicModule } from './academic/academic.module';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { GqlThrottlerGuard } from './common/guards/gql-throttler.guard';
import { ContentSecurityPipe } from './common/security/content-security.pipe';
import { ContentSecurityService } from './common/security/content-security.service';
import { GamificationModule } from './gamification/gamification.module';
import { MailModule } from './mail/mail.module';
import { ModerationModule } from './moderation/moderation.module';
import { QaModule } from './qa/qa.module';
import { ResourcesModule } from './resources/resources.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: process.env.NODE_ENV === 'production' ? 180 : 600,
      },
    ]),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri:
          configService.get<string>('MONGODB_URI') ||
          'mongodb://localhost:27017/kolab',
      }),
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: process.env.NODE_ENV !== 'production',
      introspection: process.env.NODE_ENV !== 'production',
      context: ({ req, res }) => ({ req, res }),
    }),
    MailModule,
    UsersModule,
    AuthModule,
    AcademicModule,
    GamificationModule,
    ModerationModule,
    ResourcesModule,
    QaModule,
    AiModule,
    CollaborationModule,
  ],
  providers: [
    ContentSecurityService,
    {
      provide: APP_GUARD,
      useClass: GqlThrottlerGuard,
    },
    {
      provide: APP_PIPE,
      useClass: ContentSecurityPipe,
    },
  ],
})
export class AppModule {}
