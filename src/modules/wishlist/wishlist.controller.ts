import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Body,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { WishlistService } from './wishlist.service';
import { AddWishlistDto, WishlistResponseDto } from './dto/wishlist.dto';

@ApiTags(SWAGGER_TAGS.WISHLIST)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'wishlist' })
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiOperation({
    summary: 'Get customer wishlist',
    description:
      'Returns all wishlist products for the authenticated customer with total count. Cached in Redis (`wishlist:{customerId}`, TTL 600s).',
  })
  @ApiResponse({
    status: 200,
    description: 'Wishlist fetched successfully',
    type: WishlistResponseDto,
    schema: {
      example: {
        success: true,
        message: 'Wishlist fetched successfully',
        data: {
          id: 'uuid',
          count: 1,
          items: [
            {
              id: 'uuid',
              productId: 'uuid',
              createdAt: '2026-07-17T12:00:00.000Z',
              product: {
                id: 'uuid',
                slug: 'ultratech-premium-ppc-cement',
                name: 'UltraTech Premium PPC',
                brand: 'UltraTech',
                unit: 'Bag',
                price: 425,
                gst: 18,
                thumbnailUrl: 'https://example.com/cement.jpg',
                isVisible: true,
                status: 'IN STOCK',
              },
            },
          ],
        },
      },
    },
  })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async getWishlist(
    @CurrentUser() user: AuthenticatedCustomer,
  ): Promise<{ success: boolean; message: string; data: WishlistResponseDto }> {
    const data = await this.wishlistService.getWishlist(user.id);
    return {
      success: true,
      message: 'Wishlist fetched successfully',
      data,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add product to wishlist',
    description:
      'Adds a product to the customer wishlist. Duplicate products are rejected. Product must exist.',
  })
  @ApiBody({ type: AddWishlistDto, examples: { default: { value: { productId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' } } } })
  @ApiResponse({ status: 201, description: 'Product added to wishlist', type: WishlistResponseDto })
  @ApiResponse({ status: 404, description: 'Product not found', type: ApiErrorResponseDto })
  @ApiResponse({ status: 409, description: 'Product already in wishlist', type: ApiErrorResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error', type: ApiErrorResponseDto })
  async addItem(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: AddWishlistDto,
  ): Promise<{ success: boolean; message: string; data: WishlistResponseDto }> {
    const data = await this.wishlistService.addItem(user.id, dto);
    return {
      success: true,
      message: 'Product added to wishlist',
      data,
    };
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove product from wishlist',
    description: 'Removes a product from the customer wishlist by productId.',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Product removed from wishlist', type: WishlistResponseDto })
  @ApiResponse({ status: 404, description: 'Product not in wishlist', type: ApiErrorResponseDto })
  async removeItem(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<{ success: boolean; message: string; data: WishlistResponseDto }> {
    const data = await this.wishlistService.removeItem(user.id, productId);
    return {
      success: true,
      message: 'Product removed from wishlist',
      data,
    };
  }
}
