import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlaceOrderDto } from './dto/place-order.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { CatalogGateway } from '../catalog/catalog.gateway';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private catalogGateway: CatalogGateway,
  ) {}

  async placeOrder(contractorId: string, dto: PlaceOrderDto) {
    try {
      // 1. Verify project (project-bound order) OR validate shipping (personal order)
      const isPersonal = !dto.projectId;
      const fulfillmentType = dto.fulfillmentType === 'PICKUP' ? 'PICKUP' : 'DELIVERY';
      if (isPersonal) {
        // For PICKUP personal orders we only need contact info; for DELIVERY we need the address.
        if (fulfillmentType === 'DELIVERY' && !dto.shippingAddress?.trim()) {
          throw new BadRequestException('Shipping address is required for personal deliveries');
        }
        if (!dto.recipientName?.trim() || !dto.recipientPhone?.trim()) {
          throw new BadRequestException('Recipient name and phone are required for personal purchases');
        }
      } else {
        const project = await this.prisma.project.findFirst({
          where: { id: dto.projectId, contractorId },
        });
        if (!project) throw new NotFoundException('Project not found');
      }

      // 2. Fetch catalog items to get current prices
      const uniqueCatalogItemIds = [...new Set(dto.items.map((i) => i.catalogItemId))];
      const catalogItems = await this.prisma.catalogItem.findMany({
        where: {
          id: { in: uniqueCatalogItemIds },
          supplierId: dto.supplierId,
        },
      });

      if (catalogItems.length !== uniqueCatalogItemIds.length) {
        throw new BadRequestException('Some items are unavailable or belong to a different supplier');
      }

      // 3. Calculate total amount
      let totalAmount = 0;
      const itemsData = dto.items.map((item) => {
        const catalogItem = catalogItems.find((ci) => ci.id === item.catalogItemId)!;
        const price = catalogItem.price;
        totalAmount += price * item.quantity;
        return {
          catalogItemId: item.catalogItemId,
          quantity: item.quantity,
          priceAtOrder: price,
        };
      });

      // 4. Fetch admins for conversation participants
      const admins = await this.prisma.user.findMany({
        where: { role: 'ADMIN', status: 'ACTIVE' },
        select: { id: true },
      });

      // 4b. Validate contractor-booked driver if provided
      if (dto.driverId) {
        const driver = await this.prisma.user.findFirst({
          where: { id: dto.driverId, role: 'DRIVER', status: 'ACTIVE' },
        });
        if (!driver) throw new BadRequestException('Driver not found or unavailable');
      }

      // 5. Create Order + Items + Escrow in a transaction
      const order = await this.prisma.$transaction(async (tx) => {
        const sharedParticipants: { userId: string; lastReadAt?: Date }[] = [
          { userId: contractorId, lastReadAt: new Date() },
          { userId: dto.supplierId },
        ];
        if (dto.driverId) sharedParticipants.push({ userId: dto.driverId });

        const order = await tx.order.create({
          data: {
            contractorId,
            supplierId: dto.supplierId,
            projectId: dto.projectId || null,
            shippingAddress: isPersonal ? (dto.shippingAddress?.trim() || null) : null,
            recipientName: isPersonal ? dto.recipientName?.trim() || null : null,
            recipientPhone: isPersonal ? dto.recipientPhone?.trim() || null : null,
            totalAmount,
            status: 'PENDING',
            escrowStatus: 'HELD',
            deliveryDate: dto.deliveryDate && !isNaN(new Date(dto.deliveryDate).getTime()) ? new Date(dto.deliveryDate) : null,
            deliveryType: dto.deliveryType || 'STANDARD',
            fulfillmentType,
            notes: dto.notes,
            driverId: dto.driverId || null,
            driverFee: dto.driverFee ?? null,
            bookedByContractor: !!dto.driverId,
            items: {
              create: itemsData,
            },
            escrowTx: {
              create: {
                amount: totalAmount,
                status: 'HELD',
              },
            },
            conversations: {
              create: [
                {
                  type: 'ORDER_SHARED',
                  participants: { create: sharedParticipants },
                },
                {
                  type: 'ORDER_PRIVATE_ADMIN_SUPPLIER',
                  participants: {
                    create: [
                      { userId: dto.supplierId },
                      ...admins
                        .filter((admin) => admin.id !== dto.supplierId)
                        .map((admin) => ({ userId: admin.id })),
                    ],
                  },
                },
              ],
            },
          },
          include: {
            items: true,
            escrowTx: true,
          },
        });

        // 6. Decrement stock for each ordered item
        for (const item of dto.items) {
          await tx.catalogItem.update({
            where: { id: item.catalogItemId },
            data: { stock: { decrement: item.quantity } },
          });
        }

        return order;
      }, {
        timeout: 10000 // Increase timeout for SQLite
      });

      // 7. Emit real-time stock updates globally to all connected clients
      const updatedItems = await this.prisma.catalogItem.findMany({
        where: { id: { in: dto.items.map(i => i.catalogItemId) } },
        select: { id: true, stock: true },
      });
      this.catalogGateway.emitGlobalStockUpdated(updatedItems);

      // 8. Notify parties (outside transaction for performance)
      this.notifications.create(
        dto.supplierId,
        'New Order Received',
        `A new order for GH₵${totalAmount} has been placed.`,
        'SUCCESS'
      ).catch(err => console.error('Failed to send notification:', err));

      if (dto.driverId) {
        this.notifications.create(
          dto.driverId,
          'New Delivery Booking',
          `A contractor has booked you for order #${order.id.slice(-8).toUpperCase()}. Agreed fee: GH₵${dto.driverFee ?? 0}.`,
          'INFO'
        ).catch(err => console.error('Failed to send driver notification:', err));
      }

      return order;
    } catch (err: any) {
      console.error('Order placement failed:', err);
      if (err instanceof NotFoundException || err instanceof BadRequestException) {
        throw err;
      }
      // Re-throw with more detail if possible
      throw new BadRequestException(`Order failed: ${err.message || 'Check logs'}`);
    }
  }

  async findOne(id: string, userId: string, role: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        contractor: { select: { contractorProfile: true } },
        supplier: { select: { supplierProfile: true } },
        project: true,
        items: { include: { catalogItem: true } },
        driver: { select: { driverProfile: true } },
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    const isParticipant =
      order.contractorId === userId ||
      order.supplierId === userId ||
      order.driverId === userId ||
      role === 'ADMIN';

    if (!isParticipant) throw new BadRequestException('Unauthorized access to order');

    return order;
  }

  async findForContractor(contractorId: string) {
    return this.prisma.order.findMany({
      where: { contractorId },
      include: {
        supplier: { select: { supplierProfile: true } },
        project: true,
        items: { include: { catalogItem: true } },
        driver: { select: { driverProfile: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findForSupplier(supplierId: string) {
    return this.prisma.order.findMany({
      where: { supplierId },
      include: {
        contractor: { select: { contractorProfile: true } },
        project: true,
        items: { include: { catalogItem: true } },
        driver: { select: { driverProfile: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findForDriver(driverId: string) {
    return this.prisma.order.findMany({
      where: { driverId },
      include: {
        contractor: { select: { contractorProfile: true } },
        supplier: { select: { supplierProfile: true } },
        project: true,
        items: { include: { catalogItem: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findForAdmin() {
    return this.prisma.order.findMany({
      include: {
        contractor: {
          include: {
            contractorProfile: true,
          },
        },
        supplier: {
          include: {
            supplierProfile: true,
          },
        },
        project: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async acceptOrder(supplierId: string, orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, supplierId },
      });
      if (!order) throw new NotFoundException('Order not found');
      if (order.status !== 'PENDING') throw new BadRequestException('Order already processed');

      // If contractor already booked a driver, skip straight to DISPATCHED
      const nextStatus = order.bookedByContractor ? 'DISPATCHED' : 'ACCEPTED';

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: nextStatus },
      });

      await this.notifications.create(
        order.contractorId,
        'Order Accepted',
        `Your order #${orderId.slice(-8).toUpperCase()} has been accepted by the supplier.`,
        'SUCCESS',
        tx
      );

      if (order.bookedByContractor && order.driverId) {
        await this.notifications.create(
          order.driverId,
          'Delivery Ready',
          `Order #${orderId.slice(-8).toUpperCase()} has been accepted by the supplier and is ready for pickup.`,
          'SUCCESS',
          tx
        );
      }

      return updated;
    }, {
      timeout: 10000 // Increase timeout for SQLite
    });
  }

  async assignDriver(supplierId: string, orderId: string, driverId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, supplierId },
        include: {
          conversations: {
            where: { type: 'ORDER_SHARED' },
            select: { id: true },
          },
        },
      });
      if (!order) throw new NotFoundException('Order not found');
      if (order.status !== 'ACCEPTED') {
        throw new BadRequestException('Only accepted orders can be dispatched');
      }

      const driver = await tx.user.findFirst({
        where: {
          id: driverId,
          role: 'DRIVER',
          status: 'ACTIVE',
          supplierDrivers: { some: { supplierId } },
        },
      });
      if (!driver) throw new NotFoundException('Driver not found in your fleet');

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          driverId,
          status: 'DISPATCHED',
        },
      });

      const sharedConversation = order.conversations[0];
      if (sharedConversation) {
        await tx.conversationParticipant.upsert({
          where: {
            conversationId_userId: {
              conversationId: sharedConversation.id,
              userId: driverId,
            },
          },
          update: {},
          create: {
            conversationId: sharedConversation.id,
            userId: driverId,
          },
        });
      }

      // Notify Contractor
      await this.notifications.create(
        order.contractorId,
        'Driver Assigned',
        `A driver has been assigned to your order #${orderId.slice(-8).toUpperCase()}.`,
        'INFO',
        tx
      );

      // Notify Driver
      await this.notifications.create(
        driverId,
        'New Delivery Task',
        `You have been assigned a new delivery for order #${orderId.slice(-8).toUpperCase()}.`,
        'SUCCESS',
        tx
      );

      return updated;
    }, {
      timeout: 10000 // Increase timeout for SQLite
    });
  }

  async driverUpdateStatus(driverId: string, orderId: string, status: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, driverId },
      });
      if (!order) throw new NotFoundException('Order not found or not assigned to you');

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status },
      });

      let message = '';
      if (status === 'DRIVER_ACCEPTED') message = `Driver accepted the delivery task for order #${orderId.slice(-8).toUpperCase()}.`;
      else if (status === 'IN_TRANSIT') message = `Your order #${orderId.slice(-8).toUpperCase()} is now in transit.`;
      else if (status === 'ARRIVED') message = `Driver has arrived at the location for order #${orderId.slice(-8).toUpperCase()}.`;

      if (message) {
        await this.notifications.create(order.contractorId, 'Delivery Update', message, 'INFO', tx);
        await this.notifications.create(order.supplierId, 'Delivery Update', message, 'INFO', tx);
      }

      return updated;
    }, {
      timeout: 10000
    });
  }

  async submitProofOfDelivery(driverId: string, orderId: string, podData: { photoUrl?: string; signatureUrl?: string; lat?: number; lng?: number; timestamp?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, driverId },
      });
      if (!order) throw new NotFoundException('Order not found or not assigned to you');

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { 
          status: 'DELIVERED',
          podPhotoUrl: podData.photoUrl,
          podSignatureUrl: podData.signatureUrl,
          podLat: podData.lat,
          podLng: podData.lng,
          podTimestamp: podData.timestamp ? new Date(podData.timestamp) : new Date(),
        },
      });

      // Notify all parties
      await this.notifications.create(
        order.contractorId,
        'Order Delivered',
        `Your order #${orderId.slice(-8).toUpperCase()} has been delivered. Please review the proof of delivery and release funds.`,
        'SUCCESS',
        tx
      );
      await this.notifications.create(
        order.supplierId,
        'Delivery Confirmed',
        `Delivery for order #${orderId.slice(-8).toUpperCase()} has been confirmed with proof of delivery.`,
        'INFO',
        tx
      );

      return updated;
    }, {
      timeout: 10000
    });
  }

  async confirmDelivery(userId: string, orderId: string, role: string, podData?: { podPhotoUrl?: string; podSignatureUrl?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const where: any = { id: orderId };
      if (role === 'DRIVER') where.driverId = userId;
      else if (role === 'CONTRACTOR') where.contractorId = userId;

      const order = await tx.order.findFirst({ where });
      if (!order) throw new NotFoundException('Order not found or unauthorized');

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { 
          status: 'DELIVERED',
          podPhotoUrl: podData?.podPhotoUrl,
          podSignatureUrl: podData?.podSignatureUrl
        },
      });

      // Notify all parties
      await this.notifications.create(
        order.contractorId,
        'Order Delivered',
        `Your order #${orderId.slice(-8).toUpperCase()} has been marked as delivered. Please release funds.`,
        'SUCCESS',
        tx
      );
      await this.notifications.create(
        order.supplierId,
        'Delivery Confirmed',
        `Delivery for order #${orderId.slice(-8).toUpperCase()} has been confirmed.`,
        'INFO',
        tx
      );

      return updated;
    }, {
      timeout: 10000
    });
  }

  async releaseFunds(contractorId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, contractorId },
      include: { escrowTx: true },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'DELIVERED' && order.status !== 'COMPLETED') {
      throw new BadRequestException('Funds can only be released after delivery');
    }
    if (order.escrowStatus !== 'HELD') {
      throw new BadRequestException('Funds already released or refunded');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.escrowTransaction.update({
        where: { orderId },
        data: { status: 'RELEASED' },
      });

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          escrowStatus: 'RELEASED',
          status: 'COMPLETED',
        },
      });

      // Notify Supplier
      await this.notifications.create(
        order.supplierId,
        'Funds Released',
        `Payment for order #${orderId.slice(-8).toUpperCase()} has been released to your account.`,
        'SUCCESS',
        tx
      );

      return updated;
    });
  }

  async getAvailableDrivers() {
    return this.prisma.user.findMany({
      where: { role: 'DRIVER', status: 'ACTIVE' },
      select: {
        id: true,
        phone: true,
        driverProfile: {
          select: { firstName: true, lastName: true, licenseNo: true, ratePerTrip: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async setDriverFee(driverId: string, orderId: string, fee: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, driverId },
    });
    if (!order) throw new NotFoundException('Order not found or not assigned to you');
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { driverFee: fee },
    });
    this.notifications.create(
      order.contractorId,
      'Driver Fee Updated',
      `The driver has set a delivery fee of GH₵${fee} for order #${orderId.slice(-8).toUpperCase()}.`,
      'INFO'
    ).catch(() => {});
    return updated;
  }

  async getAdminAnalytics() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [orders, users] = await Promise.all([
      this.prisma.order.findMany({
        include: {
          contractor: { select: { contractorProfile: true } },
          supplier: { select: { supplierProfile: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.findMany({
        select: { id: true, role: true, status: true, createdAt: true },
      }),
    ]);

    // Order status breakdown
    const statusCounts: Record<string, number> = {};
    for (const o of orders) {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    }

    const totalGMV = orders.reduce((s, o) => s + o.totalAmount, 0);
    const escrowHeld = orders.filter(o => o.escrowStatus === 'HELD').reduce((s, o) => s + o.totalAmount, 0);
    const escrowReleased = orders.filter(o => o.escrowStatus === 'RELEASED').reduce((s, o) => s + o.totalAmount, 0);
    const completedThisMonth = orders.filter(o => o.status === 'COMPLETED' && new Date(o.createdAt) >= startOfMonth).length;

    // 30-day daily trend
    const trendMap: Record<string, { count: number; volume: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      trendMap[key] = { count: 0, volume: 0 };
    }
    for (const o of orders) {
      const key = new Date(o.createdAt).toISOString().slice(0, 10);
      if (trendMap[key]) {
        trendMap[key].count++;
        trendMap[key].volume += o.totalAmount;
      }
    }
    const trend = Object.entries(trendMap).map(([date, v]) => ({ date, ...v }));

    // Users
    const contractors = users.filter(u => u.role === 'CONTRACTOR').length;
    const suppliers = users.filter(u => u.role === 'SUPPLIER').length;
    const drivers = users.filter(u => u.role === 'DRIVER').length;
    const newUsersThisMonth = users.filter(u => new Date(u.createdAt) >= startOfMonth).length;

    // Supplier verification breakdown
    const supplierProfiles = await this.prisma.supplierProfile.groupBy({
      by: ['verificationStatus'],
      _count: true,
    });
    const supplierVerification: Record<string, number> = {};
    for (const row of supplierProfiles) {
      supplierVerification[row.verificationStatus] = row._count;
    }

    // Top 5 contractors by spend
    const contractorSpend: Record<string, { name: string; totalSpend: number; orderCount: number }> = {};
    for (const o of orders) {
      const id = o.contractorId;
      const profile = (o.contractor as any)?.contractorProfile;
      const name = profile ? `${profile.firstName} ${profile.lastName}` : id.slice(-6);
      if (!contractorSpend[id]) contractorSpend[id] = { name, totalSpend: 0, orderCount: 0 };
      contractorSpend[id].totalSpend += o.totalAmount;
      contractorSpend[id].orderCount++;
    }
    const topContractors = Object.values(contractorSpend)
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 5);

    // Top 5 suppliers by revenue
    const supplierRevenue: Record<string, { name: string; totalRevenue: number; orderCount: number }> = {};
    for (const o of orders) {
      const id = o.supplierId;
      const profile = (o.supplier as any)?.supplierProfile;
      const name = profile?.businessName || id.slice(-6);
      if (!supplierRevenue[id]) supplierRevenue[id] = { name, totalRevenue: 0, orderCount: 0 };
      supplierRevenue[id].totalRevenue += o.totalAmount;
      supplierRevenue[id].orderCount++;
    }
    const topSuppliers = Object.values(supplierRevenue)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 5);

    // Recent 10 orders for feed
    const recentOrders = orders.slice(0, 10).map(o => ({
      id: o.id,
      status: o.status,
      totalAmount: o.totalAmount,
      escrowStatus: o.escrowStatus,
      createdAt: o.createdAt,
      contractorName: (() => {
        const p = (o.contractor as any)?.contractorProfile;
        return p ? `${p.firstName} ${p.lastName}` : '—';
      })(),
      supplierName: (o.supplier as any)?.supplierProfile?.businessName || '—',
    }));

    return {
      orders: {
        total: orders.length,
        byStatus: statusCounts,
        totalGMV,
        escrowHeld,
        escrowReleased,
        completedThisMonth,
        trend,
      },
      users: {
        total: users.length,
        contractors,
        suppliers,
        drivers,
        newThisMonth: newUsersThisMonth,
      },
      supplierVerification,
      topContractors,
      topSuppliers,
      recentOrders,
    };
  }

  async getSupplierStats(supplierId: string) {
    const orders = await this.prisma.order.findMany({
      where: { supplierId },
      include: { escrowTx: true },
    });

    const totalEarned = orders
      .filter((o) => o.escrowStatus === 'RELEASED')
      .reduce((sum, o) => sum + o.totalAmount, 0);

    const pendingEscrow = orders
      .filter((o) => o.escrowStatus === 'HELD')
      .reduce((sum, o) => sum + o.totalAmount, 0);

    const completedCount = orders.filter((o) => o.status === 'COMPLETED').length;
    const activeCount = orders.filter((o) => !['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(o.status)).length;

    return {
      totalEarned,
      pendingEscrow,
      completedCount,
      activeCount,
      recentTransactions: orders
        .filter(o => o.escrowStatus !== 'REFUNDED')
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 10)
    };
  }
}
