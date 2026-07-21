import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  SWAGGER_BEARER_AUTH,
  SWAGGER_TAGS,
} from '../../common/constants/swagger.constants';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  NotificationResponseDto,
  UnreadCountResponseDto,
} from './dto/notification-response.dto';
import { NotificationService } from './notification.service';

@ApiTags(SWAGGER_TAGS.NOTIFICATIONS)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'notifications' })
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({
    summary: 'List customer notifications',
    description:
      'Returns paginated notifications for the authenticated customer (customer-specific + global). Stored in PostgreSQL. Supports type filter and search.',
  })
  @ApiResponse({ status: 200, description: 'Notifications fetched successfully' })
  @ApiResponse({
    status: 401,
    description: 'Authentication required',
    type: ApiErrorResponseDto,
  })
  async findAll(
    @CurrentUser() user: AuthenticatedCustomer,
    @Query() query: NotificationQueryDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      items: NotificationResponseDto[];
      meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
      };
    };
  }> {
    const data = await this.notificationService.findAll(user.id, query);
    return {
      success: true,
      message: 'Notifications fetched successfully',
      data,
    };
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Get unread notification count',
    description:
      'Returns unread count for the authenticated customer. Cached in Redis as `notification:customer:{customerId}:count` (TTL 300s).',
  })
  @ApiResponse({
    status: 200,
    description: 'Unread count fetched successfully',
    type: UnreadCountResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication required',
    type: ApiErrorResponseDto,
  })
  async unreadCount(
    @CurrentUser() user: AuthenticatedCustomer,
  ): Promise<{
    success: boolean;
    message: string;
    data: UnreadCountResponseDto;
  }> {
    const data = await this.notificationService.getUnreadCount(user.id);
    return {
      success: true,
      message: 'Unread count fetched successfully',
      data,
    };
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description:
      'Marks all unread notifications (customer + global) as read and invalidates the Redis unread count cache.',
  })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  @ApiResponse({
    status: 401,
    description: 'Authentication required',
    type: ApiErrorResponseDto,
  })
  async markAllAsRead(
    @CurrentUser() user: AuthenticatedCustomer,
  ): Promise<{
    success: boolean;
    message: string;
    data: { updatedCount: number };
  }> {
    const data = await this.notificationService.markAllAsRead(user.id);
    return {
      success: true,
      message: 'All notifications marked as read',
      data,
    };
  }

  @Patch('read/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a notification as read',
    description: 'Marks a single notification as read by UUID.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({
    status: 404,
    description: 'Notification not found',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication required',
    type: ApiErrorResponseDto,
  })
  async markAsRead(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: NotificationResponseDto;
  }> {
    const data = await this.notificationService.markAsRead(user.id, id);
    return {
      success: true,
      message: 'Notification marked as read',
      data,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a notification',
    description:
      'Soft-deletes a customer-owned notification. Global announcements cannot be deleted (returns 403).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Notification deleted' })
  @ApiResponse({
    status: 403,
    description: 'Cannot delete global announcement',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Notification not found',
    type: ApiErrorResponseDto,
  })
  async remove(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: { deleted: boolean };
  }> {
    const data = await this.notificationService.remove(user.id, id);
    return {
      success: true,
      message: 'Notification deleted successfully',
      data,
    };
  }
}
