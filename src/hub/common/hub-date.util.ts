export function getTodayRange(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function generateDispatchNo(): string {
  const suffix = Date.now().toString().slice(-8);
  return `DSP-${suffix}`;
}
