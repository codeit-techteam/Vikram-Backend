import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import {
  SearchQueryDto,
  SearchSuggestionsQueryDto,
} from './dto/search-query.dto';
import {
  SearchResponseDto,
  SearchSuggestionsResponseDto,
} from './dto/search-response.dto';
import { SearchService } from './search.service';

@Public()
@ApiTags(SWAGGER_TAGS.SEARCH)
@Controller({ version: '1', path: 'search' })
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({
    summary: 'Global search',
    description:
      'Search across products, categories, and offers by keyword. Supports category filter and sort. Products are paginated; categories and offers return top matches. Cached under `search:{hash}` (TTL 180s).',
  })
  @ApiQuery({ name: 'keyword', required: false, example: 'cement' })
  @ApiQuery({ name: 'q', required: false, example: 'cement' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'category', required: false, example: 'cement' })
  @ApiQuery({
    name: 'sort',
    required: false,
    example: 'relevance',
    description: 'relevance | price_asc | price_desc | newest | sales | name',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results fetched successfully',
    schema: {
      example: {
        success: true,
        message: 'Search results fetched successfully',
        data: {
          products: [],
          categories: [],
          offers: [],
          meta: { page: 1, limit: 20, total: 0, query: 'cement' },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error — keyword required',
    type: ApiErrorResponseDto,
  })
  async search(
    @Query() query: SearchQueryDto,
  ): Promise<{ success: boolean; message: string; data: SearchResponseDto }> {
    const data = await this.searchService.search(query);
    return {
      success: true,
      message: 'Search results fetched successfully',
      data,
    };
  }

  @Get('suggestions')
  @ApiOperation({
    summary: 'Search suggestions',
    description:
      'Returns popular searches (`search:popular`, TTL 600s), recent searches, and matching products / categories / offers. Suggestions cached as `search:suggestions:{q}` (TTL 300s).',
  })
  @ApiQuery({ name: 'keyword', required: false, example: 'ult' })
  @ApiResponse({
    status: 200,
    description: 'Suggestions fetched successfully',
    schema: {
      example: {
        success: true,
        message: 'Suggestions fetched successfully',
        data: {
          popularSearches: ['UltraTech Cement', 'River Sand'],
          recentSearches: ['cement', 'tmt'],
          matchingProducts: [
            { text: 'UltraTech Premium PPC', type: 'product', slug: '...' },
          ],
          matchingCategories: [
            { text: 'Cement', type: 'category', slug: 'cement' },
          ],
          matchingOffers: [],
        },
      },
    },
  })
  async suggestions(
    @Query() query: SearchSuggestionsQueryDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: SearchSuggestionsResponseDto;
  }> {
    const data = await this.searchService.getSuggestions(query);
    return {
      success: true,
      message: 'Suggestions fetched successfully',
      data,
    };
  }

  @Get('trending')
  @ApiOperation({ summary: 'Get trending / popular search terms' })
  @ApiResponse({ status: 200, description: 'Trending terms fetched successfully' })
  async trending(): Promise<{
    success: boolean;
    message: string;
    data: string[];
  }> {
    const data = await this.searchService.getPopularSearches();
    return {
      success: true,
      message: 'Trending search terms fetched successfully',
      data,
    };
  }
}
