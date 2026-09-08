import { BadRequestException } from '@nestjs/common';
import { AudienceResolverService } from './audience-resolver.service';

jest.mock('../../../generated/prisma/client', () => ({
  PrismaClient: class PrismaClient {},
  CustomerStatus: { ACTIVE: 'ACTIVE' },
  PushCampaignAudienceType: {
    ALL: 'ALL',
    CITY_HUB: 'CITY_HUB',
    SEGMENT: 'SEGMENT',
    CUSTOM_LIST: 'CUSTOM_LIST',
  },
  PushUserSegment: {
    NEW_CUSTOMERS: 'NEW_CUSTOMERS',
    EXISTING_CUSTOMERS: 'EXISTING_CUSTOMERS',
    ACTIVE: 'ACTIVE',
    DORMANT: 'DORMANT',
    MEMBERS: 'MEMBERS',
    CONTRACTORS: 'CONTRACTORS',
  },
  Prisma: {},
}));

describe('AudienceResolverService', () => {
  const prisma = {
    customer: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  let service: AudienceResolverService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AudienceResolverService(prisma as never);
  });

  it('resolves all eligible active customers', async () => {
    prisma.customer.findMany.mockResolvedValueOnce([
      { id: '11111111-1111-4111-8111-111111111111' },
      { id: '22222222-2222-4222-8222-222222222222' },
    ]);

    const ids = await service.resolveCustomerIds('ALL' as never, {});
    expect(ids).toHaveLength(2);
    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          deletedAt: null,
        }),
      }),
    );
  });

  it('resolves a particular user custom list', async () => {
    const customerId = '33333333-3333-4333-8333-333333333333';
    prisma.customer.findMany.mockResolvedValueOnce([{ id: customerId }]);

    const ids = await service.resolveCustomerIds('CUSTOM_LIST' as never, {
      customerIds: [customerId],
    });
    expect(ids).toEqual([customerId]);
  });

  it('rejects custom list targeting an ineligible customer', async () => {
    prisma.customer.findMany.mockResolvedValueOnce([]);
    await expect(
      service.resolveCustomerIds('CUSTOM_LIST' as never, {
        customerIds: ['33333333-3333-4333-8333-333333333333'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a city or hub for CITY_HUB', async () => {
    await expect(
      service.resolveCustomerIds('CITY_HUB' as never, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolves hub audience by assignedHubId', async () => {
    const hubId = '44444444-4444-4444-8444-444444444444';
    prisma.customer.findMany.mockResolvedValueOnce([
      { id: '55555555-5555-4555-8555-555555555555' },
    ]);
    const ids = await service.resolveCustomerIds('CITY_HUB' as never, {
      hubIds: [hubId],
    });
    expect(ids).toHaveLength(1);
    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ assignedHubId: { in: [hubId] } }),
          ]),
        }),
      }),
    );
  });

  it('resolves city audience via hub city or address city', async () => {
    prisma.customer.findMany.mockResolvedValueOnce([
      { id: '77777777-7777-4777-8777-777777777777' },
    ]);
    const ids = await service.resolveCustomerIds('CITY_HUB' as never, {
      cities: ['Jaipur'],
    });
    expect(ids).toHaveLength(1);
    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({
                  assignedHub: expect.objectContaining({
                    city: expect.objectContaining({ in: ['Jaipur'] }),
                  }),
                }),
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it('resolves contractor segment by role slug', async () => {
    prisma.customer.findMany.mockResolvedValueOnce([
      { id: '66666666-6666-4666-8666-666666666666' },
    ]);
    await service.resolveCustomerIds('SEGMENT' as never, {
      segments: ['CONTRACTORS'],
    });
    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { slug: 'contractor' },
        }),
      }),
    );
  });
});
