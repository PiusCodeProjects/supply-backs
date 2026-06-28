import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async create(contractorId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        name: dto.name,
        location: dto.location,
        contractorId,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        estimatedDuration: dto.estimatedDuration,
        projectType: dto.projectType,
        budget: dto.budget,
        lat: dto.lat,
        lng: dto.lng,
      },
    });
  }

  async findAll(contractorId: string) {
    return this.prisma.project.findMany({
      where: { contractorId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { 
            orders: true,
            requirements: true,
          },
        },
      },
    });
  }

  async findOne(id: string, contractorId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, contractorId },
      include: {
        requirements: true,
        orders: {
          include: {
            supplier: {
              select: { supplierProfile: true },
            },
            items: {
              include: {
                catalogItem: {
                  select: { id: true, name: true, unit: true, masterProductId: true },
                },
              },
            },
          },
        },
      },
    });

    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async setRequirements(id: string, contractorId: string, requirements: any[]) {
    const project = await this.findOne(id, contractorId);
    
    // Simple sync: delete existing and create new
    return this.prisma.$transaction(async (tx) => {
      await tx.projectRequirement.deleteMany({
        where: { projectId: id },
      });

      return tx.project.update({
        where: { id },
        data: {
          requirements: {
            create: requirements.map(r => ({
              materialName: r.materialName,
              quantityNeeded: r.quantityNeeded,
              unit: r.unit,
              priority: r.priority || 'MEDIUM',
              neededBy: r.neededBy ? new Date(r.neededBy) : null,
            })),
          },
        },
        include: { requirements: true },
      });
    });
  }

  async update(id: string, contractorId: string, dto: Partial<CreateProjectDto>) {
    const project = await this.findOne(id, contractorId);
    const data: any = { ...dto };
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    
    return this.prisma.project.update({
      where: { id: project.id },
      data,
    });
  }
}
