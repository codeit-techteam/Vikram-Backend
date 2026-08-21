import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ApiAdminRoles } from '../decorators/api-admin-roles.decorator';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminUsersService } from './admin-users.service';
import {
  AdminUserQueryDto,
  AdminUserResponseDto,
  ChangeAdminUserRoleDto,
  CreateAdminUserDto,
  ResetAdminUserPasswordDto,
  ResetAdminUserPasswordResponseDto,
  UpdateAdminUserDto,
  UpdateAdminUserStatusDto,
} from './dto/admin-users.dto';

@ApiTags('Admin Users')
@Controller({ version: '1', path: 'admin/users' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @ApiOperation({
    summary: 'List admin users',
    description:
      'Paginated list with search (name, email, phone), role filter, status filter, and created date range. SUPER_ADMIN only.',
  })
  @ApiResponse({
    status: 200,
    description: 'Admin users fetched successfully',
    type: ApiResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid JWT',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — SUPER_ADMIN only' })
  async findAll(@Query() query: AdminUserQueryDto) {
    const data = await this.adminUsersService.findAll(query);
    return { success: true, message: 'Admin users fetched', data };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get admin user details',
    description:
      'Returns full profile for a single admin user. SUPER_ADMIN only.',
  })
  @ApiParam({ name: 'id', description: 'Admin user UUID' })
  @ApiResponse({
    status: 200,
    description: 'Admin user fetched successfully',
    type: AdminUserResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Admin user not found' })
  async findOne(@Param('id') id: string) {
    const data = await this.adminUsersService.findOne(id);
    return { success: true, message: 'Admin user fetched', data };
  }

  @Post()
  @ApiOperation({
    summary: 'Create admin user',
    description:
      'Creates a new admin account with bcrypt-hashed password. SUPER_ADMIN only.',
  })
  @ApiResponse({
    status: 201,
    description: 'Admin user created successfully',
    type: AdminUserResponseDto,
  })
  @ApiConflictResponse({ description: 'Email already in use' })
  async create(
    @Body() dto: CreateAdminUserDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.adminUsersService.create(
      dto,
      admin.id,
      admin.email,
    );
    return { success: true, message: 'Admin user created', data };
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update admin user profile',
    description: 'Update name, email, or phone. SUPER_ADMIN only.',
  })
  @ApiParam({ name: 'id', description: 'Admin user UUID' })
  @ApiResponse({
    status: 200,
    description: 'Admin user updated successfully',
    type: AdminUserResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Admin user not found' })
  @ApiConflictResponse({ description: 'Email already in use' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.adminUsersService.update(
      id,
      dto,
      admin.id,
      admin.email,
    );
    return { success: true, message: 'Admin user updated', data };
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Activate or deactivate admin user',
    description:
      'ACTIVATE enables login. DEACTIVATE disables login and revokes all active sessions. SUPER_ADMIN only.',
  })
  @ApiParam({ name: 'id', description: 'Admin user UUID' })
  @ApiResponse({
    status: 200,
    description: 'Admin user status updated successfully',
    type: AdminUserResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Admin user not found' })
  @ApiResponse({
    status: 403,
    description: 'Cannot deactivate your own account',
  })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.adminUsersService.updateStatus(
      id,
      dto,
      admin.id,
      admin.email,
    );
    const message =
      dto.action === 'ACTIVATE'
        ? 'Admin user activated'
        : 'Admin user deactivated';
    return { success: true, message, data };
  }

  @Patch(':id/password')
  @ApiOperation({
    summary: 'Reset admin user password',
    description:
      'Sets a new bcrypt-hashed password and revokes all active sessions. Auto-generates a temporary password if omitted. SUPER_ADMIN only.',
  })
  @ApiParam({ name: 'id', description: 'Admin user UUID' })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
    type: ResetAdminUserPasswordResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Admin user not found' })
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetAdminUserPasswordDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.adminUsersService.resetPassword(
      id,
      dto,
      admin.id,
      admin.email,
    );
    return { success: true, message: 'Password reset successfully', data };
  }

  @Patch(':id/role')
  @ApiOperation({
    summary: 'Assign or change admin user role',
    description:
      'Updates role (SUPER_ADMIN, WAREHOUSE_MANAGER, CUSTOMER_EXECUTIVE) and revokes active sessions. SUPER_ADMIN only.',
  })
  @ApiParam({ name: 'id', description: 'Admin user UUID' })
  @ApiResponse({
    status: 200,
    description: 'Admin user role updated successfully',
    type: AdminUserResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Admin user not found' })
  @ApiResponse({
    status: 400,
    description:
      'User already has this role, or last SUPER_ADMIN protection triggered',
  })
  async changeRole(
    @Param('id') id: string,
    @Body() dto: ChangeAdminUserRoleDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.adminUsersService.changeRole(
      id,
      dto,
      admin.id,
      admin.email,
    );
    return { success: true, message: 'Admin user role updated', data };
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Soft delete admin user',
    description:
      'Marks the user as deleted, deactivates the account, and revokes sessions. SUPER_ADMIN only.',
  })
  @ApiParam({ name: 'id', description: 'Admin user UUID' })
  @ApiResponse({
    status: 200,
    description: 'Admin user deleted successfully',
    type: AdminUserResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Admin user not found' })
  @ApiResponse({ status: 403, description: 'Cannot delete your own account' })
  async remove(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.adminUsersService.remove(id, admin.id, admin.email);
    return { success: true, message: 'Admin user deleted', data };
  }
}
