import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SearchSuggestionItemDto {
  @ApiProperty()
  text!: string;

  @ApiProperty({ enum: ['product', 'category', 'offer', 'brand', 'term'] })
  type!: 'product' | 'category' | 'offer' | 'brand' | 'term';

  @ApiPropertyOptional()
  slug?: string;

  @ApiPropertyOptional()
  imageUrl?: string | null;
}

/** @deprecated Use SearchSuggestionsResponseDto */
export class SearchSuggestionDto extends SearchSuggestionItemDto {}

export class SearchSuggestionsResponseDto {
  @ApiProperty({ type: [String], description: 'Popular / curated searches' })
  popularSearches!: string[];

  @ApiProperty({ type: [String], description: 'Recent search terms' })
  recentSearches!: string[];

  @ApiProperty({ type: [SearchSuggestionItemDto] })
  matchingProducts!: SearchSuggestionItemDto[];

  @ApiProperty({ type: [SearchSuggestionItemDto] })
  matchingCategories!: SearchSuggestionItemDto[];

  @ApiProperty({ type: [SearchSuggestionItemDto] })
  matchingOffers!: SearchSuggestionItemDto[];

  /** @deprecated Prefer popularSearches */
  @ApiPropertyOptional({ type: [String] })
  popular?: string[];

  /** @deprecated Prefer recentSearches */
  @ApiPropertyOptional({ type: [String] })
  recent?: string[];

  /** @deprecated Prefer matching* fields */
  @ApiPropertyOptional({ type: [SearchSuggestionItemDto] })
  matching?: SearchSuggestionItemDto[];
}

export class SearchProductResultDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  brand?: string | null;

  @ApiProperty()
  categorySlug!: string;

  @ApiProperty()
  categoryName!: string;

  @ApiProperty()
  price!: number;

  @ApiProperty()
  retailPrice!: number;

  @ApiPropertyOptional()
  thumbnail?: string | null;

  @ApiPropertyOptional()
  imageUrl?: string | null;

  @ApiPropertyOptional()
  badge?: string | null;

  @ApiProperty()
  unit!: string;
}

export class SearchCategoryResultDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  image?: string | null;
}

export class SearchOfferResultDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  discountLabel?: string | null;

  @ApiPropertyOptional()
  bannerImage?: string | null;
}

/** Legacy shape kept for clients that expect paginated product-only results */
export class SearchResultDto extends SearchProductResultDto {}

export class SearchResponseDto {
  @ApiProperty({ type: [SearchProductResultDto] })
  products!: SearchProductResultDto[];

  @ApiProperty({ type: [SearchCategoryResultDto] })
  categories!: SearchCategoryResultDto[];

  @ApiProperty({ type: [SearchOfferResultDto] })
  offers!: SearchOfferResultDto[];

  /** @deprecated Prefer `products` */
  @ApiPropertyOptional({ type: [SearchProductResultDto] })
  items?: SearchProductResultDto[];

  @ApiProperty()
  meta!: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    query: string;
  };
}
