const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function setupTestUser() {
  const email = 'test@contractor.com';
  const password = 'Test@1234!';
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      isVerified: true,
      status: 'ACTIVE'
    },
    create: {
      email,
      phone: '+1234567890',
      passwordHash,
      role: 'CONTRACTOR',
      status: 'ACTIVE',
      isVerified: true,
      contractorProfile: {
        create: {
          firstName: 'Test',
          lastName: 'Contractor',
          company: 'Test Build Ltd'
        }
      }
    }
  });

  console.log(`✅ Test contractor setup: ${email} / ${password}`);
  await prisma.$disconnect();
}

setupTestUser();
