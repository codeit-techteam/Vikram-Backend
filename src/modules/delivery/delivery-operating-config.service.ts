import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import {
  DEFAULT_DELIVERY_OPERATING_CONFIG,
  type DeliveryOperatingConfigValues,
} from './delivery-preference.constants';

export type UpdateDeliveryOperatingConfigInput = Partial<{
  timezone: string;
  openMinutes: number;
  closeMinutes: number;
  slotDurationMinutes: number;
  workingWeekdays: number[];
  holidayDates: string[];
}> & {
  updatedBy?: string;
  updatedByName?: string;
};

@Injectable()
export class DeliveryOperatingConfigService {
  private cache: {
    value: DeliveryOperatingConfigValues;
    expiresAt: number;
  } | null = null;

  private readonly cacheTtlMs = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  invalidateCache() {
    this.cache = null;
  }

  async getConfig(): Promise<DeliveryOperatingConfigValues> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.value;
    }
    const row = await this.prisma.deliveryOperatingConfig.findUnique({
      where: { configKey: 'DEFAULT' },
    });
    const value = row
      ? this.mapRow(row)
      : { ...DEFAULT_DELIVERY_OPERATING_CONFIG };
    this.cache = { value, expiresAt: now + this.cacheTtlMs };
    return value;
  }

  async ensureDefault(): Promise<DeliveryOperatingConfigValues> {
    const existing = await this.prisma.deliveryOperatingConfig.findUnique({
      where: { configKey: 'DEFAULT' },
    });
    if (existing) return this.mapRow(existing);
    const created = await this.prisma.deliveryOperatingConfig.create({
      data: {
        configKey: 'DEFAULT',
        timezone: DEFAULT_DELIVERY_OPERATING_CONFIG.timezone,
        openMinutes: DEFAULT_DELIVERY_OPERATING_CONFIG.openMinutes,
        closeMinutes: DEFAULT_DELIVERY_OPERATING_CONFIG.closeMinutes,
        slotDurationMinutes:
          DEFAULT_DELIVERY_OPERATING_CONFIG.slotDurationMinutes,
        workingWeekdays: [
          ...DEFAULT_DELIVERY_OPERATING_CONFIG.workingWeekdays,
        ],
        holidayDates: [],
      },
    });
    this.invalidateCache();
    return this.mapRow(created);
  }

  async updateConfig(
    input: UpdateDeliveryOperatingConfigInput,
  ): Promise<DeliveryOperatingConfigValues> {
    await this.ensureDefault();
    const data: Record<string, unknown> = {};
    if (input.timezone != null) data.timezone = input.timezone;
    if (input.openMinutes != null) data.openMinutes = input.openMinutes;
    if (input.closeMinutes != null) data.closeMinutes = input.closeMinutes;
    if (input.slotDurationMinutes != null) {
      data.slotDurationMinutes = input.slotDurationMinutes;
    }
    if (input.workingWeekdays != null) {
      data.workingWeekdays = input.workingWeekdays;
    }
    if (input.holidayDates != null) {
      data.holidayDates = [
        ...new Set(
          input.holidayDates
            .map((d) => d.trim())
            .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
        ),
      ].sort();
    }
    if (input.updatedBy != null) data.updatedBy = input.updatedBy;
    if (input.updatedByName != null) data.updatedByName = input.updatedByName;

    const updated = await this.prisma.deliveryOperatingConfig.update({
      where: { configKey: 'DEFAULT' },
      data,
    });
    this.invalidateCache();
    return this.mapRow(updated);
  }

  private mapRow(row: {
    timezone: string;
    openMinutes: number;
    closeMinutes: number;
    slotDurationMinutes: number;
    workingWeekdays: number[];
    holidayDates: string[];
  }): DeliveryOperatingConfigValues {
    return {
      timezone: row.timezone || DEFAULT_DELIVERY_OPERATING_CONFIG.timezone,
      openMinutes: row.openMinutes,
      closeMinutes: row.closeMinutes,
      slotDurationMinutes: row.slotDurationMinutes,
      workingWeekdays:
        row.workingWeekdays?.length > 0
          ? [...row.workingWeekdays]
          : [...DEFAULT_DELIVERY_OPERATING_CONFIG.workingWeekdays],
      holidayDates: [...(row.holidayDates ?? [])],
    };
  }
}
