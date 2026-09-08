import { DeviceTokenService } from './device-token.service';

jest.mock('../../../generated/prisma/client', () => ({
  PrismaClient: class PrismaClient {},
  DevicePlatform: { ANDROID: 'ANDROID', IOS: 'IOS', WEB: 'WEB' },
}));

describe('DeviceTokenService', () => {
  const prisma = {
    notificationToken: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    deviceSession: {
      upsert: jest.fn(),
    },
  };

  let service: DeviceTokenService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DeviceTokenService(prisma as never);
    prisma.deviceSession.upsert.mockResolvedValue({});
  });

  it('updates an existing token instead of creating a duplicate', async () => {
    prisma.notificationToken.findUnique.mockResolvedValue({
      id: 'tok-1',
      token: 'fcm-token',
      customerId: 'old-user',
      deviceId: 'device-1',
    });
    prisma.notificationToken.update.mockResolvedValue({
      id: 'tok-1',
      token: 'fcm-token',
      platform: 'ANDROID',
    });

    const result = await service.register('new-user', {
      token: 'fcm-token',
      platform: 'ANDROID',
      deviceId: 'device-1',
    });

    expect(prisma.notificationToken.create).not.toHaveBeenCalled();
    expect(prisma.notificationToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: 'fcm-token' },
        data: expect.objectContaining({
          customerId: 'new-user',
          isActive: true,
        }),
      }),
    );
    expect(result.token).toBe('fcm-token');
  });

  it('deactivates tokens on logout instead of deleting them', async () => {
    prisma.notificationToken.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.release('user-1', { token: 'fcm-token' });
    expect(result.released).toBe(1);
    expect(prisma.notificationToken.updateMany).toHaveBeenCalledWith({
      where: { customerId: 'user-1', isActive: true, token: 'fcm-token' },
      data: { isActive: false },
    });
  });
});
