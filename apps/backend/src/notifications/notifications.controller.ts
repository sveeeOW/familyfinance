import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PushService } from './push.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RegisterDeviceDto } from './dto/device.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly push: PushService) {}

  @Post('device-token')
  register(@CurrentUser('userId') userId: string, @Body() dto: RegisterDeviceDto) {
    return this.push.registerToken(userId, dto.token, dto.platform);
  }

  @Delete('device-token')
  remove(@Body() dto: RegisterDeviceDto) {
    return this.push.removeToken(dto.token);
  }
}
