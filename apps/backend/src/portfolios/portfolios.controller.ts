import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PortfoliosService } from './portfolios.service';
import {
  CreateInviteDto,
  CreatePortfolioDto,
  UpdateMemberDto,
  UpdatePortfolioDto,
} from './dto/portfolio.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('portfolios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class PortfoliosController {
  constructor(private readonly portfolios: PortfoliosService) {}

  @Get('portfolios')
  list(@CurrentUser('userId') userId: string) {
    return this.portfolios.list(userId);
  }

  @Post('portfolios')
  create(@CurrentUser('userId') userId: string, @Body() dto: CreatePortfolioDto) {
    return this.portfolios.create(userId, dto);
  }

  @Get('portfolios/:id')
  get(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.portfolios.get(id, userId);
  }

  @Patch('portfolios/:id')
  update(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdatePortfolioDto,
  ) {
    return this.portfolios.update(id, userId, dto);
  }

  @Delete('portfolios/:id')
  remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.portfolios.remove(id, userId);
  }

  // ─── Members ───────────────────────────────────────────────────────────────
  @Get('portfolios/:id/members')
  members(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.portfolios.listMembers(id, userId);
  }

  @Patch('portfolios/:id/members/:memberId')
  updateMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.portfolios.updateMember(id, memberId, userId, dto);
  }

  @Delete('portfolios/:id/members/:memberId')
  removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.portfolios.removeMember(id, memberId, userId);
  }

  // ─── Invites ─────────────────────────────────────────────────────────────
  @Post('portfolios/:id/invite')
  invite(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.portfolios.createInvite(id, userId, dto);
  }

  @Post('invites/:token/accept')
  accept(@Param('token') token: string, @CurrentUser('userId') userId: string) {
    return this.portfolios.acceptInvite(token, userId);
  }
}
