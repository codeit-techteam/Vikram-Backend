import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/database/prisma.service';
import {
  ANDROID_NOTIFICATION_CHANNEL,
  FCM_MAX_ATTEMPTS,
  FCM_MULTICAST_LIMIT,
  FCM_RETRY_BACKOFF_MS,
  INVALID_FCM_ERROR_CODES,
  TRANSIENT_FCM_ERROR_CODES,
} from './push.constants';

export interface FcmMulticastMessage {
  title: string;
  body: string;
  imageUrl?: string | null;
  data?: Record<string, string>;
}

export interface FcmTokenSendResult {
  token: string;
  success: boolean;
  messageId?: string;
  errorCode?: string;
  invalidToken: boolean;
  retryable: boolean;
}

export interface FcmBatchResult {
  successCount: number;
  failureCount: number;
  results: FcmTokenSendResult[];
}

type FirebaseErrorLike = {
  code?: string;
  message?: string;
};

type FirebaseSendResponse = {
  success: boolean;
  messageId?: string;
  error?: FirebaseErrorLike;
};

type FirebaseMessaging = {
  sendEachForMulticast: (message: {
    tokens: string[];
    notification: { title: string; body: string; imageUrl?: string };
    data?: Record<string, string>;
    android?: {
      notification?: {
        imageUrl?: string;
        channelId?: string;
        sound?: string;
      };
      priority?: 'high' | 'normal';
    };
    apns?: {
      payload?: { aps: { 'mutable-content'?: number; sound?: string } };
      fcmOptions?: { imageUrl?: string };
    };
  }) => Promise<{
    successCount: number;
    failureCount: number;
    responses: FirebaseSendResponse[];
  }>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyError(code?: string): {
  invalidToken: boolean;
  retryable: boolean;
} {
  if (!code) return { invalidToken: false, retryable: true };
  return {
    invalidToken: INVALID_FCM_ERROR_CODES.has(code),
    retryable: TRANSIENT_FCM_ERROR_CODES.has(code),
  };
}

/**
 * Server-side FCM sender. Initializes only when FIREBASE_* env vars are present.
 * In-app notifications still work without FCM.
 */
@Injectable()
export class FcmPushService implements OnModuleInit {
  private readonly logger = new Logger(FcmPushService.name);
  private messaging: FirebaseMessaging | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  isEnabled(): boolean {
    return this.messaging !== null;
  }

  async onModuleInit(): Promise<void> {
    const projectId = this.config.get<string>('firebase.projectId');
    const clientEmail = this.config.get<string>('firebase.clientEmail');
    let privateKey = this.config.get<string>('firebase.privateKey');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        'FCM disabled — FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY are required for push delivery',
      );
      return;
    }

    try {
      privateKey = privateKey.replace(/\\n/g, '\n');
      // Lazy require so local/dev without Firebase still boots.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const admin = require('firebase-admin') as {
        apps: unknown[];
        initializeApp: (options: { credential: unknown }) => void;
        credential: {
          cert: (serviceAccount: {
            projectId: string;
            clientEmail: string;
            privateKey: string;
          }) => unknown;
        };
        messaging: () => FirebaseMessaging;
      };
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
      }
      this.messaging = admin.messaging();
      this.logger.log('FCM push enabled');
    } catch (error) {
      this.logger.warn(
        `FCM init failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  async sendToCustomer(
    customerId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    const tokens = await this.prisma.notificationToken.findMany({
      where: { customerId, isActive: true },
      select: { token: true },
      take: 20,
    });
    const unique = [...new Set(tokens.map((t) => t.token).filter(Boolean))];
    if (unique.length === 0) return;

    await this.sendToTokens(unique, { title, body, data });
  }

  async sendToTokens(
    tokens: string[],
    message: FcmMulticastMessage,
  ): Promise<FcmBatchResult> {
    const unique = [...new Set(tokens.filter(Boolean))];
    if (unique.length === 0) {
      return { successCount: 0, failureCount: 0, results: [] };
    }

    if (!this.messaging) {
      this.logger.warn(
        `FCM skip — provider not configured (tokens=${unique.length})`,
      );
      return {
        successCount: 0,
        failureCount: unique.length,
        results: unique.map((token) => ({
          token,
          success: false,
          errorCode: 'fcm/not-configured',
          invalidToken: false,
          retryable: false,
        })),
      };
    }

    const allResults: FcmTokenSendResult[] = [];
    for (let i = 0; i < unique.length; i += FCM_MULTICAST_LIMIT) {
      const chunk = unique.slice(i, i + FCM_MULTICAST_LIMIT);
      const chunkResult = await this.sendChunkWithRetry(chunk, message);
      allResults.push(...chunkResult);
    }

    const invalid = allResults
      .filter((r) => r.invalidToken)
      .map((r) => r.token);
    if (invalid.length > 0) {
      await this.deactivateTokens(invalid);
    }

    return {
      successCount: allResults.filter((r) => r.success).length,
      failureCount: allResults.filter((r) => !r.success).length,
      results: allResults,
    };
  }

  async deactivateTokens(tokens: string[]): Promise<number> {
    if (tokens.length === 0) return 0;
    const result = await this.prisma.notificationToken.updateMany({
      where: { token: { in: tokens } },
      data: { isActive: false },
    });
    if (result.count > 0) {
      this.logger.log(`Deactivated ${result.count} invalid FCM tokens`);
    }
    return result.count;
  }

  private async sendChunkWithRetry(
    tokens: string[],
    message: FcmMulticastMessage,
  ): Promise<FcmTokenSendResult[]> {
    let pending = [...tokens];
    const settled = new Map<string, FcmTokenSendResult>();

    for (let attempt = 0; attempt < FCM_MAX_ATTEMPTS && pending.length > 0; attempt++) {
      if (attempt > 0) {
        await sleep(FCM_RETRY_BACKOFF_MS[attempt - 1] ?? 3000);
      }

      const batch = await this.sendChunkOnce(pending, message);
      const nextPending: string[] = [];
      for (const result of batch) {
        if (result.success || result.invalidToken || !result.retryable) {
          settled.set(result.token, result);
        } else if (attempt === FCM_MAX_ATTEMPTS - 1) {
          settled.set(result.token, result);
        } else {
          nextPending.push(result.token);
        }
      }
      pending = nextPending;
    }

    return tokens.map((token) => {
      return (
        settled.get(token) ?? {
          token,
          success: false,
          errorCode: 'fcm/unknown',
          invalidToken: false,
          retryable: false,
        }
      );
    });
  }

  private async sendChunkOnce(
    tokens: string[],
    message: FcmMulticastMessage,
  ): Promise<FcmTokenSendResult[]> {
    if (!this.messaging) {
      return tokens.map((token) => ({
        token,
        success: false,
        errorCode: 'fcm/not-configured',
        invalidToken: false,
        retryable: false,
      }));
    }

    const imageUrl = message.imageUrl?.trim() || undefined;
    try {
      const result = await this.messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: message.title,
          body: message.body,
          ...(imageUrl ? { imageUrl } : {}),
        },
        data: message.data,
        android: {
          priority: 'high',
          notification: {
            channelId: ANDROID_NOTIFICATION_CHANNEL,
            sound: 'default',
            ...(imageUrl ? { imageUrl } : {}),
          },
        },
        apns: {
          payload: { aps: { 'mutable-content': imageUrl ? 1 : undefined, sound: 'default' } },
          ...(imageUrl ? { fcmOptions: { imageUrl } } : {}),
        },
      });

      return tokens.map((token, index) => {
        const response = result.responses[index];
        if (response?.success) {
          return {
            token,
            success: true,
            messageId: response.messageId,
            invalidToken: false,
            retryable: false,
          };
        }
        const errorCode = response?.error?.code ?? 'fcm/unknown';
        const classified = classifyError(errorCode);
        this.logger.warn(
          `FCM token failed code=${errorCode} invalid=${classified.invalidToken}`,
        );
        return {
          token,
          success: false,
          errorCode,
          invalidToken: classified.invalidToken,
          retryable: classified.retryable,
        };
      });
    } catch (error) {
      const errorCode =
        error instanceof Error ? error.message : 'fcm/send-failed';
      this.logger.warn(`FCM multicast failed: ${errorCode}`);
      return tokens.map((token) => ({
        token,
        success: false,
        errorCode: 'fcm/send-failed',
        invalidToken: false,
        retryable: true,
      }));
    }
  }
}
