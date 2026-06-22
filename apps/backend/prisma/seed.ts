import { PrismaClient } from '@prisma/client';
import { SYSTEM_CATEGORIES } from '../src/categories/system-categories';

const prisma = new PrismaClient();

async function main() {
  console.log('Сидирование системных категорий и правил автокатегоризации…');

  for (const def of SYSTEM_CATEGORIES) {
    const existing = await prisma.category.findFirst({
      where: { isSystem: true, portfolioId: null, name: def.name },
    });
    const category =
      existing ??
      (await prisma.category.create({
        data: { name: def.name, icon: def.icon, color: def.color, isSystem: true },
      }));

    for (const keyword of def.keywords ?? []) {
      const rule = await prisma.categoryRule.findFirst({
        where: { keyword, isSystem: true, categoryId: category.id },
      });
      if (!rule) {
        await prisma.categoryRule.create({
          data: { keyword, categoryId: category.id, isSystem: true },
        });
      }
    }
  }

  const categoryCount = await prisma.category.count({ where: { isSystem: true } });
  const ruleCount = await prisma.categoryRule.count({ where: { isSystem: true } });
  console.log(`Готово: ${categoryCount} системных категорий, ${ruleCount} правил.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
