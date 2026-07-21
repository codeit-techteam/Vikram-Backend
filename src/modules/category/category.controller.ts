import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
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
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @ApiOperation({
    summary: 'List visible categories',
    description:
      'Returns only visible categories sorted by displayOrder. Cached in Redis under key `categories` (TTL 600s).',
  })
  @ApiResponse({
    status: 200,
    description: 'Categories fetched successfully',
    schema: {
      example: {
        success: true,
        message: 'Categories fetched successfully',
        data: [
          {
            id: 'uuid',
            slug: 'cement',
            name: 'Cement',
            image: '/assets/category-cement.png',
            icon: null,
            displayOrder: 1,
            isVisible: true,
            isFeatured: true,
            productCount: 12,
          },
        ],
      },
    },
  })
  async findAll(
    @Query() query: CategoryQueryDto,
  ): Promise<{ success: boolean; message: string; data: CategoryResponseDto[] }> {
    const data = await this.categoryService.findAll(query.featured);
    return {
      success: true,
      message: 'Categories fetched successfully',
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
  async findBySlug(
    @Param('slug') slug: string,
  ): Promise<{
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
