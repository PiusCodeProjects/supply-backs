import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testDuplicateItems() {
  const contractor = await prisma.user.findFirst({ where: { role: 'CONTRACTOR' } });
  const supplier = await prisma.user.findFirst({ where: { role: 'SUPPLIER' } });
  const project = await prisma.project.findFirst({ where: { contractorId: contractor?.id } });
  const catalogItem = await prisma.catalogItem.findFirst({ where: { supplierId: supplier?.id } });

  if (!contractor || !supplier || !project || !catalogItem) {
    console.error('Missing test data');
    return;
  }

  try {
    const dto = {
      projectId: project.id,
      supplierId: supplier.id,
      items: [
        { catalogItemId: catalogItem.id, quantity: 10 },
        { catalogItemId: catalogItem.id, quantity: 20 } // Duplicate catalogItemId
      ],
      deliveryDate: new Date().toISOString(),
      deliveryType: 'STANDARD',
    };

    // Simulate placeOrder
    const uniqueCatalogItemIds = [...new Set(dto.items.map((i) => i.catalogItemId))];
    const catalogItems = await prisma.catalogItem.findMany({
      where: { id: { in: uniqueCatalogItemIds }, supplierId: dto.supplierId },
    });

    if (catalogItems.length !== uniqueCatalogItemIds.length) {
      throw new Error('Validation failed');
    }

    let totalAmount = 0;
    const itemsData = dto.items.map((item) => {
      const ci = catalogItems.find((c) => c.id === item.catalogItemId)!;
      totalAmount += ci.price * item.quantity;
      return { catalogItemId: item.catalogItemId, quantity: item.quantity, priceAtOrder: ci.price };
    });

    const order = await prisma.order.create({
      data: {
        contractorId: contractor.id,
        supplierId: dto.supplierId,
        projectId: dto.projectId,
        totalAmount,
        items: { create: itemsData },
        escrowTx: { create: { amount: totalAmount, status: 'HELD' } },
        conversations: {
          create: [{ type: 'ORDER_SHARED', participants: { create: [{ userId: contractor.id }, { userId: dto.supplierId }] } }]
        }
      }
    });

    console.log('Order with duplicates created successfully:', order.id);
  } catch (err) {
    console.error('Order creation FAILED:', err);
  } finally {
    await prisma.$disconnect();
  }
}

testDuplicateItems();
