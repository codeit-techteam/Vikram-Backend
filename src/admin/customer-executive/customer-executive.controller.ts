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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { ApiAdminRoles } from '../decorators/api-admin-roles.decorator';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { CustomerExecutiveService } from './customer-executive.service';
import {
  CeBulkAssignDto,
  CeBulkConvertDto,
  CeBulkFollowUpDto,
  CeBulkFollowUpStatusDto,
  CeBulkNoteDto,
  CeBulkQueryDto,
  CeBulkQuotationDto,
  CeBulkQuotationStatusDto,
  CeBulkRejectDto,
  CeBulkStatusDto,
  CeCancelOrderDto,
  CeCreateOrderDto,
  CeCreateTicketDto,
  CeCustomerSearchQueryDto,
  CeEmergencyStatusDto,
  CeExpertCallbackQueryDto,
  CeLookupCustomerDto,
  CeOrdersQueryDto,
  CePaginationQueryDto,
  CePaymentQueryDto,
  CePaymentReminderDto,
  CeRegisterCustomerDto,
  CeRenewMembershipDto,
  CeSendOtpDto,
  CeSendPaymentLinkDto,
  CeTicketQueryDto,
  CeTrackingSearchQueryDto,
  CeUpdateCustomerDto,
  CeUpdateCustomerNoteDto,
  CeUpdateExpertCallbackDto,
  CeUpdateOrderAddressDto,
  CeUpdateOrderPaymentDto,
  CeUpdateTicketDto,
  CeVerifyOtpDto,
} from './dto/customer-executive.dto';

@ApiTags('Customer Executive')
@Controller({ version: '1', path: 'admin/customer-executive' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class CustomerExecutiveController {
  constructor(private readonly ceService: CustomerExecutiveService) {}

  @Get('dashboard')
  @ApiAdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Customer executive dashboard stats' })
  @ApiResponse({ status: 200, description: 'Dashboard stats' })
  async getDashboard(@CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.ceService.getDashboard(admin);
    return { success: true, message: 'Dashboard fetched', data };
  }

  @Get('activity')
  @ApiOperation({ summary: 'Recent activity feed for customer executive' })
  async getActivity(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Query('limit') limit?: number,
  ) {
    const data = await this.ceService.getActivity(
      admin,
      limit ? Number(limit) : 20,
    );
    return { success: true, message: 'Activity fetched', data };
  }

  @Post('customers/lookup')
  @ApiOperation({ summary: 'Lookup customer by mobile number' })
  async lookupCustomer(
    @Body() dto: CeLookupCustomerDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.lookupCustomer(dto, admin);
    return { success: true, message: 'Lookup completed', data };
  }

  @Post('customers/send-otp')
  @ApiOperation({ summary: 'Send OTP for new customer registration' })
  async sendRegistrationOtp(@Body() dto: CeSendOtpDto) {
    const data = await this.ceService.sendRegistrationOtp(dto);
    return { success: true, message: 'OTP sent', data };
  }

  @Post('customers/verify-otp')
  @ApiOperation({ summary: 'Verify OTP for new customer registration' })
  async verifyRegistrationOtp(@Body() dto: CeVerifyOtpDto) {
    const data = await this.ceService.verifyRegistrationOtp(dto);
    return { success: true, message: 'OTP verified', data };
  }

  @Post('customers')
  @ApiOperation({ summary: 'Register a new customer' })
  async registerCustomer(
    @Body() dto: CeRegisterCustomerDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.registerCustomer(dto, admin);
    return { success: true, message: 'Customer registered', data };
  }

  @Get('customers')
  @ApiOperation({ summary: 'List customers' })
  async getCustomers(
    @Query() query: CeCustomerSearchQueryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.findCustomers(query, admin);
    return { success: true, message: 'Customers fetched', data };
  }

  @Get('customers/search')
  @ApiOperation({ summary: 'Search customers by mobile, name, company, or ID' })
  async searchCustomers(
    @Query() query: CeCustomerSearchQueryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.searchCustomers(query, admin);
    return { success: true, message: 'Search results', data };
  }

  @Get('customers/:id')
  @ApiOperation({ summary: 'Get customer profile' })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  async getCustomer(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.findCustomer(id, admin);
    return { success: true, message: 'Customer fetched', data };
  }

  @Patch('customers/:id')
  @ApiOperation({ summary: 'Update customer profile' })
  async updateCustomer(
    @Param('id') id: string,
    @Body() dto: CeUpdateCustomerDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.updateCustomer(id, dto, admin);
    return { success: true, message: 'Customer updated', data };
  }

  @Patch('customers/:id/note')
  @ApiOperation({ summary: 'Update customer internal note' })
  async updateCustomerNote(
    @Param('id') id: string,
    @Body() dto: CeUpdateCustomerNoteDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.updateCustomerNote(id, dto, admin);
    return { success: true, message: 'Customer note updated', data };
  }

  @Get('customers/:id/membership')
  @ApiOperation({ summary: 'Get customer membership status' })
  async getMembership(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.getCustomerMembership(id, admin);
    return { success: true, message: 'Membership fetched', data };
  }

  @Patch('customers/:id/membership/renew')
  @ApiOperation({ summary: 'Renew customer membership' })
  async renewMembership(
    @Param('id') id: string,
    @Body() dto: CeRenewMembershipDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.renewCustomerMembership(id, dto, admin);
    return { success: true, message: 'Membership renewed', data };
  }

  @Get('customers/:id/loyalty')
  @ApiOperation({ summary: 'Get customer loyalty status (read-only)' })
  async getLoyalty(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.getCustomerLoyalty(id, admin);
    return { success: true, message: 'Loyalty fetched', data };
  }

  @Get('customers/:id/loyalty/history')
  @ApiOperation({ summary: 'Get customer loyalty history (read-only)' })
  async getLoyaltyHistory(
    @Param('id') id: string,
    @Query() query: CePaginationQueryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.getCustomerLoyaltyHistory(
      id,
      query,
      admin,
    );
    return { success: true, message: 'Loyalty history fetched', data };
  }

  @Get('orders')
  @ApiOperation({ summary: 'List orders' })
  async getOrders(
    @Query() query: CeOrdersQueryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.findOrders(query, admin);
    return { success: true, message: 'Orders fetched', data };
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get order details' })
  async getOrder(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.findOrder(id, admin);
    return { success: true, message: 'Order fetched', data };
  }

  @Post('orders')
  @ApiOperation({ summary: 'Create order on behalf of customer' })
  async createOrder(
    @Body() dto: CeCreateOrderDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.createOrder(dto, admin);
    return { success: true, message: 'Order created', data };
  }

  @Patch('orders/:id/cancel')
  @ApiOperation({ summary: 'Cancel pending order' })
  async cancelOrder(
    @Param('id') id: string,
    @Body() dto: CeCancelOrderDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.cancelOrder(id, dto, admin);
    return { success: true, message: 'Order cancelled', data };
  }

  @Patch('orders/:id/address')
  @ApiOperation({ summary: 'Update order delivery address' })
  async updateOrderAddress(
    @Param('id') id: string,
    @Body() dto: CeUpdateOrderAddressDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.updateOrderAddress(id, dto, admin);
    return { success: true, message: 'Order address updated', data };
  }

  @Patch('orders/:id/payment')
  @ApiOperation({ summary: 'Update order payment method' })
  async updateOrderPayment(
    @Param('id') id: string,
    @Body() dto: CeUpdateOrderPaymentDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.updateOrderPayment(id, dto, admin);
    return { success: true, message: 'Order payment updated', data };
  }

  @Get('orders/:id/tracking')
  @ApiOperation({ summary: 'Track order shipment' })
  async getOrderTracking(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.getOrderTracking(id, admin);
    return { success: true, message: 'Tracking fetched', data };
  }

  @Get('payments')
  @ApiOperation({ summary: 'List pending payments queue' })
  async getPayments(
    @Query() query: CePaymentQueryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.findPayments(query, admin);
    return { success: true, message: 'Payments fetched', data };
  }

  @Get('tracking/search')
  @ApiOperation({
    summary: 'Search order tracking by order ID, number, or customer',
  })
  async searchTracking(
    @Query() query: CeTrackingSearchQueryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.searchTracking(query, admin);
    return { success: true, message: 'Tracking search results', data };
  }

  @Get('bulk')
  @ApiOperation({ summary: 'List bulk procurement enquiries' })
  async getBulk(
    @Query() query: CeBulkQueryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.findBulkEnquiries(query, admin);
    return { success: true, message: 'Bulk enquiries fetched', data };
  }

  @Get('bulk/stats')
  @ApiOperation({ summary: 'Bulk enquiry pipeline stats (scoped)' })
  async getBulkStats(
    @Query() query: CeBulkQueryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.getBulkStats(admin, query);
    return { success: true, message: 'Bulk stats fetched', data };
  }

  @Get('bulk/:id')
  @ApiOperation({ summary: 'Get bulk enquiry details' })
  async getBulkById(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.findBulkEnquiry(id, admin);
    return { success: true, message: 'Bulk enquiry fetched', data };
  }

  @Patch('bulk/:id/status')
  @ApiOperation({ summary: 'Update bulk enquiry status' })
  async updateBulkStatus(
    @Param('id') id: string,
    @Body() dto: CeBulkStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.updateBulkStatus(id, dto, admin);
    return { success: true, message: 'Bulk status updated', data };
  }

  @Patch('bulk/:id/assign')
  @ApiOperation({ summary: 'Assign executive to bulk enquiry' })
  async assignBulk(
    @Param('id') id: string,
    @Body() dto: CeBulkAssignDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.assignBulkEnquiry(id, dto, admin);
    return { success: true, message: 'Bulk enquiry assigned', data };
  }

  @Post('bulk/:id/follow-ups')
  @ApiOperation({ summary: 'Add follow-up on bulk enquiry' })
  async addBulkFollowUp(
    @Param('id') id: string,
    @Body() dto: CeBulkFollowUpDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.addBulkFollowUp(id, dto, admin);
    return { success: true, message: 'Follow-up added', data };
  }

  @Patch('bulk/:id/follow-ups/:followUpId')
  @ApiOperation({ summary: 'Update bulk follow-up status' })
  async updateBulkFollowUp(
    @Param('id') id: string,
    @Param('followUpId') followUpId: string,
    @Body() dto: CeBulkFollowUpStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.updateBulkFollowUpStatus(
      id,
      followUpId,
      dto,
      admin,
    );
    return { success: true, message: 'Follow-up updated', data };
  }

  @Post('bulk/:id/notes')
  @ApiOperation({ summary: 'Add internal note on bulk enquiry' })
  async addBulkNote(
    @Param('id') id: string,
    @Body() dto: CeBulkNoteDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.addBulkNote(id, dto, admin);
    return { success: true, message: 'Note added', data };
  }

  @Post('bulk/:id/quotations')
  @ApiOperation({ summary: 'Create quotation for bulk enquiry' })
  async createBulkQuotation(
    @Param('id') id: string,
    @Body() dto: CeBulkQuotationDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.createBulkQuotation(id, dto, admin);
    return { success: true, message: 'Quotation created', data };
  }

  @Patch('bulk/:id/quotations/:quotationId/status')
  @ApiOperation({ summary: 'Update bulk quotation status' })
  async updateBulkQuotationStatus(
    @Param('id') id: string,
    @Param('quotationId') quotationId: string,
    @Body() dto: CeBulkQuotationStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.updateBulkQuotationStatus(
      id,
      quotationId,
      dto,
      admin,
    );
    return { success: true, message: 'Quotation status updated', data };
  }

  @Post('bulk/:id/convert')
  @ApiOperation({ summary: 'Convert bulk enquiry to order' })
  async convertBulk(
    @Param('id') id: string,
    @Body() dto: CeBulkConvertDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.convertBulkEnquiry(id, dto, admin);
    return { success: true, message: 'Enquiry converted to order', data };
  }

  @Patch('bulk/:id/reject')
  @ApiOperation({ summary: 'Reject bulk enquiry' })
  async rejectBulk(
    @Param('id') id: string,
    @Body() dto: CeBulkRejectDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.rejectBulkEnquiry(id, dto, admin);
    return { success: true, message: 'Enquiry rejected', data };
  }

  @Patch('bulk/:id/cancel')
  @ApiOperation({ summary: 'Cancel bulk enquiry' })
  async cancelBulk(
    @Param('id') id: string,
    @Body() dto: CeBulkRejectDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.cancelBulkEnquiry(id, dto, admin);
    return { success: true, message: 'Enquiry cancelled', data };
  }

  @Get('emergency')
  @ApiOperation({ summary: 'List emergency orders' })
  async getEmergency(@Query() query: CePaginationQueryDto) {
    const data = await this.ceService.findEmergencyOrders(query);
    return { success: true, message: 'Emergency orders fetched', data };
  }

  @Get('emergency/:id')
  @ApiOperation({ summary: 'Get emergency order details' })
  async getEmergencyById(@Param('id') id: string) {
    const data = await this.ceService.findEmergencyOrder(id);
    return { success: true, message: 'Emergency order fetched', data };
  }

  @Patch('emergency/:id/status')
  @ApiOperation({ summary: 'Update emergency order status' })
  async updateEmergencyStatus(
    @Param('id') id: string,
    @Body() dto: CeEmergencyStatusDto,
  ) {
    const data = await this.ceService.updateEmergencyStatus(id, dto);
    return { success: true, message: 'Emergency status updated', data };
  }

  @Post('payment/send-link')
  @ApiOperation({ summary: 'Send payment link to customer' })
  async sendPaymentLink(
    @Body() dto: CeSendPaymentLinkDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.sendPaymentLink(dto, admin);
    return { success: true, message: 'Payment link sent', data };
  }

  @Post('payment/reminder')
  @ApiOperation({ summary: 'Send payment reminder to customer' })
  async sendPaymentReminder(
    @Body() dto: CePaymentReminderDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.sendPaymentReminder(dto, admin);
    return { success: true, message: 'Payment reminder sent', data };
  }

  @Post('tickets')
  @ApiOperation({ summary: 'Create support ticket' })
  async createTicket(
    @Body() dto: CeCreateTicketDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.createTicket(dto, admin);
    return { success: true, message: 'Ticket created', data };
  }

  @Get('tickets')
  @ApiOperation({ summary: 'List support tickets' })
  async getTickets(
    @Query() query: CeTicketQueryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.findTickets(query, admin);
    return { success: true, message: 'Tickets fetched', data };
  }

  @Get('tickets/:id')
  @ApiOperation({ summary: 'Get support ticket details' })
  async getTicket(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.findTicket(id, admin);
    return { success: true, message: 'Ticket fetched', data };
  }

  @Patch('tickets/:id')
  @ApiOperation({ summary: 'Update support ticket' })
  async updateTicket(
    @Param('id') id: string,
    @Body() dto: CeUpdateTicketDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.updateTicket(id, dto, admin);
    return { success: true, message: 'Ticket updated', data };
  }

  @Get('expert-callbacks')
  @ApiOperation({
    summary: 'List material expert callback requests from the app',
  })
  async getExpertCallbacks(
    @Query() query: CeExpertCallbackQueryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.findExpertCallbacks(query, admin);
    return { success: true, message: 'Expert callbacks fetched', data };
  }

  @Get('expert-callbacks/:id')
  @ApiOperation({ summary: 'Get material expert callback request details' })
  @ApiParam({ name: 'id' })
  async getExpertCallback(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.findExpertCallback(id, admin);
    return { success: true, message: 'Expert callback fetched', data };
  }

  @Patch('expert-callbacks/:id')
  @ApiOperation({ summary: 'Update material expert callback status / notes' })
  @ApiParam({ name: 'id' })
  async updateExpertCallback(
    @Param('id') id: string,
    @Body() dto: CeUpdateExpertCallbackDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.ceService.updateExpertCallback(id, dto, admin);
    return { success: true, message: 'Expert callback updated', data };
  }
}
