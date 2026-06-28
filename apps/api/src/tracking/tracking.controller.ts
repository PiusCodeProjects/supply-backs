import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TrackingService } from './tracking.service';

@Controller('tracking')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TrackingController {
  constructor(private trackingService: TrackingService) {}

  @Get('orders/:orderId/latest')
  @Roles('CONTRACTOR', 'SUPPLIER', 'DRIVER', 'ADMIN')
  getLatest(@Param('orderId') orderId: string) {
    return this.trackingService.getLatestLocation(orderId);
  }

  @Get('orders/:orderId/history')
  @Roles('CONTRACTOR', 'SUPPLIER', 'DRIVER', 'ADMIN')
  getHistory(@Param('orderId') orderId: string) {
    return this.trackingService.getLocationHistory(orderId);
  }
}
