import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  MEDIA_FOLDERS,
  resolveMediaFolder,
  type MediaFolder,
} from './media-folders';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl?: string;
  endpoint?: string;
}

export interface UploadResult {
  /** Object key inside the R2 bucket (same as storageKey). */
  key: string;
  /** Alias for `key` — prefer this in API responses. */
  storageKey: string;
  publicUrl: string;
  bucket: string;
  size: number;
  mimeType: string;
  etag?: string;
}

export interface UploadBufferOptions {
  folder?: string | MediaFolder;
  filename?: string;
  contentType?: string;
  cacheControl?: string;
}

function sanitizeFilename(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

function extensionFromName(filename?: string, mimeType?: string): string {
  if (filename && filename.includes('.')) {
    return filename.split('.').pop()!.toLowerCase().slice(0, 10);
  }
  if (!mimeType) return 'bin';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('quicktime')) return 'mov';
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('svg')) return 'svg';
  return 'bin';
}

function toUploadResult(
  partial: Omit<UploadResult, 'storageKey'>,
): UploadResult {
  return { ...partial, storageKey: partial.key };
}

export function createR2Client(config: R2Config): S3Client {
  const endpoint =
    config.endpoint?.trim() ||
    (config.accountId
      ? `https://${config.accountId}.r2.cloudflarestorage.com`
      : '');

  if (!endpoint || !config.accessKeyId || !config.secretAccessKey) {
    throw new Error(
      'R2 is not configured. Set R2_ACCOUNT_ID (or R2_ENDPOINT), R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.',
    );
  }

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  });
}

export function generateUniqueKey(
  folder: string | MediaFolder = MEDIA_FOLDERS.VIDEOS,
  filename?: string,
  mimeType?: string,
): string {
  const prefix = resolveMediaFolder(folder).replace(/^\/+|\/+$/g, '');
  const ext = extensionFromName(filename, mimeType);
  const base = filename
    ? sanitizeFilename(filename.replace(/\.[^.]+$/, ''))
    : 'file';
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}/${stamp}-${randomUUID().slice(0, 8)}-${base}.${ext}`;
}

export function getPublicUrl(config: R2Config, key: string): string {
  const publicBase = config.publicUrl?.replace(/\/+$/, '');
  if (publicBase) {
    return `${publicBase}/${key.replace(/^\/+/, '')}`;
  }
  // Fallback: S3-style path (requires public bucket / custom domain). Prefer signed URLs when empty.
  const endpoint =
    config.endpoint?.replace(/\/+$/, '') ||
    `https://${config.accountId}.r2.cloudflarestorage.com`;
  return `${endpoint}/${config.bucketName}/${key.replace(/^\/+/, '')}`;
}

export async function getSignedObjectUrl(
  client: S3Client,
  bucket: string,
  key: string,
  expiresInSeconds = 60 * 60 * 24 * 7,
): Promise<string> {
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

export async function getSignedUploadUrl(
  client: S3Client,
  bucket: string,
  key: string,
  contentType: string,
  expiresInSeconds = 60 * 15,
): Promise<string> {
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: expiresInSeconds },
  );
}

export async function uploadBuffer(
  client: S3Client,
  config: R2Config,
  body: Buffer | Uint8Array,
  options: UploadBufferOptions = {},
): Promise<UploadResult> {
  const mimeType = options.contentType || 'application/octet-stream';
  const key = generateUniqueKey(options.folder, options.filename, mimeType);
  const size = body.byteLength;

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: body,
      ContentType: mimeType,
      CacheControl:
        options.cacheControl ?? 'public, max-age=31536000, immutable',
    }),
  );

  return toUploadResult({
    key,
    publicUrl: getPublicUrl(config, key),
    bucket: config.bucketName,
    size,
    mimeType,
  });
}

export async function uploadFile(
  client: S3Client,
  config: R2Config,
  filePath: string,
  options: UploadBufferOptions & { size?: number } = {},
): Promise<UploadResult> {
  const mimeType = options.contentType || 'application/octet-stream';
  const key = generateUniqueKey(options.folder, options.filename, mimeType);
  const stream = createReadStream(filePath);

  const upload = new Upload({
    client,
    params: {
      Bucket: config.bucketName,
      Key: key,
      Body: stream,
      ContentType: mimeType,
      CacheControl:
        options.cacheControl ?? 'public, max-age=31536000, immutable',
      ...(options.size ? { ContentLength: options.size } : {}),
    },
    queueSize: 4,
    partSize: 8 * 1024 * 1024,
  });

  const result = await upload.done();
  const size =
    options.size ??
    (await headObjectSize(client, config.bucketName, key).catch(() => 0));

  return toUploadResult({
    key,
    publicUrl: getPublicUrl(config, key),
    bucket: config.bucketName,
    size,
    mimeType,
    etag: result.ETag,
  });
}

export async function uploadStream(
  client: S3Client,
  config: R2Config,
  body: Readable | Buffer,
  options: UploadBufferOptions & { size?: number } = {},
): Promise<UploadResult> {
  const mimeType = options.contentType || 'application/octet-stream';
  const key = generateUniqueKey(options.folder, options.filename, mimeType);

  const upload = new Upload({
    client,
    params: {
      Bucket: config.bucketName,
      Key: key,
      Body: body,
      ContentType: mimeType,
      CacheControl:
        options.cacheControl ?? 'public, max-age=31536000, immutable',
      ...(options.size ? { ContentLength: options.size } : {}),
    },
    queueSize: 4,
    partSize: 8 * 1024 * 1024,
  });

  const result = await upload.done();
  const size =
    options.size ??
    (await headObjectSize(client, config.bucketName, key).catch(() => 0));

  return toUploadResult({
    key,
    publicUrl: getPublicUrl(config, key),
    bucket: config.bucketName,
    size,
    mimeType,
    etag: result.ETag,
  });
}

async function headObjectSize(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<number> {
  const head = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: key }),
  );
  return Number(head.ContentLength ?? 0);
}

export async function deleteFile(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<void> {
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

/**
 * Derive R2 object key from a public CDN URL or path.
 * Returns null for non-R2 / blob / relative paths.
 */
export function extractStorageKeyFromUrl(
  urlOrKey: string | null | undefined,
  publicBaseUrl?: string,
): string | null {
  if (!urlOrKey?.trim()) return null;
  const value = urlOrKey.trim();
  if (value.startsWith('blob:') || value.startsWith('data:')) return null;

  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    return value.replace(/^\/+/, '') || null;
  }

  try {
    const parsed = new URL(value);
    const path = parsed.pathname.replace(/^\/+/, '');
    if (!path) return null;

    const publicBase = publicBaseUrl?.replace(/\/+$/, '');
    if (publicBase) {
      const base = new URL(publicBase);
      if (parsed.host === base.host) return path;
    }

    // Accept any https URL whose path looks like our folder layout.
    if (
      /^(videos|banners|offers|products|categories|brands|testimonials|icons|thumbnails|documents)\//i.test(
        path,
      )
    ) {
      return path;
    }
  } catch {
    return null;
  }

  return null;
}

export async function uploadVideo(
  client: S3Client,
  config: R2Config,
  body: Readable | Buffer,
  options: UploadBufferOptions & { size?: number } = {},
): Promise<UploadResult> {
  return uploadStream(client, config, body, {
    folder: options.folder ?? MEDIA_FOLDERS.VIDEOS_HOME,
    filename: options.filename ?? 'video.mp4',
    contentType: options.contentType ?? 'video/mp4',
    size: options.size,
    cacheControl: options.cacheControl,
  });
}

export async function uploadImage(
  client: S3Client,
  config: R2Config,
  body: Buffer | Uint8Array,
  options: UploadBufferOptions = {},
): Promise<UploadResult> {
  return uploadBuffer(client, config, body, {
    folder: options.folder ?? MEDIA_FOLDERS.BANNERS,
    filename: options.filename ?? 'image.jpg',
    contentType: options.contentType ?? 'image/jpeg',
    cacheControl: options.cacheControl,
  });
}
