import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { VideoPlacement } from '../../../../generated/prisma/client';

export class VideoQueryDto {
  @ApiPropertyOptional({ enum: VideoPlacement, default: VideoPlacement.HOME })
  @IsOptional()
  @IsEnum(VideoPlacement)
  placement?: VideoPlacement;
}
