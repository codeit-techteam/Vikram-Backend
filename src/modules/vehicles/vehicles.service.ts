import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type {
  VehicleDocumentType,
  VehicleStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { R2StorageService } from '../../storage/r2.service';
import { MEDIA_FOLDERS } from '../../storage/media-folders';
import { randomUUID } from 'crypto';
import {
  deriveAvailabilityStatus,
  evaluateVehicleCompliance,
  normalizeVehicleRegistration,
  RUNNING_VEHICLE_STATUSES,
} from './vehicle-compliance.util';

export interface VehicleListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  hubId?: string;
  warehouseHubId?: string;
  driverId?: string;
  gpsEnabled?: boolean;
  compliance?: 'expired' | 'expiring_soon' | 'valid';
  includeInactive?: boolean;
}

export interface VehicleCreateInput {
  registration: string;
  hubId: string;
  warehouseHubId?: string | null;
  capacity?: number;
  payloadKg?: number | null;
  vehicleType?: string;
  vehicleCategory?: string | null;
  fuelType?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  manufactureYear?: number | null;
  vehicleColor?: string | null;
  fastagNumber?: string | null;
  odometerKm?: number | null;
  emergencyContact?: string | null;
  remarks?: string | null;
  registrationDate?: string | null;
  insuranceNumber?: string | null;
  insuranceExpiry?: string | null;
  fitnessCertificateNumber?: string | null;
  fitnessExpiry?: string | null;
  pucNumber?: string | null;
  pucExpiry?: string | null;
  permitType?: string | null;
  permitNumber?: string | null;
  permitExpiry?: string | null;
  roadTaxStatus?: string | null;
  roadTaxExpiry?: string | null;
  gpsEnabled?: boolean;
  gpsDeviceId?: string | null;
  status?: VehicleStatus;
  assignedDriverId?: string | null;
  createdBy?: string;
}

export interface VehicleUpdateInput extends Partial<VehicleCreateInput> {
  isActive?: boolean;
  updatedBy?: string;
  maintenanceReason?: string | null;
  maintenanceStartedAt?: string | null;
  maintenanceExpectedAt?: string | null;
  maintenanceCompletedAt?: string | null;
}

const ALLOWED_DOC_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

const MAX_DOC_BYTES = 10 * 1024 * 1024;

const vehicleInclude = {
  hub: {
    select: { id: true, code: true, name: true, hubType: true, city: true },
  },
  warehouseHub: {
    select: { id: true, code: true, name: true, hubType: true, city: true },
  },
  driver: {
    select: {
      id: true,
      name: true,
      phone: true,
      availability: true,
      isActive: true,
    },
  },
  documents: {
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.VehicleInclude;

@Injectable()
export class VehiclesService {
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

  private mapVehicle(vehicle: any) {
    const compliance = evaluateVehicleCompliance(vehicle);
    return {
      ...vehicle,
      capacity: Number(vehicle.capacity ?? 0),
      payloadKg: vehicle.payloadKg != null ? Number(vehicle.payloadKg) : null,
      odometerKm:
        vehicle.odometerKm != null ? Number(vehicle.odometerKm) : null,
      availabilityStatus: deriveAvailabilityStatus(vehicle.status),
      compliance,
    };
  }

  async findAll(query: VehicleListQuery) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.VehicleWhereInput = {
      deletedAt: null,
    };

    if (!query.includeInactive) {
      // still show INACTIVE in list when filtered by status
      if (!query.status) {
        where.isActive = true;
      }
    }

    if (query.hubId) where.hubId = query.hubId;
    if (query.warehouseHubId) where.warehouseHubId = query.warehouseHubId;
    if (query.status) {
      where.status = query.status as VehicleStatus;
    }
    if (query.gpsEnabled !== undefined) where.gpsEnabled = query.gpsEnabled;
    if (query.driverId) where.driver = { id: query.driverId };
    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { registration: { contains: q, mode: 'insensitive' } },
        { manufacturer: { contains: q, mode: 'insensitive' } },
        { model: { contains: q, mode: 'insensitive' } },
        { vehicleType: { equals: q.toUpperCase() as any } },
      ];
    }

    if (query.compliance === 'expired') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      where.OR = [
        ...(where.OR ?? []),
        { insuranceExpiry: { lt: today } },
        { fitnessExpiry: { lt: today } },
        { pucExpiry: { lt: today } },
        { permitExpiry: { lt: today } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          hub: vehicleInclude.hub,
          warehouseHub: vehicleInclude.warehouseHub,
          driver: vehicleInclude.driver,
          dispatches: {
            where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              dispatchNo: true,
              status: true,
              order: {
                select: {
                  id: true,
                  orderNumber: true,
                  orderStatus: true,
                  customer: {
                    select: { id: true, fullName: true, phone: true },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return {
      data: rows.map((v) => this.mapVehicle(v)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getStats(filters?: { hubId?: string; warehouseHubId?: string }) {
    const base: Prisma.VehicleWhereInput = {
      deletedAt: null,
      ...(filters?.hubId ? { hubId: filters.hubId } : {}),
      ...(filters?.warehouseHubId
        ? { warehouseHubId: filters.warehouseHubId }
        : {}),
    };

    const [total, available, running, maintenance, inactive, blocked] =
      await Promise.all([
        this.prisma.vehicle.count({ where: { ...base, isActive: true } }),
        this.prisma.vehicle.count({
          where: { ...base, isActive: true, status: 'AVAILABLE' },
        }),
        this.prisma.vehicle.count({
          where: {
            ...base,
            isActive: true,
            status: { in: RUNNING_VEHICLE_STATUSES },
          },
        }),
        this.prisma.vehicle.count({
          where: { ...base, isActive: true, status: 'MAINTENANCE' },
        }),
        this.prisma.vehicle.count({
          where: {
            ...base,
            OR: [{ isActive: false }, { status: 'INACTIVE' }],
          },
        }),
        this.prisma.vehicle.count({
          where: {
            ...base,
            isActive: true,
            status: { in: ['BLOCKED', 'DOCUMENT_EXPIRED'] },
          },
        }),
      ]);

    return {
      total,
      available,
      running,
      maintenance,
      inactive,
      blocked,
    };
  }

  async findById(id: string, hubScope?: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(hubScope ? { hubId: hubScope } : {}),
      },
      include: {
        ...vehicleInclude,
        dispatches: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            driver: { select: { id: true, name: true, phone: true } },
            order: {
              select: {
                id: true,
                orderNumber: true,
                orderStatus: true,
                customer: {
                  select: { id: true, fullName: true, phone: true },
                },
                deliveryAddress: true,
                expectedDeliveryAt: true,
                driverReachedAt: true,
                deliveryCompletedAt: true,
              },
            },
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          take: 30,
        },
        assignmentHistory: {
          orderBy: { assignedAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return this.mapVehicle(vehicle);
  }

  async create(input: VehicleCreateInput, options?: { forceHubId?: string }) {
    const hubId = options?.forceHubId ?? input.hubId;
    if (!hubId) throw new BadRequestException('Hub is required');

    const registration = normalizeVehicleRegistration(input.registration);
    if (!registration || registration.length < 5) {
      throw new BadRequestException('Invalid vehicle registration number');
    }

    const existing = await this.prisma.vehicle.findFirst({
      where: { registration, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(
        `Vehicle ${registration} is already registered.`,
      );
    }

    const hub = await this.prisma.hub.findFirst({
      where: { id: hubId, deletedAt: null },
    });
    if (!hub) throw new BadRequestException('Hub not found');

    const warehouseHubId = input.warehouseHubId ?? null;
    if (warehouseHubId) {
      const wh = await this.prisma.hub.findFirst({
        where: {
          id: warehouseHubId,
          deletedAt: null,
          OR: [
            { hubType: 'CENTRAL_WAREHOUSE' },
            { hubType: { contains: 'WAREHOUSE', mode: 'insensitive' } },
          ],
        },
      });
      if (!wh) {
        // Allow any active hub as warehouse assignment if typed loosely
        const anyHub = await this.prisma.hub.findFirst({
          where: { id: warehouseHubId, deletedAt: null },
        });
        if (!anyHub) throw new BadRequestException('Warehouse hub not found');
      }
    }

    const status = (input.status as VehicleStatus) ?? 'AVAILABLE';

    const created = await this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.create({
        data: {
          hubId,
          warehouseHubId,
          registration,
          capacity: input.capacity ?? 0,
          payloadKg: input.payloadKg ?? null,
          vehicleType: (input.vehicleType as any) ?? 'TRUCK',
          vehicleCategory: input.vehicleCategory ?? null,
          fuelType: input.fuelType ?? null,
          manufacturer: input.manufacturer ?? null,
          model: input.model ?? null,
          manufactureYear: input.manufactureYear ?? null,
          vehicleColor: input.vehicleColor ?? null,
          fastagNumber: input.fastagNumber ?? null,
          odometerKm: input.odometerKm ?? null,
          emergencyContact: input.emergencyContact ?? null,
          remarks: input.remarks ?? null,
          registrationDate: this.parseDate(input.registrationDate) ?? null,
          insuranceNumber: input.insuranceNumber ?? null,
          insuranceExpiry: this.parseDate(input.insuranceExpiry) ?? null,
          fitnessCertificateNumber: input.fitnessCertificateNumber ?? null,
          fitnessExpiry: this.parseDate(input.fitnessExpiry) ?? null,
          pucNumber: input.pucNumber ?? null,
          pucExpiry: this.parseDate(input.pucExpiry) ?? null,
          permitType: input.permitType ?? null,
          permitNumber: input.permitNumber ?? null,
          permitExpiry: this.parseDate(input.permitExpiry) ?? null,
          roadTaxStatus: input.roadTaxStatus ?? null,
          roadTaxExpiry: this.parseDate(input.roadTaxExpiry) ?? null,
          gpsEnabled: input.gpsEnabled ?? false,
          gpsDeviceId: input.gpsDeviceId ?? null,
          status,
          createdBy: input.createdBy ?? null,
          updatedBy: input.createdBy ?? null,
        },
      });

      await tx.vehicleStatusHistory.create({
        data: {
          vehicleId: vehicle.id,
          fromStatus: null,
          toStatus: status,
          changedBy: input.createdBy ?? null,
          reason: 'Vehicle created',
        },
      });

      await tx.vehicleAssignmentHistory.create({
        data: {
          vehicleId: vehicle.id,
          previousHubId: null,
          newHubId: hubId,
          previousWarehouseHubId: null,
          newWarehouseHubId: warehouseHubId,
          assignedBy: input.createdBy ?? null,
          remarks: 'Initial assignment',
        },
      });

      if (input.assignedDriverId) {
        await this.bindDriverTx(
          tx,
          vehicle.id,
          hubId,
          input.assignedDriverId,
          input.createdBy,
        );
      }

      return vehicle;
    });

    return this.findById(created.id);
  }

  async update(
    id: string,
    input: VehicleUpdateInput,
    options?: { hubScope?: string; allowHubChange?: boolean },
  ) {
    const existing = await this.prisma.vehicle.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(options?.hubScope ? { hubId: options.hubScope } : {}),
      },
      include: { driver: true },
    });
    if (!existing) throw new NotFoundException('Vehicle not found');

    if (
      options?.hubScope &&
      input.hubId &&
      input.hubId !== options.hubScope &&
      !options.allowHubChange
    ) {
      throw new ForbiddenException(
        'You do not have permission to move this vehicle to another Hub.',
      );
    }

    if (
      options?.hubScope &&
      input.warehouseHubId !== undefined &&
      !options.allowHubChange
    ) {
      throw new ForbiddenException(
        'You do not have permission to change warehouse assignment.',
      );
    }

    let registration: string | undefined;
    if (input.registration) {
      registration = normalizeVehicleRegistration(input.registration);
      const dup = await this.prisma.vehicle.findFirst({
        where: {
          registration,
          deletedAt: null,
          NOT: { id },
        },
      });
      if (dup) {
        throw new ConflictException(
          `Vehicle ${registration} is already registered.`,
        );
      }
    }

    const nextHubId = options?.allowHubChange
      ? (input.hubId ?? existing.hubId)
      : existing.hubId;
    const nextWarehouse =
      options?.allowHubChange && input.warehouseHubId !== undefined
        ? input.warehouseHubId
        : existing.warehouseHubId;

    const data: Prisma.VehicleUpdateInput = {
      ...(registration ? { registration } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.payloadKg !== undefined ? { payloadKg: input.payloadKg } : {}),
      ...(input.vehicleType ? { vehicleType: input.vehicleType as any } : {}),
      ...(input.vehicleCategory !== undefined
        ? { vehicleCategory: input.vehicleCategory }
        : {}),
      ...(input.fuelType !== undefined ? { fuelType: input.fuelType } : {}),
      ...(input.manufacturer !== undefined
        ? { manufacturer: input.manufacturer }
        : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.manufactureYear !== undefined
        ? { manufactureYear: input.manufactureYear }
        : {}),
      ...(input.vehicleColor !== undefined
        ? { vehicleColor: input.vehicleColor }
        : {}),
      ...(input.fastagNumber !== undefined
        ? { fastagNumber: input.fastagNumber }
        : {}),
      ...(input.odometerKm !== undefined
        ? { odometerKm: input.odometerKm }
        : {}),
      ...(input.emergencyContact !== undefined
        ? { emergencyContact: input.emergencyContact }
        : {}),
      ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
      ...(input.registrationDate !== undefined
        ? { registrationDate: this.parseDate(input.registrationDate) }
        : {}),
      ...(input.insuranceNumber !== undefined
        ? { insuranceNumber: input.insuranceNumber }
        : {}),
      ...(input.insuranceExpiry !== undefined
        ? { insuranceExpiry: this.parseDate(input.insuranceExpiry) }
        : {}),
      ...(input.fitnessCertificateNumber !== undefined
        ? { fitnessCertificateNumber: input.fitnessCertificateNumber }
        : {}),
      ...(input.fitnessExpiry !== undefined
        ? { fitnessExpiry: this.parseDate(input.fitnessExpiry) }
        : {}),
      ...(input.pucNumber !== undefined ? { pucNumber: input.pucNumber } : {}),
      ...(input.pucExpiry !== undefined
        ? { pucExpiry: this.parseDate(input.pucExpiry) }
        : {}),
      ...(input.permitType !== undefined
        ? { permitType: input.permitType }
        : {}),
      ...(input.permitNumber !== undefined
        ? { permitNumber: input.permitNumber }
        : {}),
      ...(input.permitExpiry !== undefined
        ? { permitExpiry: this.parseDate(input.permitExpiry) }
        : {}),
      ...(input.roadTaxStatus !== undefined
        ? { roadTaxStatus: input.roadTaxStatus }
        : {}),
      ...(input.roadTaxExpiry !== undefined
        ? { roadTaxExpiry: this.parseDate(input.roadTaxExpiry) }
        : {}),
      ...(input.gpsEnabled !== undefined
        ? { gpsEnabled: input.gpsEnabled }
        : {}),
      ...(input.gpsDeviceId !== undefined
        ? { gpsDeviceId: input.gpsDeviceId }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.maintenanceReason !== undefined
        ? { maintenanceReason: input.maintenanceReason }
        : {}),
      ...(input.maintenanceStartedAt !== undefined
        ? {
            maintenanceStartedAt: this.parseDate(input.maintenanceStartedAt),
          }
        : {}),
      ...(input.maintenanceExpectedAt !== undefined
        ? {
            maintenanceExpectedAt: this.parseDate(input.maintenanceExpectedAt),
          }
        : {}),
      ...(input.maintenanceCompletedAt !== undefined
        ? {
            maintenanceCompletedAt: this.parseDate(
              input.maintenanceCompletedAt,
            ),
          }
        : {}),
      updatedBy: input.updatedBy ?? null,
      hub: { connect: { id: nextHubId } },
      ...(nextWarehouse
        ? { warehouseHub: { connect: { id: nextWarehouse } } }
        : input.warehouseHubId === null
          ? { warehouseHub: { disconnect: true } }
          : {}),
    };

    await this.prisma.$transaction(async (tx) => {
      if (
        nextHubId !== existing.hubId ||
        nextWarehouse !== existing.warehouseHubId
      ) {
        await tx.vehicleAssignmentHistory.create({
          data: {
            vehicleId: id,
            previousHubId: existing.hubId,
            newHubId: nextHubId,
            previousWarehouseHubId: existing.warehouseHubId,
            newWarehouseHubId: nextWarehouse ?? null,
            previousDriverId: existing.driver?.id ?? null,
            newDriverId: existing.driver?.id ?? null,
            assignedBy: input.updatedBy ?? null,
            remarks: 'Assignment updated',
          },
        });
      }

      if (input.status && input.status !== existing.status) {
        await tx.vehicleStatusHistory.create({
          data: {
            vehicleId: id,
            fromStatus: existing.status,
            toStatus: input.status,
            changedBy: input.updatedBy ?? null,
            reason: 'Manual status update',
          },
        });
        data.status = input.status;
      }

      await tx.vehicle.update({ where: { id }, data });

      if (input.assignedDriverId !== undefined) {
        if (input.assignedDriverId === null) {
          if (existing.driver) {
            await tx.driver.update({
              where: { id: existing.driver.id },
              data: { vehicleId: null },
            });
            await tx.vehicleAssignmentHistory.create({
              data: {
                vehicleId: id,
                previousHubId: nextHubId,
                newHubId: nextHubId,
                previousDriverId: existing.driver.id,
                newDriverId: null,
                assignedBy: input.updatedBy ?? null,
                remarks: 'Driver unassigned',
              },
            });
          }
        } else {
          await this.bindDriverTx(
            tx,
            id,
            nextHubId,
            input.assignedDriverId,
            input.updatedBy,
          );
        }
      }
    });

    return this.findById(id, options?.hubScope);
  }

  private async bindDriverTx(
    tx: Prisma.TransactionClient,
    vehicleId: string,
    hubId: string,
    driverId: string,
    actor?: string | null,
  ) {
    const driver = await tx.driver.findFirst({
      where: { id: driverId, hubId, deletedAt: null, isActive: true },
    });
    if (!driver) {
      throw new BadRequestException('Driver not found at this hub');
    }

    // Unbind any other driver currently on this vehicle
    await tx.driver.updateMany({
      where: { vehicleId, NOT: { id: driverId } },
      data: { vehicleId: null },
    });

    await tx.driver.update({
      where: { id: driverId },
      data: { vehicleId },
    });

    await tx.vehicleAssignmentHistory.create({
      data: {
        vehicleId,
        previousHubId: hubId,
        newHubId: hubId,
        previousDriverId: null,
        newDriverId: driverId,
        assignedBy: actor ?? null,
        remarks: 'Driver assigned',
      },
    });
  }

  async updateAssignment(
    id: string,
    dto: {
      hubId?: string;
      warehouseHubId?: string | null;
      assignedDriverId?: string | null;
    },
    actor?: string,
  ) {
    return this.update(
      id,
      {
        hubId: dto.hubId,
        warehouseHubId: dto.warehouseHubId,
        assignedDriverId: dto.assignedDriverId,
        updatedBy: actor,
      },
      { allowHubChange: true },
    );
  }

  async updateStatus(
    id: string,
    status: VehicleStatus,
    actor?: string,
    reason?: string,
    extras?: Partial<{
      maintenanceReason: string;
      maintenanceStartedAt: string;
      maintenanceExpectedAt: string;
      orderId: string;
      dispatchId: string;
    }>,
  ) {
    const existing = await this.prisma.vehicle.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Vehicle not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.vehicle.update({
        where: { id },
        data: {
          status,
          updatedBy: actor ?? null,
          ...(status === 'MAINTENANCE'
            ? {
                maintenanceReason:
                  extras?.maintenanceReason ?? existing.maintenanceReason,
                maintenanceStartedAt:
                  this.parseDate(extras?.maintenanceStartedAt) ??
                  existing.maintenanceStartedAt ??
                  new Date(),
                maintenanceExpectedAt:
                  this.parseDate(extras?.maintenanceExpectedAt) ??
                  existing.maintenanceExpectedAt,
                maintenanceCompletedAt: null,
              }
            : {}),
          ...(status === 'AVAILABLE' && existing.status === 'MAINTENANCE'
            ? { maintenanceCompletedAt: new Date() }
            : {}),
          ...(status === 'INACTIVE' ? { isActive: false } : {}),
          ...(status === 'AVAILABLE' ? { isActive: true } : {}),
        },
      });
      await tx.vehicleStatusHistory.create({
        data: {
          vehicleId: id,
          fromStatus: existing.status,
          toStatus: status,
          changedBy: actor ?? null,
          reason: reason ?? `Status → ${status}`,
          orderId: extras?.orderId ?? null,
          dispatchId: extras?.dispatchId ?? null,
        },
      });
    });

    return this.findById(id);
  }

  async softDelete(
    id: string,
    options?: { hubScope?: string; actor?: string },
  ) {
    const existing = await this.prisma.vehicle.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(options?.hubScope ? { hubId: options.hubScope } : {}),
      },
    });
    if (!existing) throw new NotFoundException('Vehicle not found');

    const dispatchCount = await this.prisma.hubDispatch.count({
      where: { vehicleId: id },
    });

    if (dispatchCount > 0) {
      // Soft-inactivate — preserve history
      return this.updateStatus(
        id,
        'INACTIVE',
        options?.actor,
        'Deactivated — has historical dispatch records',
      );
    }

    await this.prisma.vehicle.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        status: 'INACTIVE',
        updatedBy: options?.actor ?? null,
      },
    });

    return { id, deleted: true };
  }

  async getDispatchHistory(id: string, hubScope?: string) {
    await this.findById(id, hubScope);
    const rows = await this.prisma.hubDispatch.findMany({
      where: { vehicleId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        driver: { select: { id: true, name: true, phone: true } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            orderStatus: true,
            customer: { select: { id: true, fullName: true, phone: true } },
            deliveryCompletedAt: true,
            dispatchedAt: true,
          },
        },
      },
    });
    return { data: rows };
  }

  // ── Documents ────────────────────────────────────────────────────────────

  async createDocumentUploadUrl(
    vehicleId: string,
    dto: {
      documentType: VehicleDocumentType | string;
      fileName: string;
      mimeType: string;
      fileSize: number;
    },
    hubScope?: string,
  ) {
    await this.findById(vehicleId, hubScope);

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
    const key = `vehicles/${vehicleId}/documents/${type}/${randomUUID()}-${safeName}`;

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
    vehicleId: string,
    dto: {
      documentType: VehicleDocumentType | string;
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
    await this.findById(vehicleId, hubScope);

    if (!dto.storageKey.startsWith(`vehicles/${vehicleId}/`)) {
      throw new BadRequestException('Invalid storage key for this vehicle');
    }
    if (!ALLOWED_DOC_MIMES.has(dto.mimeType.toLowerCase())) {
      throw new BadRequestException('Invalid document MIME type');
    }

    const doc = await this.prisma.vehicleDocument.create({
      data: {
        vehicleId,
        documentType: dto.documentType as VehicleDocumentType,
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

    return doc;
  }

  async listDocuments(vehicleId: string, hubScope?: string) {
    await this.findById(vehicleId, hubScope);
    const docs = await this.prisma.vehicleDocument.findMany({
      where: { vehicleId },
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
    vehicleId: string,
    documentId: string,
    hubScope?: string,
  ) {
    await this.findById(vehicleId, hubScope);
    const doc = await this.prisma.vehicleDocument.findFirst({
      where: { id: documentId, vehicleId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    try {
      await this.r2.deleteFile(doc.storageKey);
    } catch {
      // best-effort R2 delete
    }
    await this.prisma.vehicleDocument.delete({ where: { id: documentId } });
    return { id: documentId, deleted: true };
  }

  /** Assert vehicle is eligible for dispatch; throws on failure. */
  assertDispatchEligible(
    vehicle: {
      id: string;
      status: VehicleStatus;
      isActive: boolean;
      deletedAt?: Date | null;
      capacity: unknown;
      insuranceExpiry?: Date | null;
      fitnessExpiry?: Date | null;
      pucExpiry?: Date | null;
      permitExpiry?: Date | null;
      permitNumber?: string | null;
      roadTaxExpiry?: Date | null;
    },
    orderWeightTons?: number | null,
  ) {
    if (!vehicle.isActive || vehicle.deletedAt) {
      throw new ConflictException('Vehicle is inactive.');
    }
    if (vehicle.status !== 'AVAILABLE') {
      throw new ConflictException(
        vehicle.status === 'OUT_FOR_DELIVERY' ||
          vehicle.status === 'REACHED' ||
          vehicle.status === 'LOADING' ||
          vehicle.status === 'ASSIGNED'
          ? `Vehicle is currently ${vehicle.status.replace(/_/g, ' ').toLowerCase()}.`
          : 'Vehicle is not available.',
      );
    }

    const compliance = evaluateVehicleCompliance(vehicle as any);
    if (!compliance.isCompliant) {
      throw new ConflictException(compliance.blockReasons[0]);
    }

    if (orderWeightTons != null && orderWeightTons > 0) {
      const capacity = Number(vehicle.capacity ?? 0);
      if (capacity > 0 && orderWeightTons > capacity) {
        throw new BadRequestException(
          'Vehicle capacity is insufficient for this order.',
        );
      }
    }
  }
}
