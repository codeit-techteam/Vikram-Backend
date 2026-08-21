import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { BannerPlacement } from '../../../../generated/prisma/client';

export class BannerQueryDto {
  @ApiPropertyOptional({
    enum: BannerPlacement,
    default: BannerPlacement.HOME_HERO,
  })
  @IsOptional()
  @IsEnum(BannerPlacement)
  placement?: BannerPlacement;
}
