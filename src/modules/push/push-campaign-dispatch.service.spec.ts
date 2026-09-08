import { PushCampaignDispatchService } from './push-campaign-dispatch.service';

jest.mock('../../../generated/prisma/client', () => ({
  PrismaClient: class PrismaClient {},
  CustomerStatus: { ACTIVE: 'ACTIVE' },
  NotificationType: { ADMIN_ANNOUNCEMENT: 'ADMIN_ANNOUNCEMENT' },
  PushCampaignStatus: {
    QUEUED: 'QUEUED',
    SCHEDULED: 'SCHEDULED',
    SENDING: 'SENDING',
    SENT: 'SENT',
    PARTIALLY_SENT: 'PARTIALLY_SENT',
    FAILED: 'FAILED',
  },
  PushDeliveryStatus: {
    PENDING: 'PENDING',
    SENT: 'SENT',
    FAILED: 'FAILED',
  },
  PushCampaignAudienceType: { CUSTOM_LIST: 'CUSTOM_LIST', ALL: 'ALL' },
  PushDeepLinkTarget: {
    HOME: 'HOME',
    PRODUCT: 'PRODUCT',
    CATEGORY: 'CATEGORY',
    OFFER: 'OFFER',
    ORDER: 'ORDER',
    CART: 'CART',
    NOTIFICATIONS: 'NOTIFICATIONS',
    CUSTOM: 'CUSTOM',
  },
}));

describe('PushCampaignDispatchService', () => {
  const prisma = {
    pushCampaign: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    notification: { createMany: jest.fn() },
    notificationToken: { findMany: jest.fn() },
    pushCampaignDelivery: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const fcm = { sendToTokens: jest.fn() };
  const cache = { invalidateNotifications: jest.fn().mockResolvedValue(undefined) };
  const audienceResolver = { resolveCustomerIds: jest.fn() };

  let service: PushCampaignDispatchService;

  beforeEach(() => {
    jest.clearAllMocks();
    cache.invalidateNotifications.mockResolvedValue(undefined);
    service = new PushCampaignDispatchService(
      prisma as never,
      fcm as never,
      cache as never,
      audienceResolver as never,
      { emitInboxCreated: jest.fn() } as never,
    );
  });

  it('creates one inbox row per customer and FCM deliveries per device', async () => {
    prisma.pushCampaign.updateMany.mockResolvedValue({ count: 1 });
    prisma.pushCampaign.findUnique.mockResolvedValue({
      id: 'camp-1',
      title: 'Sale',
      body: 'Today',
      imageUrl: 'https://cdn.example.com/n.png',
      notificationType: 'ADMIN_ANNOUNCEMENT',
      deepLinkTarget: 'HOME',
      deepLinkValue: null,
      audienceType: 'CUSTOM_LIST',
      audiences: [],
    });
    audienceResolver.resolveCustomerIds.mockResolvedValue(['cust-a']);
    prisma.pushCampaign.update.mockResolvedValue({});
    prisma.notification.createMany.mockResolvedValue({ count: 1 });
    prisma.notificationToken.findMany.mockResolvedValue([
      { id: 't1', customerId: 'cust-a', token: 'token-android', platform: 'ANDROID' },
      { id: 't2', customerId: 'cust-a', token: 'token-ios', platform: 'IOS' },
    ]);
    prisma.pushCampaignDelivery.createMany.mockResolvedValue({ count: 2 });
    prisma.pushCampaignDelivery.findMany.mockResolvedValue([
      { deviceToken: 'token-android', customerId: 'cust-a', tokenId: 't1' },
      { deviceToken: 'token-ios', customerId: 'cust-a', tokenId: 't2' },
    ]);
    fcm.sendToTokens.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      results: [
        { token: 'token-android', success: true, messageId: 'm1' },
        { token: 'token-ios', success: false, errorCode: 'messaging/unavailable' },
      ],
    });
    prisma.pushCampaignDelivery.updateMany.mockResolvedValue({ count: 1 });

    await service.processCampaign('camp-1');

    expect(prisma.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ customerId: 'cust-a', campaignId: 'camp-1' })],
        skipDuplicates: true,
      }),
    );
    expect(fcm.sendToTokens).toHaveBeenCalledWith(
      ['token-android', 'token-ios'],
      expect.objectContaining({
        title: 'Sale',
        imageUrl: 'https://cdn.example.com/n.png',
      }),
    );
    expect(prisma.pushCampaign.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PARTIALLY_SENT',
          totalSent: 1,
          totalFailed: 1,
        }),
      }),
    );
  });

  it('marks the campaign failed when every FCM send fails', async () => {
    prisma.pushCampaign.updateMany.mockResolvedValue({ count: 1 });
    prisma.pushCampaign.findUnique.mockResolvedValue({
      id: 'camp-2',
      title: 'Sale',
      body: 'Today',
      imageUrl: null,
      notificationType: 'ADMIN_ANNOUNCEMENT',
      deepLinkTarget: 'HOME',
      deepLinkValue: null,
      audienceType: 'ALL',
      audiences: [],
    });
    audienceResolver.resolveCustomerIds.mockResolvedValue(['cust-a']);
    prisma.pushCampaign.update.mockResolvedValue({});
    prisma.notification.createMany.mockResolvedValue({ count: 1 });
    prisma.notificationToken.findMany.mockResolvedValue([
      { id: 't1', customerId: 'cust-a', token: 'bad', platform: 'ANDROID' },
    ]);
    prisma.pushCampaignDelivery.createMany.mockResolvedValue({ count: 1 });
    prisma.pushCampaignDelivery.findMany.mockResolvedValue([
      { deviceToken: 'bad', customerId: 'cust-a', tokenId: 't1' },
    ]);
    fcm.sendToTokens.mockResolvedValue({
      successCount: 0,
      failureCount: 1,
      results: [{ token: 'bad', success: false, errorCode: 'messaging/invalid-registration-token' }],
    });
    prisma.pushCampaignDelivery.updateMany.mockResolvedValue({ count: 1 });

    await service.processCampaign('camp-2');
    expect(prisma.pushCampaign.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });
});
