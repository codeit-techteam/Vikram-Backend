import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { HubJwtAuthGuard } from '../guards/hub-jwt-auth.guard';
import { HubRolesGuard } from '../guards/hub-roles.guard';
import { HubPermission } from '../decorators/hub-roles.decorator';
import { CurrentHubUser } from '../decorators/current-hub-user.decorator';
import type { AuthenticatedHubUser } from '../auth/hub-jwt.strategy';
import { HubDispatchService } from './hub-dispatch.service';
import {
  HubDispatchCreateDto,
  HubDispatchQueryDto,
  HubDispatchUpdateDto,
} from '../dto/hub.dto';

@ApiTags(SWAGGER_TAGS.DISPATCH)
@Controller({ version: '1', path: 'hub/dispatch' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubDispatchController {
  constructor(private readonly dispatchService: HubDispatchService) {}

  @Get()
  @HubPermission('dispatch')
  @ApiOperation({ summary: 'List dispatches at hub' })
  async findAll(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query() query: HubDispatchQueryDto,
  ) {
    const data = await this.dispatchService.findAll(user.hubId, query);
    return { success: true, message: 'Dispatches fetched', data };
  }

  @Post('create')
  @HubPermission('dispatch')
  @ApiOperation({ summary: 'Create dispatch for an order' })
  async create(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Body() dto: HubDispatchCreateDto,
  ) {
    const data = await this.dispatchService.create(user.hubId, dto);
    return { success: true, message: 'Dispatch created', data };
  }

  @Patch(':id')
  @HubPermission('dispatch')
  @ApiOperation({ summary: 'Update dispatch assignment' })
  async update(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubDispatchUpdateDto,
  ) {
    const data = await this.dispatchService.update(user.hubId, id, dto);
    return { success: true, message: 'Dispatch updated', data };
  }

  @Patch(':id/complete')
  @HubPermission('dispatch')
  @ApiOperation({ summary: 'Complete dispatch' })
  async complete(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.dispatchService.complete(user.hubId, id);
    return { success: true, message: 'Dispatch completed', data };
  }
}
