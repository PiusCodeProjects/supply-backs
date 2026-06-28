"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function testOrder() {
    const contractorId = 'replace-with-valid-id'; // I need a valid ID
    const supplierId = 'replace-with-valid-id';
    const projectId = 'replace-with-valid-id';
    const catalogItemId = 'replace-with-valid-id';
    // I'll fetch some real IDs first
    const contractor = await prisma.user.findFirst({ where: { role: 'CONTRACTOR' } });
    const supplier = await prisma.user.findFirst({ where: { role: 'SUPPLIER' } });
    const project = await prisma.project.findFirst({ where: { contractorId: contractor?.id } });
    const catalogItem = await prisma.catalogItem.findFirst({ where: { supplierId: supplier?.id } });
    if (!contractor || !supplier || !project || !catalogItem) {
        console.error('Missing test data');
        return;
    }
    console.log('Testing with:', {
        contractorId: contractor.id,
        supplierId: supplier.id,
        projectId: project.id,
        catalogItemId: catalogItem.id
    });
    try {
        const dto = {
            projectId: project.id,
            supplierId: supplier.id,
            items: [{ catalogItemId: catalogItem.id, quantity: 10 }],
            deliveryDate: new Date().toISOString(),
            deliveryType: 'STANDARD',
            notes: 'Test order'
        };
        // Simulate placeOrder logic
        const uniqueCatalogItemIds = [...new Set(dto.items.map((i) => i.catalogItemId))];
        const catalogItems = await prisma.catalogItem.findMany({
            where: {
                id: { in: uniqueCatalogItemIds },
                supplierId: dto.supplierId,
            },
        });
        let totalAmount = 0;
        const itemsData = dto.items.map((item) => {
            const ci = catalogItems.find((c) => c.id === item.catalogItemId);
            totalAmount += ci.price * item.quantity;
            return {
                catalogItemId: item.catalogItemId,
                quantity: item.quantity,
                priceAtOrder: ci.price,
            };
        });
        const admins = await prisma.user.findMany({
            where: { role: 'ADMIN', status: 'ACTIVE' },
            select: { id: true },
        });
        const order = await prisma.$transaction(async (tx) => {
            return await tx.order.create({
                data: {
                    contractorId: contractor.id,
                    supplierId: dto.supplierId,
                    projectId: dto.projectId,
                    totalAmount,
                    status: 'PENDING',
                    escrowStatus: 'HELD',
                    deliveryDate: new Date(dto.deliveryDate),
                    deliveryType: dto.deliveryType,
                    notes: dto.notes,
                    items: { create: itemsData },
                    escrowTx: { create: { amount: totalAmount, status: 'HELD' } },
                    conversations: {
                        create: [
                            {
                                type: 'ORDER_SHARED',
                                participants: {
                                    create: [
                                        { userId: contractor.id, lastReadAt: new Date() },
                                        { userId: dto.supplierId },
                                    ],
                                },
                            },
                            {
                                type: 'ORDER_PRIVATE_ADMIN_SUPPLIER',
                                participants: {
                                    create: [
                                        { userId: dto.supplierId },
                                        ...admins
                                            .filter((admin) => admin.id !== dto.supplierId)
                                            .map((admin) => ({ userId: admin.id })),
                                    ],
                                },
                            },
                        ],
                    },
                },
            });
        });
        console.log('Order created successfully:', order.id);
    }
    catch (err) {
        console.error('Order creation failed:', err);
    }
    finally {
        await prisma.$disconnect();
    }
}
testOrder();
