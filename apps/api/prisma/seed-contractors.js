"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new client_1.PrismaClient();
async function main() {
    const password = 'Password123!';
    const passwordHash = await bcrypt.hash(password, 12);
    const contractors = [
        {
            email: 'john.doe@buildit.com',
            phone: '+233201112221',
            firstName: 'John',
            lastName: 'Doe',
            company: 'BuildIt Ltd',
            projectName: 'West Hills Apartments',
            location: 'Weija, Accra',
        },
        {
            email: 'jane.smith@greenhomes.gh',
            phone: '+233201112222',
            firstName: 'Jane',
            lastName: 'Smith',
            company: 'Green Homes',
            projectName: 'Eco-Village Phase 1',
            location: 'Aburi, Eastern Region',
        },
        {
            email: 'robert.brown@solidfoundations.com',
            phone: '+233201112223',
            firstName: 'Robert',
            lastName: 'Brown',
            company: 'Solid Foundations',
            projectName: 'Downtown Plaza',
            location: 'Ridge, Accra',
        },
        {
            email: 'mary.johnson@modernliving.gh',
            phone: '+233201112224',
            firstName: 'Mary',
            lastName: 'Johnson',
            company: 'Modern Living',
            projectName: 'Lakeside Villas',
            location: 'East Legon, Accra',
        },
        {
            email: 'david.wilson@wilsonsons.com',
            phone: '+233201112225',
            firstName: 'David',
            lastName: 'Wilson',
            company: 'Wilson & Sons',
            projectName: 'New Horizon School',
            location: 'Tema, Greater Accra',
        },
    ];
    console.log('🌱 Seeding contractors and projects...');
    for (const c of contractors) {
        // Check if user exists
        const existing = await prisma.user.findFirst({
            where: { OR: [{ email: c.email }, { phone: c.phone }] },
        });
        if (existing) {
            console.log(`⚠️ User ${c.email} already exists, skipping.`);
            continue;
        }
        // Create User
        const user = await prisma.user.create({
            data: {
                email: c.email,
                phone: c.phone,
                passwordHash,
                role: 'CONTRACTOR',
                status: 'ACTIVE',
                isVerified: true,
                contractorProfile: {
                    create: {
                        firstName: c.firstName,
                        lastName: c.lastName,
                        company: c.company,
                    },
                },
                projects: {
                    create: {
                        name: c.projectName,
                        location: c.location,
                        status: 'ACTIVE',
                    },
                },
            },
        });
        console.log(`✅ Seeded Contractor: ${c.firstName} ${c.lastName} (${c.email}) with Project: ${c.projectName}`);
    }
    console.log('✨ Seeding complete!');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
