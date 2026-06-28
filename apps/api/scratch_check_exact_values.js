"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function testExactValues() {
    const contractor = await prisma.user.findFirst({ where: { role: 'CONTRACTOR' } });
    const supplier = await prisma.user.findFirst({ where: { role: 'SUPPLIER' } });
    const project = await prisma.project.findFirst({ where: { contractorId: contractor?.id } });
    const catalogItem = await prisma.catalogItem.findFirst({ where: { supplierId: supplier?.id } });
    if (!contractor || !supplier || !project || !catalogItem) {
        console.error('Missing test data');
        return;
    }
    try {
        const totalAmount = 5436.67;
        const itemsData = [
            { catalogItemId: catalogItem.id, quantity: 100, priceAtOrder: 10.3667 },
            { catalogItemId: catalogItem.id, quantity: 50, priceAtOrder: 43 }
        ];
        const order = await prisma.order.create({
            data: {
                contractorId: contractor.id,
                supplierId: supplier.id,
                projectId: project.id,
                totalAmount,
                status: 'PENDING',
                deliveryDate: new Date("2026-05-01"),
                deliveryType: 'STANDARD',
                items: { create: itemsData },
                escrowTx: { create: { amount: totalAmount, status: 'HELD' } },
                conversations: {
                    create: [
                        {
                            type: 'ORDER_SHARED',
                            participants: { create: [{ userId: contractor.id }, { userId: supplier.id }] }
                        }
                    ]
                }
            }
        });
        console.log('Order with exact values created successfully:', order.id);
    }
    catch (err) {
        console.error('Order creation FAILED:', err);
    }
    finally {
        await prisma.$disconnect();
    }
}
testExactValues();
