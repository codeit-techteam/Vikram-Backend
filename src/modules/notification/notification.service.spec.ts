import { NotificationService } from './notification.service';

jest.mock('../../../generated/prisma/client', () => ({
  PrismaClient: class PrismaClient {},
  EntityStatus: { ACTIVE: 'ACTIVE' },
  NotificationType: { ADMIN_ANNOUNCEMENT: 'ADMIN_ANNOUNCEMENT' },
  PushDeliveryStatus: { OPENED: 'OPENED' },
  Prisma: {},
}));

describe('NotificationService isolation', () => {
  const prisma = {
    notification: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    pushCampaign: { update: jest.fn() },
    pushCampaignDelivery: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const cache = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
    invalidateNotifications: jest.fn(),
    invalidateUnreadCount: jest.fn(),
  };

  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationService(prisma as never, cache as never);
  });

  it('does not mark another customer notification as read', async () => {
    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(
      service.markAsRead('customer-a', '11111111-1111-4111-8111-111111111111'),
    ).rejects.toThrow('not found');
  });

  it('marks owned notification read and increments campaign open count once', async () => {
    prisma.notification.findFirst.mockResolvedValue({
      id: 'n1',
      customerId: 'customer-a',
      campaignId: 'camp-1',
      isRead: false,
      openedAt: null,
      isGlobal: false,
      type: 'ADMIN_ANNOUNCEMENT',
      label: 'PUSH',
      title: 'Hi',
      body: 'Body',
      imageUrl: null,
      actionLabel: 'Open',
      actionRoute: '/(tabs)',
      actionVariant: 'outline',
      createdAt: new Date(),
    });
    prisma.notification.update.mockResolvedValue({
      id: 'n1',
      campaignId: 'camp-1',
      type: 'ADMIN_ANNOUNCEMENT',
      label: 'PUSH',
      title: 'Hi',
      body: 'Body',
      imageUrl: null,
      actionLabel: 'Open',
      actionRoute: '/(tabs)',
      actionVariant: 'outline',
      isRead: true,
      createdAt: new Date(),
    });
    prisma.pushCampaign.update.mockResolvedValue({});
    prisma.pushCampaignDelivery.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.markAsRead('customer-a', 'n1');
    expect(result.isRead).toBe(true);
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'n1' } }),
    );
    expect(prisma.pushCampaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { totalOpened: { increment: 1 } },
    });
  });

  it('marks read when FCM notificationId is the campaign id', async () => {
    prisma.notification.findFirst.mockResolvedValue({
      id: 'inbox-row',
      customerId: 'customer-a',
      campaignId: 'camp-1',
      isRead: false,
      openedAt: null,
      isGlobal: false,
      type: 'ADMIN_ANNOUNCEMENT',
      label: 'PUSH',
      title: 'Hi',
      body: 'Body',
      imageUrl: null,
      actionLabel: 'Open',
      actionRoute: '/(tabs)',
      actionVariant: 'outline',
      createdAt: new Date(),
    });
    prisma.notification.update.mockResolvedValue({
      id: 'inbox-row',
      campaignId: 'camp-1',
      type: 'ADMIN_ANNOUNCEMENT',
      label: 'PUSH',
      title: 'Hi',
      body: 'Body',
      imageUrl: null,
      actionLabel: 'Open',
      actionRoute: '/(tabs)',
      actionVariant: 'outline',
      isRead: true,
      createdAt: new Date(),
    });
    prisma.pushCampaign.update.mockResolvedValue({});
    prisma.pushCampaignDelivery.updateMany.mockResolvedValue({ count: 1 });

    await service.markAsRead('customer-a', 'camp-1');
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'inbox-row' } }),
    );
  });
});
