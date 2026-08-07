import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { HubJwtAuthGuard } from '../guards/hub-jwt-auth.guard';
import { HubRolesGuard } from '../guards/hub-roles.guard';
import { HubPermission } from '../decorators/hub-roles.decorator';
import { CurrentHubUser } from '../decorators/current-hub-user.decorator';
import type { AuthenticatedHubUser } from '../auth/hub-jwt.strategy';
import { HubDriversService } from './hub-drivers.service';
import { HubDispatchService } from '../dispatch/hub-dispatch.service';
import {
  HubDriverCreateDto,
  HubDriversQueryDto,
  HubDriverUpdateDto,
} from '../dto/hub.dto';

@ApiTags(SWAGGER_TAGS.DRIVERS)
@Controller({ version: '1', path: 'hub/drivers' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubDriversController {
  constructor(
    private readonly driversService: HubDriversService,
    private readonly dispatchService: HubDispatchService,
  ) {}

  @Get()
  @HubPermission('drivers')
  @ApiOperation({ summary: 'List hub drivers' })
  async findAll(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query() query: HubDriversQueryDto,
  ) {
    const data = await this.driversService.findAll(user.hubId, query);
    return { success: true, message: 'Drivers fetched', data };
  }

  @Get('available')
  @HubPermission('drivers')
  @ApiOperation({ summary: 'Available drivers for dispatch planning' })
  async available(@CurrentHubUser() user: AuthenticatedHubUser) {
    const data = await this.dispatchService.getAvailableDrivers(user.hubId);
    return { success: true, message: 'Available drivers fetched', data };
  }

  @Post()
  @HubPermission('drivers')
  @ApiOperation({ summary: 'Create hub driver' })
  async create(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Body() dto: HubDriverCreateDto,
  ) {
    const data = await this.driversService.create(user.hubId, dto);
    return { success: true, message: 'Driver created', data };
  }

  @Patch(':id')
  @HubPermission('drivers')
  @ApiOperation({ summary: 'Update hub driver' })
  async update(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubDriverUpdateDto,
  ) {
    const data = await this.driversService.update(user.hubId, id, dto);
    return { success: true, message: 'Driver updated', data };
  }

  @Delete(':id')
  @HubPermission('drivers')
  @ApiOperation({ summary: 'Delete hub driver' })
  async remove(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.driversService.remove(user.hubId, id);
    return { success: true, message: 'Driver deleted', data };
  }
}
