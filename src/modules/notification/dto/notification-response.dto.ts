import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '../../../../generated/prisma/client';

export class NotificationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    enum: NotificationType,
    example: NotificationType.ORDER,
  })
  type!: NotificationType;

  @ApiProperty({ example: 'ORDER UPDATE' })
  label!: string;

  @ApiProperty({ example: 'Order #BJW-882 confirmed' })
  title!: string;

  @ApiProperty({ example: 'Your order has been confirmed and is being packed.' })
  body!: string;

  @ApiPropertyOptional({ example: 'Track Order' })
  actionLabel?: string | null;

  @ApiPropertyOptional({ example: '/(tabs)/orders' })
  actionRoute?: string | null;

  @ApiPropertyOptional({ example: 'outline' })
  actionVariant?: string | null;

  @ApiProperty()
  isRead!: boolean;

  @ApiProperty({ example: '2026-07-17T12:00:00.000Z' })
  createdAt!: string;
}

export class UnreadCountResponseDto {
  @ApiProperty({ example: 3 })
  count!: number;
}
