import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { SkipResponseWrap } from '../../common/decorators/skip-response-wrap.decorator';
import { HubJwtAuthGuard } from '../guards/hub-jwt-auth.guard';
import { HubRolesGuard } from '../guards/hub-roles.guard';
import { HubPermission } from '../decorators/hub-roles.decorator';
import { CurrentHubUser } from '../decorators/current-hub-user.decorator';
import type { AuthenticatedHubUser } from '../auth/hub-jwt.strategy';
import { HubOrdersService } from './hub-orders.service';
import { InvoiceService } from '../../modules/invoice/invoice.service';
import {
  HubAssignDriverDto,
  HubAssignLoaderDto,
  HubAssignTeamDto,
  HubAssignVehicleDto,
  HubCancelOrderDto,
  HubOrderActionDto,
  HubOrderQueryDto,
  HubPodDto,
  HubRejectOrderDto,
  HubTimelineEntryDto,
  HubUpdateStatusDto,
  HubVerifyDeliveryOtpDto,
} from '../dto/hub.dto';

@ApiTags(SWAGGER_TAGS.HUB_ORDERS)
@Controller({ version: '1', path: 'hub/orders' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubOrdersController {
  constructor(
    private readonly ordersService: HubOrdersService,
    private readonly invoiceService: InvoiceService,
  ) {}

  @Get()
  @HubPermission('orders')
  @ApiOperation({ summary: 'List hub orders with filters' })
  async findAll(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query() query: HubOrderQueryDto,
  ) {
    const data = await this.ordersService.findAll(user.hubId, query);
    return { success: true, message: 'Hub orders fetched', data };
  }

  @Get(':id/timeline')
  @HubPermission('timeline')
  @ApiOperation({ summary: 'Get order timeline' })
  async timeline(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.ordersService.getTimeline(user.hubId, id);
    return { success: true, message: 'Order timeline fetched', data };
  }

  @Get(':id/invoice')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Get order invoice JSON (same as customer/admin)' })
  async getInvoice(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    await this.ordersService.findOne(user.hubId, id);
    const data = await this.invoiceService.getInvoiceByOrderId(id);
    return { success: true, message: 'Invoice fetched', data };
  }

  @Get(':id/invoice/pdf')
  @SkipResponseWrap()
  @Header('Content-Type', 'application/pdf')
  @ApiProduces('application/pdf')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Download order invoice PDF (single source)' })
  async getInvoicePdf(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    await this.ordersService.findOne(user.hubId, id);
    const { buffer, filename } = await this.invoiceService.getInvoicePdfByOrderId(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':id')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Get hub order details' })
  async findOne(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.ordersService.findOne(user.hubId, id);
    return { success: true, message: 'Hub order fetched', data };
  }

  @Post(':id/timeline')
  @HubPermission('timeline')
  @ApiOperation({ summary: 'Add order timeline entry' })
  async addTimeline(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubTimelineEntryDto,
  ) {
    const data = await this.ordersService.addTimeline(
      user.hubId,
      id,
      dto,
      user.fullName,
    );
    return { success: true, message: 'Timeline entry added', data };
  }

  @Post(':id/generate-delivery-otp')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Generate delivery OTP (sent to customer, not returned)' })
  async generateDeliveryOtp(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubOrderActionDto,
  ) {
    const data = await this.ordersService.generateDeliveryOtp(
      user.hubId,
      id,
      dto,
      user.fullName,
    );
    return { success: true, message: 'Delivery OTP generated', data };
  }

  @Post(':id/verify-delivery-otp')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Verify delivery OTP and complete delivery' })
  async verifyDeliveryOtp(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubVerifyDeliveryOtpDto,
  ) {
    const data = await this.ordersService.verifyDeliveryOtp(
      user.hubId,
      id,
      dto,
      user.fullName,
    );
    return { success: true, message: data.message, data };
  }

  @Patch(':id/status')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Update order status (single source of truth)' })
  async updateStatus(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubUpdateStatusDto,
  ) {
    const data = await this.ordersService.updateStatus(
      user.hubId,
      id,
      dto,
      user.fullName,
      user.role,
    );
    return { success: true, message: 'Order status updated', data };
  }

  @Patch(':id/accept')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Accept order at hub' })
  async accept(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubOrderActionDto,
  ) {
    const data = await this.ordersService.accept(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Order accepted', data };
  }

  @Patch(':id/reject')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Reject order at hub' })
  async reject(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubRejectOrderDto,
  ) {
    const data = await this.ordersService.reject(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Order rejected', data };
  }

  @Patch(':id/ready')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Mark order packed / ready' })
  async ready(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubOrderActionDto,
  ) {
    const data = await this.ordersService.markReady(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Order marked ready', data };
  }

  @Patch(':id/loading')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Mark order picking / loading' })
  async loading(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubOrderActionDto,
  ) {
    const data = await this.ordersService.markLoading(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Order loading started', data };
  }

  @Patch(':id/dispatch')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Mark out for delivery' })
  async dispatch(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubOrderActionDto,
  ) {
    const data = await this.ordersService.dispatch(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Order dispatched', data };
  }

  @Patch(':id/driver-reached')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Mark driver reached customer location' })
  async driverReached(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubOrderActionDto,
  ) {
    const data = await this.ordersService.markDriverReached(
      user.hubId,
      id,
      dto,
      user.fullName,
    );
    return { success: true, message: 'Driver marked as reached', data };
  }

  @Patch(':id/complete-delivery')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Complete delivery after OTP verification' })
  async completeDelivery(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubOrderActionDto,
  ) {
    const data = await this.ordersService.completeDelivery(
      user.hubId,
      id,
      dto,
      user.fullName,
    );
    return { success: true, message: 'Delivery completed', data };
  }

  @Patch(':id/deliver')
  @HubPermission('orders')
  @ApiOperation({
    summary: 'Mark order delivered (requires prior OTP verification)',
  })
  async deliver(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubOrderActionDto,
  ) {
    const data = await this.ordersService.deliver(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Order delivered', data };
  }

  @Patch(':id/cancel')
  @HubPermission('orders')
  @ApiOperation({ summary: 'Cancel order at hub' })
  async cancel(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubCancelOrderDto,
  ) {
    const data = await this.ordersService.cancel(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Order cancelled', data };
  }

  @Patch(':id/assign-driver')
  @HubPermission('assignments')
  @ApiOperation({ summary: 'Assign driver to order' })
  async assignDriver(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubAssignDriverDto,
  ) {
    const data = await this.ordersService.assignDriver(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Driver assigned', data };
  }

  @Patch(':id/assign-vehicle')
  @HubPermission('assignments')
  @ApiOperation({ summary: 'Assign vehicle to order' })
  async assignVehicle(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubAssignVehicleDto,
  ) {
    const data = await this.ordersService.assignVehicle(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Vehicle assigned', data };
  }

  @Patch(':id/assign-loader')
  @HubPermission('assignments')
  @ApiOperation({ summary: 'Assign loader to order' })
  async assignLoader(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubAssignLoaderDto,
  ) {
    const data = await this.ordersService.assignLoader(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Loader assigned', data };
  }

  @Patch(':id/assign-team')
  @HubPermission('assignments')
  @ApiOperation({ summary: 'Assign driver, vehicle and loader team' })
  async assignTeam(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubAssignTeamDto,
  ) {
    const data = await this.ordersService.assignTeam(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Team assigned', data };
  }

  @Post(':id/pod')
  @HubPermission('pod')
  @ApiOperation({ summary: 'Submit proof of delivery (requires OTP verification)' })
  async pod(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: HubPodDto,
  ) {
    const data = await this.ordersService.submitPod(user.hubId, id, dto, user.fullName);
    return { success: true, message: 'Proof of delivery submitted', data };
  }
}
