const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const contractorId = 'cmopnfxf70000ikqxyjp18uhs'; // John Doe
  const projects = await prisma.project.findMany({
    where: { contractorId }
  });
  console.log('Projects for John Doe:', JSON.stringify(projects, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
