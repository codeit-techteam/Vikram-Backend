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
import { AdminTestimonialsService } from './admin-testimonials.service';
import {
  CreateTestimonialDto,
  UpdateTestimonialDto,
  TestimonialQueryDto,
} from './dto/admin-testimonials.dto';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';

@ApiTags('Admin Testimonials')
@Controller({ version: '1', path: 'admin/testimonials' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminTestimonialsController {
  constructor(
    private readonly testimonialsService: AdminTestimonialsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'List all testimonials' })
  async findAll(@Query() query: TestimonialQueryDto) {
    const data = await this.testimonialsService.findAll(query);
    return { success: true, message: 'Testimonials fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get testimonial by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.testimonialsService.findOne(id);
    return { success: true, message: 'Testimonial fetched', data };
  }

  @Post()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Create testimonial (VIDEO, IMAGE, or text review)',
  })
  async create(
    @Body() dto: CreateTestimonialDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.testimonialsService.create(dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'Testimonial',
      resourceId: data.id,
      newValue: dto,
    });
    return { success: true, message: 'Testimonial created', data };
  }

  @Post('reorder')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Reorder testimonials' })
  async reorder(
    @Body() body: { items: Array<{ id: string; sortOrder: number }> },
  ) {
    const data = await this.testimonialsService.reorder(body.items);
    return { success: true, message: 'Testimonials reordered', data };
  }

  @Patch(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update testimonial' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTestimonialDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.testimonialsService.update(id, dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'Testimonial',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Testimonial updated', data };
  }

  @Patch(':id/publish')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Publish testimonial (auto-consumed by Customer App Home API)',
  })
  async publish(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.testimonialsService.publish(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'PUBLISH',
      resource: 'Testimonial',
      resourceId: id,
    });
    return { success: true, message: 'Testimonial published', data };
  }

  @Patch(':id/unpublish')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Unpublish testimonial' })
  async unpublish(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.testimonialsService.unpublish(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UNPUBLISH',
      resource: 'Testimonial',
      resourceId: id,
    });
    return { success: true, message: 'Testimonial unpublished', data };
  }

  @Delete(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Delete testimonial' })
  async remove(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.testimonialsService.remove(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'DELETE',
      resource: 'Testimonial',
      resourceId: id,
    });
    return { success: true, message: 'Testimonial deleted', data };
  }
}
