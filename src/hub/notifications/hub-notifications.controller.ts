import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { HubJwtAuthGuard } from '../guards/hub-jwt-auth.guard';
import { HubRolesGuard } from '../guards/hub-roles.guard';
import { HubPermission } from '../decorators/hub-roles.decorator';
import { CurrentHubUser } from '../decorators/current-hub-user.decorator';
import type { AuthenticatedHubUser } from '../auth/hub-jwt.strategy';
import { HubNotificationsService } from './hub-notifications.service';
import { HubNotificationsQueryDto } from '../dto/hub.dto';

@ApiTags(SWAGGER_TAGS.HUB_NOTIFICATIONS)
@Controller({ version: '1', path: 'hub/notifications' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubNotificationsController {
  constructor(private readonly notificationsService: HubNotificationsService) {}

  @Get()
  @HubPermission('notifications')
  @ApiOperation({ summary: 'List hub notifications' })
  async findAll(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query() query: HubNotificationsQueryDto,
  ) {
    const data = await this.notificationsService.findAll(user.hubId, query);
    return { success: true, message: 'Notifications fetched', data };
  }

  @Patch(':id/read')
  @HubPermission('notifications')
  @ApiOperation({ summary: 'Mark notification as read' })
  async markRead(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.notificationsService.markRead(user.hubId, id);
    return { success: true, message: 'Notification marked as read', data };
  }
}
