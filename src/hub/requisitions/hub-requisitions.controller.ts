import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { HubJwtAuthGuard } from '../guards/hub-jwt-auth.guard';
import { HubRolesGuard } from '../guards/hub-roles.guard';
import { HubPermission } from '../decorators/hub-roles.decorator';
import { CurrentHubUser } from '../decorators/current-hub-user.decorator';
import type { AuthenticatedHubUser } from '../auth/hub-jwt.strategy';
import { RequisitionsService } from '../../modules/requisitions/requisitions.service';
import {
  CreateRequisitionDto,
  ReceiveRequisitionDto,
  RequisitionCommentDto,
  RequisitionPaginationQueryDto,
  UpdateRequisitionDto,
} from '../../modules/requisitions/dto/requisitions.dto';

@ApiTags('Hub Requisitions')
@Controller({ version: '1', path: 'hub/requisitions' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubRequisitionsController {
  constructor(private readonly requisitionsService: RequisitionsService) {}

  private actor(user: AuthenticatedHubUser) {
    return {
      id: user.id,
      name: user.fullName,
      role: user.role,
    };
  }

  @Get('stats')
  @HubPermission('inventory')
  @ApiOperation({ summary: 'Requisition dashboard stats for hub' })
  async stats(@CurrentHubUser() user: AuthenticatedHubUser) {
    const data = await this.requisitionsService.getStats(user.hubId);
    return { success: true, message: 'Requisition stats fetched', data };
  }

  @Get('materials/search')
  @HubPermission('inventory')
  @ApiOperation({ summary: 'Search hub inventory materials for requisition' })
  async searchMaterials(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query('search') search?: string,
  ) {
    const data = await this.requisitionsService.searchMaterials(
      user.hubId,
      search,
    );
    return { success: true, message: 'Materials fetched', data };
  }

  @Post()
  @HubPermission('inventory')
  @ApiOperation({ summary: 'Create requisition (optionally submit)' })
  async create(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Body() dto: CreateRequisitionDto,
  ) {
    if (user.role !== 'HUB_MANAGER') {
      throw new ForbiddenException('Only Hub Manager can create requisitions');
    }
    const data = await this.requisitionsService.create(
      user.hubId,
      this.actor(user),
      dto,
    );
    return { success: true, message: 'Requisition created', data };
  }

  @Get('draft')
  @HubPermission('inventory')
  @ApiOperation({ summary: 'Get latest draft requisition for the current hub user' })
  async getDraft(@CurrentHubUser() user: AuthenticatedHubUser) {
    const data = await this.requisitionsService.findLatestDraft(
      user.hubId,
      user.id,
    );
    return { success: true, message: 'Draft fetched', data };
  }

  @Get()
  @HubPermission('inventory')
  @ApiOperation({ summary: 'List hub requisitions' })
  async findAll(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Query() query: RequisitionPaginationQueryDto,
  ) {
    const data = await this.requisitionsService.findAll(query, user.hubId);
    return { success: true, message: 'Requisitions fetched', data };
  }

  @Get(':id')
  @HubPermission('inventory')
  @ApiOperation({ summary: 'Get requisition detail' })
  async findOne(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.requisitionsService.findOne(id, user.hubId);
    return { success: true, message: 'Requisition fetched', data };
  }

  @Patch(':id')
  @HubPermission('inventory')
  @ApiOperation({ summary: 'Update draft requisition' })
  async update(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: UpdateRequisitionDto,
  ) {
    const data = await this.requisitionsService.update(
      id,
      user.hubId,
      this.actor(user),
      dto,
    );
    return { success: true, message: 'Requisition updated', data };
  }

  @Patch(':id/submit')
  @HubPermission('inventory')
  @ApiOperation({ summary: 'Submit requisition for warehouse approval' })
  async submit(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
  ) {
    const data = await this.requisitionsService.submit(
      id,
      user.hubId,
      this.actor(user),
    );
    return { success: true, message: 'Requisition submitted', data };
  }

  @Patch(':id/receive')
  @HubPermission('inventory')
  @ApiOperation({ summary: 'Receive requisition shipment at hub' })
  async receive(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: ReceiveRequisitionDto,
  ) {
    const data = await this.requisitionsService.receive(
      id,
      user.hubId,
      this.actor(user),
      dto,
    );
    return { success: true, message: 'Requisition received', data };
  }

  @Post(':id/comments')
  @HubPermission('inventory')
  @ApiOperation({ summary: 'Add comment to requisition' })
  async comment(
    @CurrentHubUser() user: AuthenticatedHubUser,
    @Param('id') id: string,
    @Body() dto: RequisitionCommentDto,
  ) {
    const data = await this.requisitionsService.addComment(
      id,
      this.actor(user),
      dto,
    );
    return { success: true, message: 'Comment added', data };
  }
}
