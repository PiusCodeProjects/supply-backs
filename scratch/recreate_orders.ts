import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const contractorId = "cmopnfxf70000ikqxyjp18uhs";
  const projectId = "cmopnfxf70002ikqxfjrb5bk8";
  
  const falconId = "cmopnfv28000m9nggxyxy6kgh";
  const globalId = "cmopnfuzq00009nggwtbvv77u";

  // Recreate Falcon Order
  const falconOrder = await prisma.order.create({
    data: {
      id: "order_falcon_007X69Y2",
      contractorId,
      supplierId: falconId,
      projectId,
      totalAmount: 2324,
      status: 'PENDING',
      escrowStatus: 'HELD',
      items: {
        create: [
          {
            catalogItemId: "cmopnfv2n000r9nggqjfv5cuq", // Red Clay Bricks
            quantity: 9,
            priceAtOrder: 250
          },
          {
            catalogItemId: "cmopnfv2g000p9ngglnxjq3z9", // Quarry Dust
            quantity: 2,
            priceAtOrder: 37
          }
        ]
      },
      escrowTx: {
        create: {
          amount: 2324,
          status: 'HELD'
        }
      }
    }
  });

  // Recreate Global Order
  const globalOrder = await prisma.order.create({
    data: {
      id: "order_global_W09Z9Z0V",
      contractorId,
      supplierId: globalId,
      projectId,
      totalAmount: 550,
      status: 'PENDING',
      escrowStatus: 'HELD',
      items: {
        create: [
          {
            catalogItemId: "cmoqvc4fu0001v0vj93pfzy61", // Red Clay Bricks (Global)
            quantity: 90,
            priceAtOrder: 6
          },
          {
            catalogItemId: "cmopnfv0500039ngg64uhxqpn", // Cement
            quantity: 1,
            priceAtOrder: 10
          }
        ]
      },
      escrowTx: {
        create: {
          amount: 550,
          status: 'HELD'
        }
      }
    }
  });

  console.log('Orders recreated successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
