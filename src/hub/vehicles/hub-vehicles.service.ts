import { Injectable } from '@nestjs/common';
import type {
  HubVehicleCreateDto,
  HubVehiclesQueryDto,
  HubVehicleUpdateDto,
} from '../dto/hub.dto';
import { VehiclesService } from '../../modules/vehicles/vehicles.service';
import type { VehicleStatus } from '../../../generated/prisma/client';
import {
  VehicleDocumentConfirmDto,
  VehicleDocumentUploadUrlDto,
} from '../../admin/vehicles/dto/admin-vehicles.dto';

@Injectable()
export class HubVehiclesService {
  constructor(private readonly vehiclesService: VehiclesService) {}

  async findAll(hubId: string, query: HubVehiclesQueryDto) {
    return this.vehiclesService.findAll({
      hubId,
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      includeInactive: true,
    });
  }

  async findOne(hubId: string, id: string) {
    return this.vehiclesService.findById(id, hubId);
  }

  async create(hubId: string, dto: HubVehicleCreateDto, actor?: string) {
    return this.vehiclesService.create(
      {
        registration: dto.registration,
        hubId,
        capacity: dto.capacity,
        payloadKg: dto.payloadKg,
        vehicleType: dto.vehicleType,
        vehicleCategory: dto.vehicleCategory,
        fuelType: dto.fuelType,
        manufacturer: dto.manufacturer,
        model: dto.model,
        manufactureYear: dto.manufactureYear,
        vehicleColor: dto.vehicleColor,
        fastagNumber: dto.fastagNumber,
        odometerKm: dto.odometerKm,
        emergencyContact: dto.emergencyContact,
        remarks: dto.remarks,
        registrationDate: dto.registrationDate,
        insuranceNumber: dto.insuranceNumber,
        insuranceExpiry: dto.insuranceExpiry,
        fitnessCertificateNumber: dto.fitnessCertificateNumber,
        fitnessExpiry: dto.fitnessExpiry,
        pucNumber: dto.pucNumber,
        pucExpiry: dto.pucExpiry,
        permitType: dto.permitType,
        permitNumber: dto.permitNumber,
        permitExpiry: dto.permitExpiry,
        roadTaxStatus: dto.roadTaxStatus,
        roadTaxExpiry: dto.roadTaxExpiry,
        gpsEnabled: dto.gpsEnabled,
        gpsDeviceId: dto.gpsDeviceId,
        assignedDriverId: dto.assignedDriverId,
        warehouseHubId: dto.warehouseHubId,
        createdBy: actor,
      },
      { forceHubId: hubId },
    );
  }

  async update(
    hubId: string,
    id: string,
    dto: HubVehicleUpdateDto,
    actor?: string,
  ) {
    return this.vehiclesService.update(
      id,
      {
        registration: dto.registration,
        capacity: dto.capacity,
        payloadKg: dto.payloadKg,
        vehicleType: dto.vehicleType,
        vehicleCategory: dto.vehicleCategory,
        fuelType: dto.fuelType,
        manufacturer: dto.manufacturer,
        model: dto.model,
        manufactureYear: dto.manufactureYear,
        vehicleColor: dto.vehicleColor,
        fastagNumber: dto.fastagNumber,
        odometerKm: dto.odometerKm,
        emergencyContact: dto.emergencyContact,
        remarks: dto.remarks,
        registrationDate: dto.registrationDate,
        insuranceNumber: dto.insuranceNumber,
        insuranceExpiry: dto.insuranceExpiry,
        fitnessCertificateNumber: dto.fitnessCertificateNumber,
        fitnessExpiry: dto.fitnessExpiry,
        pucNumber: dto.pucNumber,
        pucExpiry: dto.pucExpiry,
        permitType: dto.permitType,
        permitNumber: dto.permitNumber,
        permitExpiry: dto.permitExpiry,
        roadTaxStatus: dto.roadTaxStatus,
        roadTaxExpiry: dto.roadTaxExpiry,
        gpsEnabled: dto.gpsEnabled,
        gpsDeviceId: dto.gpsDeviceId,
        assignedDriverId: dto.assignedDriverId,
        status: dto.status as VehicleStatus | undefined,
        isActive: dto.isActive,
        updatedBy: actor,
      },
      { hubScope: hubId, allowHubChange: false },
    );
  }

  async remove(hubId: string, id: string, actor?: string) {
    return this.vehiclesService.softDelete(id, { hubScope: hubId, actor });
  }

  async stats(hubId: string) {
    return this.vehiclesService.getStats({ hubId });
  }

  async dispatchHistory(hubId: string, id: string) {
    return this.vehiclesService.getDispatchHistory(id, hubId);
  }

  async createDocumentUploadUrl(
    hubId: string,
    id: string,
    dto: VehicleDocumentUploadUrlDto,
  ) {
    return this.vehiclesService.createDocumentUploadUrl(id, dto, hubId);
  }

  async confirmDocument(
    hubId: string,
    id: string,
    dto: VehicleDocumentConfirmDto,
    actor?: string,
  ) {
    return this.vehiclesService.confirmDocument(id, dto, actor, hubId);
  }

  async listDocuments(hubId: string, id: string) {
    return this.vehiclesService.listDocuments(id, hubId);
  }

  async deleteDocument(hubId: string, vehicleId: string, documentId: string) {
    return this.vehiclesService.deleteDocument(vehicleId, documentId, hubId);
  }
}
