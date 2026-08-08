import { Injectable } from '@nestjs/common';
import { DriversService } from '../../modules/drivers/drivers.service';
import type { HubDriverCreateDto, HubDriversQueryDto, HubDriverUpdateDto } from '../dto/hub.dto';

@Injectable()
export class HubDriversService {
  constructor(private readonly driversService: DriversService) {}

  async findAll(hubId: string, query: HubDriversQueryDto) {
    return this.driversService.findAll(
      {
        page: query.page,
        limit: query.limit,
        search: query.search,
        status: query.availability,
        includeInactive: true,
      },
      { hubScope: hubId },
    );
  }

  async findOne(hubId: string, id: string) {
    return this.driversService.findById(id, hubId);
  }

  async create(hubId: string, dto: HubDriverCreateDto, actor?: string) {
    return this.driversService.create(
      {
        hubId,
        name: dto.name,
        phone: dto.phone,
        vehicleId: dto.vehicleId,
        licenseNumber: dto.licenseNumber,
        licenseExpiry: dto.licenseExpiry,
        alternatePhone: dto.alternatePhone,
        email: dto.email,
        bloodGroup: dto.bloodGroup,
        joiningDate: dto.joiningDate,
        address: dto.address,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactNumber: dto.emergencyContactNumber,
        createdBy: actor,
      },
      { hubScope: hubId },
    );
  }

  async update(hubId: string, id: string, dto: HubDriverUpdateDto, actor?: string) {
    return this.driversService.update(
      id,
      {
        name: dto.name,
        phone: dto.phone,
        vehicleId: dto.vehicleId,
        licenseNumber: dto.licenseNumber,
        licenseExpiry: dto.licenseExpiry,
        alternatePhone: dto.alternatePhone,
        email: dto.email,
        bloodGroup: dto.bloodGroup,
        joiningDate: dto.joiningDate,
        address: dto.address,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactNumber: dto.emergencyContactNumber,
        onLeave: dto.availability === 'OFF_DUTY' || dto.availability === 'ON_LEAVE',
        isActive:
          dto.isActive !== undefined
            ? dto.isActive
            : dto.availability === 'INACTIVE'
              ? false
              : undefined,
        updatedBy: actor,
      },
      { hubScope: hubId },
    );
  }

  async remove(hubId: string, id: string, actor?: string) {
    return this.driversService.softDelete(id, { hubScope: hubId, actor });
  }
}
