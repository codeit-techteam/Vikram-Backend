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
import { HubVehiclesService } from './hub-vehicles.service';
import {
  HubVehicleCreateDto,
  HubVehiclesQueryDto,
  HubVehicleUpdateDto,
} from '../dto/hub.dto';

@ApiTags(SWAGGER_TAGS.VEHICLES)
@Controller({ version: '1', path: 'hub/vehicles' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubVehiclesController {
  constructor(private readonly vehiclesService: HubVehiclesService) {}

  @Get()
  @HubPermission('vehicles')
  @ApiOperation({ summary: 'List hub vehicles' })
  async findAll(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query() query: HubVehiclesQueryDto,
  ) {
    const data = await this.vehiclesService.findAll(user.hubId, query);
    return { success: true, message: 'Vehicles fetched', data };
  }

  @Post()
  @HubPermission('vehicles')
  @ApiOperation({ summary: 'Create hub vehicle' })
  async create(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Body() dto: HubVehicleCreateDto,
  ) {
    const data = await this.vehiclesService.create(user.hubId, dto);
    return { success: true, message: 'Vehicle created', data };
  }

  @Patch(':id')
  @HubPermission('vehicles')
  @ApiOperation({ summary: 'Update hub vehicle' })
  async update(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubVehicleUpdateDto,
  ) {
    const data = await this.vehiclesService.update(user.hubId, id, dto);
    return { success: true, message: 'Vehicle updated', data };
  }

  @Delete(':id')
  @HubPermission('vehicles')
  @ApiOperation({ summary: 'Delete hub vehicle' })
  async remove(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.vehiclesService.remove(user.hubId, id);
    return { success: true, message: 'Vehicle deleted', data };
  }
}
