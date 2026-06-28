import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@cscp.dev';
  const phone = process.env.ADMIN_PHONE || '+10000000000';
  const password = process.env.ADMIN_PASSWORD || 'Admin@1234!';

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { phone }] },
  });

  if (existing) {
    console.log('✅ Admin user already exists:', email);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.create({
    data: {
      email,
      phone,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      isVerified: true,
    },
  });

  console.log('\n✅ Admin user seeded:');
  console.log(`   Email: ${email}`);
  console.log(`   Phone: ${phone}`);
  console.log(`   Password: ${password}`);
  console.log(`   ID: ${admin.id}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
