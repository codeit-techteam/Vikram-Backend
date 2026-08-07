import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { HubJwtAuthGuard } from '../guards/hub-jwt-auth.guard';
import { HubRolesGuard } from '../guards/hub-roles.guard';
import { HubPermission } from '../decorators/hub-roles.decorator';
import { CurrentHubUser } from '../decorators/current-hub-user.decorator';
import type { AuthenticatedHubUser } from '../auth/hub-jwt.strategy';
import { RequisitionsService } from '../../modules/requisitions/requisitions.service';
import { ReceiveRequisitionDto } from '../../modules/requisitions/dto/requisitions.dto';

/**
 * Hub Incoming Transfers — adapters over warehouse-dispatched requisitions.
 * Warehouse dispatch → appears here automatically (same DB row).
 */
@ApiTags('Hub Transfers')
@Controller({ version: '1', path: 'hub/transfers' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubTransfersController {
  constructor(private readonly requisitionsService: RequisitionsService) {}

  private actor(user: AuthenticatedHubUser) {
    return {
      id: user.id,
      name: user.fullName,
      role: user.role,
    };
  }

  @Get()
  @HubPermission('inventory')
  @ApiOperation({
    summary: 'List incoming transfers (dispatched/in-transit requisitions)',
  })
  async list(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    const data = await this.requisitionsService.listIncomingTransfers(
      user.hubId,
    );

    let transfers = data.transfers;
    if (search?.trim()) {
      const q = search.toLowerCase();
      transfers = transfers.filter(
        (t) =>
          t.transferId.toLowerCase().includes(q) ||
          t.vehicle.toLowerCase().includes(q) ||
          t.driver.name.toLowerCase().includes(q) ||
          t.materials.some(
            (m) =>
              m.name.toLowerCase().includes(q) ||
              (m.sku ?? '').toLowerCase().includes(q),
          ),
      );
    }
    if (status && status !== 'all') {
      transfers = transfers.filter((t) => t.status === status);
    }

    return {
      success: true,
      message: 'Transfers fetched',
      data: { summary: data.summary, transfers },
    };
  }

  @Get(':id')
  @HubPermission('inventory')
  @ApiOperation({ summary: 'Get incoming transfer by id or request number' })
  async getOne(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.requisitionsService.getIncomingTransfer(
      user.hubId,
      id,
    );
    return { success: true, message: 'Transfer fetched', data };
  }

  @Patch(':id/receive')
  @HubPermission('inventory')
  @ApiOperation({ summary: 'Receive incoming transfer (updates inventory)' })
  async receive(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: ReceiveRequisitionDto,
  ) {
    const transfer = await this.requisitionsService.getIncomingTransfer(
      user.hubId,
      id,
    );
    const data = await this.requisitionsService.receive(
      transfer.id,
      user.hubId,
      this.actor(user),
      dto,
    );
    return { success: true, message: 'Transfer received', data };
  }
}
