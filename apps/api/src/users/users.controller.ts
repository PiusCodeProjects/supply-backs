import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UsersService } from './users.service';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

class UpdateStatusDto {
  @IsString()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status: 'ACTIVE' | 'SUSPENDED';
}

class AdminUpdateUserDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

class VerifySupplierDto {
  @IsString()
  @IsIn(['APPROVED', 'REJECTED'])
  action: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles('ADMIN', 'SUPPLIER')
  findAll(@Query('role') role?: string, @Query('status') status?: string) {
    return this.usersService.findAll(role, status);
  }

  @Get('suppliers/pending')
  @Roles('ADMIN')
  getPendingSuppliers() {
    return this.usersService.getPendingSuppliers();
  }

  @Get('fleet/my-drivers')
  @Roles('SUPPLIER')
  getSupplierFleet(@CurrentUser() user: any) {
    return this.usersService.getSupplierFleet(user.sub);
  }

  @Get('me')
  @Roles('ADMIN', 'SUPPLIER', 'CONTRACTOR', 'DRIVER')
  getMe(@CurrentUser() user: any) {
    return this.usersService.findOne(user.sub);
  }

  @Patch('profile')
  @Roles('SUPPLIER', 'CONTRACTOR', 'DRIVER')
  updateProfile(@CurrentUser() user: any, @Body() dto: any) {
    return this.usersService.updateProfile(user.sub, dto);
  }

  @Get(':id')
  @Roles('ADMIN')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  adminUpdateUser(@Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
    return this.usersService.adminUpdateUser(id, dto);
  }

  @Patch(':id/status')
  @Roles('ADMIN')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.usersService.updateStatus(id, dto.status);
  }

  @Patch(':id/verify-supplier')
  @Roles('ADMIN')
  verifySupplier(@Param('id') id: string, @Body() dto: VerifySupplierDto) {
    return this.usersService.verifySupplier(id, dto.action, dto.rejectionReason);
  }

  @Delete('fleet/drivers/:id')
  @Roles('SUPPLIER')
  removeDriver(@Param('id') id: string, @CurrentUser() user: any) {
    return this.usersService.removeDriver(user.sub, id);
  }
}
