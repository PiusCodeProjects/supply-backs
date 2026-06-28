"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new client_1.PrismaClient();
async function main() {
    const suppliers = await prisma.user.findMany({
        where: { role: 'SUPPLIER' },
    });
    if (suppliers.length === 0) {
        console.log('❌ No suppliers found! Please run seed-suppliers first.');
        return;
    }
    const passwordHash = await bcrypt.hash('Password123!', 12);
    console.log('Seeding Drivers...');
    let idx = 1;
    for (const supplier of suppliers) {
        const email = `driver${idx}@fleet.com`;
        const phone = `+1300000000${idx}`;
        const existing = await prisma.user.findFirst({
            where: { phone },
        });
        if (existing) {
            console.log(`✅ Driver already exists for supplier ${supplier.id}: ${phone}`);
        }
        else {
            const driver = await prisma.user.create({
                data: {
                    email,
                    phone,
                    passwordHash,
                    role: 'DRIVER',
                    status: 'ACTIVE',
                    isVerified: true,
                    driverProfile: {
                        create: {
                            firstName: `Driver`,
                            lastName: `${idx}`,
                            licenseNo: `DL-${Math.random().toString(36).substring(7).toUpperCase()}`,
                        },
                    },
                    supplierDrivers: {
                        create: { supplierId: supplier.id },
                    },
                },
            });
            console.log(`✅ Driver created: ${driver.id} - ${phone} assigned to supplier ${supplier.id}`);
        }
        idx++;
    }
    console.log('\n🎉 Finished seeding drivers!\n');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
