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
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminOffersService } from './admin-offers.service';
import {
  CreateOfferDto,
  UpdateOfferDto,
  OfferQueryDto,
  SetOfferProductsDto,
} from './dto/admin-offers.dto';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';

@ApiTags('Admin Offers')
@Controller({ version: '1', path: 'admin/offers' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminOffersController {
  constructor(
    private readonly offersService: AdminOffersService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'List all offers' })
  async findAll(@Query() query: OfferQueryDto) {
    const data = await this.offersService.findAll(query);
    return { success: true, message: 'Offers fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get offer by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.offersService.findOne(id);
    return { success: true, message: 'Offer fetched', data };
  }

  @Post()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Create offer' })
  async create(
    @Body() dto: CreateOfferDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.offersService.create(dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'Offer',
      resourceId: data.id,
      newValue: dto,
    });
    return { success: true, message: 'Offer created', data };
  }

  @Patch(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update offer' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOfferDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.offersService.update(id, dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'Offer',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Offer updated', data };
  }

  @Patch(':id/activate')
  @Post(':id/activate')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Activate offer' })
  async activate(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.offersService.activate(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'PUBLISH',
      resource: 'Offer',
      resourceId: id,
    });
    return { success: true, message: 'Offer activated', data };
  }

  @Patch(':id/publish')
  @Post(':id/publish')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Publish offer' })
  async publish(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.offersService.publish(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'PUBLISH',
      resource: 'Offer',
      resourceId: id,
    });
    return { success: true, message: 'Offer published successfully', data };
  }

  @Patch(':id/deactivate')
  @Post(':id/deactivate')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Deactivate offer' })
  async deactivate(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.offersService.deactivate(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UNPUBLISH',
      resource: 'Offer',
      resourceId: id,
    });
    return { success: true, message: 'Offer deactivated', data };
  }

  @Patch(':id/products')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Replace products linked to an offer' })
  async setProducts(
    @Param('id') id: string,
    @Body() dto: SetOfferProductsDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.offersService.setProducts(id, dto.productIds);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'Offer',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Offer products updated', data };
  }

  @Delete(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Delete offer' })
  async remove(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.offersService.remove(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'DELETE',
      resource: 'Offer',
      resourceId: id,
    });
    return { success: true, message: 'Offer deleted', data };
  }
}
