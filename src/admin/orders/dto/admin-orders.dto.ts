import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsString, IsOptional, IsInt, Min, IsBoolean } from 'class-validator';

function toBoolean(value: unknown): boolean | undefined {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
}

export class AdminOrderQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional({
    description:
      'Status bucket: pending | accepted | dispatch | completed | delivered | cancelled | unassigned',
  })
  @IsOptional()
  @IsString()
  bucket?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hubId?: string;
  @ApiPropertyOptional({
    description:
      'When true, only orders with no hub assigned (awaiting allocation).',
  })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  unassigned?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() fromDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() toDate?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

export class UpdateOrderStatusDto {
  @IsString() status: string;
  @ApiPropertyOptional() @IsOptional() @IsString() remarks?: string;
}

export class AssignHubDto {
  @IsString() hubId: string;
}

export class AssignDriverDto {
  @IsString() driverId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expectedDeliveryAt?: string;
}

export class CancelOrderDto {
  @IsString() reason: string;
}

export class UpdateAdminInternalNoteDto {
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  note?: string | null;
}
