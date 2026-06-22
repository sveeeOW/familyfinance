import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioAccessService } from '../common/access/portfolio-access.service';
import { SYSTEM_CATEGORIES } from './system-categories';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortfolioAccessService,
  ) {}

  /** Идемпотентно гарантирует, что глобальные системные категории и их правила засеяны. */
  async ensureSystemCategories() {
    const count = await this.prisma.category.count({ where: { isSystem: true, portfolioId: null } });
    if (count >= SYSTEM_CATEGORIES.length) return;

    for (const def of SYSTEM_CATEGORIES) {
      const existing = await this.prisma.category.findFirst({
        where: { isSystem: true, portfolioId: null, name: def.name },
      });
      const category =
        existing ??
        (await this.prisma.category.create({
          data: { name: def.name, icon: def.icon, color: def.color, isSystem: true },
        }));

      for (const keyword of def.keywords ?? []) {
        const rule = await this.prisma.categoryRule.findFirst({
          where: { keyword, isSystem: true, categoryId: category.id },
        });
        if (!rule) {
          await this.prisma.categoryRule.create({
            data: { keyword, categoryId: category.id, isSystem: true },
          });
        }
      }
    }
  }

  /** Вызывается при создании портфеля. Системные категории общие, поэтому только сидим их. */
  async ensurePortfolioCategories(_portfolioId: string) {
    await this.ensureSystemCategories();
  }

  /** Категории, доступные в портфеле: глобальные системные + кастомные портфеля. */
  async listForPortfolio(portfolioId: string, userId: string) {
    await this.access.requireMember(portfolioId, userId);
    return this.prisma.category.findMany({
      where: {
        isActive: true,
        OR: [{ portfolioId: null, isSystem: true }, { portfolioId }],
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async create(portfolioId: string, userId: string, dto: CreateCategoryDto) {
    await this.access.require(portfolioId, userId, 'edit');
    return this.prisma.category.create({
      data: {
        portfolioId,
        name: dto.name,
        parentId: dto.parentId,
        icon: dto.icon,
        color: dto.color,
        isSystem: false,
      },
    });
  }

  async update(id: string, userId: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Категория не найдена');
    if (!category.portfolioId) {
      throw new ForbiddenException('Системную категорию нельзя редактировать');
    }
    await this.access.require(category.portfolioId, userId, 'edit');
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Категория не найдена');
    if (!category.portfolioId) {
      throw new ForbiddenException('Системную категорию нельзя удалить — её можно только отключить');
    }
    await this.access.require(category.portfolioId, userId, 'manage');
    // Мягко отключаем, чтобы не потерять связанные расходы.
    return this.prisma.category.update({ where: { id }, data: { isActive: false } });
  }
}
