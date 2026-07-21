import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH, SWAGGER_TAGS } from '../../common/constants/swagger.constants';
import { HubJwtAuthGuard } from '../guards/hub-jwt-auth.guard';
import { HubRolesGuard } from '../guards/hub-roles.guard';
import { HubPermission } from '../decorators/hub-roles.decorator';
import { CurrentHubUser } from '../decorators/current-hub-user.decorator';
import type { AuthenticatedHubUser } from '../auth/hub-jwt.strategy';
import { HubProfileService } from './hub-profile.service';
import { HubProfileUpdateDto } from '../dto/hub.dto';

@ApiTags(SWAGGER_TAGS.HUB)
@Controller({ version: '1', path: 'hub/profile' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubProfileController {
  constructor(private readonly profileService: HubProfileService) {}

  @Get()
  @HubPermission('profile')
  @ApiOperation({ summary: 'Get hub profile' })
  async getProfile(@CurrentHubUser() user: AuthenticatedHubUser) {
    const data = await this.profileService.getProfile(user.hubId);
    return { success: true, message: 'Hub profile fetched', data };
  }

  @Patch()
  @HubPermission('profile')
  @ApiOperation({ summary: 'Update hub profile / staff contact info' })
  async updateProfile(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Body() dto: HubProfileUpdateDto,
  ) {
    const data = await this.profileService.updateProfile(user.hubId, dto, user.id);
    return { success: true, message: 'Hub profile updated', data };
  }
}
