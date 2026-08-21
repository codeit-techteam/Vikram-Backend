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
  Put,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedCustomer } from '../../auth/jwt/jwt-payload.interface';
import { CustomerService } from './customer.service';
import {
  AddressResponseDto,
  CreateAddressDto,
  UpdateAddressDto,
} from './dto/address.dto';
import {
  CreateProfileDto,
  ProfileResponseDto,
  UpsertProfileDto,
} from './dto/profile.dto';
import { RoleResponseDto, SelectRoleDto } from './dto/role.dto';

@ApiTags(SWAGGER_TAGS.CUSTOMER)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@Controller({ version: '1', path: 'customer' })
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get('roles')
  @ApiOperation({ summary: 'List available customer roles' })
  @ApiResponse({
    status: 200,
    description: 'Roles fetched',
    type: [RoleResponseDto],
  })
  async getRoles(): Promise<{
    success: boolean;
    message: string;
    data: RoleResponseDto[];
  }> {
    const data = await this.customerService.getRoles();
    return {
      success: true,
      message: 'Roles fetched successfully',
      data,
    };
  }

  @Post('select-role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Select customer role after registration' })
  @ApiResponse({
    status: 200,
    description: 'Role selected',
    type: ProfileResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Role not found',
    type: ApiErrorResponseDto,
  })
  async selectRole(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: SelectRoleDto,
  ): Promise<{ success: boolean; message: string; data: ProfileResponseDto }> {
    const data = await this.customerService.selectRole(user.id, dto);
    return {
      success: true,
      message: 'Role selected successfully',
      data,
    };
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get customer profile' })
  @ApiResponse({ status: 200, type: ProfileResponseDto })
  async getProfile(
    @CurrentUser() user: AuthenticatedCustomer,
  ): Promise<{ success: boolean; message: string; data: ProfileResponseDto }> {
    const data = await this.customerService.getProfile(user.id);
    return {
      success: true,
      message: 'Profile fetched successfully',
      data,
    };
  }

  @Post('profile')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create customer profile' })
  @ApiResponse({ status: 201, type: ProfileResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Profile already exists',
    type: ApiErrorResponseDto,
  })
  async createProfile(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: CreateProfileDto,
  ): Promise<{ success: boolean; message: string; data: ProfileResponseDto }> {
    const data = await this.customerService.createProfile(user.id, dto);
    return {
      success: true,
      message: 'Profile created successfully',
      data,
    };
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update customer profile' })
  @ApiResponse({ status: 200, type: ProfileResponseDto })
  async updateProfile(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: UpsertProfileDto,
  ): Promise<{ success: boolean; message: string; data: ProfileResponseDto }> {
    const data = await this.customerService.updateProfile(user.id, dto);
    return {
      success: true,
      message: 'Profile updated successfully',
      data,
    };
  }

  @Post('address')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a new address' })
  @ApiResponse({ status: 201, type: AddressResponseDto })
  async createAddress(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: CreateAddressDto,
  ): Promise<{ success: boolean; message: string; data: AddressResponseDto }> {
    const data = await this.customerService.createAddress(user.id, dto);
    return {
      success: true,
      message: 'Address created successfully',
      data,
    };
  }

  @Get('address')
  @ApiOperation({ summary: 'List customer addresses' })
  @ApiResponse({ status: 200, type: [AddressResponseDto] })
  async getAddresses(@CurrentUser() user: AuthenticatedCustomer): Promise<{
    success: boolean;
    message: string;
    data: AddressResponseDto[];
  }> {
    const data = await this.customerService.getAddresses(user.id);
    return {
      success: true,
      message: 'Addresses fetched successfully',
      data,
    };
  }

  @Patch('address/:id')
  @ApiOperation({ summary: 'Update an address' })
  @ApiParam({ name: 'id', description: 'Address UUID' })
  @ApiResponse({ status: 200, type: AddressResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Address not found',
    type: ApiErrorResponseDto,
  })
  async updateAddress(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<{ success: boolean; message: string; data: AddressResponseDto }> {
    const data = await this.customerService.updateAddress(user.id, id, dto);
    return {
      success: true,
      message: 'Address updated successfully',
      data,
    };
  }

  @Delete('address/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an address (soft delete)' })
  @ApiParam({ name: 'id', description: 'Address UUID' })
  @ApiResponse({ status: 200, description: 'Address deleted' })
  async deleteAddress(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: boolean; message: string; data: null }> {
    await this.customerService.deleteAddress(user.id, id);
    return {
      success: true,
      message: 'Address deleted successfully',
      data: null,
    };
  }

  @Put('address/default/:id')
  @ApiOperation({ summary: 'Set address as default' })
  @ApiParam({ name: 'id', description: 'Address UUID' })
  @ApiResponse({ status: 200, type: AddressResponseDto })
  async setDefaultAddress(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: boolean; message: string; data: AddressResponseDto }> {
    const data = await this.customerService.setDefaultAddress(user.id, id);
    return {
      success: true,
      message: 'Default address updated successfully',
      data,
    };
  }
}
