import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagingController } from './messaging.controller';
import { MessagingGateway } from './messaging.gateway';
import { MessagingService } from './messaging.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MessagingController],
  providers: [MessagingService, MessagingGateway, WsJwtGuard],
  exports: [MessagingService],
})
export class MessagingModule {}
