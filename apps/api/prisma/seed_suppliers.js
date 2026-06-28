"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new client_1.PrismaClient();
const MATERIALS = [
    { name: 'Standard Portland Cement', unit: '50kg Bag', category: 'Basic', basePrice: 12 },
    { name: 'Reinforcement Steel Bar (12mm)', unit: 'Meter', category: 'Structural', basePrice: 8 },
    { name: 'River Sand (Clean)', unit: 'Ton', category: 'Basic', basePrice: 45 },
    { name: 'Quarry Dust', unit: 'Ton', category: 'Basic', basePrice: 38 },
    { name: 'Red Clay Bricks', unit: '1000 Units', category: 'Masonry', basePrice: 250 },
    { name: 'Ceramic Floor Tiles (60x60)', unit: 'Sqm', category: 'Finishing', basePrice: 22 },
    { name: 'Interior Emulsion Paint (White)', unit: '20L Bucket', category: 'Painting', basePrice: 65 },
    { name: 'PVC Conduit Pipe (20mm)', unit: '3m Length', category: 'Electrical', basePrice: 5 },
    { name: 'Copper Wiring (2.5mm)', unit: '100m Roll', category: 'Electrical', basePrice: 120 },
    { name: 'PPR Hot Water Pipe', unit: 'Length', category: 'Plumbing', basePrice: 15 },
    { name: 'Structural Timber (2x4)', unit: 'Foot', category: 'Carpentry', basePrice: 2 },
    { name: 'Ready-Mix Concrete (C25)', unit: 'Cubic Meter', category: 'Basic', basePrice: 110 },
    { name: 'Galvanized Iron Sheets', unit: 'Sheet', category: 'Roofing', basePrice: 18 },
    { name: 'Solar Water Heater (200L)', unit: 'Unit', category: 'Energy', basePrice: 850 },
    { name: 'Double Glazed Window Panes', unit: 'Sqm', category: 'Glass', basePrice: 95 }
];
const SUPPLIERS = [
    { name: 'Global Construction Supplies', email: 'sales@global-supplies.com', phone: '+12025550101' },
    { name: 'Falcon Building Materials', email: 'orders@falcon-materials.com', phone: '+12025550102' },
    { name: 'Metro Hardware & Logistics', email: 'supply@metro-hardware.com', phone: '+12025550103' },
    { name: 'Titan Steel & Concrete', email: 'logistics@titan-steel.com', phone: '+12025550104' },
    { name: 'Elite Interior Finishes', email: 'design@elite-interiors.com', phone: '+12025550105' }
];
async function main() {
    const passwordHash = await bcrypt.hash('Password123!', 12);
    for (const s of SUPPLIERS) {
        console.log(`Seeding supplier: ${s.name}...`);
        // 1. Create User
        const user = await prisma.user.upsert({
            where: { email: s.email },
            update: {},
            create: {
                email: s.email,
                phone: s.phone,
                passwordHash,
                role: 'SUPPLIER',
                status: 'ACTIVE',
                isVerified: true,
                supplierProfile: {
                    create: {
                        businessName: s.name,
                        verificationStatus: 'APPROVED',
                    }
                }
            }
        });
        // 2. Assign 10 materials (shuffled with some overlap)
        const shuffled = [...MATERIALS].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 10);
        for (const m of selected) {
            await prisma.catalogItem.create({
                data: {
                    supplierId: user.id,
                    name: m.name,
                    description: `High quality ${m.name.toLowerCase()} for construction projects.`,
                    price: m.basePrice + (Math.random() * 5 - 2.5), // Varied price per supplier
                    unit: m.unit,
                    category: m.category,
                    stock: Math.floor(Math.random() * 1000) + 100,
                }
            });
        }
    }
    console.log('✅ Seeding completed!');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
