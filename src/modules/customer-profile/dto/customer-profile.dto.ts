import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { OrderListItemDto } from '../../orders/dto/order-response.dto';
import { AddressResponseDto } from '../../customer/dto/address.dto';
import { ProfileResponseDto } from '../../customer/dto/profile.dto';

export class UpdateProfileImageDto {
  @ApiProperty({ example: 'https://cdn.example.com/profiles/user.jpg' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  profileImage!: string;
}

export class ChangeMobileDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+91|91|0)?[6-9]\d{9}$/, {
    message: 'Enter a valid Indian mobile number',
  })
  newMobile!: string;

  @ApiProperty({ example: '123456', description: 'OTP sent to new mobile' })
  @IsString()
  @Length(4, 8)
  otp!: string;
}

export class ChangeEmailDto {
  @ApiProperty({ example: 'rahul@example.com' })
  @IsEmail()
  @MaxLength(200)
  newEmail!: string;
}

export class CustomerActivityResponseDto {
  @ApiProperty({ type: [OrderListItemDto] })
  recentOrders!: OrderListItemDto[];

  @ApiProperty({ type: [AddressResponseDto] })
  addresses!: AddressResponseDto[];

  @ApiProperty()
  wishlistCount!: number;

  @ApiProperty()
  cartCount!: number;

  @ApiPropertyOptional({ type: ProfileResponseDto })
  profile?: ProfileResponseDto;
}

export class RequestMobileOtpDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+91|91|0)?[6-9]\d{9}$/, {
    message: 'Enter a valid Indian mobile number',
  })
  newMobile!: string;
}

export class RequestMobileOtpResponseDto {
  @ApiProperty()
  expiresIn!: number;

  @ApiPropertyOptional({ description: 'Returned only in non-production' })
  otp?: string;
}
