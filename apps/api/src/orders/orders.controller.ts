import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '@cscp/types';
import { OrdersService } from './orders.service';
import { PlaceOrderDto } from './dto/place-order.dto';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post()
  @Roles('CONTRACTOR')
  placeOrder(@CurrentUser() user: JwtPayload, @Body() dto: PlaceOrderDto) {
    return this.ordersService.placeOrder(user.sub, dto);
  }

  @Get('contractor')
  @Roles('CONTRACTOR')
  findForContractor(@CurrentUser() user: JwtPayload) {
    return this.ordersService.findForContractor(user.sub);
  }

  @Get('supplier')
  @Roles('SUPPLIER')
  findForSupplier(@CurrentUser() user: JwtPayload) {
    return this.ordersService.findForSupplier(user.sub);
  }
  
  @Get('supplier/stats')
  @Roles('SUPPLIER')
  getSupplierStats(@CurrentUser() user: JwtPayload) {
    return this.ordersService.getSupplierStats(user.sub);
  }

  @Get('driver')
  @Roles('DRIVER')
  findForDriver(@CurrentUser() user: JwtPayload) {
    return this.ordersService.findForDriver(user.sub);
  }

  @Get('admin')
  @Roles('ADMIN')
  findForAdmin() {
    return this.ordersService.findForAdmin();
  }

  @Get('admin/analytics')
  @Roles('ADMIN')
  getAdminAnalytics() {
    return this.ordersService.getAdminAnalytics();
  }

  @Get('drivers')
  @Roles('CONTRACTOR')
  getAvailableDrivers() {
    return this.ordersService.getAvailableDrivers();
  }

  @Get(':id')
  @Roles('CONTRACTOR', 'SUPPLIER', 'DRIVER', 'ADMIN')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.ordersService.findOne(id, user.sub, user.role);
  }

  @Patch(':id/accept')
  @Roles('SUPPLIER')
  acceptOrder(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.ordersService.acceptOrder(user.sub, id);
  }

  @Patch(':id/assign-driver')
  @Roles('SUPPLIER')
  assignDriver(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('driverId') driverId: string,
  ) {
    return this.ordersService.assignDriver(user.sub, id, driverId);
  }

  @Patch(':id/driver-accept')
  @Roles('DRIVER')
  driverAcceptOrder(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.ordersService.driverUpdateStatus(user.sub, id, 'DRIVER_ACCEPTED');
  }

  @Patch(':id/driver-start-trip')
  @Roles('DRIVER')
  driverStartTrip(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.ordersService.driverUpdateStatus(user.sub, id, 'IN_TRANSIT');
  }

  @Patch(':id/driver-arrive')
  @Roles('DRIVER')
  driverArrive(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.ordersService.driverUpdateStatus(user.sub, id, 'ARRIVED');
  }

  @Patch(':id/driver-submit-pod')
  @Roles('DRIVER')
  driverSubmitPod(
    @CurrentUser() user: JwtPayload, 
    @Param('id') id: string,
    @Body() podData: { photoUrl?: string; signatureUrl?: string; lat?: number; lng?: number; timestamp?: string }
  ) {
    return this.ordersService.submitProofOfDelivery(user.sub, id, podData);
  }

  @Patch(':id/confirm-delivery')
  @Roles('DRIVER', 'CONTRACTOR')
  confirmDelivery(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() podData: { podPhotoUrl?: string; podSignatureUrl?: string },
  ) {
    return this.ordersService.confirmDelivery(user.sub, id, user.role, podData);
  }

  @Patch(':id/set-driver-fee')
  @Roles('DRIVER')
  setDriverFee(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('fee') fee: number,
  ) {
    return this.ordersService.setDriverFee(user.sub, id, fee);
  }

  @Patch(':id/release-funds')
  @Roles('CONTRACTOR')
  releaseFunds(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.ordersService.releaseFunds(user.sub, id);
  }
}
