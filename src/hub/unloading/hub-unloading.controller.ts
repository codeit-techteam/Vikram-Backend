import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { HubJwtAuthGuard } from '../guards/hub-jwt-auth.guard';
import { HubRolesGuard } from '../guards/hub-roles.guard';
import { HubPermission } from '../decorators/hub-roles.decorator';
import { CurrentHubUser } from '../decorators/current-hub-user.decorator';
import type { AuthenticatedHubUser } from '../auth/hub-jwt.strategy';
import { HubUnloadingService } from './hub-unloading.service';
import { HubUnloadingCompleteDto, HubUnloadingStartDto } from '../dto/hub.dto';

@ApiTags(SWAGGER_TAGS.HUB_UNLOADING)
@Controller({ version: '1', path: 'hub/unloading' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubUnloadingController {
  constructor(private readonly unloadingService: HubUnloadingService) {}

  @Get()
  @HubPermission('unloading')
  @ApiOperation({ summary: 'List unloading records' })
  async findAll(@CurrentHubUser() user: AuthenticatedHubUser) {
    const data = await this.unloadingService.findAll(user.hubId);
    return { success: true, message: 'Unloading records fetched', data };
  }

  @Post('start')
  @HubPermission('unloading')
  @ApiOperation({ summary: 'Start unloading for an order' })
  async start(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Body() dto: HubUnloadingStartDto,
  ) {
    const data = await this.unloadingService.start(user.hubId, dto, user.fullName);
    return { success: true, message: 'Unloading started', data };
  }

  @Patch('complete')
  @HubPermission('unloading')
  @ApiOperation({ summary: 'Complete unloading with proof photos and signature' })
  async complete(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Body() dto: HubUnloadingCompleteDto,
  ) {
    const data = await this.unloadingService.complete(user.hubId, dto, user.fullName);
    return { success: true, message: 'Unloading completed', data };
  }
}
