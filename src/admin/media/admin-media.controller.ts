import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { R2StorageService } from '../../storage/r2.service';
import {
  inferMediaFolder,
  resolveMediaFolder,
} from '../../storage/media-folders';

const IMAGE_MIME = /^(image\/(jpeg|jpg|png|webp|gif|svg\+xml))$/i;
const PDF_MIME = /^application\/pdf$/i;
const VIDEO_MIME = /^(video\/|application\/octet-stream)/i;

@ApiTags('Admin Media')
@Controller({ version: '1', path: 'admin/media' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminMediaController {
  constructor(
    private readonly storage: R2StorageService,
    private readonly auditService: AuditService,
  ) {}

  @Post('upload')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({
    summary: 'Upload image, video, or PDF to Cloudflare R2',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        folder: {
          type: 'string',
          example: 'products',
          description:
            'videos|videos/home|videos/tutorial|videos/promotions|banners|offers|products|products/gallery|categories|brands|testimonials|icons|thumbnails|documents',
        },
        replaceKey: {
          type: 'string',
          description:
            'Optional previous storage key or public URL to delete after upload',
        },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 500 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('folder') folder: string | undefined,
    @Query('replaceKey') replaceKeyQuery: string | undefined,
    @Body('folder') folderBody: string | undefined,
    @Body('replaceKey') replaceKeyBody: string | undefined,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    const isImage = IMAGE_MIME.test(file.mimetype);
    const isPdf = PDF_MIME.test(file.mimetype);
    const isVideo = VIDEO_MIME.test(file.mimetype) && !isImage && !isPdf;
    if (!isImage && !isVideo && !isPdf) {
      throw new BadRequestException(
        'Unsupported file type. Use JPEG/PNG/WEBP/GIF/SVG, MP4/MOV/WEBM, or PDF.',
      );
    }

    const folderInput = folder || folderBody;
    const resolvedFolder = folderInput
      ? resolveMediaFolder(folderInput)
      : inferMediaFolder(file.mimetype);

    const replaceKey = replaceKeyQuery || replaceKeyBody || undefined;
    const uploaded = replaceKey
      ? await this.storage.replaceFile(replaceKey, file, resolvedFolder)
      : await this.storage.uploadMulterFile(file, resolvedFolder);

    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: replaceKey ? 'UPDATE' : 'CREATE',
      resource: 'Media',
      resourceId: uploaded.storageKey,
      newValue: {
        storageKey: uploaded.storageKey,
        url: uploaded.publicUrl,
        mimeType: uploaded.mimeType,
        size: uploaded.size,
        folder: resolvedFolder,
        replaced: replaceKey ?? null,
      },
    });

    return {
      success: true,
      message: replaceKey ? 'File replaced on R2' : 'File uploaded to R2',
      url: uploaded.publicUrl,
      storageKey: uploaded.storageKey,
      size: uploaded.size,
      mimeType: uploaded.mimeType,
      data: {
        key: uploaded.key,
        storageKey: uploaded.storageKey,
        url: uploaded.publicUrl,
        publicUrl: uploaded.publicUrl,
        mimeType: uploaded.mimeType,
        size: uploaded.size,
        folder: resolvedFolder,
      },
    };
  }

  @Delete()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Delete a media object from Cloudflare R2' })
  async remove(
    @Query('key') key: string | undefined,
    @Query('url') url: string | undefined,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const storageKey =
      this.storage.extractStorageKey(key) ||
      this.storage.extractStorageKey(url);

    if (!storageKey) {
      throw new BadRequestException('key or url is required');
    }

    await this.storage.deleteFile(storageKey);

    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'DELETE',
      resource: 'Media',
      resourceId: storageKey,
      newValue: { storageKey },
    });

    return {
      success: true,
      message: 'File deleted from R2',
      storageKey,
    };
  }
}
