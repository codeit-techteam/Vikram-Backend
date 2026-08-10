import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  EntityStatus,
  HubRole,
  OrderStatus,
  Prisma,
  VehicleType,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { HubDashboardService } from '../../hub/dashboard/hub-dashboard.service';
import { HubInventoryRepository } from '../../hub/repositories/hub-inventory.repository';
import { AuditService } from '../audit/audit.service';
import type {
  AdminHubOrdersQueryDto,
  AdminHubQueryDto,
  AssignHubManagerDto,
  CreateAdminHubDto,
  ProvisionHubDto,
  UpdateAdminHubDto,
  UpdateHubStatusDto,
} from './dto/admin-hubs.dto';
import {
  HubDisplayStatus,
  HubOperationalAction,
  HubOrderGroup,
  HubSortField,
} from './dto/admin-hubs.dto';

const ORDER_GROUP_MAP: Record<HubOrderGroup, OrderStatus[]> = {
  PENDING: [
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
    OrderStatus.HUB_ASSIGNED,
    OrderStatus.AWAITING_HUB_ALLOCATION,
  ],
  PROCESSING: [
    OrderStatus.PROCESSING,
    OrderStatus.PACKED,
    OrderStatus.READY_FOR_DISPATCH,
  ],
  DISPATCHED: [OrderStatus.DISPATCHED],
  DELIVERED: [OrderStatus.DELIVERED],
  CANCELLED: [OrderStatus.CANCELLED],
};

const PENDING_STATUSES: OrderStatus[] = [
  ...ORDER_GROUP_MAP.PENDING,
  ...ORDER_GROUP_MAP.PROCESSING,
  OrderStatus.DISPATCHED,
];

@Injectable()
export class AdminHubsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly dashboardService: HubDashboardService,
    private readonly inventoryRepo: HubInventoryRepository,
  ) {}

  async findAll(query: AdminHubQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.HubWhereInput = {
      deletedAt: null,
      AND: [
        // Hide consolidated duplicate hubs from Admin network views
        { NOT: { name: { contains: '(merged)', mode: 'insensitive' } } },
        // Sub-Hub Network excludes the central warehouse node
        { NOT: { hubType: 'CENTRAL_WAREHOUSE' } },
      ],
    };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
        { city: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }

    if (query.state) {
      where.state = { contains: query.state, mode: 'insensitive' };
    }

    if (query.status) {
      this.applyStatusFilter(where, query.status);
    }

    if (query.manager) {
      where.users = {
        some: {
          deletedAt: null,
          role: HubRole.HUB_MANAGER,
          isActive: true,
          OR: [
            { id: query.manager },
            { fullName: { contains: query.manager, mode: 'insensitive' } },
            { employeeId: { contains: query.manager, mode: 'insensitive' } },
            { email: { contains: query.manager, mode: 'insensitive' } },
          ],
        },
      };
    }

    const orderBy = this.buildOrderBy(query.sortBy, query.sortOrder);

    const [hubs, total] = await Promise.all([
      this.prisma.hub.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          users: {
            where: {
              deletedAt: null,
              role: HubRole.HUB_MANAGER,
              isActive: true,
            },
            take: 1,
            select: {
              id: true,
              fullName: true,
              employeeId: true,
              email: true,
              phone: true,
            },
          },
          _count: {
            select: {
              orders: { where: { deletedAt: null } },
              drivers: { where: { deletedAt: null, isActive: true } },
              vehicles: { where: { deletedAt: null, isActive: true } },
            },
          },
        },
      }),
      this.prisma.hub.count({ where }),
    ]);

    const hubIds = hubs.map((hub) => hub.id);
    const pendingCounts =
      hubIds.length === 0
        ? []
        : await this.prisma.order.groupBy({
            by: ['hubId'],
            where: {
              hubId: { in: hubIds },
              deletedAt: null,
              orderStatus: { in: PENDING_STATUSES },
            },
            _count: { _all: true },
          });

    const pendingByHub = new Map(
      pendingCounts.map((row) => [row.hubId, row._count._all]),
    );

    const metricsByHub = await this.getNetworkMetricsByHub(hubIds);

    return {
      data: hubs.map((hub) =>
        this.mapHubListItem(
          hub,
          pendingByHub.get(hub.id) ?? 0,
          metricsByHub.get(hub.id),
        ),
      ),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const hub = await this.getHubOrThrow(id);

    const hubScope = { hubId: id, deletedAt: null };

    const [
      manager,
      inventorySummary,
      pendingOrders,
      completedOrders,
      drivers,
      vehicles,
      performance,
    ] = await Promise.all([
      this.getActiveManager(id),
      this.getInventorySummary(id),
      this.prisma.order.count({
        where: { ...hubScope, orderStatus: { in: PENDING_STATUSES } },
      }),
      this.prisma.order.count({
        where: { ...hubScope, orderStatus: OrderStatus.DELIVERED },
      }),
      this.prisma.driver.findMany({
        where: { hubId: id, deletedAt: null },
        select: {
          id: true,
          name: true,
          phone: true,
          availability: true,
          isActive: true,
          vehicle: { select: { id: true, registration: true, vehicleType: true } },
        },
        orderBy: { name: 'asc' },
        take: 50,
      }),
      this.prisma.vehicle.findMany({
        where: { hubId: id, deletedAt: null },
        select: {
          id: true,
          registration: true,
          vehicleType: true,
          capacity: true,
          status: true,
          isActive: true,
        },
        orderBy: { registration: 'asc' },
        take: 50,
      }),
      this.getPerformance(id),
    ]);

    return {
      hub: this.mapHub(hub),
      manager,
      inventorySummary,
      pendingOrders,
      completedOrders,
      drivers,
      vehicles,
      performance,
    };
  }

  async create(dto: CreateAdminHubDto, adminId: string, adminEmail: string) {
    const code = (
      dto.code?.trim() ||
      (await this.generateHubCode(dto.city, dto.state, dto.name))
    ).toUpperCase();

    const existing = await this.prisma.hub.findFirst({
      where: { code, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(`Hub code "${code}" already exists`);
    }

    const created = await this.prisma.hub.create({
      data: {
        code,
        name: dto.name.trim(),
        addressLine1: dto.address.trim(),
        addressLine2: dto.addressLine2?.trim(),
        city: dto.city.trim(),
        state: dto.state.trim(),
        pincode: dto.pincode.trim(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        phone: dto.phone?.trim(),
        email: dto.email?.trim().toLowerCase(),
        capacity: dto.capacity,
        workingHours: dto.workingHours?.trim(),
        status: dto.status ?? EntityStatus.ACTIVE,
        isActive: dto.isActive ?? true,
      },
    });

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'CREATE',
      resource: 'Hub',
      resourceId: created.id,
      newValue: { code, name: dto.name, city: dto.city },
    });

    return this.mapHub(created);
  }

  private static readonly MAIN_WAREHOUSE = {
    id: 'wh-main-gurugram',
    code: 'Main Warehouse Gurugram',
  } as const;

  async provision(dto: ProvisionHubDto, adminId: string, adminEmail: string) {
    const code = (
      dto.code?.trim() ||
      (await this.generateHubCode(dto.city, dto.state, dto.name))
    ).toUpperCase();

    const existing = await this.prisma.hub.findFirst({
      where: { code, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(`Hub code "${code}" already exists`);
    }

    const employeeId = await this.resolveUniqueEmployeeId(
      dto.manager.employeeId?.trim() ||
        this.usernameFromFullName(dto.manager.fullName),
      code,
    );

    const managerEmail = await this.resolveUniqueManagerEmail(
      dto.manager.email.toLowerCase(),
      code,
    );

    if (dto.inventory?.length) {
      const productIds = dto.inventory
        .map((i) => i.productId)
        .filter((id): id is string => !!id);
      if (productIds.length) {
        const products = await this.prisma.product.findMany({
          where: { id: { in: productIds }, deletedAt: null },
          select: { id: true },
        });
        if (products.length !== productIds.length) {
          throw new BadRequestException('One or more inventory products were not found');
        }
      }
    }

    const resolvedInventory = await this.resolveProvisionInventory(dto.inventory ?? []);

    const plainPassword =
      dto.manager.password?.trim() || this.generateTempPassword(dto.manager.fullName);
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const coveragePincodes = Array.from(
      new Set([
        dto.pincode.trim(),
        ...(dto.coverage?.pincodes ?? []).map((p) => p.trim()).filter(Boolean),
      ]),
    );

    const warehouseId =
      dto.warehouseId?.trim() || AdminHubsService.MAIN_WAREHOUSE.id;
    const warehouseCode =
      dto.warehouseCode?.trim() || AdminHubsService.MAIN_WAREHOUSE.code;

    const result = await this.prisma.$transaction(async (tx) => {
      const hub = await tx.hub.create({
        data: {
          code,
          name: dto.name.trim(),
          addressLine1: dto.address.trim(),
          addressLine2: dto.addressLine2?.trim(),
          city: dto.city.trim(),
          state: dto.state.trim(),
          pincode: dto.pincode.trim(),
          latitude: dto.latitude,
          longitude: dto.longitude,
          phone: dto.phone?.trim() || dto.manager.phone?.trim(),
          email: dto.email?.trim().toLowerCase() || managerEmail,
          capacity: dto.capacity,
          workingHours: dto.workingHours?.trim(),
          hubType: dto.hubType?.trim(),
          warehouseId,
          warehouseCode,
          serviceRadiusKm: dto.coverage?.serviceRadiusKm ?? 15,
          coveragePincodes,
          coveragePolygon:
            dto.coverage?.polygon != null
              ? (dto.coverage.polygon as Prisma.InputJsonValue)
              : undefined,
          createdByAdminId: adminId,
          status: dto.status ?? EntityStatus.ACTIVE,
          isActive: dto.isActive ?? true,
        },
      });

      const manager = await tx.hubUser.create({
        data: {
          employeeId,
          email: managerEmail,
          phone: dto.manager.phone?.trim(),
          passwordHash,
          fullName: dto.manager.fullName.trim(),
          role: HubRole.HUB_MANAGER,
          hubId: hub.id,
          isActive: true,
        },
      });

      if (resolvedInventory.length) {
        for (const item of resolvedInventory) {
          await tx.hubInventory.create({
            data: {
              hubId: hub.id,
              productId: item.productId,
              variantId: item.variantId,
              availableQty: item.availableQty,
              reservedQty: 0,
              lowStockThreshold: item.lowStockThreshold ?? 10,
              minimumStock: item.minimumStock ?? 0,
              maximumStock: item.maximumStock,
            },
          });
        }
      }

      const vehicleByReg = new Map<string, string>();

      if (dto.vehicles?.length) {
        for (const vehicle of dto.vehicles) {
          const type = this.parseVehicleType(vehicle.vehicleType);
          const created = await tx.vehicle.create({
            data: {
              hubId: hub.id,
              registration: vehicle.registration.trim().toUpperCase(),
              capacity: vehicle.capacity ?? 0,
              vehicleType: type,
            },
          });
          vehicleByReg.set(created.registration, created.id);
        }
      }

      let driverCount = 0;
      if (dto.drivers?.length) {
        for (const driver of dto.drivers) {
          let vehicleId: string | undefined;
          const reg = driver.vehicleNumber?.trim().toUpperCase();
          if (reg) {
            vehicleId = vehicleByReg.get(reg);
            if (!vehicleId) {
              const type = this.parseVehicleType(driver.vehicleType);
              const created = await tx.vehicle.create({
                data: {
                  hubId: hub.id,
                  registration: reg,
                  capacity: 0,
                  vehicleType: type,
                },
              });
              vehicleId = created.id;
              vehicleByReg.set(reg, created.id);
            }
          }

          await tx.driver.create({
            data: {
              hubId: hub.id,
              name: driver.name.trim(),
              phone: driver.phone.trim(),
              vehicleId,
              availability: 'AVAILABLE',
            },
          });
          driverCount += 1;
        }
      }

      return { hub, manager, driverCount, vehicleCount: vehicleByReg.size };
    });

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'CREATE',
      resource: 'Hub',
      resourceId: result.hub.id,
      newValue: {
        code,
        name: dto.name,
        managerEmployeeId: employeeId,
        inventoryCount: resolvedInventory.length,
        provisioned: true,
        warehouseId,
      },
    });

    return {
      hub: this.mapHub(result.hub),
      manager: {
        id: result.manager.id,
        fullName: result.manager.fullName,
        employeeId: result.manager.employeeId,
        email: result.manager.email,
        phone: result.manager.phone,
        role: result.manager.role,
        temporaryPassword: plainPassword,
      },
      credentials: {
        username: employeeId,
        password: plainPassword,
      },
      inventoryCount: resolvedInventory.length,
      driverCount: result.driverCount,
      vehicleCount: result.vehicleCount,
    };
  }

  async addInventory(
    hubId: string,
    items: Array<{
      productId?: string;
      variantId?: string;
      sku?: string;
      productName?: string;
      availableQty: number;
      lowStockThreshold?: number;
      minimumStock?: number;
      maximumStock?: number;
    }>,
    adminId: string,
    adminEmail: string,
  ) {
    await this.getHubOrThrow(hubId);
    const resolved = await this.resolveProvisionInventory(items);
    if (!resolved.length) {
      throw new BadRequestException('No valid inventory items to add');
    }

    const created = [];
    for (const item of resolved) {
      const row = await this.prisma.hubInventory.upsert({
        where: {
          hubId_productId: { hubId, productId: item.productId },
        },
        create: {
          hubId,
          productId: item.productId,
          variantId: item.variantId,
          availableQty: item.availableQty,
          reservedQty: 0,
          lowStockThreshold: item.lowStockThreshold ?? 10,
          minimumStock: item.minimumStock ?? 0,
          maximumStock: item.maximumStock,
        },
        update: {
          ...(item.variantId !== undefined && { variantId: item.variantId }),
          availableQty: item.availableQty,
          lowStockThreshold: item.lowStockThreshold ?? 10,
          minimumStock: item.minimumStock ?? 0,
          maximumStock: item.maximumStock,
        },
      });
      created.push(row);
    }

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'UPDATE',
      resource: 'HubInventory',
      resourceId: hubId,
      newValue: { count: created.length },
    });

    return { count: created.length, items: created };
  }

  async createManagerForHub(
    hubId: string,
    dto: {
      fullName: string;
      employeeId?: string;
      email: string;
      phone?: string;
      password?: string;
    },
    adminId: string,
    adminEmail: string,
  ) {
    const hub = await this.getHubOrThrow(hubId);
    const employeeId = await this.resolveUniqueEmployeeId(
      dto.employeeId?.trim() || this.usernameFromFullName(dto.fullName),
      hub.code,
    );
    const email = await this.resolveUniqueManagerEmail(
      dto.email.toLowerCase(),
      hub.code,
    );
    const plainPassword =
      dto.password?.trim() || this.generateTempPassword(dto.fullName);
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    await this.prisma.hubUser.updateMany({
      where: {
        hubId,
        role: HubRole.HUB_MANAGER,
        deletedAt: null,
        isActive: true,
      },
      data: { isActive: false },
    });

    const manager = await this.prisma.hubUser.create({
      data: {
        employeeId,
        email,
        phone: dto.phone?.trim(),
        passwordHash,
        fullName: dto.fullName.trim(),
        role: HubRole.HUB_MANAGER,
        hubId,
        isActive: true,
      },
    });

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'CREATE',
      resource: 'HubManager',
      resourceId: manager.id,
      newValue: { hubId, employeeId },
    });

    return {
      manager: {
        id: manager.id,
        fullName: manager.fullName,
        employeeId: manager.employeeId,
        email: manager.email,
        phone: manager.phone,
        role: manager.role,
        hubId: manager.hubId,
      },
      credentials: {
        username: employeeId,
        password: plainPassword,
      },
    };
  }

  async addDrivers(
    hubId: string,
    drivers: Array<{
      name: string;
      phone: string;
      vehicleType?: string;
      vehicleNumber?: string;
    }>,
    adminId: string,
    adminEmail: string,
  ) {
    await this.getHubOrThrow(hubId);
    const created = [];

    for (const driver of drivers) {
      let vehicleId: string | undefined;
      const reg = driver.vehicleNumber?.trim().toUpperCase();
      if (reg) {
        const existing = await this.prisma.vehicle.findFirst({
          where: { hubId, registration: reg, deletedAt: null },
        });
        if (existing) {
          vehicleId = existing.id;
        } else {
          const vehicle = await this.prisma.vehicle.create({
            data: {
              hubId,
              registration: reg,
              capacity: 0,
              vehicleType: this.parseVehicleType(driver.vehicleType),
            },
          });
          vehicleId = vehicle.id;
        }
      }

      const row = await this.prisma.driver.create({
        data: {
          hubId,
          name: driver.name.trim(),
          phone: driver.phone.trim(),
          vehicleId,
          availability: 'AVAILABLE',
        },
      });
      created.push(row);
    }

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'CREATE',
      resource: 'Driver',
      resourceId: hubId,
      newValue: { count: created.length },
    });

    return { count: created.length, drivers: created };
  }

  async updateCoverage(
    hubId: string,
    dto: {
      latitude?: number;
      longitude?: number;
      serviceRadiusKm?: number;
      pincodes?: string[];
      polygon?: unknown;
    },
    adminId: string,
    adminEmail: string,
  ) {
    await this.getHubOrThrow(hubId);

    const updated = await this.prisma.hub.update({
      where: { id: hubId },
      data: {
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.serviceRadiusKm !== undefined && {
          serviceRadiusKm: dto.serviceRadiusKm,
        }),
        ...(dto.pincodes !== undefined && {
          coveragePincodes: dto.pincodes.map((p) => p.trim()).filter(Boolean),
        }),
        ...(dto.polygon !== undefined && {
          coveragePolygon: dto.polygon as Prisma.InputJsonValue,
        }),
      },
    });

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'UPDATE',
      resource: 'HubCoverage',
      resourceId: hubId,
      newValue: dto,
    });

    return {
      hubId: updated.id,
      latitude: Number(updated.latitude),
      longitude: Number(updated.longitude),
      radius: Number(updated.serviceRadiusKm),
      polygon: updated.coveragePolygon,
      coverageArea: updated.coveragePincodes,
    };
  }

  private async resolveProvisionInventory(
    items: Array<{
      productId?: string;
      variantId?: string;
      sku?: string;
      productName?: string;
      availableQty: number;
      lowStockThreshold?: number;
      minimumStock?: number;
      maximumStock?: number;
    }>,
  ) {
    const resolved: Array<{
      productId: string;
      variantId?: string;
      availableQty: number;
      lowStockThreshold?: number;
      minimumStock?: number;
      maximumStock?: number;
    }> = [];
    const seen = new Set<string>();

    for (const item of items) {
      let productId = item.productId;

      if (!productId && item.sku) {
        const bySku = await this.prisma.product.findFirst({
          where: { sku: item.sku, deletedAt: null },
          select: { id: true },
        });
        productId = bySku?.id;
      }

      if (!productId && item.productName) {
        const byName = await this.prisma.product.findFirst({
          where: {
            deletedAt: null,
            name: { contains: item.productName.trim(), mode: 'insensitive' },
          },
          select: { id: true },
        });
        productId = byName?.id;
      }

      if (!productId || seen.has(productId)) continue;
      seen.add(productId);
      resolved.push({
        productId,
        variantId: item.variantId,
        availableQty: item.availableQty,
        lowStockThreshold: item.lowStockThreshold,
        minimumStock: item.minimumStock,
        maximumStock: item.maximumStock,
      });
    }

    return resolved;
  }

  private usernameFromFullName(fullName: string): string {
    const parts = fullName
      .trim()
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return 'hub.manager';
    if (parts.length === 1) return parts[0];
    return `${parts[0]}.${parts[parts.length - 1]}`;
  }

  private async resolveUniqueEmployeeId(base: string, hubCode: string) {
    let candidate = base.toLowerCase().replace(/\s+/g, '.');
    const exists = await this.prisma.hubUser.findFirst({
      where: { employeeId: candidate, deletedAt: null },
    });
    if (!exists) return candidate;
    candidate = `${candidate}.${hubCode.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const stillExists = await this.prisma.hubUser.findFirst({
      where: { employeeId: candidate, deletedAt: null },
    });
    if (!stillExists) return candidate;
    return `${candidate}${Date.now().toString().slice(-4)}`;
  }

  private async resolveUniqueManagerEmail(email: string, hubCode: string) {
    const exists = await this.prisma.hubUser.findFirst({
      where: { email, deletedAt: null },
    });
    if (!exists) return email;
    const [local, domain] = email.split('@');
    if (!domain) return `${email}+${hubCode.toLowerCase()}`;
    return `${local}+${hubCode.toLowerCase().replace(/[^a-z0-9]/g, '')}@${domain}`;
  }

  private generateTempPassword(fullName?: string) {
    if (fullName) {
      const first = fullName.trim().split(/\s+/)[0] || 'Hub';
      const capitalized =
        first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
      return `${capitalized}@123`;
    }
    return `Hub@${Math.random().toString(36).slice(2, 8)}`;
  }

  private parseVehicleType(value?: string): VehicleType {
    const normalized = (value ?? 'TRUCK').toUpperCase();
    if (normalized === 'PICKUP') return VehicleType.TEMPO;
    if (Object.values(VehicleType).includes(normalized as VehicleType)) {
      return normalized as VehicleType;
    }
    return VehicleType.TRUCK;
  }

  async update(
    id: string,
    dto: UpdateAdminHubDto,
    adminId: string,
    adminEmail: string,
  ) {
    const hub = await this.getHubOrThrow(id);

    if (dto.code) {
      const code = dto.code.trim().toUpperCase();
      const duplicate = await this.prisma.hub.findFirst({
        where: { code, deletedAt: null, id: { not: id } },
      });
      if (duplicate) {
        throw new ConflictException(`Hub code "${code}" already exists`);
      }
    }

    const updated = await this.prisma.hub.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.code !== undefined && { code: dto.code.trim().toUpperCase() }),
        ...(dto.address !== undefined && { addressLine1: dto.address.trim() }),
        ...(dto.addressLine2 !== undefined && {
          addressLine2: dto.addressLine2?.trim() ?? null,
        }),
        ...(dto.city !== undefined && { city: dto.city.trim() }),
        ...(dto.state !== undefined && { state: dto.state.trim() }),
        ...(dto.pincode !== undefined && { pincode: dto.pincode.trim() }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.phone !== undefined && { phone: dto.phone?.trim() ?? null }),
        ...(dto.email !== undefined && {
          email: dto.email?.trim().toLowerCase() ?? null,
        }),
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
        ...(dto.workingHours !== undefined && {
          workingHours: dto.workingHours?.trim() ?? null,
        }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.serviceRadiusKm !== undefined && {
          serviceRadiusKm: dto.serviceRadiusKm,
        }),
        ...(dto.coveragePincodes !== undefined && {
          coveragePincodes: dto.coveragePincodes,
        }),
        ...(dto.coveragePolygon !== undefined && {
          coveragePolygon: dto.coveragePolygon as Prisma.InputJsonValue,
        }),
        ...(dto.warehouseId !== undefined && {
          warehouseId: dto.warehouseId?.trim() ?? null,
        }),
        ...(dto.warehouseCode !== undefined && {
          warehouseCode: dto.warehouseCode?.trim() ?? null,
        }),
      },
    });

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'UPDATE',
      resource: 'Hub',
      resourceId: id,
      oldValue: this.mapHub(hub),
      newValue: dto,
    });

    return this.mapHub(updated);
  }

  async updateStatus(
    id: string,
    dto: UpdateHubStatusDto,
    adminId: string,
    adminEmail: string,
  ) {
    const hub = await this.getHubOrThrow(id);
    const { isActive, status } = this.resolveOperationalAction(dto.action);

    const updated = await this.prisma.hub.update({
      where: { id },
      data: { isActive, status },
    });

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'UPDATE',
      resource: 'Hub',
      resourceId: id,
      oldValue: { isActive: hub.isActive, status: hub.status },
      newValue: { action: dto.action, isActive, status },
    });

    return {
      ...this.mapHub(updated),
      action: dto.action,
      operationalStatus: this.deriveOperationalStatus(updated.isActive, updated.status),
    };
  }

  async remove(id: string, adminId: string, adminEmail: string) {
    await this.getHubOrThrow(id);

    const [inventoryCount, orderCount, requisitionCount, dispatchCount] =
      await Promise.all([
        this.prisma.hubInventory.count({ where: { hubId: id } }),
        this.prisma.order.count({ where: { hubId: id, deletedAt: null } }),
        this.prisma.requisition.count({ where: { hubId: id } }),
        this.prisma.hubDispatch.count({ where: { hubId: id } }),
      ]);

    const hasOperationalHistory =
      inventoryCount > 0 ||
      orderCount > 0 ||
      requisitionCount > 0 ||
      dispatchCount > 0;

    // Never hard-delete hubs with history — deactivate / soft-delete only.
    const updated = await this.prisma.hub.update({
      where: { id },
      data: hasOperationalHistory
        ? {
            isActive: false,
            status: EntityStatus.INACTIVE,
          }
        : {
            deletedAt: new Date(),
            isActive: false,
            status: EntityStatus.INACTIVE,
          },
    });

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'UPDATE',
      resource: 'Hub',
      resourceId: id,
      newValue: {
        hasOperationalHistory,
        inventoryCount,
        orderCount,
        requisitionCount,
        dispatchCount,
        softDeleted: !hasOperationalHistory,
        deactivated: hasOperationalHistory,
      },
    });

    return {
      ...this.mapHub(updated),
      deactivatedOnly: hasOperationalHistory,
      message: hasOperationalHistory
        ? 'Hub has operational history and was deactivated instead of deleted'
        : 'Hub soft-deleted',
    };
  }

  async assignManager(
    id: string,
    dto: AssignHubManagerDto,
    adminId: string,
    adminEmail: string,
  ) {
    await this.getHubOrThrow(id);

    const manager = await this.prisma.hubUser.findFirst({
      where: {
        id: dto.managerId,
        deletedAt: null,
        role: HubRole.HUB_MANAGER,
      },
    });
    if (!manager) {
      throw new NotFoundException('Hub manager not found');
    }

    const previousHubId = manager.hubId;

    await this.prisma.$transaction(async (tx) => {
      await tx.hubUser.updateMany({
        where: {
          hubId: id,
          role: HubRole.HUB_MANAGER,
          isActive: true,
          deletedAt: null,
          id: { not: dto.managerId },
        },
        data: { isActive: false },
      });

      await tx.hubRefreshToken.updateMany({
        where: {
          hubUser: {
            hubId: id,
            role: HubRole.HUB_MANAGER,
            id: { not: dto.managerId },
          },
          isRevoked: false,
        },
        data: { isRevoked: true },
      });

      await tx.hubUser.update({
        where: { id: dto.managerId },
        data: { hubId: id, isActive: true },
      });
    });

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'ASSIGN',
      resource: 'Hub',
      resourceId: id,
      newValue: {
        managerId: dto.managerId,
        previousHubId,
        managerName: manager.fullName,
      },
    });

    return this.getActiveManager(id);
  }

  async getInventorySummary(hubId: string) {
    await this.getHubOrThrow(hubId);

    const rows = await this.prisma.hubInventory.findMany({
      where: { hubId },
      include: this.inventoryRepo.inventoryInclude(),
    });

    let totalProducts = 0;
    let lowStock = 0;
    let outOfStock = 0;
    let stockValue = 0;
    let totalStock = 0;
    let totalReserved = 0;
    let totalFree = 0;
    const items = [];

    for (const row of rows) {
      const mapped = this.inventoryRepo.mapInventoryRow(row);
      const onHand = mapped.currentStock;
      const reserved = mapped.reservedStock;
      const free = mapped.availableStock;
      totalProducts += 1;
      totalStock += onHand;
      totalReserved += reserved;
      totalFree += free;

      if (free <= 0) {
        outOfStock += 1;
      } else if (mapped.lowStock) {
        lowStock += 1;
      }

      const price = Number(row.product.retailPrice ?? 0);
      stockValue += onHand * price;
      items.push({
        ...mapped,
        availableQty: onHand,
        reservedQty: reserved,
        freeQty: free,
        reorderLevel: mapped.lowStockThreshold,
        unit: row.product.unit,
        category: row.product.category?.name ?? null,
        imageUrl: mapped.imageUrl,
        status:
          free <= 0
            ? 'OUT_OF_STOCK'
            : mapped.lowStock
              ? 'LOW_STOCK'
              : 'IN_STOCK',
      });
    }

    const inventoryHealth =
      totalProducts === 0
        ? 100
        : Math.round(
            ((totalProducts - outOfStock - lowStock * 0.5) / totalProducts) *
              100,
          );

    return {
      totalProducts,
      totalStock,
      totalReserved,
      totalFree,
      stockValue: Math.round(stockValue * 100) / 100,
      lowStock,
      outOfStock,
      inventoryHealth,
      items,
    };
  }

  async getSummary(hubId: string) {
    const hub = await this.getHubOrThrow(hubId);
    const metrics = (await this.getNetworkMetricsByHub([hubId])).get(hubId);
    const manager = await this.getActiveManager(hubId);
    const inventorySummary = await this.getInventorySummary(hubId);

    const pendingOrders = await this.prisma.order.count({
      where: {
        hubId,
        deletedAt: null,
        orderStatus: { in: PENDING_STATUSES },
      },
    });

    const healthStatus = this.deriveDisplayHealth(
      hub.isActive,
      hub.status,
      inventorySummary.inventoryHealth,
      inventorySummary.outOfStock,
      inventorySummary.lowStock,
    );

    return {
      hub: this.mapHub(hub),
      manager,
      inventoryHealth: inventorySummary.inventoryHealth,
      healthStatus,
      totalStock: inventorySummary.totalStock,
      totalReserved: inventorySummary.totalReserved,
      totalFree: inventorySummary.totalFree,
      stockValue: inventorySummary.stockValue,
      pendingOrders,
      requisitions: metrics?.pendingRequisitions ?? 0,
      incomingTransfers: metrics?.incomingTransfers ?? 0,
      outgoingTransfers: metrics?.outgoingTransfers ?? 0,
      activeDrivers: metrics?.activeDrivers ?? 0,
      inventorySummary,
    };
  }

  async listInventory(
    hubId: string,
    query: { page?: number; limit?: number; search?: string; category?: string },
  ) {
    return this.listNetworkInventory({ ...query, hubId });
  }

  async listNetworkInventory(query: {
    hubId?: string;
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
  }) {
    if (query.hubId) {
      await this.getHubOrThrow(query.hubId);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Prisma.HubInventoryWhereInput = {
      ...(query.hubId ? { hubId: query.hubId } : {}),
      hub: {
        deletedAt: null,
        NOT: { hubType: 'CENTRAL_WAREHOUSE' },
      },
      ...(query.search
        ? {
            OR: [
              {
                product: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                product: {
                  sku: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
      ...(query.category && query.category !== 'all'
        ? {
            product: {
              category: {
                name: { equals: query.category, mode: 'insensitive' },
              },
            },
          }
        : {}),
    };

    const [rows, total, aggregateRows] = await Promise.all([
      this.prisma.hubInventory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          ...this.inventoryRepo.inventoryInclude(),
          hub: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.hubInventory.count({ where }),
      this.prisma.hubInventory.findMany({
        where,
        select: {
          availableQty: true,
          reservedQty: true,
          lowStockThreshold: true,
          minimumStock: true,
          product: { select: { retailPrice: true } },
        },
      }),
    ]);

    const items = rows.map((row) => {
      const mapped = this.inventoryRepo.mapInventoryRow(row);
      const onHand = mapped.currentStock;
      const reserved = mapped.reservedStock;
      const free = mapped.availableStock;
      const unitPrice = Number(row.product.retailPrice ?? 0);
      return {
        id: mapped.id,
        hubId: row.hubId,
        hubName: row.hub.name,
        hubCode: row.hub.code,
        productId: mapped.productId,
        productName: row.product.name,
        sku: row.product.sku,
        category: row.product.category?.name ?? null,
        unit: row.product.unit,
        imageUrl: mapped.imageUrl,
        availableQty: onHand,
        reservedQty: reserved,
        freeQty: free,
        unitPrice,
        inventoryValue: Math.round(onHand * unitPrice * 100) / 100,
        reorderLevel: mapped.lowStockThreshold,
        minimumStock: row.minimumStock,
        maximumStock: row.maximumStock,
        status:
          free <= 0
            ? 'OUT_OF_STOCK'
            : mapped.lowStock
              ? 'LOW_STOCK'
              : 'IN_STOCK',
        lastUpdated: mapped.lastUpdated,
      };
    });

    let totalInventoryUnits = 0;
    let reservedInventory = 0;
    let lowStockItems = 0;
    let inventoryValue = 0;
    for (const row of aggregateRows) {
      const onHand = Number(row.availableQty ?? 0) + Number(row.reservedQty ?? 0);
      const reserved = Number(row.reservedQty ?? 0);
      const free = Number(row.availableQty ?? 0);
      const reorder = Number(row.lowStockThreshold ?? row.minimumStock ?? 0);
      const unitPrice = Number(row.product.retailPrice ?? 0);
      totalInventoryUnits += onHand;
      reservedInventory += reserved;
      inventoryValue += onHand * unitPrice;
      if (free <= reorder) lowStockItems += 1;
    }

    const stats = {
      totalInventoryUnits,
      reservedInventory,
      lowStockItems,
      inventoryValue: Math.round(inventoryValue * 100) / 100,
    };

    return {
      data: items,
      stats,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async listDispatchLogs(
    hubId: string,
    query: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      date?: string;
    },
  ) {
    return this.listNetworkDispatchLogs({ ...query, hubId });
  }

  async listNetworkDispatchLogs(query: {
    hubId?: string;
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    date?: string;
  }) {
    if (query.hubId) {
      await this.getHubOrThrow(query.hubId);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const orderWhere: Prisma.OrderWhereInput = {
      ...(query.hubId ? { hubId: query.hubId } : { hubId: { not: null } }),
      deletedAt: null,
      orderStatus: {
        in: [
          OrderStatus.PACKED,
          OrderStatus.READY_FOR_DISPATCH,
          OrderStatus.DRIVER_ASSIGNED,
          OrderStatus.OUT_FOR_DELIVERY,
          OrderStatus.DISPATCHED,
          OrderStatus.DELIVERED,
        ],
      },
      hub: {
        deletedAt: null,
        NOT: { hubType: 'CENTRAL_WAREHOUSE' },
      },
    };

    if (query.search) {
      orderWhere.OR = [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        {
          customer: {
            fullName: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          customer: {
            phone: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          dispatch: {
            dispatchNo: { contains: query.search, mode: 'insensitive' },
          },
        },
      ];
    }

    if (query.date) {
      const dayStart = new Date(query.date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      orderWhere.createdAt = { gte: dayStart, lt: dayEnd };
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: orderWhere,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          customer: {
            select: { id: true, fullName: true, phone: true },
          },
          hub: { select: { id: true, name: true, code: true } },
          assignedDriver: {
            select: { id: true, name: true, phone: true },
          },
          assignedVehicle: {
            select: { id: true, registration: true, vehicleType: true },
          },
          dispatch: {
            include: {
              driver: { select: { id: true, name: true, phone: true } },
              vehicle: {
                select: { id: true, registration: true, vehicleType: true },
              },
            },
          },
          items: {
            select: {
              productId: true,
              name: true,
              sku: true,
              quantity: true,
              unit: true,
            },
          },
        },
      }),
      this.prisma.order.count({ where: orderWhere }),
    ]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const hubScope = query.hubId
      ? { hubId: query.hubId }
      : { hubId: { not: null } };

    const [todaysDispatch, inProgress, delivered, delayed] = await Promise.all([
      this.prisma.order.count({
        where: {
          ...hubScope,
          deletedAt: null,
          OR: [
            { dispatchedAt: { gte: todayStart } },
            { dispatch: { dispatchedAt: { gte: todayStart } } },
          ],
        },
      }),
      this.prisma.order.count({
        where: {
          ...hubScope,
          deletedAt: null,
          orderStatus: {
            in: [
              OrderStatus.DRIVER_ASSIGNED,
              OrderStatus.OUT_FOR_DELIVERY,
              OrderStatus.DISPATCHED,
            ],
          },
        },
      }),
      this.prisma.order.count({
        where: {
          ...hubScope,
          deletedAt: null,
          orderStatus: OrderStatus.DELIVERED,
          deliveredAt: { gte: todayStart },
        },
      }),
      this.prisma.order.count({
        where: {
          ...hubScope,
          deletedAt: null,
          orderStatus: {
            in: [
              OrderStatus.DRIVER_ASSIGNED,
              OrderStatus.OUT_FOR_DELIVERY,
              OrderStatus.DISPATCHED,
            ],
          },
          expectedDeliveryAt: { lt: new Date() },
        },
      }),
    ]);

    const data = orders
      .filter((order) => {
        if (!query.status || query.status === 'all') return true;
        const mapped = this.mapOrderToDispatchStatus(order.orderStatus);
        const status = query.status.toUpperCase();
        if (status === 'PENDING-DISPATCH' || status === 'READY') {
          return (
            mapped === 'READY_FOR_DISPATCH' ||
            order.orderStatus === OrderStatus.PACKED ||
            order.orderStatus === OrderStatus.READY_FOR_DISPATCH
          );
        }
        if (status === 'ASSIGNED') {
          return (
            mapped === 'ASSIGNED' ||
            order.orderStatus === OrderStatus.DRIVER_ASSIGNED
          );
        }
        return mapped === status || order.orderStatus === status;
      })
      .map((order) => this.mapDispatchLog(order));

    return {
      data,
      stats: {
        todaysDispatch,
        inProgress,
        delivered,
        delayed,
      },
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getOrders(hubId: string, query: AdminHubOrdersQueryDto) {
    await this.getHubOrThrow(hubId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      hubId,
      deletedAt: null,
    };

    if (query.statusGroup) {
      where.orderStatus = { in: ORDER_GROUP_MAP[query.statusGroup] };
    }

    const [orders, total, statusCounts] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          grandTotal: true,
          paymentStatus: true,
          createdAt: true,
          dispatchedAt: true,
          deliveredAt: true,
          customer: {
            select: { id: true, fullName: true, phone: true },
          },
        },
      }),
      this.prisma.order.count({ where }),
      this.getOrderStatusCounts(hubId),
    ]);

    return {
      orders,
      statusCounts,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getPerformance(hubId: string) {
    await this.getHubOrThrow(hubId);

    const dashboard = await this.dashboardService.getDashboard(hubId);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const hubScope = { hubId, deletedAt: null };

    const [monthlyOrders, monthlyRevenue, dispatchMetrics] = await Promise.all([
      this.prisma.order.count({
        where: { ...hubScope, createdAt: { gte: monthStart } },
      }),
      this.prisma.order.aggregate({
        where: {
          ...hubScope,
          orderStatus: OrderStatus.DELIVERED,
          deliveredAt: { gte: monthStart },
        },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.findMany({
        where: {
          ...hubScope,
          orderStatus: OrderStatus.DELIVERED,
          dispatchedAt: { not: null },
          deliveredAt: { not: null },
          createdAt: { gte: monthStart },
        },
        select: { dispatchedAt: true, deliveredAt: true },
        take: 200,
        orderBy: { deliveredAt: 'desc' },
      }),
    ]);

    let avgDispatchTimeHours = 0;
    if (dispatchMetrics.length > 0) {
      const totalHours = dispatchMetrics.reduce((sum, order) => {
        const dispatched = order.dispatchedAt!.getTime();
        const delivered = order.deliveredAt!.getTime();
        return sum + (delivered - dispatched) / (1000 * 60 * 60);
      }, 0);
      avgDispatchTimeHours =
        Math.round((totalHours / dispatchMetrics.length) * 10) / 10;
    }

    const totalInRange = dashboard.todaysOrders || 1;
    const fulfillmentPercent = Math.round(
      (dashboard.ordersDelivered / totalInRange) * 100,
    );

    return {
      todaysOrders: dashboard.todaysOrders,
      monthlyOrders,
      revenue: {
        today: dashboard.todaysRevenue,
        monthly: monthlyRevenue._sum.grandTotal ?? 0,
      },
      dispatchTime: avgDispatchTimeHours,
      fulfillmentPercent,
      hubPerformance: dashboard.hubPerformance,
    };
  }

  private async getOrderStatusCounts(hubId: string) {
    const hubScope = { hubId, deletedAt: null };
    const groups = Object.entries(ORDER_GROUP_MAP) as [HubOrderGroup, OrderStatus[]][];

    const counts = await Promise.all(
      groups.map(async ([group, statuses]) => ({
        group,
        count: await this.prisma.order.count({
          where: { ...hubScope, orderStatus: { in: statuses } },
        }),
      })),
    );

    return Object.fromEntries(counts.map(({ group, count }) => [group, count]));
  }

  private async getActiveManager(hubId: string) {
    const manager = await this.prisma.hubUser.findFirst({
      where: {
        hubId,
        deletedAt: null,
        role: HubRole.HUB_MANAGER,
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        employeeId: true,
        email: true,
        phone: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!manager) return null;

    return {
      id: manager.id,
      name: manager.fullName,
      fullName: manager.fullName,
      employeeId: manager.employeeId,
      email: manager.email,
      phone: manager.phone,
      lastLoginAt: manager.lastLoginAt,
      assignedAt: manager.createdAt,
    };
  }

  private async getHubOrThrow(id: string) {
    const hub = await this.prisma.hub.findFirst({
      where: { id, deletedAt: null },
    });
    if (!hub) throw new NotFoundException('Hub not found');
    return hub;
  }

  private applyStatusFilter(where: Prisma.HubWhereInput, status: string) {
    const normalized = status.toUpperCase();

    if (normalized === HubDisplayStatus.ENABLED) {
      where.isActive = true;
      where.status = EntityStatus.ACTIVE;
      return;
    }
    if (normalized === HubDisplayStatus.DISABLED) {
      where.isActive = false;
      where.status = EntityStatus.INACTIVE;
      return;
    }
    if (normalized === HubDisplayStatus.SUSPENDED) {
      where.isActive = false;
      where.status = EntityStatus.DRAFT;
      return;
    }

    if (Object.values(EntityStatus).includes(normalized as EntityStatus)) {
      where.status = normalized as EntityStatus;
    }
  }

  private resolveOperationalAction(action: HubOperationalAction): {
    isActive: boolean;
    status: EntityStatus;
  } {
    switch (action) {
      case HubOperationalAction.ENABLE:
        return { isActive: true, status: EntityStatus.ACTIVE };
      case HubOperationalAction.DISABLE:
        return { isActive: false, status: EntityStatus.INACTIVE };
      case HubOperationalAction.SUSPEND:
        return { isActive: false, status: EntityStatus.DRAFT };
      default:
        throw new BadRequestException('Invalid hub status action');
    }
  }

  private deriveOperationalStatus(
    isActive: boolean,
    status: EntityStatus,
  ): HubDisplayStatus {
    if (isActive && status === EntityStatus.ACTIVE) {
      return HubDisplayStatus.ENABLED;
    }
    if (!isActive && status === EntityStatus.DRAFT) {
      return HubDisplayStatus.SUSPENDED;
    }
    return HubDisplayStatus.DISABLED;
  }

  private buildOrderBy(
    sortBy?: HubSortField,
    sortOrder?: 'asc' | 'desc',
  ): Prisma.HubOrderByWithRelationInput[] {
    const order = sortOrder ?? 'desc';
    const field = sortBy ?? HubSortField.CREATED_AT;

    const allowed = new Set(Object.values(HubSortField));
    const primary: Prisma.HubOrderByWithRelationInput = allowed.has(field)
      ? { [field]: order }
      : { createdAt: order };

    // Active operational hubs first so Admin opens the live hub by default
    return [{ isActive: 'desc' }, primary];
  }

  private mapHub(hub: {
    id: string;
    code: string;
    name: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    pincode: string;
    latitude: Prisma.Decimal;
    longitude: Prisma.Decimal;
    phone: string | null;
    email: string | null;
    capacity: number | null;
    workingHours: string | null;
    hubType?: string | null;
    warehouseId?: string | null;
    warehouseCode?: string | null;
    serviceRadiusKm?: Prisma.Decimal | number | null;
    coveragePincodes?: string[] | null;
    coveragePolygon?: Prisma.JsonValue | null;
    createdByAdminId?: string | null;
    isActive: boolean;
    status: EntityStatus;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
  }) {
    return {
      id: hub.id,
      code: hub.code,
      name: hub.name,
      address: hub.addressLine1,
      addressLine1: hub.addressLine1,
      addressLine2: hub.addressLine2,
      city: hub.city,
      state: hub.state,
      pincode: hub.pincode,
      latitude: Number(hub.latitude),
      longitude: Number(hub.longitude),
      phone: hub.phone,
      email: hub.email,
      capacity: hub.capacity,
      workingHours: hub.workingHours,
      hubType: hub.hubType ?? null,
      warehouseId: hub.warehouseId ?? null,
      warehouseCode: hub.warehouseCode ?? null,
      serviceRadiusKm:
        hub.serviceRadiusKm != null ? Number(hub.serviceRadiusKm) : 15,
      coveragePincodes: hub.coveragePincodes ?? [],
      coveragePolygon: hub.coveragePolygon ?? null,
      createdByAdminId: hub.createdByAdminId ?? null,
      isActive: hub.isActive,
      status: hub.status,
      operationalStatus: this.deriveOperationalStatus(hub.isActive, hub.status),
      createdAt: hub.createdAt,
      updatedAt: hub.updatedAt,
      deletedAt: hub.deletedAt ?? null,
    };
  }

  private mapHubListItem(
    hub: {
      id: string;
      code: string;
      name: string;
      addressLine1: string;
      city: string;
      state: string;
      pincode: string;
      phone: string | null;
      email: string | null;
      capacity: number | null;
      isActive: boolean;
      status: EntityStatus;
      createdAt: Date;
      updatedAt?: Date;
      users: {
        id: string;
        fullName: string;
        employeeId: string;
        email: string | null;
        phone: string | null;
      }[];
      _count: { orders: number; drivers: number; vehicles: number };
    },
    pendingOrders = 0,
    metrics?: {
      inventoryHealth: number;
      totalStock: number;
      stockValue: number;
      pendingRequisitions: number;
      incomingTransfers: number;
      outgoingTransfers: number;
      activeDrivers: number;
      healthStatus: 'HEALTHY' | 'ATTENTION' | 'CRITICAL';
    },
  ) {
    const manager = hub.users[0] ?? null;
    const inventoryHealth = metrics?.inventoryHealth ?? 100;
    const healthStatus =
      metrics?.healthStatus ??
      this.deriveDisplayHealth(
        hub.isActive,
        hub.status,
        inventoryHealth,
        0,
        0,
      );

    return {
      id: hub.id,
      code: hub.code,
      name: hub.name,
      address: hub.addressLine1,
      city: hub.city,
      state: hub.state,
      pincode: hub.pincode,
      phone: hub.phone,
      email: hub.email,
      capacity: hub.capacity,
      isActive: hub.isActive,
      status: hub.status,
      operationalStatus: this.deriveOperationalStatus(hub.isActive, hub.status),
      healthStatus,
      inventoryHealth,
      totalStock: metrics?.totalStock ?? 0,
      stockValue: metrics?.stockValue ?? 0,
      pendingRequisitions: metrics?.pendingRequisitions ?? 0,
      incomingTransfers: metrics?.incomingTransfers ?? 0,
      outgoingTransfers: metrics?.outgoingTransfers ?? 0,
      activeDrivers: metrics?.activeDrivers ?? hub._count.drivers,
      manager: manager
        ? {
            id: manager.id,
            name: manager.fullName,
            fullName: manager.fullName,
            employeeId: manager.employeeId,
            email: manager.email,
            phone: manager.phone,
          }
        : null,
      orderCount: hub._count.orders,
      pendingOrders,
      driverCount: hub._count.drivers,
      vehicleCount: hub._count.vehicles,
      createdAt: hub.createdAt,
      updatedAt: hub.updatedAt ?? hub.createdAt,
    };
  }

  private async getNetworkMetricsByHub(hubIds: string[]) {
    const result = new Map<
      string,
      {
        inventoryHealth: number;
        totalStock: number;
        stockValue: number;
        pendingRequisitions: number;
        incomingTransfers: number;
        outgoingTransfers: number;
        activeDrivers: number;
        healthStatus: 'HEALTHY' | 'ATTENTION' | 'CRITICAL';
      }
    >();

    if (hubIds.length === 0) return result;

    const [
      inventoryRows,
      pendingRequisitions,
      incomingTransfers,
      outgoingDispatches,
      activeDrivers,
      hubs,
    ] = await Promise.all([
      this.prisma.hubInventory.findMany({
        where: { hubId: { in: hubIds } },
        select: {
          hubId: true,
          availableQty: true,
          reservedQty: true,
          lowStockThreshold: true,
          product: { select: { retailPrice: true } },
        },
      }),
      this.prisma.requisition.groupBy({
        by: ['hubId'],
        where: {
          hubId: { in: hubIds },
          status: {
            in: [
              'DRAFT',
              'SUBMITTED',
              'PENDING_APPROVAL',
              'APPROVED',
              'ALLOCATED',
            ],
          },
        },
        _count: { _all: true },
      }),
      this.prisma.requisition.groupBy({
        by: ['hubId'],
        where: {
          hubId: { in: hubIds },
          status: { in: ['DISPATCHED', 'IN_TRANSIT'] },
        },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['hubId'],
        where: {
          hubId: { in: hubIds },
          deletedAt: null,
          orderStatus: {
            in: [
              OrderStatus.DRIVER_ASSIGNED,
              OrderStatus.OUT_FOR_DELIVERY,
              OrderStatus.DISPATCHED,
            ],
          },
        },
        _count: { _all: true },
      }),
      this.prisma.driver.groupBy({
        by: ['hubId'],
        where: {
          hubId: { in: hubIds },
          deletedAt: null,
          isActive: true,
        },
        _count: { _all: true },
      }),
      this.prisma.hub.findMany({
        where: { id: { in: hubIds } },
        select: { id: true, isActive: true, status: true },
      }),
    ]);

    const invByHub = new Map<
      string,
      { total: number; low: number; oos: number; stock: number; value: number }
    >();
    for (const row of inventoryRows) {
      const current = invByHub.get(row.hubId) ?? {
        total: 0,
        low: 0,
        oos: 0,
        stock: 0,
        value: 0,
      };
      const free = row.availableQty;
      const onHand = row.availableQty + row.reservedQty;
      current.total += 1;
      current.stock += onHand;
      current.value += onHand * Number(row.product.retailPrice ?? 0);
      if (free <= 0) current.oos += 1;
      else if (free <= row.lowStockThreshold) current.low += 1;
      invByHub.set(row.hubId, current);
    }

    const pendingReq = new Map(
      pendingRequisitions.map((r) => [r.hubId, r._count._all]),
    );
    const incoming = new Map(
      incomingTransfers.map((r) => [r.hubId, r._count._all]),
    );
    const outgoing = new Map(
      outgoingDispatches
        .filter((r): r is typeof r & { hubId: string } => !!r.hubId)
        .map((r) => [r.hubId, r._count._all]),
    );
    const drivers = new Map(
      activeDrivers
        .filter((r): r is typeof r & { hubId: string } => !!r.hubId)
        .map((r) => [r.hubId, r._count._all]),
    );
    const hubMeta = new Map(hubs.map((h) => [h.id, h]));

    for (const hubId of hubIds) {
      const inv = invByHub.get(hubId) ?? {
        total: 0,
        low: 0,
        oos: 0,
        stock: 0,
        value: 0,
      };
      const inventoryHealth =
        inv.total === 0
          ? 100
          : Math.round(((inv.total - inv.oos - inv.low * 0.5) / inv.total) * 100);
      const hub = hubMeta.get(hubId);
      result.set(hubId, {
        inventoryHealth,
        totalStock: inv.stock,
        stockValue: Math.round(inv.value * 100) / 100,
        pendingRequisitions: pendingReq.get(hubId) ?? 0,
        incomingTransfers: incoming.get(hubId) ?? 0,
        outgoingTransfers: outgoing.get(hubId) ?? 0,
        activeDrivers: drivers.get(hubId) ?? 0,
        healthStatus: this.deriveDisplayHealth(
          hub?.isActive ?? true,
          hub?.status ?? EntityStatus.ACTIVE,
          inventoryHealth,
          inv.oos,
          inv.low,
        ),
      });
    }

    return result;
  }

  private deriveDisplayHealth(
    isActive: boolean,
    status: EntityStatus,
    inventoryHealth: number,
    outOfStock: number,
    lowStock: number,
  ): 'HEALTHY' | 'ATTENTION' | 'CRITICAL' {
    if (!isActive || status === EntityStatus.INACTIVE) {
      return 'CRITICAL';
    }
    if (outOfStock > 0 || inventoryHealth < 50) return 'CRITICAL';
    if (lowStock > 0 || inventoryHealth < 80) return 'ATTENTION';
    return 'HEALTHY';
  }

  private async generateHubCode(city: string, state: string, name: string) {
    const source = (city || name || state || 'HUB').trim();
    const letters = source.replace(/[^a-zA-Z]/g, '').toUpperCase();
    const cityCode =
      letters.length >= 3 ? letters.slice(0, 3) : (letters || 'HUB').padEnd(3, 'X');
    const prefix = `HUB-${cityCode}-`;

    const existing = await this.prisma.hub.findMany({
      where: { code: { startsWith: prefix } },
      select: { code: true },
    });
    const used = new Set(
      existing.map((row) => Number(row.code.replace(prefix, '')) || 0),
    );
    let seq = 1;
    while (used.has(seq)) seq += 1;
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }

  private mapOrderToDispatchStatus(status: OrderStatus): string {
    switch (status) {
      case OrderStatus.PACKED:
      case OrderStatus.READY_FOR_DISPATCH:
        return 'READY_FOR_DISPATCH';
      case OrderStatus.DRIVER_ASSIGNED:
        return 'ASSIGNED';
      case OrderStatus.OUT_FOR_DELIVERY:
      case OrderStatus.DISPATCHED:
        return 'DISPATCHED';
      case OrderStatus.DELIVERED:
        return 'DELIVERED';
      default:
        return status;
    }
  }

  private formatDeliveryAddress(deliveryAddress: unknown): string {
    if (!deliveryAddress || typeof deliveryAddress !== 'object') return '—';
    const addr = deliveryAddress as Record<string, unknown>;
    const parts = [
      addr.line1,
      addr.line2,
      addr.addressLine1,
      addr.address,
      addr.landmark,
      addr.city,
      addr.pincode,
    ]
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
    return parts.length ? Array.from(new Set(parts)).join(', ') : '—';
  }

  private mapDispatchLog(order: {
    id: string;
    orderNumber: string;
    orderStatus: OrderStatus;
    grandTotal: unknown;
    deliveryAddress: unknown;
    expectedDeliveryAt: Date | null;
    dispatchedAt: Date | null;
    deliveredAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    customer: { id: string; fullName: string | null; phone: string | null } | null;
    hub: { id: string; name: string; code: string } | null;
    assignedDriver: { id: string; name: string; phone: string } | null;
    assignedVehicle: {
      id: string;
      registration: string;
      vehicleType: unknown;
    } | null;
    dispatch: {
      id: string;
      dispatchNo: string;
      status: string;
      dispatchedAt: Date | null;
      estimatedEtaAt: Date | null;
      driver: { id: string; name: string; phone: string } | null;
      vehicle: {
        id: string;
        registration: string;
        vehicleType: unknown;
      } | null;
    } | null;
    items: Array<{
      productId: string;
      name: string;
      sku: string | null;
      quantity: number;
      unit: string;
    }>;
  }) {
    const status = this.mapOrderToDispatchStatus(order.orderStatus);
    const driver = order.dispatch?.driver ?? order.assignedDriver;
    const vehicle = order.dispatch?.vehicle ?? order.assignedVehicle;
    const expected =
      order.dispatch?.estimatedEtaAt?.toISOString() ??
      order.expectedDeliveryAt?.toISOString() ??
      order.createdAt.toISOString();
    const dispatchTime =
      order.dispatch?.dispatchedAt?.toISOString() ??
      order.dispatchedAt?.toISOString() ??
      null;
    const isDelayed =
      status !== 'DELIVERED' &&
      !!order.expectedDeliveryAt &&
      order.expectedDeliveryAt.getTime() < Date.now();

    const pincode =
      order.deliveryAddress &&
      typeof order.deliveryAddress === 'object' &&
      'pincode' in order.deliveryAddress
        ? String(
            (order.deliveryAddress as { pincode?: string }).pincode ?? '',
          )
        : '';

    return {
      id: order.dispatch?.id ?? order.id,
      dispatchId: order.dispatch?.dispatchNo ?? `DSP-${order.orderNumber}`,
      orderId: order.orderNumber,
      orderUuid: order.id,
      customerId: order.customer?.id ?? '',
      customerName: order.customer?.fullName ?? 'Customer',
      customerMobile: order.customer?.phone ?? '',
      deliveryAddress: this.formatDeliveryAddress(order.deliveryAddress),
      pincode,
      hubId: order.hub?.id ?? '',
      hubName: order.hub?.name ?? '',
      vehicleId: vehicle?.id ?? null,
      vehicleNumber: vehicle?.registration ?? null,
      vehicleType: vehicle ? String(vehicle.vehicleType) : null,
      driverId: driver?.id ?? null,
      driverName: driver?.name ?? null,
      driverMobile: driver?.phone ?? null,
      dispatchTime,
      expectedDelivery: expected,
      status,
      isDelayed,
      lastUpdated: order.updatedAt.toISOString(),
      deliveryNotes: '',
      orderLines: order.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        sku: item.sku ?? '',
        quantity: item.quantity,
        unit: item.unit,
      })),
      orderValue: Number(order.grandTotal ?? 0),
      timeline: [],
      createdAt: order.createdAt.toISOString(),
    };
  }
}
