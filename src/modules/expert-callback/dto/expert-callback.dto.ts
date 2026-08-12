import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ExpertCallbackStatus } from '../../../../generated/prisma/client';
import { PaginationMetaDto } from '../../../common/dto/pagination.dto';

export class CreateExpertCallbackDto {
  @ApiProperty({ example: 'Rahul Sharma' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    example: 'Need 200 bags OPC 53 Grade cement for site in Jaipur',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(5000)
  needs!: string;

  @ApiPropertyOptional({ example: 'rmc' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  categorySlug?: string;

  @ApiPropertyOptional({ example: 'RMC' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  categoryName?: string;
}

export class ExpertCallbackResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  contactName!: string;

  @ApiProperty()
  needs!: string;

  @ApiPropertyOptional()
  phoneSnapshot?: string | null;

  @ApiPropertyOptional()
  categorySlug?: string | null;

  @ApiPropertyOptional()
  categoryName?: string | null;

  @ApiProperty({ enum: ExpertCallbackStatus })
  status!: ExpertCallbackStatus;

  @ApiProperty()
  createdAt!: string;
}

export class ExpertCallbackListResponseDto {
  @ApiProperty({ type: [ExpertCallbackResponseDto] })
  data!: ExpertCallbackResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
