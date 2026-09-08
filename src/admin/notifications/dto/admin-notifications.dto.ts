import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsInt, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateNotificationDto {
  @ApiProperty() @IsString() @MaxLength(50) title: string;
  @ApiProperty() @IsString() @MaxLength(150) body: string;
  @ApiProperty() @IsString() type: string;
  @ApiProperty() @IsString() label: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isGlobal?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() actionLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() actionRoute?: string;
}

export class BroadcastNotificationDto {
  @ApiProperty() @IsString() @MaxLength(50) title: string;
  @ApiProperty() @IsString() @MaxLength(150) body: string;
  @ApiProperty() @IsString() type: string;
  @ApiProperty() @IsString() label: string;
  @ApiPropertyOptional() @IsOptional() @IsString() actionLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() actionRoute?: string;
}

export class UpdateNotificationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) body?: string;
}

export class NotificationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
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
