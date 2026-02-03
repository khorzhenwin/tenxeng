export function getDateKeyForTimezone(timezone: string, date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Unable to compute date key.");
  }

  return `${year}${month}${day}`;
}

export function getDatePartsForTimezone(timezone: string, date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  if (!year || !month || !day) {
    throw new Error("Unable to compute date parts.");
  }

  return { year, month, day };
}

export function parseDateKeyToDate(dateKey: string) {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(4, 6));
  const day = Number(dateKey.slice(6, 8));
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function getWeekStartDateKey(timezone: string, date = new Date()) {
  const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  let cursor = date;
  for (let offset = 0; offset < 7; offset += 1) {
    const weekday = weekdayFormatter.format(cursor);
    if (weekday === "Mon") {
      return getDateKeyForTimezone(timezone, cursor);
    }
    cursor = addDays(cursor, -1);
  }
  return getDateKeyForTimezone(timezone, date);
}

export function getWeekEndDateKey(timezone: string, weekStartKey: string) {
  const startDate = parseDateKeyToDate(weekStartKey);
  const endDate = addDays(startDate, 6);
  return getDateKeyForTimezone(timezone, endDate);
}

export function getMonthWeekStarts(timezone: string, date = new Date()) {
  const { year, month } = getDatePartsForTimezone(timezone, date);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weekStarts: string[] = [];
  const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });

  for (let day = 1; day <= daysInMonth; day += 1) {
    const cursor = new Date(Date.UTC(year, month - 1, day, 12));
    const parts = getDatePartsForTimezone(timezone, cursor);
    if (parts.month !== month) {
      continue;
    }
    const weekday = weekdayFormatter.format(cursor);
    if (weekday === "Mon") {
      weekStarts.push(getDateKeyForTimezone(timezone, cursor));
    }
  }

  return weekStarts;
}
