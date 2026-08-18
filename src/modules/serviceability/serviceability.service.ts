import { Injectable, Logger } from '@nestjs/common';
import { CoverageService } from '../coverage/coverage.service';
import { HUB_ASSIGNMENT_REASON_LABELS } from '../coverage/hub-routing.logic';
import type { ServiceabilityCheckResponseDto } from './dto/serviceability-check.dto';

const CUSTOMER_UNAVAILABLE =
  "We don't currently have a Hub serving this location.";
const CUSTOMER_LOCATION_REQUIRED =
  'We need your delivery location to check availability.';

@Injectable()
export class ServiceabilityService {
  private readonly logger = new Logger(ServiceabilityService.name);

  constructor(private readonly coverageService: CoverageService) {}

  async check(
    latitude: number,
    longitude: number,
  ): Promise<ServiceabilityCheckResponseDto> {
    const decision = await this.coverageService.routeOrder({
      latitude,
      longitude,
    });

    const eligible = decision.nearestEligibleHub;
    if (eligible) {
      return {
        serviceable: true,
        deliveryETA: 0,
        deliveryMessage: 'Delivery available to your location',
        reason: `Delivering from ${eligible.name}`,
        hubName: eligible.name,
      };
    }

    const customerReason =
      decision.reason === 'LOCATION_MISSING' ||
      decision.reason === 'LOCATION_INVALID'
        ? CUSTOMER_LOCATION_REQUIRED
        : CUSTOMER_UNAVAILABLE;

    this.logger.debug(
      [
        'SERVICEABILITY',
        `Customer: ${decision.customerLatitude ?? 'n/a'}, ${decision.customerLongitude ?? 'n/a'}`,
        `Nearest: ${decision.nearestHub?.name ?? 'none'}`,
        `Distance: ${decision.snapshot.nearestDistanceKm ?? 'n/a'} km`,
        `Radius: ${decision.snapshot.nearestHubRadiusKm ?? 'n/a'} km`,
        `Reason: ${decision.reason}`,
      ].join(' | '),
    );

    return {
      serviceable: false,
      deliveryETA: 0,
      deliveryMessage: customerReason,
      reason: customerReason,
      hubName: undefined,
    };
  }

  static adminReasonLabel(reason: string | null | undefined): string | null {
    if (!reason) return null;
    return (
      HUB_ASSIGNMENT_REASON_LABELS[
        reason as keyof typeof HUB_ASSIGNMENT_REASON_LABELS
      ] ?? reason
    );
  }
}
