import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { S3Client } from '@aws-sdk/client-s3';
import { createReadStream } from 'fs';
import { Readable } from 'stream';

import {
  MEDIA_FOLDERS,
  inferMediaFolder,
  type MediaFolder,
} from './media-folders';
import {
  createR2Client,
  deleteFile,
  extractStorageKeyFromUrl,
  generateUniqueKey,
  getPublicUrl,
  getSignedObjectUrl,
  getSignedUploadUrl,
  type R2Config,
  type UploadResult,
  uploadBuffer,
  uploadFile,
  uploadImage,
  uploadStream,
  uploadVideo,
} from './r2';

@Injectable()
export class R2StorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private readonly config: R2Config;
  private client: S3Client | null = null;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      accountId: this.configService.get<string>('r2.accountId', ''),
      accessKeyId: this.configService.get<string>('r2.accessKeyId', ''),
      secretAccessKey: this.configService.get<string>('r2.secretAccessKey', ''),
      bucketName: this.configService.get<string>('r2.bucketName', 'bajriwala'),
      publicUrl:
        this.configService.get<string>('r2.publicUrl', '') || undefined,
      endpoint: this.configService.get<string>('r2.endpoint', '') || undefined,
    };
  }

  isConfigured(): boolean {
    return Boolean(
      this.config.accessKeyId &&
      this.config.secretAccessKey &&
      this.config.bucketName &&
      (this.config.endpoint || this.config.accountId),
    );
  }

  hasPublicBaseUrl(): boolean {
    return Boolean(this.config.publicUrl?.trim());
  }

  getConfig(): R2Config {
    return { ...this.config };
  }

  getMediaProvider(): string {
    return this.configService.get<string>('r2.provider', 'r2');
  }

  private getClient(): S3Client {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Cloudflare R2 is not configured. Set R2_* environment variables.',
      );
    }
    if (!this.client) {
      this.client = createR2Client(this.config);
    }
    return this.client;
  }

  /** @alias generateUniqueKey */
  generateStorageKey(
    folder?: string | MediaFolder,
    filename?: string,
    mimeType?: string,
  ): string {
    return generateUniqueKey(folder, filename, mimeType);
  }

  generateUniqueKey(
    folder?: string | MediaFolder,
    filename?: string,
    mimeType?: string,
  ): string {
    return generateUniqueKey(folder, filename, mimeType);
  }

  getPublicUrl(key: string): string {
    return getPublicUrl(this.config, key);
  }

  async generateSignedUrl(
    key: string,
    expiresInSeconds = 60 * 60 * 24 * 7,
  ): Promise<string> {
    return getSignedObjectUrl(
      this.getClient(),
      this.config.bucketName,
      key,
      expiresInSeconds,
    );
  }

  async generateSignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 60 * 15,
  ): Promise<string> {
    return getSignedUploadUrl(
      this.getClient(),
      this.config.bucketName,
      key,
      contentType,
      expiresInSeconds,
    );
  }

  extractStorageKey(urlOrKey: string | null | undefined): string | null {
    return extractStorageKeyFromUrl(urlOrKey, this.config.publicUrl);
  }

  /**
   * Always rebuild from `storageKey` when present so stale absolute `publicUrl`
   * values (deleted UUID keys / 404s) never leak to Admin or the Customer App.
   * Without R2_PUBLIC_URL, return a long-lived signed URL for the key.
   */
  async resolveReadableUrl(
    keyOrUrl: string,
    storageKey?: string | null,
  ): Promise<string> {
    const key =
      storageKey?.trim() ||
      this.extractStorageKey(keyOrUrl) ||
      (!keyOrUrl.startsWith('http://') && !keyOrUrl.startsWith('https://')
        ? keyOrUrl.trim()
        : null);

    if (key) {
      if (this.hasPublicBaseUrl()) {
        return this.getPublicUrl(key);
      }
      this.logger.warn(
        'R2_PUBLIC_URL is empty — returning signed URL. Enable R2 public access or custom domain for production.',
      );
      return this.generateSignedUrl(key);
    }

    return keyOrUrl;
  }

  async uploadBuffer(
    body: Buffer | Uint8Array,
    options: {
      folder?: string | MediaFolder;
      filename?: string;
      contentType?: string;
    } = {},
  ): Promise<UploadResult> {
    const result = await uploadBuffer(
      this.getClient(),
      this.config,
      body,
      options,
    );
    return this.withReadableUrl(result);
  }

  async uploadFile(
    filePath: string,
    options: {
      folder?: string | MediaFolder;
      filename?: string;
      contentType?: string;
      size?: number;
    } = {},
  ): Promise<UploadResult> {
    const result = await uploadFile(
      this.getClient(),
      this.config,
      filePath,
      options,
    );
    return this.withReadableUrl(result);
  }

  async uploadStream(
    body: Readable | Buffer,
    options: {
      folder?: string | MediaFolder;
      filename?: string;
      contentType?: string;
      size?: number;
    } = {},
  ): Promise<UploadResult> {
    const result = await uploadStream(
      this.getClient(),
      this.config,
      body,
      options,
    );
    return this.withReadableUrl(result);
  }

  async uploadVideo(
    body: Readable | Buffer,
    options: {
      folder?: string | MediaFolder;
      filename?: string;
      contentType?: string;
      size?: number;
    } = {},
  ): Promise<UploadResult> {
    const result = await uploadVideo(this.getClient(), this.config, body, {
      folder: options.folder ?? MEDIA_FOLDERS.VIDEOS_HOME,
      ...options,
    });
    return this.withReadableUrl(result);
  }

  async uploadImage(
    body: Buffer | Uint8Array,
    options: {
      folder?: string | MediaFolder;
      filename?: string;
      contentType?: string;
    } = {},
  ): Promise<UploadResult> {
    const result = await uploadImage(
      this.getClient(),
      this.config,
      body,
      options,
    );
    return this.withReadableUrl(result);
  }

  async uploadMulterFile(
    file: Express.Multer.File,
    folder?: string | MediaFolder,
  ): Promise<UploadResult> {
    const resolvedFolder =
      folder ?? inferMediaFolder(file.mimetype || 'application/octet-stream');
    const isVideo = file.mimetype.startsWith('video/');
    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname?.toLowerCase().endsWith('.pdf');

    if (file.buffer) {
      if (isVideo) {
        return this.uploadVideo(file.buffer, {
          folder: resolvedFolder,
          filename: file.originalname,
          contentType: file.mimetype,
          size: file.size,
        });
      }
      if (isPdf) {
        return this.uploadBuffer(file.buffer, {
          folder: resolvedFolder || MEDIA_FOLDERS.DOCUMENTS,
          filename: file.originalname,
          contentType: 'application/pdf',
        });
      }
      return this.uploadImage(file.buffer, {
        folder: resolvedFolder,
        filename: file.originalname,
        contentType: file.mimetype,
      });
    }

    if (file.path) {
      const stream = createReadStream(file.path);
      if (isVideo) {
        return this.uploadVideo(stream, {
          folder: resolvedFolder,
          filename: file.originalname,
          contentType: file.mimetype,
          size: file.size,
        });
      }
      return this.uploadStream(stream, {
        folder: resolvedFolder,
        filename: file.originalname,
        contentType: file.mimetype,
        size: file.size,
      });
    }

    throw new ServiceUnavailableException(
      'Uploaded file has no buffer or path',
    );
  }

  async deleteFile(key: string): Promise<void> {
    if (!key) return;
    await deleteFile(this.getClient(), this.config.bucketName, key);
  }

  /**
   * Upload a replacement object and delete the previous key (best-effort).
   */
  async replaceFile(
    previousKeyOrUrl: string | null | undefined,
    file: Express.Multer.File,
    folder?: string | MediaFolder,
  ): Promise<UploadResult> {
    const uploaded = await this.uploadMulterFile(file, folder);
    const previousKey = this.extractStorageKey(previousKeyOrUrl);
    if (previousKey && previousKey !== uploaded.storageKey) {
      try {
        await this.deleteFile(previousKey);
      } catch (error) {
        this.logger.warn(
          `Failed to delete previous R2 object ${previousKey}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return uploaded;
  }

  private async withReadableUrl(result: UploadResult): Promise<UploadResult> {
    const withKey: UploadResult = {
      ...result,
      storageKey: result.storageKey || result.key,
      key: result.key || result.storageKey,
    };
    if (this.hasPublicBaseUrl()) {
      return withKey;
    }
    const publicUrl = await getSignedObjectUrl(
      this.getClient(),
      this.config.bucketName,
      withKey.key,
    );
    return { ...withKey, publicUrl };
  }
}
