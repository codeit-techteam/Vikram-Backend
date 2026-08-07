import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
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
 * Alias for Accept Delivery → same transaction as PATCH /hub/transfers/:id/receive
 */
@ApiTags('Hub Material Receipts')
@Controller({ version: '1', path: 'hub/material-receipts' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubMaterialReceiptsController {
  constructor(private readonly requisitionsService: RequisitionsService) {}

  private actor(user: AuthenticatedHubUser) {
    return {
      id: user.id,
      name: user.fullName,
      role: user.role,
    };
  }

  @Post()
  @HubPermission('inventory')
  @ApiOperation({
    summary: 'Accept delivery / create material receipt (closes transfer)',
  })
  async create(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Body() body: ReceiveRequisitionDto,
  ) {
    const id = body.transferId || body.requisitionId;
    if (!id) {
      throw new BadRequestException('transferId or requisitionId is required');
    }

    const transfer = await this.requisitionsService.getIncomingTransfer(
      user.hubId,
      id,
    );
    const data = await this.requisitionsService.receive(
      transfer.id,
      user.hubId,
      this.actor(user),
      body,
    );
    return {
      success: true,
      message: 'Material receipt created',
      data,
    };
  }

  @Get(':id')
  @HubPermission('inventory')
  @ApiOperation({ summary: 'Get material receipt / received transfer detail' })
  async getOne(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.requisitionsService.getIncomingTransfer(
      user.hubId,
      id,
    );
    return { success: true, message: 'Material receipt fetched', data };
  }
}
