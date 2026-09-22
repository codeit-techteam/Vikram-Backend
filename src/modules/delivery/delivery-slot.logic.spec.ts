import {
  addDateKeyDays,
  generateScheduleWindows,
  isDeliveryHoliday,
  isoWeekdayFromDateKey,
  nextAvailableDeliveryDate,
  resolveEffectiveHours,
  resolveHubHours,
  resolveLeadMinutes,
  sanitizeDeliveryRemark,
  slotMatchesPreference,
  validateSlotAgainstOperatingRules,
  buildDurationSlots,
} from './delivery-slot.logic';
import { DEFAULT_DELIVERY_OPERATING_CONFIG } from './delivery-preference.constants';

describe('delivery-slot.logic operating rules', () => {
  const operating = DEFAULT_DELIVERY_OPERATING_CONFIG;
  const hours = resolveEffectiveHours(
    resolveHubHours({ openMinutes: 9 * 60, closeMinutes: 21 * 60 }),
    operating,
  );

  it('generates 30-minute slots from 11:00 to 16:30', () => {
    const slots = buildDurationSlots(hours, 30);
    expect(slots[0]).toEqual({ startMinutes: 11 * 60, endMinutes: 11 * 60 + 30 });
    expect(slots[slots.length - 1]).toEqual({
      startMinutes: 16 * 60,
      endMinutes: 16 * 60 + 30,
    });
    expect(slots).toHaveLength(11);
  });

  it('rejects Sunday as delivery holiday', () => {
    // 2026-09-20 is Sunday
    expect(isoWeekdayFromDateKey('2026-09-20')).toBe(7);
    expect(isDeliveryHoliday('2026-09-20', operating).isHoliday).toBe(true);
    expect(isDeliveryHoliday('2026-09-19', operating).isHoliday).toBe(false); // Sat
    expect(isDeliveryHoliday('2026-09-21', operating).isHoliday).toBe(false); // Mon
  });

  it('skips Sunday when generating schedule windows', () => {
    // 2026-09-19 is Saturday
    const windows = generateScheduleWindows({
      todayKey: '2026-09-19',
      nowMinutes: 10 * 60,
      hours,
      leadMinutes: 0,
      operating,
      horizonDays: 3,
    });
    const sunday = windows.scheduled.find((d) => d.dateKey === '2026-09-20');
    expect(sunday?.isHoliday).toBe(true);
    expect(sunday?.slots).toHaveLength(0);
    expect(windows.tomorrow).toHaveLength(0); // tomorrow = Sunday
    const monday = windows.scheduled.find((d) => d.dateKey === '2026-09-21');
    expect(monday?.isHoliday).toBe(false);
    expect(monday?.slots.length).toBeGreaterThan(0);
  });

  it('handles tomorrow-is-Sunday by surfacing holiday + next date', () => {
    const windows = generateScheduleWindows({
      todayKey: '2026-09-19',
      nowMinutes: 12 * 60,
      hours,
      leadMinutes: 0,
      operating,
    });
    expect(windows.tomorrow).toHaveLength(0);
    expect(nextAvailableDeliveryDate('2026-09-20', operating)).toBe(
      '2026-09-21',
    );
  });

  it('boundary: 10:59 rejected, 11:00 accepted, 16:30 boundary accepted, 16:31 rejected', () => {
    expect(
      validateSlotAgainstOperatingRules({
        dateKey: '2026-09-22',
        startMinutes: 10 * 60 + 59,
        endMinutes: 11 * 60 + 29,
        operating,
      }),
    ).toBe('DELIVERY_SLOT_UNAVAILABLE');

    expect(
      validateSlotAgainstOperatingRules({
        dateKey: '2026-09-22',
        startMinutes: 11 * 60,
        endMinutes: 11 * 60 + 30,
        operating,
      }),
    ).toBeNull();

    expect(
      validateSlotAgainstOperatingRules({
        dateKey: '2026-09-22',
        startMinutes: 11 * 60 + 1,
        endMinutes: 11 * 60 + 31,
        operating,
      }),
    ).toBe('DELIVERY_SLOT_UNAVAILABLE');

    expect(
      validateSlotAgainstOperatingRules({
        dateKey: '2026-09-22',
        startMinutes: 16 * 60,
        endMinutes: 16 * 60 + 30,
        operating,
      }),
    ).toBeNull();

    expect(
      validateSlotAgainstOperatingRules({
        dateKey: '2026-09-22',
        startMinutes: 16 * 60 + 1,
        endMinutes: 16 * 60 + 31,
        operating,
      }),
    ).toBe('DELIVERY_SLOT_UNAVAILABLE');

    expect(
      validateSlotAgainstOperatingRules({
        dateKey: '2026-09-22',
        startMinutes: 16 * 60 + 30,
        endMinutes: 17 * 60,
        operating,
      }),
    ).toBe('DELIVERY_SLOT_UNAVAILABLE');
  });

  it('rejects Sunday slots via validateSlotAgainstOperatingRules', () => {
    expect(
      validateSlotAgainstOperatingRules({
        dateKey: '2026-09-20',
        startMinutes: 11 * 60,
        endMinutes: 11 * 60 + 30,
        operating,
      }),
    ).toBe('DELIVERY_SLOT_UNAVAILABLE');
  });

  it('clips expired same-day slots using lead time', () => {
    const windows = generateScheduleWindows({
      todayKey: '2026-09-22', // Tuesday
      nowMinutes: 15 * 60 + 30,
      hours,
      leadMinutes: 60,
      operating,
    });
    expect(
      windows.today.every((slot) => slot.startMinutes >= 16 * 60 + 30),
    ).toBe(true);
  });

  it('uses a longer RMC lead time', () => {
    expect(
      resolveLeadMinutes({ isRmc: true, etaMinMinutes: 40 }),
    ).toBeGreaterThanOrEqual(90);
    expect(resolveLeadMinutes({ isRmc: false, etaMinMinutes: 40 })).toBe(40);
  });

  it('sanitizes delivery remarks', () => {
    expect(
      sanitizeDeliveryRemark('  Call before arriving <script>x</script> '),
    ).toBe('Call before arriving x');
    expect(sanitizeDeliveryRemark('a'.repeat(300))?.length).toBe(250);
  });

  it('matches preference to slot date', () => {
    expect(
      slotMatchesPreference({
        type: 'TOMORROW',
        slotDateKey: addDateKeyDays('2026-09-22', 1),
        todayKey: '2026-09-22',
      }),
    ).toBe(true);
    expect(
      slotMatchesPreference({
        type: 'TODAY',
        slotDateKey: '2026-09-23',
        todayKey: '2026-09-22',
      }),
    ).toBe(false);
  });
});
