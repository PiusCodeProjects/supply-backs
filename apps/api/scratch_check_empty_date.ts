import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testEmptyDate() {
  const contractor = await prisma.user.findFirst({ where: { role: 'CONTRACTOR' } });
  const supplier = await prisma.user.findFirst({ where: { role: 'SUPPLIER' } });
  const project = await prisma.project.findFirst({ where: { contractorId: contractor?.id } });
  const catalogItem = await prisma.catalogItem.findFirst({ where: { supplierId: supplier?.id } });

  if (!contractor || !supplier || !project || !catalogItem) {
    console.error('Missing test data');
    return;
  }

  try {
    const deliveryDate = ""; // Empty string
    
    // Simulate PlaceOrder logic
    const orderDate = deliveryDate && !isNaN(new Date(deliveryDate).getTime()) ? new Date(deliveryDate) : null;
    
    console.log('Processed date:', orderDate);

    const order = await prisma.order.create({
      data: {
        contractorId: contractor.id,
        supplierId: supplier.id,
        projectId: project.id,
        totalAmount: 100,
        deliveryDate: orderDate,
        status: 'PENDING'
      }
    });

    console.log('Order created successfully with empty date:', order.id);
  } catch (err) {
    console.error('Order creation FAILED:', err);
  } finally {
    await prisma.$disconnect();
  }
}

testEmptyDate();
