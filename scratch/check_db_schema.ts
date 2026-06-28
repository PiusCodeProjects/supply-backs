import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // @ts-ignore
  const result = await prisma.$queryRaw`PRAGMA table_info(orders);`;
  console.log(result);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
