import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Rounding all prices and amounts to integers...');

  // 1. Update Catalog Items
  const items = await prisma.catalogItem.findMany();
  for (const item of items) {
    await prisma.catalogItem.update({
      where: { id: item.id },
      data: { price: Math.round(item.price) }
    });
  }
  console.log(`✅ Updated ${items.length} catalog items.`);

  // 2. Update Order Items
  const orderItems = await prisma.orderItem.findMany();
  for (const oi of orderItems) {
    await prisma.orderItem.update({
      where: { id: oi.id },
      data: { priceAtOrder: Math.round(oi.priceAtOrder) }
    });
  }
  console.log(`✅ Updated ${orderItems.length} order items.`);

  // 3. Update Orders (totalAmount)
  const orders = await prisma.order.findMany();
  for (const order of orders) {
    await prisma.order.update({
      where: { id: order.id },
      data: { totalAmount: Math.round(order.totalAmount) }
    });
  }
  console.log(`✅ Updated ${orders.length} orders.`);

  console.log('🏁 Database update complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
