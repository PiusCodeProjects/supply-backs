import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProfileService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        isVerified: true,
        createdAt: true,
        contractorProfile: true,
        supplierProfile: true,
        driverProfile: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateContractorProfile(
    userId: string,
    data: { firstName?: string; lastName?: string; company?: string },
  ) {
    return this.prisma.contractorProfile.update({
      where: { userId },
      data,
    });
  }

  async updateSupplierProfile(
    userId: string,
    data: { businessName?: string },
  ) {
    return this.prisma.supplierProfile.update({
      where: { userId },
      data,
    });
  }

  async updateDriverProfile(
    userId: string,
    data: { firstName?: string; lastName?: string; licenseNo?: string; ratePerTrip?: number },
  ) {
    return this.prisma.driverProfile.update({
      where: { userId },
      data,
    });
  }
}
