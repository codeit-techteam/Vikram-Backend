import {
  Body,
  Controller,
  Get,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../../../generated/prisma/client';
import { DeliveryOperatingConfigService } from '../../modules/delivery/delivery-operating-config.service';
import { DeliveryScheduleService } from '../../modules/delivery/delivery-schedule.service';

export class AdminDeliveryScheduleQueryDto {
  @ApiPropertyOptional({ example: '2026-09-23' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ enum: ['today', 'tomorrow', 'scheduled', 'all'] })
  @IsOptional()
  @IsString()
  bucket?: 'today' | 'tomorrow' | 'scheduled' | 'all';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hubId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleType?: string;
}

export class UpdateDeliveryOperatingConfigDto {
  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 660, description: 'Minutes from midnight IST' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  openMinutes?: number;

  @ApiPropertyOptional({ example: 990 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  closeMinutes?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(240)
  slotDurationMinutes?: number;

  @ApiPropertyOptional({
    type: [Number],
    example: [1, 2, 3, 4, 5, 6],
    description: 'ISO weekdays 1=Mon … 7=Sun',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  workingWeekdays?: number[];

  @ApiPropertyOptional({
    type: [String],
    example: ['2026-01-26'],
    description: 'Extra holiday dates YYYY-MM-DD',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(366)
  @IsString({ each: true })
  holidayDates?: string[];
}

@ApiTags('Admin Delivery Schedule')
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminDeliveryScheduleController {
  constructor(
    private readonly scheduleService: DeliveryScheduleService,
    private readonly operatingConfig: DeliveryOperatingConfigService,
    private readonly auditService: AuditService,
  ) {}

  @Get('delivery-schedule')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Cross-hub delivery schedule' })
  async getSchedule(@Query() query: AdminDeliveryScheduleQueryDto) {
    const data = await this.scheduleService.getSchedule(query);
    return { success: true, message: 'Admin delivery schedule fetched', data };
  }

  @Get('delivery-operating-config')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Get delivery hours / holiday settings' })
  async getOperatingConfig() {
    const data = await this.operatingConfig.ensureDefault();
    return { success: true, message: 'Delivery operating config', data };
  }

  @Patch('delivery-operating-config')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update delivery hours / holidays / slot duration' })
  async updateOperatingConfig(
    @Body() dto: UpdateDeliveryOperatingConfigDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const before = await this.operatingConfig.getConfig();
    const data = await this.operatingConfig.updateConfig({
      ...dto,
      updatedBy: admin.id,
      updatedByName: admin.email,
    });
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: AuditAction.UPDATE,
      resource: 'DeliveryOperatingConfig',
      resourceId: 'DEFAULT',
      oldValue: before,
      newValue: data,
    });
    return { success: true, message: 'Delivery operating config updated', data };
  }
}
