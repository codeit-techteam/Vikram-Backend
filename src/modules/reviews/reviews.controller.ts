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
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  SWAGGER_BEARER_AUTH,
  SWAGGER_TAGS,
} from '../../common/constants/swagger.constants';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import {
  CreateReviewDto,
  ProductReviewsResponseDto,
  ReviewResponseDto,
  UpdateReviewDto,
} from './dto/review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags(SWAGGER_TAGS.REVIEWS)
@Controller({ version: '1', path: 'reviews' })
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create product review',
    description:
      'Customer can review a product only from a delivered order. One review per product per order.',
  })
  @ApiResponse({ status: 201, type: ReviewResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation / business rule error',
    type: ApiErrorResponseDto,
  })
  async create(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: CreateReviewDto,
  ): Promise<{ success: boolean; message: string; data: ReviewResponseDto }> {
    const data = await this.reviewsService.create(customer.id, dto);
    return {
      success: true,
      message: 'Review submitted successfully',
      data,
    };
  }

  @Public()
  @Get('product/:productId')
  @ApiOperation({
    summary: 'List product reviews',
    description: 'Public list of visible reviews with average rating.',
  })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiResponse({ status: 200, type: ProductReviewsResponseDto })
  async findByProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: ProductReviewsResponseDto;
  }> {
    const data = await this.reviewsService.findByProduct(productId);
    return {
      success: true,
      message: 'Product reviews fetched successfully',
      data,
    };
  }

  @Patch(':reviewId')
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOperation({ summary: 'Update own review' })
  @ApiParam({ name: 'reviewId', description: 'Review UUID' })
  @ApiResponse({ status: 200, type: ReviewResponseDto })
  @ApiResponse({
    status: 403,
    description: 'Not review owner',
    type: ApiErrorResponseDto,
  })
  async update(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: UpdateReviewDto,
  ): Promise<{ success: boolean; message: string; data: ReviewResponseDto }> {
    const data = await this.reviewsService.update(customer.id, reviewId, dto);
    return {
      success: true,
      message: 'Review updated successfully',
      data,
    };
  }

  @Delete(':reviewId')
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete own review (soft delete)' })
  @ApiParam({ name: 'reviewId', description: 'Review UUID' })
  @ApiResponse({ status: 200, description: 'Review deleted' })
  async remove(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
  ): Promise<{ success: boolean; message: string; data: null }> {
    await this.reviewsService.remove(customer.id, reviewId);
    return {
      success: true,
      message: 'Review deleted successfully',
      data: null,
    };
  }
}
