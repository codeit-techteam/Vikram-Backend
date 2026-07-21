import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminWalletService } from './admin-wallet.service';
import { WalletTransactionDto, WalletQueryDto } from './dto/admin-wallet.dto';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';

@ApiTags('Admin Wallet')
@Controller({ version: '1', path: 'admin/wallet' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminWalletController {
  constructor(
    private readonly walletService: AdminWalletService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'List all customer wallets' })
  async findAll(@Query() query: WalletQueryDto) {
    const data = await this.walletService.findAllWallets(query);
    return { success: true, message: 'Wallets fetched', data };
  }

  @Get('history')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get wallet transaction history' })
  async history(@Query() query: WalletQueryDto) {
    const data = await this.walletService.getWalletHistory(query);
    return { success: true, message: 'Wallet history fetched', data };
  }

  @Get(':customerId')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get wallet by customer ID' })
  async findOne(@Param('customerId') customerId: string) {
    const data = await this.walletService.findWalletByCustomer(customerId);
    return { success: true, message: 'Wallet fetched', data };
  }

  @Post(':customerId/credit')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Credit wallet' })
  async credit(@Param('customerId') customerId: string, @Body() dto: WalletTransactionDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.walletService.creditWallet(customerId, dto);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'CREDIT', resource: 'Wallet', resourceId: customerId, newValue: dto });
    return { success: true, message: 'Wallet credited', data };
  }

  @Post(':customerId/debit')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Debit wallet' })
  async debit(@Param('customerId') customerId: string, @Body() dto: WalletTransactionDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.walletService.debitWallet(customerId, dto);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'DEBIT', resource: 'Wallet', resourceId: customerId, newValue: dto });
    return { success: true, message: 'Wallet debited', data };
  }

  @Post(':customerId/refund')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Refund to wallet' })
  async refund(@Param('customerId') customerId: string, @Body() dto: WalletTransactionDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.walletService.refundWallet(customerId, dto);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'REFUND', resource: 'Wallet', resourceId: customerId, newValue: dto });
    return { success: true, message: 'Wallet refunded', data };
  }
}
