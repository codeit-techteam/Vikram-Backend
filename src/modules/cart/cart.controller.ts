import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { CartService } from './cart.service';
import {
  AddCartItemDto,
  CartResponseDto,
  UpdateCartItemDto,
} from './dto/cart.dto';

@ApiTags(SWAGGER_TAGS.CART)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'cart' })
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({
    summary: 'Get customer cart',
    description:
      'Returns the customer cart with line items and totals (subtotal, GST, delivery charge, grand total). One cart per customer. Cached (`cart:{customerId}`, TTL 300s).',
  })
  @ApiResponse({
    status: 200,
    type: CartResponseDto,
    schema: {
      example: {
        success: true,
        message: 'Cart fetched successfully',
        data: {
          id: 'uuid',
          itemCount: 1,
          subtotal: 850,
          gstAmount: 153,
          deliveryCharge: 150,
          grandTotal: 1153,
          items: [],
        },
      },
    },
  })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async getCart(
    @CurrentUser() user: AuthenticatedCustomer,
  ): Promise<{ success: boolean; message: string; data: CartResponseDto }> {
    const data = await this.cartService.getCart(user.id);
    return { success: true, message: 'Cart fetched successfully', data };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add product to cart',
    description:
      'Adds a product to the cart. If the product already exists, quantity is incremented. Rejects hidden/inactive products and quantities exceeding available hub stock.',
  })
  @ApiBody({
    type: AddCartItemDto,
    examples: {
      default: {
        value: { productId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', quantity: 2 },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Item added', type: CartResponseDto })
  @ApiResponse({ status: 400, description: 'Validation / stock / visibility error', type: ApiErrorResponseDto })
  async addItem(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: AddCartItemDto,
  ): Promise<{ success: boolean; message: string; data: CartResponseDto }> {
    const data = await this.cartService.addItem(user.id, dto);
    return { success: true, message: 'Item added to cart', data };
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add product to cart (alias)',
    description: 'Alias for POST /cart — same behavior for mobile clients that call /cart/items.',
  })
  @ApiBody({ type: AddCartItemDto })
  @ApiResponse({ status: 200, description: 'Item added', type: CartResponseDto })
  async addItemAlias(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: AddCartItemDto,
  ): Promise<{ success: boolean; message: string; data: CartResponseDto }> {
    const data = await this.cartService.addItem(user.id, dto);
    return { success: true, message: 'Item added to cart', data };
  }

  @Patch('item/:itemId')
  @ApiOperation({
    summary: 'Update cart item quantity',
    description: 'Sets absolute quantity for a cart line. Quantity cannot exceed available stock.',
  })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiBody({ type: UpdateCartItemDto, examples: { default: { value: { quantity: 5 } } } })
  @ApiResponse({ status: 200, type: CartResponseDto })
  @ApiResponse({ status: 404, description: 'Cart item not found', type: ApiErrorResponseDto })
  @ApiResponse({ status: 400, description: 'Stock / validation error', type: ApiErrorResponseDto })
  async updateItem(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateCartItemDto,
  ): Promise<{ success: boolean; message: string; data: CartResponseDto }> {
    const data = await this.cartService.updateItem(user.id, itemId, dto);
    return { success: true, message: 'Cart item updated', data };
  }

  @Delete('item/:itemId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove cart item',
    description: 'Removes a single line item from the cart.',
  })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiResponse({ status: 200, type: CartResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async removeItem(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<{ success: boolean; message: string; data: CartResponseDto }> {
    const data = await this.cartService.removeItem(user.id, itemId);
    return { success: true, message: 'Cart item removed', data };
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clear cart',
    description: 'Removes all items from the customer cart.',
  })
  @ApiResponse({ status: 200, type: CartResponseDto })
  async clearCart(
    @CurrentUser() user: AuthenticatedCustomer,
  ): Promise<{ success: boolean; message: string; data: CartResponseDto }> {
    const data = await this.cartService.clearCart(user.id);
    return { success: true, message: 'Cart cleared successfully', data };
  }
}
