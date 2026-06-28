import { Module } from '@nestjs/common';
import { TrackingService } from './tracking.service';
import { TrackingGateway } from './tracking.gateway';
import { TrackingController } from './tracking.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [TrackingController],
  providers: [TrackingService, TrackingGateway, WsJwtGuard],
  exports: [TrackingService],
})
export class TrackingModule {}
