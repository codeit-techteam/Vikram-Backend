import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { MembershipService } from './membership.service';
import {
  CustomerMembershipResponseDto,
  MembershipPlanResponseDto,
  MembershipSummaryDto,
  PurchaseMembershipDto,
  RenewMembershipDto,
} from './dto/membership.dto';

@ApiTags(SWAGGER_TAGS.MEMBERSHIP)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'membership' })
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Get()
  @ApiOperation({ summary: 'Get current membership' })
  @ApiResponse({ status: 200, type: MembershipSummaryDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async getCurrent(
    @CurrentUser() user: AuthenticatedCustomer,
  ): Promise<{ success: boolean; message: string; data: MembershipSummaryDto }> {
    const data = await this.membershipService.getCurrentMembership(user.id);
    return {
      success: true,
      message: 'Membership fetched successfully',
      data,
    };
  }

  @Get('plans')
  @Public()
  @ApiOperation({ summary: 'List available membership plans' })
  @ApiResponse({ status: 200, type: [MembershipPlanResponseDto] })
  async listPlans(): Promise<{
    success: boolean;
    message: string;
    data: MembershipPlanResponseDto[];
  }> {
    const data = await this.membershipService.listPlans();
    return {
      success: true,
      message: 'Membership plans fetched successfully',
      data,
    };
  }

  @Post('purchase')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Purchase a membership plan' })
  @ApiBody({ type: PurchaseMembershipDto })
  @ApiResponse({ status: 201, type: CustomerMembershipResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async purchase(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: PurchaseMembershipDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: CustomerMembershipResponseDto;
  }> {
    const data = await this.membershipService.purchasePlan(user.id, dto.planId);
    return {
      success: true,
      message: 'Membership purchased successfully',
      data,
    };
  }

  @Post('renew')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renew membership' })
  @ApiBody({ type: RenewMembershipDto })
  @ApiResponse({ status: 200, type: CustomerMembershipResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async renew(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: RenewMembershipDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: CustomerMembershipResponseDto;
  }> {
    const data = await this.membershipService.renewMembership(user.id, dto.planId);
    return {
      success: true,
      message: 'Membership renewed successfully',
      data,
    };
  }
}
