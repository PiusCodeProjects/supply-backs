import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.order.findMany({
    include: {
      supplier: {
        select: {
          id: true,
          email: true,
          phone: true,
          supplierProfile: {
            select: {
              businessName: true
            }
          }
        }
      }
    }
  });
  console.log(JSON.stringify(orders, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
