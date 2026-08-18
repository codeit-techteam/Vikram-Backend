jest.mock('../../../generated/prisma/client', () => ({
  AdminRole: {
    SUPER_ADMIN: 'SUPER_ADMIN',
    CUSTOMER_EXECUTIVE: 'CUSTOMER_EXECUTIVE',
    WAREHOUSE_MANAGER: 'WAREHOUSE_MANAGER',
  },
  AuditAction: {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    ASSIGN: 'ASSIGN',
  },
  LoyaltyTransactionType: { EARN: 'EARN' },
  NotificationType: { PAYMENT: 'PAYMENT' },
  OrderStatus: {
    PENDING: 'PENDING',
    CONFIRMED: 'CONFIRMED',
    DELIVERED: 'DELIVERED',
    CANCELLED: 'CANCELLED',
  },
  PaymentLinkStatus: {
    CREATED: 'CREATED',
    SENT: 'SENT',
  },
  PaymentStatus: { PENDING: 'PENDING', PAID: 'PAID' },
  RegistrationSource: {
    CUSTOMER_APP: 'CUSTOMER_APP',
    CUSTOMER_EXECUTIVE: 'CUSTOMER_EXECUTIVE',
    SUPER_ADMIN: 'SUPER_ADMIN',
  },
  SupportTicketStatus: {
    OPEN: 'OPEN',
    IN_PROGRESS: 'IN_PROGRESS',
    RESOLVED: 'RESOLVED',
  },
  Prisma: {},
}));

jest.mock('../../common/database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../../common/database/redis.service', () => ({
  RedisService: class RedisService {},
}));

jest.mock('../../auth/otp/otp.service', () => ({
  OtpService: class OtpService {},
}));

jest.mock('../../modules/cart/cart.service', () => ({
  CartService: class CartService {},
}));

jest.mock('../../modules/orders/orders.service', () => ({
  OrdersService: class OrdersService {},
}));

jest.mock('../../modules/notification/notification.service', () => ({
  NotificationService: class NotificationService {},
}));

jest.mock('../audit/audit.service', () => ({
  AuditService: class AuditService {},
}));

jest.mock('../customers/admin-customers.service', () => ({
  AdminCustomersService: class AdminCustomersService {},
}));

jest.mock('../orders/admin-orders.service', () => ({
  AdminOrdersService: class AdminOrdersService {},
}));

jest.mock('../membership/admin-membership.service', () => ({
  AdminMembershipService: class AdminMembershipService {},
}));

jest.mock('../loyalty/admin-loyalty.service', () => ({
  AdminLoyaltyService: class AdminLoyaltyService {},
}));

jest.mock('../bulk/admin-bulk.service', () => ({
  AdminBulkService: class AdminBulkService {},
}));

jest.mock('../emergency/admin-emergency.service', () => ({
  AdminEmergencyService: class AdminEmergencyService {},
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CustomerExecutiveService } from './customer-executive.service';

describe('CustomerExecutiveService access control', () => {
  const prisma: Record<string, any> = {
    customer: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    order: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      update: jest.fn(),
    },
    supportTicket: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    paymentLink: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    bulkEnquiry: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    loyaltyAccount: { create: jest.fn() },
    customerExecutiveAssignmentHistory: { create: jest.fn() },
    orderTimeline: { create: jest.fn() },
    address: { create: jest.fn(), findFirst: jest.fn() },
    role: { findFirst: jest.fn() },
    emergencyOrder: { count: jest.fn() },
    customerProfile: { update: jest.fn(), create: jest.fn() },
    $transaction: jest.fn((fn: (tx: Record<string, any>) => unknown) =>
      fn(prisma),
    ),
  };

  const redisClient = {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
  };

  const redisService = { getClient: () => redisClient };
  const otpService = {
    sendOtp: jest.fn().mockResolvedValue({ expiresIn: 300, otp: '123456' }),
    verifyOtp: jest.fn().mockResolvedValue(undefined),
  };
  const cartService = {
    clearCart: jest.fn(),
    addItem: jest.fn(),
    getCartForCheckout: jest.fn(),
  };
  const customerOrdersService = { placeOrder: jest.fn() };
  const notificationService = { createForCustomer: jest.fn() };
  const auditService = { log: jest.fn() };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'app.env') return 'test';
      if (key === 'FRONTEND_URL') return 'https://admin.bajriwala.test';
      return undefined;
    }),
  };

  const customersService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
  };
  const ordersService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    cancelOrder: jest.fn(),
    getTimeline: jest.fn(),
  };
  const membershipService = { renewMembership: jest.fn() };
  const loyaltyService = { findByCustomer: jest.fn() };
  const bulkService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateStatus: jest.fn(),
  };
  const emergencyService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
  };

  let service: CustomerExecutiveService;

  const executive = {
    id: 'exec-1',
    email: 'exec@bajriwala.in',
    role: 'CUSTOMER_EXECUTIVE',
    permissions: [],
  };

  const otherExecCustomer = {
    id: 'cust-other',
    phone: '+919876543210',
    assignedExecutiveId: 'exec-2',
    deletedAt: null,
  };

  const ownCustomer = {
    id: 'cust-own',
    phone: '+919811112222',
    assignedExecutiveId: 'exec-1',
    deletedAt: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CustomerExecutiveService(
      prisma as never,
      customersService as never,
      ordersService as never,
      membershipService as never,
      loyaltyService as never,
      bulkService as never,
      emergencyService as never,
      customerOrdersService as never,
      notificationService as never,
      otpService as never,
      cartService as never,
      auditService as never,
      redisService as never,
      configService as never,
      { creditWelcomeBonus: jest.fn() } as never,
      { ensureBenefit: jest.fn() } as never,
    );
  });

  it('denies CE access to customers outside assignment scope', async () => {
    prisma.customer.findFirst.mockResolvedValue(otherExecCustomer);
    await expect(
      service.findCustomer('cust-other', executive),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows CE access to assigned customers', async () => {
    prisma.customer.findFirst.mockResolvedValue(ownCustomer);
    customersService.findOne.mockResolvedValue({ id: 'cust-own', name: 'A' });
    const result = await service.findCustomer('cust-own', executive);
    expect(result).toEqual({ id: 'cust-own', name: 'A' });
  });

  it('lookup returns exists=false for unknown phone', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    const result = await service.lookupCustomer(
      { phone: '9811112222' },
      executive,
    );
    expect(result).toEqual({ exists: false });
  });

  it('lookup returns exists=true for known phone', async () => {
    prisma.customer.findFirst.mockResolvedValue({
      ...ownCustomer,
      fullName: 'Test',
      email: null,
      profile: null,
      role: null,
      addresses: [],
    });
    const result = await service.lookupCustomer(
      { phone: '9811112222' },
      executive,
    );
    expect(result.exists).toBe(true);
  });

  it('sendRegistrationOtp rejects when customer already exists', async () => {
    prisma.customer.findFirst.mockResolvedValue(ownCustomer);
    await expect(
      service.sendRegistrationOtp({ phone: '9811112222' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('verifyRegistrationOtp returns verification token', async () => {
    redisClient.setex.mockResolvedValue('OK');
    const result = await service.verifyRegistrationOtp({
      phone: '9811112222',
      otp: '123456',
    });
    expect(result.verified).toBe(true);
    expect(result.verificationToken).toHaveLength(48);
    expect(otpService.verifyOtp).toHaveBeenCalled();
  });

  it('registerCustomer rejects invalid verification token', async () => {
    redisClient.get.mockResolvedValue('different-token');
    await expect(
      service.registerCustomer(
        {
          phone: '9811112222',
          verificationToken: 'bad-token',
          fullName: 'New Customer',
          address: 'Site address line',
          pincode: '122001',
          city: 'Gurugram',
          state: 'Haryana',
        },
        executive,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
