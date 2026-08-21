import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  SWAGGER_BEARER_AUTH,
  SWAGGER_TAGS,
} from '../../common/constants/swagger.constants';
import { HubJwtAuthGuard } from '../guards/hub-jwt-auth.guard';
import { HubRolesGuard } from '../guards/hub-roles.guard';
import { HubPermission } from '../decorators/hub-roles.decorator';
import { CurrentHubUser } from '../decorators/current-hub-user.decorator';
import type { AuthenticatedHubUser } from '../auth/hub-jwt.strategy';
import { HubLoadingService } from './hub-loading.service';
import {
  HubLoadingCompleteDto,
  HubLoadingQueryDto,
  HubLoadingStartDto,
} from '../dto/hub.dto';

@ApiTags(SWAGGER_TAGS.HUB_LOADING)
@Controller({ version: '1', path: 'hub/loading' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubLoadingController {
  constructor(private readonly loadingService: HubLoadingService) {}

  @Get()
  @HubPermission('loading')
  @ApiOperation({ summary: 'List loading records' })
  async findAll(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query() query: HubLoadingQueryDto,
  ) {
    const data = await this.loadingService.findAll(user.hubId, query);
    return { success: true, message: 'Loading records fetched', data };
  }

  @Get(':id')
  @HubPermission('loading')
  @ApiOperation({ summary: 'Get loading record by ID' })
  async findOne(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.loadingService.findOne(user.hubId, id);
    return { success: true, message: 'Loading record fetched', data };
  }

  @Post('start')
  @HubPermission('loading')
  @ApiOperation({ summary: 'Start loading for an order' })
  async start(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Body() dto: HubLoadingStartDto,
  ) {
    const data = await this.loadingService.start(
      user.hubId,
      dto,
      user.fullName,
    );
    return { success: true, message: 'Loading started', data };
  }

  @Patch('complete')
  @HubPermission('loading')
  @ApiOperation({ summary: 'Complete loading with photos and notes' })
  async complete(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Body() dto: HubLoadingCompleteDto,
  ) {
    const data = await this.loadingService.complete(
      user.hubId,
      dto,
      user.fullName,
    );
    return { success: true, message: 'Loading completed', data };
  }
}
