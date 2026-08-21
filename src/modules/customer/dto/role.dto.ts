import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class RoleResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Individual' })
  name!: string;

  @ApiProperty({ example: 'individual' })
  slug!: string;

  @ApiPropertyOptional({ example: 'Homeowner or personal buyer' })
  description?: string | null;
}

export class SelectRoleDto {
  @ApiProperty({
    example: 'uuid',
    description: 'Role ID from GET /customer/roles',
  })
  @IsUUID('4', { message: 'roleId must be a valid UUID' })
  @IsNotEmpty()
  roleId!: string;
}
