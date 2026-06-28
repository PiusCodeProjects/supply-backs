import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const contractorId = "cmopnfxf70000ikqxyjp18uhs";
  const falconId = "cmopnfv28000m9nggxyxy6kgh";
  const globalId = "cmopnfuzq00009nggwtbvv77u";

  const orders = await prisma.order.findMany();
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', status: 'ACTIVE' },
    select: { id: true },
  });

  for (const order of orders) {
    console.log(`Fixing conversations for order ${order.id}...`);
    
    // Check if shared conversation already exists
    const existingShared = await prisma.conversation.findFirst({
      where: { orderId: order.id, type: 'ORDER_SHARED' }
    });

    if (!existingShared) {
      await prisma.conversation.create({
        data: {
          orderId: order.id,
          type: 'ORDER_SHARED',
          participants: {
            create: [
              { userId: order.contractorId, lastReadAt: new Date() },
              { userId: order.supplierId },
            ],
          },
        }
      });
      console.log(`  - Created ORDER_SHARED`);
    }

    // Check if private admin-supplier conversation exists
    const existingAdmin = await prisma.conversation.findFirst({
      where: { orderId: order.id, type: 'ORDER_PRIVATE_ADMIN_SUPPLIER' }
    });

    if (!existingAdmin) {
      await prisma.conversation.create({
        data: {
          orderId: order.id,
          type: 'ORDER_PRIVATE_ADMIN_SUPPLIER',
          participants: {
            create: [
              { userId: order.supplierId },
              ...admins
                .filter((admin) => admin.id !== order.supplierId)
                .map((admin) => ({ userId: admin.id })),
            ],
          },
        }
      });
      console.log(`  - Created ORDER_PRIVATE_ADMIN_SUPPLIER`);
    }
  }

  console.log('Conversations fixed successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
