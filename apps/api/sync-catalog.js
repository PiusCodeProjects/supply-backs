"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const masterData = [
    {
        name: 'Standard Portland Cement',
        category: 'Basic',
        description: 'High-grade 42.5N Portland cement for general construction, foundations, and structural work.',
        imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&q=80&w=600'
    },
    {
        name: 'River Sand (Clean)',
        category: 'Basic',
        description: 'Fine-grained washed river sand, ideal for plastering, bricklaying, and concrete mixing.',
        imageUrl: 'https://images.unsplash.com/photo-1533460004989-cef01064af7c?auto=format&fit=crop&q=80&w=600'
    },
    {
        name: 'Quarry Dust',
        category: 'Basic',
        description: 'Crushed stone dust used as a fine aggregate in concrete and paving applications.',
        imageUrl: 'https://images.unsplash.com/photo-1590069230002-70cc002c3321?auto=format&fit=crop&q=80&w=600'
    },
    {
        name: 'Ready-Mix Concrete (C25)',
        category: 'Basic',
        description: 'Pre-mixed C25 strength concrete for slab pouring and structural columns.',
        imageUrl: 'https://images.unsplash.com/photo-1581094288338-2314dddb7ecb?auto=format&fit=crop&q=80&w=600'
    },
    {
        name: 'Red Clay Bricks',
        category: 'Masonry',
        description: 'Traditional kiln-fired red clay bricks for load-bearing and decorative masonry.',
        imageUrl: 'https://images.unsplash.com/photo-1582266255765-fa5cf1a1d501?auto=format&fit=crop&q=80&w=600'
    },
    {
        name: 'Reinforcement Steel Bar (12mm)',
        category: 'Structural',
        description: 'High-tensile deformed steel rebar for concrete reinforcement.',
        imageUrl: 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&q=80&w=600'
    },
    {
        name: 'Copper Wiring (2.5mm)',
        category: 'Electrical',
        description: 'Insulated 2.5mm copper cable for domestic and industrial power circuits.',
        imageUrl: 'https://images.unsplash.com/photo-1558489580-f83a21392552?auto=format&fit=crop&q=80&w=600'
    },
    {
        name: 'PVC Conduit Pipe (20mm)',
        category: 'Electrical',
        description: 'Rigid PVC conduit for protected electrical cable routing.',
        imageUrl: 'https://images.unsplash.com/photo-1605152276897-4f618f831968?auto=format&fit=crop&q=80&w=600'
    },
    {
        name: 'PPR Hot Water Pipe',
        category: 'Plumbing',
        description: 'Heat-resistant PPR piping for hot and cold water distribution systems.',
        imageUrl: 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&q=80&w=600'
    },
    {
        name: 'Ceramic Floor Tiles (60x60)',
        category: 'Finishing',
        description: 'Premium 60x60cm ceramic floor tiles with matte finish and high durability.',
        imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&q=80&w=600'
    },
    {
        name: 'Interior Emulsion Paint (White)',
        category: 'Painting',
        description: 'High-coverage brilliant white emulsion paint for interior walls and ceilings.',
        imageUrl: 'https://images.unsplash.com/photo-1562591176-3293099931b0?auto=format&fit=crop&q=80&w=600'
    },
    {
        name: 'Galvanized Iron Sheets',
        category: 'Roofing',
        description: 'Corrugated galvanized iron (GI) sheets for durable roofing and fencing.',
        imageUrl: 'https://images.unsplash.com/photo-1516714435131-44d6b64dc3a2?auto=format&fit=crop&q=80&w=600'
    },
    {
        name: 'Structural Timber (2x4)',
        category: 'Carpentry',
        description: 'Treated structural softwood timber (2x4) for framing and roofing.',
        imageUrl: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&q=80&w=600'
    },
    {
        name: 'Solar Water Heater (200L)',
        category: 'Energy',
        description: '200L high-efficiency solar thermal water heating system.',
        imageUrl: 'https://images.unsplash.com/photo-1509391366360-fe5bb58583bb?auto=format&fit=crop&q=80&w=600'
    },
    {
        name: 'Double Glazed Window Panes',
        category: 'Glass',
        description: 'Energy-efficient double-glazed glass units for noise and heat insulation.',
        imageUrl: 'https://images.unsplash.com/photo-1503708928676-1cb796a0891e?auto=format&fit=crop&q=80&w=600'
    }
];
async function main() {
    console.log('--- Syncing Catalog to Master Products ---');
    for (const item of masterData) {
        const existing = await prisma.masterProduct.findFirst({
            where: { name: item.name }
        });
        if (!existing) {
            const master = await prisma.masterProduct.create({
                data: item
            });
            console.log(`Created: ${master.name}`);
            // Update existing catalog items to link to this master product
            const updated = await prisma.catalogItem.updateMany({
                where: { name: item.name },
                data: {
                    masterProductId: master.id,
                    category: master.category,
                    imageUrl: master.imageUrl,
                    description: master.description
                }
            });
            console.log(`Linked ${updated.count} supplier items to ${master.name}`);
        }
        else {
            console.log(`Exists: ${existing.name}`);
            // Ensure existing ones are linked too
            await prisma.catalogItem.updateMany({
                where: { name: item.name, masterProductId: null },
                data: {
                    masterProductId: existing.id,
                    category: existing.category,
                    imageUrl: existing.imageUrl,
                    description: existing.description
                }
            });
        }
    }
    console.log('--- Sync Complete ---');
}
main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
