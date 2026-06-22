import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@Query('portfolioId') portfolioId: string, @CurrentUser('userId') userId: string) {
    return this.categories.listForPortfolio(portfolioId, userId);
  }

  @Post()
  create(
    @Query('portfolioId') portfolioId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categories.create(portfolioId, userId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(id, userId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.categories.remove(id, userId);
  }
}
