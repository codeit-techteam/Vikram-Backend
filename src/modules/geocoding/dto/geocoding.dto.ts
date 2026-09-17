import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class ReverseGeocodeQueryDto {
  @ApiProperty({ example: 22.9754, description: 'Latitude to resolve' })
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 88.4342, description: 'Longitude to resolve' })
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  lng!: number;
}

export class ForwardGeocodeQueryDto {
  @ApiProperty({ example: 'Salt Lake Sector V, Kolkata' })
  @IsString()
  @Length(2, 200)
  address!: string;
}

export class AutocompleteQueryDto {
  @ApiProperty({ example: 'Salt Lake', description: 'Partial address text' })
  @IsString()
  @Length(2, 200)
  input!: string;

  @ApiPropertyOptional({
    description:
      'Opaque token reused across keystrokes so Google bills the whole search as one session.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionToken?: string;
}

export class PlaceDetailsQueryDto {
  @ApiProperty({ example: 'ChIJLfyY2E4ZrjsRVq0stGY-tPs' })
  @IsString()
  @Length(2, 512)
  placeId!: string;

  @ApiPropertyOptional({
    description: 'Token from the matching autocomplete session.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionToken?: string;
}

export class ResolvedAddressDto {
  @ApiProperty({
    example: 'DN-51, Sector V, Bidhannagar, Kolkata, West Bengal 700091, India',
  })
  fullAddress!: string;

  @ApiProperty({ example: 'Kolkata' })
  city!: string;

  @ApiProperty({ example: 'West Bengal' })
  state!: string;

  @ApiProperty({ example: 'India' })
  country!: string;

  @ApiProperty({ example: '700091' })
  pincode!: string;

  @ApiProperty({ example: 22.9754 })
  latitude!: number;

  @ApiProperty({ example: 88.4342 })
  longitude!: number;

  @ApiPropertyOptional({ example: 'ChIJLfyY2E4ZrjsRVq0stGY-tPs' })
  placeId?: string;
}

export class PlaceSuggestionDto {
  @ApiProperty({ example: 'ChIJLfyY2E4ZrjsRVq0stGY-tPs' })
  placeId!: string;

  @ApiProperty({ example: 'Salt Lake Sector V, Kolkata, West Bengal, India' })
  description!: string;

  @ApiProperty({ example: 'Salt Lake Sector V' })
  mainText!: string;

  @ApiProperty({ example: 'Kolkata, West Bengal, India' })
  secondaryText!: string;
}
