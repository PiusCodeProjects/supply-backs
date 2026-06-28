 import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(role?: string, status?: string) {
    return this.prisma.user.findMany({
      where: {
        ...(role && { role: role as any }),
        ...(status && { status: status as any }),
      },
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
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
        contractorProfile: true,
        supplierProfile: true,
        driverProfile: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateStatus(id: string, status: 'ACTIVE' | 'SUSPENDED') {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'ADMIN') {
      throw new BadRequestException('Cannot change admin status');
    }
    return this.prisma.user.update({
      where: { id },
      data: { status },
      select: { id: true, status: true, role: true },
    });
  }

  async adminUpdateUser(id: string, dto: { email?: string; phone?: string; role?: string; status?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'ADMIN' && ((dto.role && dto.role !== 'ADMIN') || dto.status === 'SUSPENDED')) {
      throw new BadRequestException('Cannot suspend or demote an admin account');
    }
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: { id: true, email: true, phone: true, role: true, status: true },
    });
  }

  async verifySupplier(
    supplierId: string,
    action: 'APPROVED' | 'REJECTED',
    rejectionReason?: string,
  ) {
    const profile = await this.prisma.supplierProfile.findFirst({
      where: { userId: supplierId },
    });
    if (!profile) throw new NotFoundException('Supplier profile not found');

    // Update supplier profile verification status
    await this.prisma.supplierProfile.update({
      where: { id: profile.id },
      data: {
        verificationStatus: action,
        rejectionReason: action === 'REJECTED' ? rejectionReason : null,
      },
    });

    // If approved, activate the user account
    if (action === 'APPROVED') {
      await this.prisma.user.update({
        where: { id: supplierId },
        data: { status: 'ACTIVE' },
      });
    }

    return { message: `Supplier ${action.toLowerCase()} successfully` };
  }

  async getPendingSuppliers() {
    return this.prisma.user.findMany({
      where: {
        role: 'SUPPLIER',
        supplierProfile: { verificationStatus: 'PENDING' },
      },
      select: {
        id: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        supplierProfile: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getSupplierFleet(supplierId: string) {
    return this.prisma.user.findMany({
      where: {
        role: 'DRIVER',
        supplierDrivers: { some: { supplierId } },
      },
      select: {
        id: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        driverProfile: true,
        driverOrders: {
          where: {
            status: { in: ['ACCEPTED', 'DRIVER_ACCEPTED', 'IN_TRANSIT', 'ARRIVED'] },
          },
          select: {
            id: true,
            status: true,
            project: { select: { name: true, location: true, lat: true, lng: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async removeDriver(supplierId: string, driverId: string) {
    const linkage = await this.prisma.supplierDriver.findUnique({
      where: { supplierId_driverId: { supplierId, driverId } },
      include: {
        driver: {
          include: {
            driverOrders: {
              where: {
                status: { in: ['ACCEPTED', 'DRIVER_ACCEPTED', 'IN_TRANSIT', 'ARRIVED'] },
              },
            },
          },
        },
      },
    });

    if (!linkage) throw new NotFoundException('Driver not found in your fleet');

    if (linkage.driver.driverOrders.length > 0) {
      throw new BadRequestException(
        'Cannot remove driver with active missions. Complete or reassign missions first.',
      );
    }

    // Unlink driver from this supplier
    return this.prisma.supplierDriver.delete({
      where: { id: linkage.id },
    });
  }

  async updateProfile(userId: string, dto: { businessName?: string; email?: string; phone?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { supplierProfile: true }
    });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.$transaction(async (tx) => {
      // 1. Update User fields (email/phone)
      const userData: any = {};
      if (dto.email) userData.email = dto.email;
      if (dto.phone) userData.phone = dto.phone;

      if (Object.keys(userData).length > 0) {
        await tx.user.update({
          where: { id: userId },
          data: userData
        });
      }

      // 2. Update Supplier Profile fields
      if (dto.businessName && user.supplierProfile) {
        await tx.supplierProfile.update({
          where: { id: user.supplierProfile.id },
          data: { businessName: dto.businessName }
        });
      }

      return this.findOne(userId);
    });
  }
}
