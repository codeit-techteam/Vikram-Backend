import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';

import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminVideosService } from './admin-videos.service';
import {
  CreateVideoDto,
  PatchVideoStatusDto,
  ReorderVideosDto,
  UpdateVideoDto,
} from './dto/admin-videos.dto';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';

@ApiTags('Admin Videos')
@Controller({ version: '1', path: 'admin/videos' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminVideosController {
  constructor(
    private readonly videosService: AdminVideosService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'List all videos' })
  async findAll(@Query('placement') placement?: string) {
    const data = await this.videosService.findAll(placement);
    return { success: true, message: 'Videos fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get video by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.videosService.findOne(id);
    return { success: true, message: 'Video fetched', data };
  }

  @Post('upload')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Upload video file to R2 and create CMS record' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        thumbnail: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        description: { type: 'string' },
        placement: { type: 'string' },
        linkUrl: { type: 'string' },
        linkType: { type: 'string' },
        linkTarget: { type: 'string' },
        ctaLabel: { type: 'string' },
        priority: { type: 'string' },
        publish: { type: 'string' },
        thumbnailUrl: { type: 'string' },
      },
      required: ['file', 'title'],
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 500 * 1024 * 1024 },
      },
    ),
  )
  async upload(
    @UploadedFiles()
    files: {
      file?: Express.Multer.File[];
      thumbnail?: Express.Multer.File[];
    },
    @Body()
    body: {
      title: string;
      slug?: string;
      description?: string;
      placement?: string;
      linkType?: string;
      linkUrl?: string;
      linkTarget?: string;
      ctaLabel?: string;
      priority?: string;
      displayOrder?: string;
      duration?: string;
      publish?: string;
      scheduledAt?: string;
      expiresAt?: string;
      thumbnailUrl?: string;
    },
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const videoFile = files?.file?.[0];
    if (!videoFile) {
      throw new BadRequestException('video file is required');
    }
    const data = await this.videosService.uploadAndCreate(
      videoFile,
      {
        ...body,
        priority: body.priority ? Number(body.priority) : undefined,
        displayOrder: body.displayOrder ? Number(body.displayOrder) : undefined,
        duration: body.duration ? Number(body.duration) : undefined,
      },
      admin.id,
      files?.thumbnail?.[0],
    );
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'Video',
      resourceId: data.id,
      newValue: { title: data.title, storageKey: data.storageKey },
    });
    return { success: true, message: 'Video uploaded', data };
  }

  @Post(':id/replace')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Replace the video file for an existing CMS record',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 500 * 1024 * 1024 },
    }),
  )
  async replace(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    if (!file) {
      throw new BadRequestException('video file is required');
    }
    const data = await this.videosService.replaceFile(id, file);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'Video',
      resourceId: id,
      newValue: { storageKey: data.storageKey },
    });
    return { success: true, message: 'Video file replaced', data };
  }

  @Post()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Create video from existing public URL' })
  async create(
    @Body() dto: CreateVideoDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.videosService.create(dto, admin.id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'Video',
      resourceId: data.id,
      newValue: dto,
    });
    return { success: true, message: 'Video created', data };
  }

  @Post('reorder')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Reorder videos' })
  async reorder(@Body() body: ReorderVideosDto) {
    const data = await this.videosService.reorder(body.items);
    return { success: true, message: 'Videos reordered', data };
  }

  @Patch('order')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Alias for reorder videos' })
  async order(@Body() body: ReorderVideosDto) {
    const data = await this.videosService.reorder(body.items);
    return { success: true, message: 'Videos reordered', data };
  }

  @Patch('status')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Publish / unpublish / archive by body payload' })
  async patchStatus(
    @Body() body: PatchVideoStatusDto & { id: string },
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.videosService.setStatus(body.id, body.status);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: body.status === 'publish' ? 'PUBLISH' : 'UNPUBLISH',
      resource: 'Video',
      resourceId: body.id,
    });
    return { success: true, message: `Video ${body.status}`, data };
  }

  @Patch(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update video' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateVideoDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.videosService.update(id, dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'Video',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Video updated', data };
  }

  @Patch(':id/publish')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Publish video' })
  async publish(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.videosService.publish(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'PUBLISH',
      resource: 'Video',
      resourceId: id,
    });
    return { success: true, message: 'Video published', data };
  }

  @Patch(':id/unpublish')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Unpublish video' })
  async unpublish(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.videosService.unpublish(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UNPUBLISH',
      resource: 'Video',
      resourceId: id,
    });
    return { success: true, message: 'Video unpublished', data };
  }

  @Patch(':id/archive')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Archive video' })
  async archive(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.videosService.archive(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UNPUBLISH',
      resource: 'Video',
      resourceId: id,
    });
    return { success: true, message: 'Video archived', data };
  }

  @Delete(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Delete video' })
  async remove(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.videosService.remove(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'DELETE',
      resource: 'Video',
      resourceId: id,
    });
    return { success: true, message: 'Video deleted', data };
  }
}
