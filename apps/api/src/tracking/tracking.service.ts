import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TrackingService {
  constructor(private prisma: PrismaService) {}

  async updateLocation(orderId: string, lat: number, lng: number) {
    return this.prisma.orderLocation.create({
      data: {
        orderId,
        lat,
        lng,
      },
    });
  }

  async getLatestLocation(orderId: string) {
    return this.prisma.orderLocation.findFirst({
      where: { orderId },
      orderBy: { timestamp: 'desc' },
    });
  }

  async getLocationHistory(orderId: string) {
    return this.prisma.orderLocation.findMany({
      where: { orderId },
      orderBy: { timestamp: 'asc' },
    });
  }
}
