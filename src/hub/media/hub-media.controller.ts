import {
  BadRequestException,
  Body,
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
import { HubJwtAuthGuard } from '../guards/hub-jwt-auth.guard';
import { HubRolesGuard } from '../guards/hub-roles.guard';
import { HubPermission } from '../decorators/hub-roles.decorator';
import { R2StorageService } from '../../storage/r2.service';
import { MEDIA_FOLDERS, resolveMediaFolder } from '../../storage/media-folders';

const IMAGE_MIME = /^(image\/(jpeg|jpg|png|webp|gif|heic|heif))$/i;
const DOC_MIME =
  /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/i;

@ApiTags('Hub Media')
@Controller({ version: '1', path: 'hub/media' })
@UseGuards(HubJwtAuthGuard, HubRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class HubMediaController {
  constructor(private readonly storage: R2StorageService) {}

  @Post('upload')
  @HubPermission('inventory')
  @ApiOperation({
    summary: 'Upload delivery photo or receiving document to Cloudflare R2',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        folder: {
          type: 'string',
          example: 'hub-receipts/photos',
          description:
            'hub-receipts/photos | hub-receipts/documents | receiving/photos | receiving/documents',
        },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('folder') folderQuery: string | undefined,
    @Body('folder') folderBody: string | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    const isImage = IMAGE_MIME.test(file.mimetype);
    const isDoc = DOC_MIME.test(file.mimetype);
    if (!isImage && !isDoc) {
      throw new BadRequestException(
        'Unsupported file type. Use JPEG/PNG/HEIC or PDF/DOC/DOCX.',
      );
    }

    const folderInput = folderQuery || folderBody;
    let resolvedFolder = folderInput
      ? resolveMediaFolder(folderInput)
      : isImage
        ? MEDIA_FOLDERS.HUB_RECEIPTS_PHOTOS
        : MEDIA_FOLDERS.HUB_RECEIPTS_DOCUMENTS;

    if (
      resolvedFolder !== MEDIA_FOLDERS.HUB_RECEIPTS_PHOTOS &&
      resolvedFolder !== MEDIA_FOLDERS.HUB_RECEIPTS_DOCUMENTS
    ) {
      resolvedFolder = isImage
        ? MEDIA_FOLDERS.HUB_RECEIPTS_PHOTOS
        : MEDIA_FOLDERS.HUB_RECEIPTS_DOCUMENTS;
    }

    if (isImage && resolvedFolder !== MEDIA_FOLDERS.HUB_RECEIPTS_PHOTOS) {
      resolvedFolder = MEDIA_FOLDERS.HUB_RECEIPTS_PHOTOS;
    }
    if (isDoc && resolvedFolder !== MEDIA_FOLDERS.HUB_RECEIPTS_DOCUMENTS) {
      resolvedFolder = MEDIA_FOLDERS.HUB_RECEIPTS_DOCUMENTS;
    }

    const uploaded = await this.storage.uploadMulterFile(file, resolvedFolder);

    return {
      success: true,
      message: 'File uploaded to R2',
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
