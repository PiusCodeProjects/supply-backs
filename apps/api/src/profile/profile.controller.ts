import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProfileService } from './profile.service';
import { JwtPayload } from '@cscp/types';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private profileService: ProfileService) {}

  @Get()
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.profileService.getProfile(user.sub);
  }

  @Patch()
  updateProfile(@CurrentUser() user: JwtPayload, @Body() body: any) {
    switch (user.role) {
      case 'CONTRACTOR':
        return this.profileService.updateContractorProfile(user.sub, body);
      case 'SUPPLIER':
        return this.profileService.updateSupplierProfile(user.sub, body);
      case 'DRIVER':
        return this.profileService.updateDriverProfile(user.sub, body);
      default:
        return { message: 'No profile update available for this role' };
    }
  }
}
