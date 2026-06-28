import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const products = [
    // Basic / Masonry
    { name: 'Portland Cement (Grade 42.5)', category: 'Basic', unit: 'Bags', description: 'High-strength cement for structural concrete and plastering.', imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&q=80&w=400' },
    { name: 'Hollow Blocks (6 Inch)', category: 'Basic', unit: 'Pcs', description: 'Standard concrete blocks for load-bearing and partition walls.', imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&q=80&w=400' },
    { name: 'Red Clay Bricks', category: 'Basic', unit: 'Pcs', description: 'Durable fired clay bricks for traditional masonry work.', imageUrl: 'https://images.unsplash.com/photo-1590069230002-70cc002c3321?auto=format&fit=crop&q=80&w=400' },

    // Aggregates
    { name: 'Granite Stones (20mm)', category: 'Basic', unit: 'Tons', description: 'Crushed granite for concrete mixing and drainage.', imageUrl: 'https://images.unsplash.com/photo-1574689049594-376ef02e2cce?auto=format&fit=crop&q=80&w=400' },
    { name: 'River Sand (Sharp)', category: 'Basic', unit: 'Tons', description: 'Clean, sharp sand for mortar and concrete works.', imageUrl: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&q=80&w=400' },

    // Reinforcement
    { name: 'Iron Rods (12mm)', category: 'Basic', unit: 'Pcs', description: 'High-tensile steel reinforcement bars for structural safety.', imageUrl: 'https://images.unsplash.com/photo-1513467655676-561b7d489a88?auto=format&fit=crop&q=80&w=400' },
    { name: 'Iron Rods (16mm)', category: 'Basic', unit: 'Pcs', description: 'Heavy-duty reinforcement bars for columns and beams.', imageUrl: 'https://images.unsplash.com/photo-1505330622279-bf7d7fc918f4?auto=format&fit=crop&q=80&w=400' },

    // Electrical
    { name: 'Copper Cable (2.5mm)', category: 'Electrical', unit: 'Rolls', description: 'High-conductivity copper wire for residential wiring.', imageUrl: 'https://images.unsplash.com/photo-1620214915428-1002237890f5?auto=format&fit=crop&q=80&w=400' },
    { name: 'Circuit Breaker (32A)', category: 'Electrical', unit: 'Pcs', description: 'Single-pole circuit breaker for electrical safety.', imageUrl: 'https://images.unsplash.com/photo-1558484664-9041b654067a?auto=format&fit=crop&q=80&w=400' },
    { name: 'LED Panel Light (18W)', category: 'Electrical', unit: 'Pcs', description: 'Energy-efficient recessed ceiling light.', imageUrl: 'https://images.unsplash.com/photo-1550985616-10810253b84d?auto=format&fit=crop&q=80&w=400' },

    // Plumbing
    { name: 'PVC Pipe (4 Inch)', category: 'Plumbing', unit: 'Meters', description: 'Heavy-duty drainage and waste-water management pipe.', imageUrl: 'https://images.unsplash.com/photo-1585314062340-f1a5a7c9328d?auto=format&fit=crop&q=80&w=400' },
    { name: 'Kitchen Mixer Tap', category: 'Plumbing', unit: 'Units', description: 'Chrome-finished swivel tap for modern kitchens.', imageUrl: 'https://images.unsplash.com/photo-1584622781564-1d987f7333c1?auto=format&fit=crop&q=80&w=400' },
    { name: 'Water Storage Tank (1000L)', category: 'Plumbing', unit: 'Units', description: 'UV-stabilized plastic tank for residential water storage.', imageUrl: 'https://images.unsplash.com/photo-1590483734724-388185f3bb0d?auto=format&fit=crop&q=80&w=400' },

    // Finishing
    { name: 'Porcelain Floor Tiles', category: 'Finishing', unit: 'Sqm', description: 'Premium 60x60 tiles with high-gloss finish.', imageUrl: 'https://images.unsplash.com/photo-1502005075163-5d5573a7305e?auto=format&fit=crop&q=80&w=400' },
    { name: 'Satin Wall Paint (White)', category: 'Finishing', unit: 'Liters', description: 'Washable interior paint with subtle sheen.', imageUrl: 'https://images.unsplash.com/photo-1562157873-818bc0726f68?auto=format&fit=crop&q=80&w=400' },
    { name: 'Plaster of Paris (POP)', category: 'Finishing', unit: 'Bags', description: 'Fine white powder for decorative ceiling works.', imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&q=80&w=400' },

    // Roofing
    { name: 'Aluminum Roofing Sheets', category: 'Roofing', unit: 'Sheets', description: 'Long-span corrugated aluminum sheets for durable roofing.', imageUrl: 'https://images.unsplash.com/photo-1635424710928-0544e8512eae?auto=format&fit=crop&q=80&w=400' },
    { name: 'Self-Drilling Roof Screws', category: 'Roofing', unit: 'kg', description: 'Galvanized screws for secure sheet fastening.', imageUrl: 'https://images.unsplash.com/photo-1586864387917-f399f668f44c?auto=format&fit=crop&q=80&w=400' },

    // Glass
    { name: 'Clear Float Glass (5mm)', category: 'Glass', unit: 'Sqm', description: 'Standard clear glass for windows and partitions.', imageUrl: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&q=80&w=400' },
    { name: 'Tinted Glass (6mm)', category: 'Glass', unit: 'Sqm', description: 'Heat-absorbing tinted glass for architectural glazing.', imageUrl: 'https://images.unsplash.com/photo-1516592673814-189c0a5bf83c?auto=format&fit=crop&q=80&w=400' },
  ];

  console.log('Seeding master products...');

  for (const p of products) {
    const id = `master-${p.name.toLowerCase().replace(/ /g, '-')}`;
    await prisma.masterProduct.upsert({
      where: { id },
      update: { unit: p.unit, category: p.category, description: p.description, imageUrl: p.imageUrl },
      create: { id, ...p },
    });
  }

  console.log('Master products seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
