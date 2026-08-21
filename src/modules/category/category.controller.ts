import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { ProductService } from '../product/product.service';
import { ProductQueryDto } from '../product/dto/product-query.dto';
import { ProductListResponseDto } from '../product/dto/product-response.dto';
import { CategoryService } from './category.service';
import { CategoryQueryDto } from './dto/category-query.dto';
import {
  CategoryDetailResponseDto,
  CategoryResponseDto,
} from './dto/category-response.dto';

@Public()
@ApiTags(SWAGGER_TAGS.CATEGORIES)
@Controller({ version: '1', path: 'categories' })
export class CategoryController {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly productService: ProductService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List visible categories',
    description:
      'Returns only visible categories sorted by displayOrder. Cached in Redis under key `categories` (TTL 600s).',
  })
  @ApiResponse({
    status: 200,
    description: 'Categories fetched successfully',
  })
  async findAll(@Query() query: CategoryQueryDto): Promise<{
    success: boolean;
    message: string;
    data: CategoryResponseDto[];
  }> {
    const data = await this.categoryService.findAll(query.featured);
    return {
      success: true,
      message: 'Categories fetched successfully',
      data,
    };
  }

  @Get(':id/products')
  @ApiOperation({
    summary: 'List products for a category (by UUID or slug)',
    description:
      'Paginated products for the given category id/slug. Includes child subcategory products when filtering by parent.',
  })
  @ApiParam({
    name: 'id',
    example: 'cement',
    description: 'Category UUID or slug',
  })
  @ApiResponse({ status: 200, description: 'Category products fetched' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async findProducts(
    @Param('id') id: string,
    @Query() query: ProductQueryDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: ProductListResponseDto;
  }> {
    const data = await this.productService.findByCategoryIdOrSlug(id, query);
    return {
      success: true,
      message: 'Category products fetched successfully',
      data,
    };
  }

  @Get(':slug')
  @ApiOperation({
    summary: 'Get category by slug',
    description: 'Returns category details including child categories.',
  })
  @ApiParam({ name: 'slug', example: 'cement' })
  @ApiResponse({ status: 200, type: ApiResponseDto })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async findBySlug(@Param('slug') slug: string): Promise<{
    success: boolean;
    message: string;
    data: CategoryDetailResponseDto;
  }> {
    const data = await this.categoryService.findBySlug(slug);
    return {
      success: true,
      message: 'Category fetched successfully',
      data,
    };
  }
}
