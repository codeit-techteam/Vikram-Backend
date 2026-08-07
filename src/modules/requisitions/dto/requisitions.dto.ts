import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  RequisitionPriority,
  RequisitionReason,
  RequisitionStatus,
} from '../../../../generated/prisma/client';

export class RequisitionPaginationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(RequisitionStatus)
  status?: RequisitionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(RequisitionPriority)
  priority?: RequisitionPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ enum: ['createdAt', 'expectedDate', 'totalValue', 'requestNo'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

export class RequisitionItemInputDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  requestedQty!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateRequisitionDto {
  @ApiProperty({ enum: RequisitionPriority })
  @IsEnum(RequisitionPriority)
  priority!: RequisitionPriority;

  @ApiProperty({ enum: RequisitionReason })
  @IsEnum(RequisitionReason)
  reason!: RequisitionReason;

  @ApiProperty()
  @IsDateString()
  expectedDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiProperty({ type: [RequisitionItemInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequisitionItemInputDto)
  items!: RequisitionItemInputDto[];

  @ApiPropertyOptional({ description: 'If true, submit immediately after create' })
  @IsOptional()
  submit?: boolean;
}

export class UpdateRequisitionDto {
  @ApiPropertyOptional({ enum: RequisitionPriority })
  @IsOptional()
  @IsEnum(RequisitionPriority)
  priority?: RequisitionPriority;

  @ApiPropertyOptional({ enum: RequisitionReason })
  @IsOptional()
  @IsEnum(RequisitionReason)
  reason?: RequisitionReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional({ type: [RequisitionItemInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequisitionItemInputDto)
  items?: RequisitionItemInputDto[];
}

export class ApproveRequisitionItemDto {
  @ApiProperty()
  @IsUUID()
  itemId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  approvedQty!: number;
}

export class ApproveRequisitionDto {
  @ApiProperty({ type: [ApproveRequisitionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApproveRequisitionItemDto)
  items!: ApproveRequisitionItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class RejectRequisitionDto {
  @ApiProperty()
  @IsString()
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class AllocateRequisitionItemDto {
  @ApiProperty()
  @IsUUID()
  itemId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  allocatedQty!: number;
}

export class AllocateRequisitionDto {
  @ApiProperty({ type: [AllocateRequisitionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocateRequisitionItemDto)
  items!: AllocateRequisitionItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  warehouseBin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedDispatchDate?: string;
}

export class DispatchRequisitionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lrNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dispatchDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  estimatedArrival?: string;
}

export class ReceiveRequisitionItemDto {
  @ApiProperty()
  @IsUUID()
  itemId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  receivedQty!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  shortageQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  damageQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  missingQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class ReceivingDocumentInputDto {
  @ApiProperty()
  @IsString()
  url!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'GRN | GATE_PASS | DELIVERY_NOTE | SIGNED_INVOICE | OTHER',
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  size?: string;
}

export class ReceiveRequisitionDto {
  @ApiProperty({ type: [ReceiveRequisitionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveRequisitionItemDto)
  items!: ReceiveRequisitionItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Cloudflare R2 public URLs for delivery photos',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[];

  @ApiPropertyOptional({
    description: 'Cloudflare R2 document metadata (GRN, gate pass, etc.)',
    type: [ReceivingDocumentInputDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivingDocumentInputDto)
  documents?: ReceivingDocumentInputDto[];

  @ApiPropertyOptional({ description: 'Alias for transfer / requisition id' })
  @IsOptional()
  @IsString()
  transferId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requisitionId?: string;
}

export class RequisitionCommentDto {
  @ApiProperty()
  @IsString()
  message!: string;
}
