import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { ProductQueryDto } from './dto/product-query.dto';
import {
  ProductListResponseDto,
  ProductResponseDto,
} from './dto/product-response.dto';
import { ProductService } from './product.service';

@Public()
@ApiTags(SWAGGER_TAGS.PRODUCTS)
@Controller({ version: '1', path: 'products' })
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @ApiOperation({
    summary: 'List products',
    description:
      'Paginated product catalog with filters for category, search, featured, bestSelling, sort, page, and limit. Read-only Customer APP endpoint.',
  })
  @ApiQuery({ name: 'category', required: false, example: 'cement' })
  @ApiQuery({ name: 'search', required: false, example: 'ultratech' })
  @ApiQuery({ name: 'featured', required: false, example: true })
  @ApiQuery({ name: 'bestSelling', required: false, example: true })
  @ApiQuery({ name: 'offers', required: false, example: true })
  @ApiQuery({ name: 'newArrivals', required: false, example: true })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'sortBy', required: false, example: 'price' })
  @ApiQuery({ name: 'sortOrder', required: false, example: 'asc' })
  @ApiResponse({
    status: 200,
    description: 'Products fetched successfully',
    schema: {
      example: {
        success: true,
        message: 'Products fetched successfully',
        data: {
          items: [
            {
              id: 'uuid',
              slug: 'ultratech-premium-ppc-cement',
              name: 'UltraTech Premium PPC Cement',
              price: 380,
              gst: 18,
              thumbnail: 'https://cdn.example.com/cement.jpg',
              unit: 'Bag',
              isFeatured: true,
              isBestSelling: false,
            },
          ],
          meta: {
            page: 1,
            limit: 20,
            total: 48,
            totalPages: 3,
            hasNextPage: true,
            hasPrevPage: false,
          },
        },
      },
    },
  })
  async findAll(@Query() query: ProductQueryDto): Promise<{
    success: boolean;
    message: string;
    data: ProductListResponseDto;
  }> {
    const data = await this.productService.findAll(query);
    return {
      success: true,
      message: 'Products fetched successfully',
      data,
    };
  }

  @Get('home')
  @ApiOperation({
    summary: 'Home product discovery rails',
    description:
      'Returns featured, popular, offers, and recentlyAdded product rails in one response for the Customer APP home screen. Optional section=featured|popular|offers|new returns a single rail. Optional hubId scopes popular/offers stock to the nearest hub.',
  })
  @ApiQuery({
    name: 'section',
    required: false,
    enum: ['featured', 'popular', 'offers', 'new'],
  })
  @ApiQuery({ name: 'latitude', required: false })
  @ApiQuery({ name: 'longitude', required: false })
  @ApiQuery({ name: 'pincode', required: false })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Home products fetched successfully',
    schema: {
      example: {
        success: true,
        message: 'Home products fetched successfully',
        data: {
          featured: [],
          popular: [],
          offers: [],
          recentlyAdded: [],
        },
      },
    },
  })
  async getHomeProducts(
    @Query('section') section?: 'featured' | 'popular' | 'offers' | 'new',
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('pincode') pincode?: string,
    @Query('limit') limit?: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      featured: ProductResponseDto[];
      popular: ProductResponseDto[];
      offers: ProductResponseDto[];
      recentlyAdded: ProductResponseDto[];
    };
  }> {
    const parsedLimit = limit ? Number(limit) : undefined;
    const parsedLat = latitude ? Number(latitude) : undefined;
    const parsedLng = longitude ? Number(longitude) : undefined;
    const data = await this.productService.findHomeProducts({
      latitude: Number.isFinite(parsedLat) ? parsedLat : undefined,
      longitude: Number.isFinite(parsedLng) ? parsedLng : undefined,
      pincode,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      section,
    });
    return {
      success: true,
      message: 'Home products fetched successfully',
      data,
    };
  }

  @Get(':slug')
  @ApiOperation({
    summary: 'Get product by slug',
    description:
      'Returns product details with images, category, variants, and related products from the same category.',
  })
  @ApiParam({ name: 'slug', example: 'ultratech-premium-ppc-cement' })
  @ApiResponse({ status: 200, description: 'Product fetched successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findBySlug(
    @Param('slug') slug: string,
  ): Promise<{ success: boolean; message: string; data: ProductResponseDto }> {
    const data = await this.productService.findBySlug(slug);
    return {
      success: true,
      message: 'Product fetched successfully',
      data,
    };
  }
}
