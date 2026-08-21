import {
  addDateKeyDays,
  generateScheduleWindows,
  resolveHubHours,
  resolveLeadMinutes,
  sanitizeDeliveryRemark,
  slotMatchesPreference,
} from './delivery-slot.logic';

describe('delivery-slot.logic', () => {
  it('clips expired same-day windows using lead time', () => {
    const hours = resolveHubHours({
      openMinutes: 9 * 60,
      closeMinutes: 21 * 60,
    });
    const windows = generateScheduleWindows({
      todayKey: '2026-08-18',
      nowMinutes: 17 * 60 + 30,
      hours,
      leadMinutes: 90,
    });
    expect(windows.today.every((slot) => slot.startMinutes >= 18 * 60)).toBe(
      true,
    );
    expect(windows.tomorrow.length).toBeGreaterThan(0);
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
        slotDateKey: addDateKeyDays('2026-08-18', 1),
        todayKey: '2026-08-18',
      }),
    ).toBe(true);
    expect(
      slotMatchesPreference({
        type: 'TODAY',
        slotDateKey: '2026-08-19',
        todayKey: '2026-08-18',
      }),
    ).toBe(false);
  });
});
