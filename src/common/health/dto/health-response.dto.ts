import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'Running' })
  backend: string;

  @ApiProperty({ example: 'Connected', enum: ['Connected', 'Disconnected'] })
  database: string;

  @ApiProperty({
    example: 'Connected',
    enum: ['Connected', 'Disconnected', 'Disabled'],
  })
  redis: string;

  @ApiProperty({ example: 'development' })
  environment: string;

  @ApiProperty({ example: '2026-07-17T08:00:00.000Z' })
  timestamp: string;
}
