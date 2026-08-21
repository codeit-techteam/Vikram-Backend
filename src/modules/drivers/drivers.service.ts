import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type {
  DriverAvailability,
  DriverDocumentType,
  DriverEmploymentType,
  DriverLicenseType,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { R2StorageService } from '../../storage/r2.service';
import { randomUUID } from 'crypto';
import {
  deriveDriverOperationalStatus,
  isDriverAssignable,
  isLicenseExpired,
  mapOperationalToStoredAvailability,
  type OperationalDriverStatus,
} from './driver-status.util';

export interface DriverListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  hubId?: string;
  warehouseHubId?: string;
  vehicleAssigned?: 'yes' | 'no';
  licenseExpiry?: 'expired' | 'expiring_soon' | 'valid';
  includeInactive?: boolean;
}

export interface DriverCreateInput {
  hubId: string;
  warehouseHubId?: string | null;
  name: string;
  phone: string;
  employeeId?: string | null;
  alternatePhone?: string | null;
  email?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  bloodGroup?: string | null;
  emergencyContactName?: string | null;
  emergencyContactNumber?: string | null;
  emergencyContactRelationship?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pinCode?: string | null;
  licenseNumber?: string | null;
  licenseIssueDate?: string | null;
  licenseExpiry?: string | null;
  licenseType?: string | null;
  licenseIssuingState?: string | null;
  joiningDate?: string | null;
  employmentType?: string | null;
  shift?: string | null;
  onLeave?: boolean;
  aadhaarNumber?: string | null;
  panNumber?: string | null;
  bankAccountHolder?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  upiId?: string | null;
  remarks?: string | null;
  vehicleId?: string | null;
  isActive?: boolean;
  createdBy?: string;
}

export interface DriverUpdateInput extends Partial<DriverCreateInput> {
  updatedBy?: string;
}

const ALLOWED_DOC_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

const MAX_DOC_BYTES = 10 * 1024 * 1024;

const ACTIVE_TRIP_ORDER_STATUSES = ['OUT_FOR_DELIVERY', 'DISPATCHED'] as const;

const ASSIGNED_ORDER_STATUSES = [
  'READY_FOR_DISPATCH',
  'DRIVER_ASSIGNED',
] as const;

const driverInclude = {
  hub: {
    select: { id: true, code: true, name: true, hubType: true, city: true },
  },
  warehouseHub: {
    select: { id: true, code: true, name: true, hubType: true, city: true },
  },
  vehicle: {
    select: {
      id: true,
      registration: true,
      vehicleType: true,
      vehicleCategory: true,
      status: true,
      capacity: true,
      isActive: true,
    },
  },
  documents: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.DriverInclude;

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2StorageService,
  ) {}

  private parseDate(value?: string | null): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    return d;
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    const last10 = digits.slice(-10);
    if (last10.length !== 10) {
      throw new BadRequestException(
        'Phone must be a valid 10-digit Indian mobile number',
      );
    }
    return last10;
  }

  private normalizeEmployeeId(
    value?: string | null,
  ): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    return value.trim().toUpperCase();
  }

  private async nextEmployeeId(
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<string> {
    const latest = await tx.driver.findFirst({
      where: { employeeId: { startsWith: 'DRV-' } },
      orderBy: { employeeId: 'desc' },
      select: { employeeId: true },
    });
    const match = latest?.employeeId?.match(/DRV-(\d+)/);
    const next = match ? Number(match[1]) + 1 : 1001;
    return `DRV-${String(next).padStart(4, '0')}`;
  }

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private async enrichDriver(driver: any) {
    const today = this.startOfToday();
    const [activeTripCount, assignedOrderCount, tripsToday, completedTrips] =
      await Promise.all([
        this.prisma.order.count({
          where: {
            assignedDriverId: driver.id,
            orderStatus: { in: [...ACTIVE_TRIP_ORDER_STATUSES] as any },
            deletedAt: null,
          },
        }),
        this.prisma.order.count({
          where: {
            assignedDriverId: driver.id,
            orderStatus: { in: [...ASSIGNED_ORDER_STATUSES] as any },
            deletedAt: null,
          },
        }),
        this.prisma.order.count({
          where: {
            assignedDriverId: driver.id,
            deletedAt: null,
            OR: [
              { dispatchedAt: { gte: today } },
              { deliveryCompletedAt: { gte: today } },
            ],
          },
        }),
        this.prisma.order.count({
          where: {
            assignedDriverId: driver.id,
            orderStatus: 'DELIVERED',
            deletedAt: null,
          },
        }),
      ]);

    const currentOrder = await this.prisma.order.findFirst({
      where: {
        assignedDriverId: driver.id,
        orderStatus: {
          in: [
            ...ACTIVE_TRIP_ORDER_STATUSES,
            ...ASSIGNED_ORDER_STATUSES,
          ] as any,
        },
        deletedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        orderStatus: true,
        customer: { select: { id: true, fullName: true, phone: true } },
        dispatchedAt: true,
      },
    });

    const operationalStatus = deriveDriverOperationalStatus({
      isActive: driver.isActive,
      onLeave: driver.onLeave,
      availability: driver.availability,
      licenseExpiry: driver.licenseExpiry,
      hasActiveTrip: activeTripCount > 0,
      hasAssignedOrder: assignedOrderCount > 0,
    });

    const docs = driver.documents ?? [];
    const withUrls = await Promise.all(
      docs.map(async (d: any) => ({
        ...d,
        downloadUrl: await this.r2
          .generateSignedUrl(d.storageKey, 60 * 60)
          .catch(() => null),
      })),
    );

    return {
      ...driver,
      rating: driver.rating != null ? Number(driver.rating) : null,
      operationalStatus,
      licenseExpired: isLicenseExpired(driver.licenseExpiry),
      assignable: isDriverAssignable(operationalStatus),
      tripsToday,
      tripsCompleted: completedTrips,
      currentTrip: currentOrder
        ? {
            orderId: currentOrder.id,
            orderNumber: currentOrder.orderNumber,
            status: currentOrder.orderStatus,
            customerName: currentOrder.customer?.fullName ?? null,
            customerPhone: currentOrder.customer?.phone ?? null,
            startedAt: currentOrder.dispatchedAt,
          }
        : null,
      documents: withUrls,
      banking: driver.bankAccountNumber
        ? {
            accountHolder: driver.bankAccountHolder,
            bankName: driver.bankName,
            accountNumberMasked: this.maskAccount(driver.bankAccountNumber),
            accountNumber: driver.bankAccountNumber,
            ifscCode: driver.bankIfscCode,
            upiId: driver.upiId,
          }
        : null,
      aadhaarMasked: driver.aadhaarNumber
        ? `XXXX XXXX ${String(driver.aadhaarNumber).slice(-4)}`
        : null,
      panMasked: driver.panNumber
        ? `${String(driver.panNumber).slice(0, 5)}****${String(driver.panNumber).slice(-1)}`
        : null,
    };
  }

  private maskAccount(accountNumber: string): string {
    if (accountNumber.length <= 4) return '****';
    return `${'*'.repeat(Math.max(accountNumber.length - 4, 4))}${accountNumber.slice(-4)}`;
  }

  private mapCreateData(input: DriverCreateInput, employeeId: string | null) {
    return {
      hubId: input.hubId,
      warehouseHubId: input.warehouseHubId ?? null,
      name: input.name.trim(),
      phone: this.normalizePhone(input.phone),
      employeeId,
      alternatePhone: input.alternatePhone
        ? this.normalizePhone(input.alternatePhone)
        : null,
      email: input.email?.trim() || null,
      gender: input.gender?.trim() || null,
      dateOfBirth: this.parseDate(input.dateOfBirth) ?? null,
      bloodGroup: input.bloodGroup?.trim() || null,
      emergencyContactName: input.emergencyContactName?.trim() || null,
      emergencyContactNumber: input.emergencyContactNumber
        ? this.normalizePhone(input.emergencyContactNumber)
        : null,
      emergencyContactRelationship:
        input.emergencyContactRelationship?.trim() || null,
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      pinCode: input.pinCode?.trim() || null,
      licenseNumber: input.licenseNumber?.trim().toUpperCase() || null,
      licenseIssueDate: this.parseDate(input.licenseIssueDate) ?? null,
      licenseExpiry: this.parseDate(input.licenseExpiry) ?? null,
      licenseType: (input.licenseType as DriverLicenseType) || null,
      licenseIssuingState: input.licenseIssuingState?.trim() || null,
      joiningDate: this.parseDate(input.joiningDate) ?? null,
      employmentType: (input.employmentType as DriverEmploymentType) || null,
      shift: input.shift?.trim() || null,
      onLeave: input.onLeave ?? false,
      aadhaarNumber: input.aadhaarNumber?.replace(/\D/g, '') || null,
      panNumber: input.panNumber?.trim().toUpperCase() || null,
      bankAccountHolder: input.bankAccountHolder?.trim() || null,
      bankName: input.bankName?.trim() || null,
      bankAccountNumber: input.bankAccountNumber?.trim() || null,
      bankIfscCode: input.bankIfscCode?.trim().toUpperCase() || null,
      upiId: input.upiId?.trim() || null,
      remarks: input.remarks?.trim() || null,
      isActive: input.isActive ?? true,
      availability: (input.onLeave
        ? 'ON_LEAVE'
        : 'AVAILABLE') as DriverAvailability,
      createdBy: input.createdBy ?? null,
    };
  }

  async findAll(query: DriverListQuery, options?: { hubScope?: string }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.DriverWhereInput = {
      deletedAt: null,
      ...(options?.hubScope ? { hubId: options.hubScope } : {}),
    };

    if (query.hubId) where.hubId = query.hubId;
    if (query.warehouseHubId) where.warehouseHubId = query.warehouseHubId;
    if (!query.includeInactive && !query.status) {
      where.isActive = true;
    }

    if (query.vehicleAssigned === 'yes') where.vehicleId = { not: null };
    if (query.vehicleAssigned === 'no') where.vehicleId = null;

    if (query.licenseExpiry === 'expired') {
      where.licenseExpiry = { lt: this.startOfToday() };
    } else if (query.licenseExpiry === 'expiring_soon') {
      const in30 = new Date(this.startOfToday());
      in30.setDate(in30.getDate() + 30);
      where.licenseExpiry = { gte: this.startOfToday(), lte: in30 };
    }

    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { employeeId: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { licenseNumber: { contains: q, mode: 'insensitive' } },
        { vehicle: { registration: { contains: q, mode: 'insensitive' } } },
      ];
    }

    // Status filter applied after enrichment for derived statuses,
    // except for clear stored flags.
    if (query.status === 'INACTIVE') {
      where.isActive = false;
    } else if (query.status === 'ON_LEAVE') {
      where.OR = [
        ...(Array.isArray(where.OR) ? [] : []),
        { onLeave: true },
        { availability: { in: ['ON_LEAVE', 'OFF_DUTY'] } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: driverInclude,
      }),
      this.prisma.driver.count({ where }),
    ]);

    let data = await Promise.all(rows.map((d) => this.enrichDriver(d)));

    if (
      query.status &&
      !['INACTIVE', 'ON_LEAVE', 'all'].includes(query.status)
    ) {
      const want = query.status === 'ON_TRIP' ? 'ON_TRIP' : query.status;
      data = data.filter((d) => d.operationalStatus === want);
    }

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async findById(id: string, hubScope?: string) {
    const driver = await this.prisma.driver.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(hubScope ? { hubId: hubScope } : {}),
      },
      include: driverInclude,
    });
    if (!driver) throw new NotFoundException('Driver not found');
    return this.enrichDriver(driver);
  }

  async getStats(filters?: { hubId?: string; warehouseHubId?: string }) {
    const where: Prisma.DriverWhereInput = {
      deletedAt: null,
      ...(filters?.hubId ? { hubId: filters.hubId } : {}),
      ...(filters?.warehouseHubId
        ? { warehouseHubId: filters.warehouseHubId }
        : {}),
    };

    const drivers = await this.prisma.driver.findMany({
      where,
      select: {
        id: true,
        isActive: true,
        onLeave: true,
        availability: true,
        licenseExpiry: true,
      },
    });

    const activeTripDriverIds = new Set(
      (
        await this.prisma.order.findMany({
          where: {
            assignedDriverId: { in: drivers.map((d) => d.id) },
            orderStatus: { in: [...ACTIVE_TRIP_ORDER_STATUSES] as any },
            deletedAt: null,
          },
          select: { assignedDriverId: true },
          distinct: ['assignedDriverId'],
        })
      )
        .map((o) => o.assignedDriverId)
        .filter(Boolean) as string[],
    );

    const assignedDriverIds = new Set(
      (
        await this.prisma.order.findMany({
          where: {
            assignedDriverId: { in: drivers.map((d) => d.id) },
            orderStatus: { in: [...ASSIGNED_ORDER_STATUSES] as any },
            deletedAt: null,
          },
          select: { assignedDriverId: true },
          distinct: ['assignedDriverId'],
        })
      )
        .map((o) => o.assignedDriverId)
        .filter(Boolean) as string[],
    );

    let available = 0;
    let onTrip = 0;
    let onLeave = 0;
    let inactive = 0;
    let assigned = 0;
    let blocked = 0;

    for (const d of drivers) {
      const status = deriveDriverOperationalStatus({
        isActive: d.isActive,
        onLeave: d.onLeave,
        availability: d.availability,
        licenseExpiry: d.licenseExpiry,
        hasActiveTrip: activeTripDriverIds.has(d.id),
        hasAssignedOrder: assignedDriverIds.has(d.id),
      });
      switch (status) {
        case 'AVAILABLE':
          available += 1;
          break;
        case 'ON_TRIP':
          onTrip += 1;
          break;
        case 'ON_LEAVE':
          onLeave += 1;
          break;
        case 'INACTIVE':
          inactive += 1;
          break;
        case 'ASSIGNED':
          assigned += 1;
          break;
        case 'BLOCKED':
        case 'SUSPENDED':
          blocked += 1;
          break;
      }
    }

    return {
      total: drivers.length,
      available,
      onTrip,
      onLeave,
      inactive,
      assigned,
      blocked,
    };
  }

  async create(input: DriverCreateInput, options?: { hubScope?: string }) {
    if (options?.hubScope && input.hubId !== options.hubScope) {
      throw new BadRequestException('Cannot create driver for another hub');
    }

    const hub = await this.prisma.hub.findFirst({
      where: { id: input.hubId, deletedAt: null },
    });
    if (!hub) throw new BadRequestException('Hub not found');

    if (input.warehouseHubId) {
      const wh = await this.prisma.hub.findFirst({
        where: { id: input.warehouseHubId, deletedAt: null },
      });
      if (!wh) throw new BadRequestException('Warehouse not found');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const employeeId =
        this.normalizeEmployeeId(input.employeeId) ??
        (await this.nextEmployeeId(tx));

      if (employeeId) {
        const clash = await tx.driver.findFirst({
          where: { employeeId, deletedAt: null },
        });
        if (clash) {
          throw new ConflictException(
            `Employee ID ${employeeId} already exists`,
          );
        }
      }

      const driver = await tx.driver.create({
        data: this.mapCreateData(input, employeeId),
      });

      if (input.vehicleId) {
        await this.bindVehicleTx(
          tx,
          driver.id,
          input.hubId,
          input.vehicleId,
          input.createdBy,
        );
      }

      return driver;
    });

    return this.findById(created.id, options?.hubScope);
  }

  async update(
    id: string,
    input: DriverUpdateInput,
    options?: { hubScope?: string; allowHubChange?: boolean },
  ) {
    const existing = await this.prisma.driver.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(options?.hubScope ? { hubId: options.hubScope } : {}),
      },
      include: { vehicle: true },
    });
    if (!existing) throw new NotFoundException('Driver not found');

    if (
      input.hubId &&
      input.hubId !== existing.hubId &&
      !options?.allowHubChange
    ) {
      throw new BadRequestException('Hub change not permitted');
    }

    if (input.hubId && input.hubId !== existing.hubId) {
      const hub = await this.prisma.hub.findFirst({
        where: { id: input.hubId, deletedAt: null },
      });
      if (!hub) throw new BadRequestException('Hub not found');

      // Cross-hub vehicle must be cleared
      if (existing.vehicleId && existing.vehicle?.hubId !== input.hubId) {
        throw new ConflictException(
          'Unassign vehicle before transferring driver to another hub',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const employeeId = this.normalizeEmployeeId(input.employeeId);
      if (employeeId && employeeId !== existing.employeeId) {
        const clash = await tx.driver.findFirst({
          where: { employeeId, deletedAt: null, NOT: { id } },
        });
        if (clash) {
          throw new ConflictException(
            `Employee ID ${employeeId} already exists`,
          );
        }
      }

      const data: Prisma.DriverUpdateInput = {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.phone !== undefined && {
          phone: this.normalizePhone(input.phone),
        }),
        ...(employeeId !== undefined && { employeeId }),
        ...(input.alternatePhone !== undefined && {
          alternatePhone: input.alternatePhone
            ? this.normalizePhone(input.alternatePhone)
            : null,
        }),
        ...(input.email !== undefined && {
          email: input.email?.trim() || null,
        }),
        ...(input.gender !== undefined && {
          gender: input.gender?.trim() || null,
        }),
        ...(input.dateOfBirth !== undefined && {
          dateOfBirth: this.parseDate(input.dateOfBirth) ?? null,
        }),
        ...(input.bloodGroup !== undefined && {
          bloodGroup: input.bloodGroup?.trim() || null,
        }),
        ...(input.emergencyContactName !== undefined && {
          emergencyContactName: input.emergencyContactName?.trim() || null,
        }),
        ...(input.emergencyContactNumber !== undefined && {
          emergencyContactNumber: input.emergencyContactNumber
            ? this.normalizePhone(input.emergencyContactNumber)
            : null,
        }),
        ...(input.emergencyContactRelationship !== undefined && {
          emergencyContactRelationship:
            input.emergencyContactRelationship?.trim() || null,
        }),
        ...(input.address !== undefined && {
          address: input.address?.trim() || null,
        }),
        ...(input.city !== undefined && { city: input.city?.trim() || null }),
        ...(input.state !== undefined && {
          state: input.state?.trim() || null,
        }),
        ...(input.pinCode !== undefined && {
          pinCode: input.pinCode?.trim() || null,
        }),
        ...(input.licenseNumber !== undefined && {
          licenseNumber: input.licenseNumber?.trim().toUpperCase() || null,
        }),
        ...(input.licenseIssueDate !== undefined && {
          licenseIssueDate: this.parseDate(input.licenseIssueDate) ?? null,
        }),
        ...(input.licenseExpiry !== undefined && {
          licenseExpiry: this.parseDate(input.licenseExpiry) ?? null,
        }),
        ...(input.licenseType !== undefined && {
          licenseType: (input.licenseType as DriverLicenseType) || null,
        }),
        ...(input.licenseIssuingState !== undefined && {
          licenseIssuingState: input.licenseIssuingState?.trim() || null,
        }),
        ...(input.joiningDate !== undefined && {
          joiningDate: this.parseDate(input.joiningDate) ?? null,
        }),
        ...(input.employmentType !== undefined && {
          employmentType:
            (input.employmentType as DriverEmploymentType) || null,
        }),
        ...(input.shift !== undefined && {
          shift: input.shift?.trim() || null,
        }),
        ...(input.onLeave !== undefined && {
          onLeave: input.onLeave,
          availability: input.onLeave
            ? 'ON_LEAVE'
            : existing.availability === 'ON_LEAVE' ||
                existing.availability === 'OFF_DUTY'
              ? 'AVAILABLE'
              : existing.availability,
        }),
        ...(input.aadhaarNumber !== undefined && {
          aadhaarNumber: input.aadhaarNumber?.replace(/\D/g, '') || null,
        }),
        ...(input.panNumber !== undefined && {
          panNumber: input.panNumber?.trim().toUpperCase() || null,
        }),
        ...(input.bankAccountHolder !== undefined && {
          bankAccountHolder: input.bankAccountHolder?.trim() || null,
        }),
        ...(input.bankName !== undefined && {
          bankName: input.bankName?.trim() || null,
        }),
        ...(input.bankAccountNumber !== undefined && {
          bankAccountNumber: input.bankAccountNumber?.trim() || null,
        }),
        ...(input.bankIfscCode !== undefined && {
          bankIfscCode: input.bankIfscCode?.trim().toUpperCase() || null,
        }),
        ...(input.upiId !== undefined && {
          upiId: input.upiId?.trim() || null,
        }),
        ...(input.remarks !== undefined && {
          remarks: input.remarks?.trim() || null,
        }),
        ...(input.isActive !== undefined && {
          isActive: input.isActive,
          availability: input.isActive ? existing.availability : 'INACTIVE',
        }),
        ...(input.hubId !== undefined && {
          hub: { connect: { id: input.hubId } },
        }),
        ...(input.warehouseHubId !== undefined && {
          warehouseHub: input.warehouseHubId
            ? { connect: { id: input.warehouseHubId } }
            : { disconnect: true },
        }),
        ...(input.updatedBy !== undefined && { updatedBy: input.updatedBy }),
      };

      await tx.driver.update({ where: { id }, data });

      if (input.vehicleId !== undefined) {
        if (input.vehicleId === null) {
          await tx.driver.update({
            where: { id },
            data: { vehicleId: null },
          });
        } else {
          await this.bindVehicleTx(
            tx,
            id,
            input.hubId ?? existing.hubId,
            input.vehicleId,
            input.updatedBy,
          );
        }
      }
    });

    return this.findById(id, options?.hubScope);
  }

  private async bindVehicleTx(
    tx: Prisma.TransactionClient,
    driverId: string,
    hubId: string,
    vehicleId: string,
    actor?: string | null,
  ) {
    const vehicle = await tx.vehicle.findFirst({
      where: { id: vehicleId, deletedAt: null, isActive: true },
      include: { driver: true },
    });
    if (!vehicle) throw new BadRequestException('Vehicle not found');
    if (vehicle.hubId !== hubId) {
      throw new BadRequestException(
        'Vehicle does not belong to the selected hub',
      );
    }
    if (
      ['MAINTENANCE', 'INACTIVE', 'BLOCKED', 'DOCUMENT_EXPIRED'].includes(
        vehicle.status,
      )
    ) {
      throw new ConflictException('Vehicle is not eligible for assignment');
    }

    // Unbind previous drivers from this vehicle
    await tx.driver.updateMany({
      where: { vehicleId, NOT: { id: driverId } },
      data: { vehicleId: null },
    });

    // Unbind this driver from any other vehicle
    await tx.driver.update({
      where: { id: driverId },
      data: { vehicleId },
    });

    await tx.vehicleAssignmentHistory.create({
      data: {
        vehicleId,
        previousHubId: hubId,
        newHubId: hubId,
        previousDriverId: vehicle.driver?.id ?? null,
        newDriverId: driverId,
        assignedBy: actor ?? null,
        remarks: 'Driver↔Vehicle assignment',
      },
    });
  }

  async assignVehicle(
    driverId: string,
    vehicleId: string | null,
    actor?: string,
    hubScope?: string,
  ) {
    return this.update(
      driverId,
      { vehicleId, updatedBy: actor },
      { hubScope, allowHubChange: !hubScope },
    );
  }

  async softDelete(
    id: string,
    options?: { hubScope?: string; actor?: string },
  ) {
    const existing = await this.prisma.driver.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(options?.hubScope ? { hubId: options.hubScope } : {}),
      },
    });
    if (!existing) throw new NotFoundException('Driver not found');

    const activeOrders = await this.prisma.order.count({
      where: {
        assignedDriverId: id,
        orderStatus: {
          in: [
            ...ACTIVE_TRIP_ORDER_STATUSES,
            ...ASSIGNED_ORDER_STATUSES,
          ] as any,
        },
        deletedAt: null,
      },
    });
    if (activeOrders > 0) {
      throw new ConflictException(
        'Cannot deactivate driver with active order assignments',
      );
    }

    await this.prisma.driver.update({
      where: { id },
      data: {
        isActive: false,
        availability: 'INACTIVE',
        vehicleId: null,
        deletedAt: new Date(),
        updatedBy: options?.actor ?? null,
      },
    });

    return { id, deleted: true };
  }

  /** Assert driver can be assigned to a delivery. */
  async assertAssignable(driverId: string, hubId?: string) {
    const driver = await this.findById(driverId, hubId);
    if (!driver.assignable) {
      throw new ConflictException(
        driver.operationalStatus === 'BLOCKED'
          ? 'Driver license is expired — not eligible for assignment'
          : `Driver is ${driver.operationalStatus.replace(/_/g, ' ').toLowerCase()}`,
      );
    }
    return driver;
  }

  async syncAvailabilityFromOrders(driverId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, deletedAt: null },
    });
    if (!driver || !driver.isActive || driver.onLeave) return;

    const hasActiveTrip = await this.prisma.order.count({
      where: {
        assignedDriverId: driverId,
        orderStatus: { in: [...ACTIVE_TRIP_ORDER_STATUSES] as any },
        deletedAt: null,
      },
    });
    const hasAssigned = await this.prisma.order.count({
      where: {
        assignedDriverId: driverId,
        orderStatus: { in: [...ASSIGNED_ORDER_STATUSES] as any },
        deletedAt: null,
      },
    });

    const status = deriveDriverOperationalStatus({
      isActive: driver.isActive,
      onLeave: driver.onLeave,
      availability: driver.availability,
      licenseExpiry: driver.licenseExpiry,
      hasActiveTrip: hasActiveTrip > 0,
      hasAssignedOrder: hasAssigned > 0,
    });

    const next = mapOperationalToStoredAvailability(status);
    if (next !== driver.availability) {
      await this.prisma.driver.update({
        where: { id: driverId },
        data: { availability: next },
      });
    }
  }

  // ── Documents ────────────────────────────────────────────────────────────

  async createDocumentUploadUrl(
    driverId: string,
    dto: {
      documentType: DriverDocumentType | string;
      fileName: string;
      mimeType: string;
      fileSize: number;
    },
    hubScope?: string,
  ) {
    await this.findById(driverId, hubScope);

    if (!ALLOWED_DOC_MIMES.has(dto.mimeType.toLowerCase())) {
      throw new BadRequestException(
        'Only PDF, JPG, JPEG, and PNG files are allowed.',
      );
    }
    if (dto.fileSize <= 0 || dto.fileSize > MAX_DOC_BYTES) {
      throw new BadRequestException(
        'File size must be between 1 byte and 10 MB.',
      );
    }

    const safeName = dto.fileName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 120);
    const type = String(dto.documentType).toLowerCase();
    const key = `drivers/${driverId}/documents/${type}/${randomUUID()}-${safeName}`;

    const uploadUrl = await this.r2.generateSignedUploadUrl(
      key,
      dto.mimeType,
      60 * 15,
    );

    return {
      uploadUrl,
      storageKey: key,
      expiresInSeconds: 60 * 15,
      headers: { 'Content-Type': dto.mimeType },
    };
  }

  async confirmDocument(
    driverId: string,
    dto: {
      documentType: DriverDocumentType | string;
      storageKey: string;
      fileName: string;
      mimeType: string;
      fileSize: number;
      documentNumber?: string;
      issueDate?: string;
      expiryDate?: string;
    },
    uploadedBy?: string,
    hubScope?: string,
  ) {
    await this.findById(driverId, hubScope);

    if (!dto.storageKey.startsWith(`drivers/${driverId}/`)) {
      throw new BadRequestException('Invalid storage key for this driver');
    }

    const doc = await this.prisma.driverDocument.create({
      data: {
        driverId,
        documentType: dto.documentType as DriverDocumentType,
        fileName: dto.fileName,
        storageKey: dto.storageKey,
        mimeType: dto.mimeType,
        fileSize: dto.fileSize,
        documentNumber: dto.documentNumber ?? null,
        issueDate: this.parseDate(dto.issueDate) ?? null,
        expiryDate: this.parseDate(dto.expiryDate) ?? null,
        uploadedBy: uploadedBy ?? null,
      },
    });

    if (dto.documentType === 'DRIVER_PHOTO') {
      const url = await this.r2.generateSignedUrl(
        dto.storageKey,
        60 * 60 * 24 * 7,
      );
      await this.prisma.driver.update({
        where: { id: driverId },
        data: { photoUrl: url },
      });
    }

    return doc;
  }

  async listDocuments(driverId: string, hubScope?: string) {
    await this.findById(driverId, hubScope);
    const docs = await this.prisma.driverDocument.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
    });
    const withUrls = await Promise.all(
      docs.map(async (d) => ({
        ...d,
        downloadUrl: await this.r2.generateSignedUrl(d.storageKey, 60 * 60),
      })),
    );
    return { data: withUrls };
  }

  async deleteDocument(
    driverId: string,
    documentId: string,
    hubScope?: string,
  ) {
    await this.findById(driverId, hubScope);
    const doc = await this.prisma.driverDocument.findFirst({
      where: { id: documentId, driverId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    try {
      await this.r2.deleteFile(doc.storageKey);
    } catch {
      // best-effort
    }
    await this.prisma.driverDocument.delete({ where: { id: documentId } });
    return { id: documentId, deleted: true };
  }
}
