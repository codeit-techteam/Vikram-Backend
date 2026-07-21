import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OptionalAuth } from '../../common/decorators/optional-auth.decorator';
import { OptionalUser } from '../../common/decorators/optional-user.decorator';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { HomeResponseDto } from './dto/home-response.dto';
import { HomeService } from './home.service';

@OptionalAuth()
@ApiTags(SWAGGER_TAGS.HOME)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'home' })
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get()
  @ApiOperation({
    summary: 'Aggregated home screen data',
    description:
      'Single API for the Customer APP home screen. Public content is cached as `home:default` (TTL 300s). When a valid JWT is provided, also returns membership, wallet, loyalty, and lastOrders.',
  })
  @ApiResponse({
    status: 200,
    description: 'Home loaded successfully',
    type: HomeResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: ApiErrorResponseDto,
  })
  async getHome(
    @OptionalUser() user: AuthenticatedCustomer | null,
  ): Promise<{
    success: boolean;
    message: string;
    data: HomeResponseDto;
  }> {
    const data = await this.homeService.getHomeData(user?.id);
    return {
      success: true,
      message: 'Home loaded successfully',
      data,
    };
  }
}
