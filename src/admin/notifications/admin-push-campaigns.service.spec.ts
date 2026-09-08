import { BadRequestException } from '@nestjs/common';
import { AdminPushCampaignsService } from './admin-push-campaigns.service';

jest.mock('../../../generated/prisma/client', () => ({
  PrismaClient: class PrismaClient {},
  CustomerStatus: { ACTIVE: 'ACTIVE' },
  DevicePlatform: { ANDROID: 'ANDROID', IOS: 'IOS' },
  PushCampaignAudienceType: {
    ALL: 'ALL',
    CITY_HUB: 'CITY_HUB',
    SEGMENT: 'SEGMENT',
    CUSTOM_LIST: 'CUSTOM_LIST',
  },
  PushCampaignStatus: {
    DRAFT: 'DRAFT',
    SCHEDULED: 'SCHEDULED',
    QUEUED: 'QUEUED',
    SENDING: 'SENDING',
    SENT: 'SENT',
    PARTIALLY_SENT: 'PARTIALLY_SENT',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
  },
  PushCampaignDeliveryMode: { NOW: 'NOW', SCHEDULED: 'SCHEDULED' },
  PushDeepLinkTarget: {
    HOME: 'HOME',
    PRODUCT: 'PRODUCT',
    CUSTOM: 'CUSTOM',
  },
  NotificationType: { ADMIN_ANNOUNCEMENT: 'ADMIN_ANNOUNCEMENT' },
  Prisma: {},
}));

describe('AdminPushCampaignsService', () => {
  const prisma = {
    pushCampaign: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    adminDeviceToken: { findMany: jest.fn() },
    notificationToken: { findMany: jest.fn() },
    customer: { findFirst: jest.fn() },
    notification: { create: jest.fn() },
  };
  const audienceResolver = {
    resolveCustomerIds: jest.fn().mockResolvedValue(['c1']),
  };
  const dispatch = { enqueue: jest.fn() };
  const fcm = {
    sendToTokens: jest.fn(),
    isEnabled: jest.fn().mockReturnValue(true),
  };
  const deviceTokens = { countActiveSubscribers: jest.fn().mockResolvedValue(4) };

  let service: AdminPushCampaignsService;

  beforeEach(() => {
    jest.clearAllMocks();
    fcm.isEnabled.mockReturnValue(true);
    service = new AdminPushCampaignsService(
      prisma as never,
      audienceResolver as never,
      dispatch as never,
      fcm as never,
      deviceTokens as never,
    );
  });

  it('creates a send-now campaign and queues dispatch', async () => {
    prisma.pushCampaign.create.mockResolvedValue({
      id: 'camp-1',
      title: 'Monsoon Sale is Live!',
      body: 'Special offers available today',
      imageUrl: 'https://cdn.example.com/n.png',
      audienceType: 'CUSTOM_LIST',
      deepLinkTarget: 'HOME',
      deepLinkValue: null,
      status: 'QUEUED',
      deliveryMode: 'NOW',
      scheduledAt: null,
      sentAt: null,
      createdAt: new Date(),
      totalRecipients: 0,
      totalSent: 0,
      totalDelivered: 0,
      totalOpened: 0,
      totalFailed: 0,
      audiences: [{ userId: '123e4567-e89b-12d3-a456-426614174000', city: null, hubId: null, segment: null }],
    });

    const result = await service.create('admin-1', {
      title: 'Monsoon Sale is Live!',
      body: 'Special offers available today',
      imageUrl: 'https://cdn.example.com/n.png',
      audienceType: 'CUSTOM_LIST',
      customerIds: ['123e4567-e89b-12d3-a456-426614174000'],
      deepLinkTarget: 'HOME',
      deliveryMode: 'NOW',
    });

    expect(audienceResolver.resolveCustomerIds).toHaveBeenCalled();
    expect(dispatch.enqueue).toHaveBeenCalledWith('camp-1');
    expect(result.status).toBe('QUEUED');
  });

  it('rejects send-now when FCM is not configured', async () => {
    fcm.isEnabled.mockReturnValue(false);

    await expect(
      service.create('admin-1', {
        title: 'Test Notification',
        body: 'Offer is Valid till 10 Sep',
        audienceType: 'ALL',
        deepLinkTarget: 'HOME',
        deliveryMode: 'NOW',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.pushCampaign.create).not.toHaveBeenCalled();
    expect(dispatch.enqueue).not.toHaveBeenCalled();
  });

  it('allows drafts when FCM is not configured', async () => {
    fcm.isEnabled.mockReturnValue(false);
    prisma.pushCampaign.create.mockResolvedValue({
      id: 'draft-2',
      title: 'Draft',
      body: 'Hold',
      imageUrl: null,
      audienceType: 'ALL',
      deepLinkTarget: 'HOME',
      deepLinkValue: null,
      status: 'DRAFT',
      deliveryMode: 'NOW',
      scheduledAt: null,
      sentAt: null,
      createdAt: new Date(),
      totalRecipients: 0,
      totalSent: 0,
      totalDelivered: 0,
      totalOpened: 0,
      totalFailed: 0,
      audiences: [],
    });

    await service.create('admin-1', {
      title: 'Draft',
      body: 'Hold',
      audienceType: 'ALL',
      deepLinkTarget: 'HOME',
      deliveryMode: 'NOW',
      saveAsDraft: true,
    });

    expect(prisma.pushCampaign.create).toHaveBeenCalled();
    expect(dispatch.enqueue).not.toHaveBeenCalled();
  });

  it('saves drafts without queueing FCM', async () => {
    prisma.pushCampaign.create.mockResolvedValue({
      id: 'draft-1',
      title: 'Draft',
      body: 'Hold',
      imageUrl: null,
      audienceType: 'ALL',
      deepLinkTarget: 'HOME',
      deepLinkValue: null,
      status: 'DRAFT',
      deliveryMode: 'NOW',
      scheduledAt: null,
      sentAt: null,
      createdAt: new Date(),
      totalRecipients: 0,
      totalSent: 0,
      totalDelivered: 0,
      totalOpened: 0,
      totalFailed: 0,
      audiences: [],
    });

    await service.create('admin-1', {
      title: 'Draft',
      body: 'Hold',
      audienceType: 'ALL',
      deepLinkTarget: 'HOME',
      deliveryMode: 'NOW',
      saveAsDraft: true,
    });

    expect(audienceResolver.resolveCustomerIds).not.toHaveBeenCalled();
    expect(dispatch.enqueue).not.toHaveBeenCalled();
  });

  it('schedules for later without sending immediately', async () => {
    const when = new Date(Date.now() + 60_000).toISOString();
    prisma.pushCampaign.create.mockResolvedValue({
      id: 'sched-1',
      title: 'Later',
      body: 'Tomorrow',
      imageUrl: null,
      audienceType: 'ALL',
      deepLinkTarget: 'HOME',
      deepLinkValue: null,
      status: 'SCHEDULED',
      deliveryMode: 'SCHEDULED',
      scheduledAt: new Date(when),
      sentAt: null,
      createdAt: new Date(),
      totalRecipients: 0,
      totalSent: 0,
      totalDelivered: 0,
      totalOpened: 0,
      totalFailed: 0,
      audiences: [],
    });

    const result = await service.create('admin-1', {
      title: 'Later',
      body: 'Tomorrow',
      audienceType: 'ALL',
      deepLinkTarget: 'HOME',
      deliveryMode: 'SCHEDULED',
      scheduledAt: when,
    });

    expect(result.status).toBe('SCHEDULED');
    expect(dispatch.enqueue).not.toHaveBeenCalled();
  });

  it('rejects send-test when no admin or customer device is registered', async () => {
    prisma.adminDeviceToken.findMany.mockResolvedValue([]);
    prisma.customer.findFirst.mockResolvedValue(null);

    await expect(
      service.sendTest(
        { id: 'admin-1', email: 'ops@bajriwala.in' },
        { title: 'Test', body: 'Hello' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fcm.sendToTokens).not.toHaveBeenCalled();
  });

  it('sends a real FCM test when a device is registered', async () => {
    prisma.adminDeviceToken.findMany.mockResolvedValue([
      { token: 'admin-fcm' },
    ]);
    prisma.customer.findFirst.mockResolvedValue(null);
    fcm.sendToTokens.mockResolvedValue({ successCount: 1, failureCount: 0 });

    const result = await service.sendTest(
      { id: 'admin-1', email: 'ops@bajriwala.in' },
      { title: 'Test', body: 'Hello' },
    );
    expect(fcm.sendToTokens).toHaveBeenCalledWith(
      ['admin-fcm'],
      expect.objectContaining({ title: 'Test', body: 'Hello' }),
    );
    expect(result.sent).toBe(1);
  });
});
