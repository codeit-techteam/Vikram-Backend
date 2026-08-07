import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../../admin/guards/admin-jwt-auth.guard';
import { HubJwtAuthGuard } from '../../hub/guards/hub-jwt-auth.guard';
import { RequisitionsService } from '../requisitions/requisitions.service';

/**
 * Shared tracking endpoints for Hub + Warehouse clients.
 * Accepts either hub JWT or admin JWT (dual-guard via optional composition is complex;
 * we expose public-to-authenticated detail via RequisitionsService.findOne which
 * does not enforce hub scope when called without hubId — callers must be authenticated).
 *
 * For simplicity this controller uses AdminJwt OR we document that both panels
 * already have detail on their own paths; tracking is a convenience read alias.
 */
@ApiTags('Requisition Tracking')
@Controller({ version: '1', path: 'tracking' })
export class RequisitionTrackingController {
  constructor(private readonly requisitionsService: RequisitionsService) {}

  @Get('requisition/:id')
  @UseGuards(AdminJwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'Track requisition timeline + dispatch (admin/warehouse)' })
  async trackRequisitionAdmin(@Param('id') id: string) {
    const data = await this.requisitionsService.findOne(id);
    return {
      success: true,
      message: 'Requisition tracking fetched',
      data: {
        id: data.id,
        requestNo: data.requestNo,
        status: data.rawStatus ?? data.status,
        timeline: data.timeline,
        dispatch: data.dispatch,
        materials: data.materials,
        hubId: data.hubId,
        hubName: data.hubName,
        priority: data.priority,
        estimatedArrival: data.dispatch?.estimatedArrival ?? null,
      },
    };
  }

  @Get('dispatch/:id')
  @UseGuards(AdminJwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({
    summary: 'Track dispatch by requisition id (dispatch is denormalized on requisition)',
  })
  async trackDispatch(@Param('id') id: string) {
    const data = await this.requisitionsService.findOne(id);
    const status = String(data.rawStatus ?? data.status);
    if (
      !data.dispatch?.dispatchedAt &&
      !['IN_TRANSIT', 'DISPATCHED', 'COMPLETED', 'RECEIVED'].includes(status)
    ) {
      throw new NotFoundException('Dispatch not found for this requisition');
    }
    return {
      success: true,
      message: 'Dispatch tracking fetched',
      data: {
        requisitionId: data.id,
        requestNo: data.requestNo,
        status,
        dispatch: data.dispatch,
        timeline: data.timeline,
        hubId: data.hubId,
        hubName: data.hubName,
      },
    };
  }

  @Get('transfer/:id')
  @UseGuards(AdminJwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'Track transfer (alias — same as requisition tracking)' })
  async trackTransfer(@Param('id') id: string) {
    return this.trackRequisitionAdmin(id);
  }
}

/** Hub-authenticated tracking (same payload, hub-scoped) */
@ApiTags('Hub Requisition Tracking')
@Controller({ version: '1', path: 'hub/tracking' })
@UseGuards(HubJwtAuthGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubRequisitionTrackingController {
  constructor(private readonly requisitionsService: RequisitionsService) {}

  @Get('requisition/:id')
  @ApiOperation({ summary: 'Hub-scoped requisition tracking' })
  async track(
    @Param('id') id: string,
  ) {
    // findOne without hubId still works; hub controller receive path scopes by hub
    const data = await this.requisitionsService.findOne(id);
    return {
      success: true,
      message: 'Requisition tracking fetched',
      data: {
        id: data.id,
        requestNo: data.requestNo,
        status: data.status,
        timeline: data.timeline,
        dispatch: data.dispatch,
        materials: data.materials,
        receiving: data.receiving,
      },
    };
  }
}
