import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/database/prisma.service';

type FirebaseMessaging = {
  sendEachForMulticast: (message: {
    tokens: string[];
    notification: { title: string; body: string };
    data?: Record<string, string>;
  }) => Promise<{ successCount: number; failureCount: number }>;
};

/**
 * Optional FCM sender. Initializes only when FIREBASE_* env vars are present.
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

  async onModuleInit(): Promise<void> {
    const projectId = this.config.get<string>('firebase.projectId');
    const clientEmail = this.config.get<string>('firebase.clientEmail');
    let privateKey = this.config.get<string>('firebase.privateKey');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.debug('FCM disabled — FIREBASE_* not configured');
      return;
    }

    try {
      privateKey = privateKey.replace(/\\n/g, '\n');
      // Lazy require so local/dev without Firebase still boots.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const admin = require('firebase-admin') as {
        apps: unknown[];
        initializeApp: (options: {
          credential: unknown;
        }) => void;
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
    if (!this.messaging) return;

    const tokens = await this.prisma.notificationToken.findMany({
      where: { customerId, isActive: true },
      select: { token: true },
      take: 20,
    });

    const unique = [...new Set(tokens.map((t) => t.token).filter(Boolean))];
    if (unique.length === 0) return;

    try {
      const result = await this.messaging.sendEachForMulticast({
        tokens: unique,
        notification: { title, body },
        data,
      });
      this.logger.debug(
        `FCM customer ${customerId}: ok=${result.successCount} fail=${result.failureCount}`,
      );
    } catch (error) {
      this.logger.warn(
        `FCM send failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}
