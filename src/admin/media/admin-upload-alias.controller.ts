import {
  BadRequestException,
  Controller,
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

/**
 * Production shorthand upload endpoint:
 * POST /api/v1/upload  (alias of /api/v1/admin/media/upload)
 */
@ApiTags('Upload')
@Controller({ version: '1', path: 'upload' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminUploadAliasController {
  constructor(
    private readonly storage: R2StorageService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Upload media to Cloudflare R2 (alias)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        folder: { type: 'string', example: 'banners' },
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
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    const resolvedFolder = folder
      ? resolveMediaFolder(folder)
      : inferMediaFolder(file.mimetype);
    const uploaded = await this.storage.uploadMulterFile(file, resolvedFolder);

    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'Media',
      resourceId: uploaded.storageKey,
      newValue: {
        storageKey: uploaded.storageKey,
        url: uploaded.publicUrl,
        folder: resolvedFolder,
      },
    });

    return {
      success: true,
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
}
