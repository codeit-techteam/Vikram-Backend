import { CustomerStatus } from '../../../generated/prisma/client';
import { AdminCustomersService } from './admin-customers.service';

jest.mock('../../../generated/prisma/client', () => ({
  PrismaClient: class PrismaClient {},
  AdminRole: { CUSTOMER_EXECUTIVE: 'CUSTOMER_EXECUTIVE' },
  CustomerStatus: {
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE',
    SUSPENDED: 'SUSPENDED',
  },
  MembershipStatus: { ACTIVE: 'ACTIVE', CANCELLED: 'CANCELLED' },
  PaymentStatus: { PAID: 'PAID' },
  RegistrationSource: { SUPER_ADMIN: 'SUPER_ADMIN' },
  Prisma: {},
}));

jest.mock('../../common/database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../../hub/common/hub-date.util', () => ({
  startOfDayIst: () => new Date('2026-09-01T18:30:00.000Z'),
  addDays: (date: Date, days: number) =>
    new Date(date.getTime() + days * 24 * 60 * 60 * 1000),
}));

describe('AdminCustomersService', () => {
  const prisma = {
    customer: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    hub: { findMany: jest.fn(), findFirst: jest.fn() },
    adminUser: { findMany: jest.fn(), findFirst: jest.fn() },
    address: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };

  let service: AdminCustomersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminCustomersService(prisma as never);
  });

  it('returns dashboard stats from the database', async () => {
    prisma.customer.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);

    await expect(service.getStats()).resolves.toEqual({
      total: 12,
      active: 9,
      blocked: 1,
      inactive: 2,
      pendingVerification: 3,
      newToday: 4,
    });
  });

  it('filters pending verification without inventing a status enum', async () => {
    prisma.customer.findMany.mockResolvedValue([]);
    prisma.customer.count.mockResolvedValue(0);

    await service.findAll({ status: 'PENDING_VERIFICATION', page: 1, limit: 10 });

    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isVerified: false,
          status: { not: CustomerStatus.SUSPENDED },
        }),
      }),
    );
  });

  it('maps blocked UI status to SUSPENDED', async () => {
    prisma.customer.findMany.mockResolvedValue([]);
    prisma.customer.count.mockResolvedValue(0);

    await service.findAll({ status: 'BLOCKED', page: 1, limit: 10 });

    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: CustomerStatus.SUSPENDED }),
      }),
    );
  });

  it('exports csv without membership tiers', async () => {
    prisma.customer.findMany.mockResolvedValue([
      {
        id: 'c1',
        phone: '+919876543210',
        email: 'a@test.com',
        fullName: 'Asha',
        status: 'ACTIVE',
        isVerified: true,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        assignedHubId: null,
        assignedExecutiveId: null,
        assignedHub: null,
        assignedExecutive: null,
        profile: { companyName: 'Asha Builders', gstNumber: null, businessType: 'BUILDER' },
        loyaltyAccount: { availablePoints: 10, currentPoints: 10 },
        addresses: [{ city: 'Mumbai', state: 'Maharashtra' }],
        deviceSessions: [],
        _count: { orders: 2, addresses: 1 },
      },
    ]);

    const csv = await service.exportCsv({});
    expect(csv).toContain('Asha');
    expect(csv).toContain('Mumbai');
    expect(csv.toLowerCase()).not.toContain('gold');
    expect(csv.toLowerCase()).not.toContain('bronze');
    expect(csv.toLowerCase()).not.toContain('membership');
  });
});
