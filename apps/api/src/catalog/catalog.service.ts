import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogGateway } from './catalog.gateway';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CatalogService {
  constructor(
    private prisma: PrismaService,
    private gateway: CatalogGateway,
    private notifications: NotificationsService,
  ) {}

  async create(supplierId: string, dto: any) {
    // If masterProductId is provided, we use the master product's details
    let item: any;
    if (dto.masterProductId) {
      const master = await this.prisma.masterProduct.findUnique({
        where: { id: dto.masterProductId }
      });
      if (!master) throw new NotFoundException('Master product template not found');

      item = await this.prisma.catalogItem.create({
        data: {
          supplierId,
          masterProductId: dto.masterProductId,
          price: dto.price,
          unit: dto.unit,
          stock: dto.stock,
          // Optional overrides, otherwise we'll pull from masterProduct on query
          name: master.name,
          category: master.category,
          description: master.description,
          imageUrl: master.imageUrl
        },
      });
    } else {
      item = await this.prisma.catalogItem.create({
        data: {
          ...dto,
          supplierId,
        },
      });
    }

    this.gateway.emitCatalogChanged({ action: 'created', itemId: item.id });
    return item;
  }

  async findAll(category?: string) {
    return this.prisma.catalogItem.findMany({
      where: {
        ...(category && { category }),
      },
      include: {
        masterProduct: true,
        supplier: {
          select: {
            id: true,
            phone: true,
            createdAt: true,
            supplierProfile: {
              select: {
                businessName: true,
                verificationStatus: true,
                storePhotos: true,
                createdAt: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findBySupplier(supplierId: string) {
    return this.prisma.catalogItem.findMany({
      where: { supplierId },
      include: { masterProduct: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllMasterProducts() {
    // Only APPROVED master products are visible in supplier/contractor pickers.
    return this.prisma.masterProduct.findMany({
      where: { status: 'APPROVED' },
      orderBy: { category: 'asc' },
    });
  }

  async createMasterProduct(dto: any) {
    // Admin-created entries are auto-approved.
    return this.prisma.masterProduct.create({
      data: {
        name: dto.name,
        category: dto.category,
        description: dto.description,
        imageUrl: dto.imageUrl,
        unit: dto.unit,
        status: 'APPROVED',
        reviewedAt: new Date(),
      },
    });
  }

  // ── Supplier-driven master-product proposals ──────────────────────────────
  async proposeMasterProduct(supplierId: string, dto: any) {
    const name = (dto.name || '').trim();
    const category = (dto.category || '').trim();
    if (!name) throw new BadRequestException('Product name is required');
    if (!category) throw new BadRequestException('Category is required');
    const created = await this.prisma.masterProduct.create({
      data: {
        name,
        category,
        description: dto.description?.trim() || null,
        imageUrl: dto.imageUrl || null,
        unit: dto.unit?.trim() || null,
        status: 'PENDING',
        submittedById: supplierId,
      },
    });
    // Notify all admins
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });
    await Promise.all(
      admins.map((a) =>
        this.notifications.create(
          a.id,
          'New product proposal',
          `A supplier proposed a new product "${name}" for review.`,
          'INFO',
        ).catch((err) => console.error('Notify admin failed:', err)),
      ),
    );
    return created;
  }

  async listMySubmissions(supplierId: string) {
    return this.prisma.masterProduct.findMany({
      where: { submittedById: supplierId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listPendingMasterProducts() {
    return this.prisma.masterProduct.findMany({
      where: { status: 'PENDING' },
      include: {
        submittedBy: {
          select: {
            id: true,
            email: true,
            phone: true,
            supplierProfile: { select: { businessName: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async approveMasterProduct(id: string) {
    const product = await this.prisma.masterProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Master product not found');
    if (product.status === 'APPROVED') return product;
    const updated = await this.prisma.masterProduct.update({
      where: { id },
      data: { status: 'APPROVED', rejectionReason: null, reviewedAt: new Date() },
    });
    if (product.submittedById) {
      await this.notifications.create(
        product.submittedById,
        'Product approved',
        `Your proposed product "${product.name}" was approved and is now in the catalog. Add price & stock to start selling.`,
        'SUCCESS',
      ).catch((err) => console.error('Notify supplier failed:', err));
    }
    return updated;
  }

  async rejectMasterProduct(id: string, reason?: string) {
    const product = await this.prisma.masterProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Master product not found');
    const trimmed = reason?.trim() || null;
    const updated = await this.prisma.masterProduct.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: trimmed, reviewedAt: new Date() },
    });
    if (product.submittedById) {
      await this.notifications.create(
        product.submittedById,
        'Product proposal rejected',
        trimmed
          ? `Your proposed product "${product.name}" was rejected. Reason: ${trimmed}`
          : `Your proposed product "${product.name}" was rejected.`,
        'WARNING',
      ).catch((err) => console.error('Notify supplier failed:', err));
    }
    return updated;
  }

  async updateMasterProduct(id: string, dto: any) {
    return this.prisma.masterProduct.update({
      where: { id },
      data: {
        name: dto.name,
        category: dto.category,
        description: dto.description,
        imageUrl: dto.imageUrl,
        unit: dto.unit,
      },
    });
  }

  async removeMasterProduct(id: string) {
    return this.prisma.masterProduct.delete({
      where: { id },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.catalogItem.findUnique({
      where: { id },
      include: {
        masterProduct: true,
        supplier: {
          select: {
            supplierProfile: true,
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Catalog item not found');
    return item;
  }

  async update(id: string, supplierId: string, dto: any) {
    const item = await this.prisma.catalogItem.findUnique({ where: { id } });
    if (!item || item.supplierId !== supplierId) {
      throw new NotFoundException('Catalog item not found or unauthorized');
    }

    const updated = await this.prisma.catalogItem.update({
      where: { id },
      data: dto,
    });
    this.gateway.emitCatalogChanged({ action: 'updated', itemId: id });
    return updated;
  }

  async remove(id: string, supplierId: string) {
    const item = await this.prisma.catalogItem.findUnique({ where: { id } });
    if (!item || item.supplierId !== supplierId) {
      throw new NotFoundException('Catalog item not found or unauthorized');
    }

    const deleted = await this.prisma.catalogItem.delete({ where: { id } });
    this.gateway.emitCatalogChanged({ action: 'deleted', itemId: id });
    return deleted;
  }
}
