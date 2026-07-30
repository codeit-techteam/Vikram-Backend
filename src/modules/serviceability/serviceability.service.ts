import { Injectable, Logger } from '@nestjs/common';
import { EntityStatus } from '../../../generated/prisma/client';
import {
  buildDeliveryMessage,
  buildDeliverySubtitle,
} from '../../common/delivery/customer-delivery.util';
import { PrismaService } from '../../common/database/prisma.service';
import {
  decimalToNumber,
  haversineKm,
} from '../../common/shopping/pricing.util';
import type { ServiceabilityCheckResponseDto } from './dto/serviceability-check.dto';

/** ETA formula constants — aligned with DeliveryService */
const PICKING_MINUTES = 5;
const PACKING_MINUTES = 5;
const LOADING_MINUTES = 5;
const AVG_VEHICLE_SPEED_KMH = 25;
const TRAFFIC_MULTIPLIER = 1.25;
const TRAFFIC_BUFFER_MINUTES = 3;

type HubCandidate = {
  id: string;
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  distanceKm: number;
  isActive: boolean;
  status: EntityStatus;
};

@Injectable()
export class ServiceabilityService {
  private readonly logger = new Logger(ServiceabilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(
    latitude: number,
    longitude: number,
  ): Promise<ServiceabilityCheckResponseDto> {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return {
        serviceable: false,
        deliveryETA: 0,
        deliveryMessage: buildDeliveryMessage(0, { serviceable: false }),
        reason: 'Valid latitude and longitude are required',
      };
    }

    const hubs = await this.prisma.hub.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        latitude: true,
        longitude: true,
        serviceRadiusKm: true,
        isActive: true,
        status: true,
      },
    });

    if (hubs.length === 0) {
      this.logDebug(latitude, longitude, null, 'No hubs configured');
      return {
        serviceable: false,
        deliveryETA: 0,
        deliveryMessage: buildDeliveryMessage(0, { serviceable: false }),
        reason: 'Delivery is not available in your area yet',
      };
    }

    const candidates: HubCandidate[] = hubs
      .map((hub) => {
        const hubLat = decimalToNumber(hub.latitude);
        const hubLng = decimalToNumber(hub.longitude);
        const radiusKm = decimalToNumber(hub.serviceRadiusKm) || 15;
        const distanceKm = haversineKm(latitude, longitude, hubLat, hubLng);

        return {
          id: hub.id,
          code: hub.code,
          name: hub.name,
          latitude: hubLat,
          longitude: hubLng,
          radiusKm,
          distanceKm: Math.round(distanceKm * 100) / 100,
          isActive: hub.isActive,
          status: hub.status,
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const nearest = candidates[0] ?? null;

    const covering = candidates.filter(
      (hub) =>
        hub.isActive &&
        hub.status === EntityStatus.ACTIVE &&
        hub.distanceKm <= hub.radiusKm,
    );

    const matched = covering[0] ?? null;

    if (!matched) {
      const reason = nearest
        ? nearest.distanceKm > nearest.radiusKm
          ? 'Delivery is not available at this location yet'
          : !nearest.isActive || nearest.status !== EntityStatus.ACTIVE
            ? 'Delivery is temporarily unavailable in your area'
            : 'Delivery is not available at this location yet'
        : 'Delivery is not available in your area yet';

      this.logDebug(latitude, longitude, nearest, reason);

      return {
        serviceable: false,
        deliveryETA: 0,
        deliveryMessage: buildDeliveryMessage(0, { serviceable: false }),
        reason,
      };
    }

    const eta = this.computeEtaMinutes(matched);
    this.logDebug(latitude, longitude, matched, 'SERVICEABLE');

    return {
      serviceable: true,
      deliveryETA: eta,
      deliveryMessage: buildDeliveryMessage(eta, { serviceable: true }),
      reason: buildDeliverySubtitle(true),
    };
  }

  private computeEtaMinutes(hub: HubCandidate): number {
    const travelMinutes = Math.max(
      1,
      Math.ceil(
        (hub.distanceKm / AVG_VEHICLE_SPEED_KMH) * 60 * TRAFFIC_MULTIPLIER,
      ),
    );
    return (
      PICKING_MINUTES +
      PACKING_MINUTES +
      LOADING_MINUTES +
      travelMinutes +
      TRAFFIC_BUFFER_MINUTES
    );
  }

  private logDebug(
    customerLat: number,
    customerLng: number,
    hub: HubCandidate | null,
    result: string,
  ): void {
    if (hub) {
      this.logger.debug(
        [
          'Serviceability check',
          `Customer: ${customerLat}, ${customerLng}`,
          `Hub: ${hub.name} (${hub.latitude}, ${hub.longitude})`,
          `Distance: ${hub.distanceKm} km`,
          `Coverage Radius: ${hub.radiusKm} km`,
          `Operational: ${hub.isActive && hub.status === EntityStatus.ACTIVE}`,
          `Result: ${result}`,
        ].join(' | '),
      );
    } else {
      this.logger.debug(
        `Serviceability check | Customer: ${customerLat}, ${customerLng} | Result: ${result}`,
      );
    }
  }
}
