import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  SWAGGER_BEARER_AUTH,
  SWAGGER_TAGS,
} from '../../common/constants/swagger.constants';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { EmergencyOrderService } from './emergency-order.service';
import {
  CreateEmergencyOrderDto,
  EmergencyOrderResponseDto,
} from './dto/emergency-order.dto';

@ApiTags(SWAGGER_TAGS.EMERGENCY_ORDER)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'emergency-order' })
export class EmergencyOrderController {
  constructor(private readonly emergencyOrderService: EmergencyOrderService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Raise emergency delivery request' })
  @ApiBody({ type: CreateEmergencyOrderDto })
  @ApiResponse({ status: 201, type: EmergencyOrderResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  @ApiResponse({ status: 409, type: ApiErrorResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: CreateEmergencyOrderDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: EmergencyOrderResponseDto;
  }> {
    const data = await this.emergencyOrderService.createEmergencyRequest(
      user.id,
      dto,
    );
    return {
      success: true,
      message: 'Emergency delivery request submitted successfully',
      data,
    };
  }
}
