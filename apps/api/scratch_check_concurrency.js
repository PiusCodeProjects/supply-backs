"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function testConcurrentOrders() {
    const contractor = await prisma.user.findFirst({ where: { role: 'CONTRACTOR' } });
    const supplier = await prisma.user.findFirst({ where: { role: 'SUPPLIER' } });
    const project = await prisma.project.findFirst({ where: { contractorId: contractor?.id } });
    const catalogItem = await prisma.catalogItem.findFirst({ where: { supplierId: supplier?.id } });
    if (!contractor || !supplier || !project || !catalogItem) {
        console.error('Missing test data');
        return;
    }
    const dto = {
        projectId: project.id,
        supplierId: supplier.id,
        items: [{ catalogItemId: catalogItem.id, quantity: 1 }],
        deliveryDate: new Date().toISOString(),
        deliveryType: 'STANDARD',
    };
    const createOrder = async (idx) => {
        console.log(`Starting order ${idx}...`);
        try {
            const order = await prisma.$transaction(async (tx) => {
                // Simulate some work
                await new Promise(r => setTimeout(r, 100));
                return await tx.order.create({
                    data: {
                        contractorId: contractor.id,
                        supplierId: dto.supplierId,
                        projectId: dto.projectId,
                        totalAmount: 100,
                        status: 'PENDING',
                        escrowStatus: 'HELD',
                        items: { create: [{ catalogItemId: catalogItem.id, quantity: 1, priceAtOrder: 100 }] },
                        escrowTx: { create: { amount: 100, status: 'HELD' } },
                        conversations: {
                            create: [
                                { type: 'ORDER_SHARED', participants: { create: [{ userId: contractor.id }, { userId: dto.supplierId }] } }
                            ]
                        }
                    }
                });
            });
            console.log(`Order ${idx} success: ${order.id}`);
        }
        catch (err) {
            console.error(`Order ${idx} FAILED:`, err);
        }
    };
    // Run 5 concurrent orders
    console.log('Sending 5 concurrent orders...');
    await Promise.all([
        createOrder(1),
        createOrder(2),
        createOrder(3),
        createOrder(4),
        createOrder(5)
    ]);
    await prisma.$disconnect();
}
testConcurrentOrders();
