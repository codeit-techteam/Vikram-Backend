import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalAuth } from '../../common/decorators/optional-auth.decorator';
import { OptionalUser } from '../../common/decorators/optional-user.decorator';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { DeliveryPromotionService } from './delivery-promotion.service';
import type { DeliveryPromotionDto } from './dto/delivery-promotion-response.dto';

@Public()
@OptionalAuth()
@ApiTags(SWAGGER_TAGS.CMS)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'cms/delivery-promotions' })
export class DeliveryPromotionController {
  constructor(
    private readonly deliveryPromotions: DeliveryPromotionService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Eligible Home delivery promotion banners',
    description:
      'Returns currently scheduled, active delivery promotions. When a JWT is present, audience is filtered from the delivery-benefit engine (not from the CMS creative). Home displays the first (highest-priority) item.',
  })
  async list(
    @OptionalUser() user: AuthenticatedCustomer | null,
  ): Promise<{
    success: boolean;
    message: string;
    data: DeliveryPromotionDto[];
  }> {
    const data = await this.deliveryPromotions.getEligiblePromotions(user?.id);
    return {
      success: true,
      message: 'Delivery promotions fetched successfully',
      data,
    };
  }
}
