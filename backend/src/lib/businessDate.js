const UTC_MINUS_3_OFFSET_HOURS = -3;
const UTC_MINUS_3_NOON_IN_UTC_HOUR = 12 - UTC_MINUS_3_OFFSET_HOURS;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function toBusinessDateAtNoon(input = new Date()) {
  const sourceDate = input instanceof Date ? input : new Date(input);
  const shiftedToUtcMinus3 = new Date(
    sourceDate.getTime() + UTC_MINUS_3_OFFSET_HOURS * 60 * 60 * 1000,
  );

  return new Date(
    Date.UTC(
      shiftedToUtcMinus3.getUTCFullYear(),
      shiftedToUtcMinus3.getUTCMonth(),
      shiftedToUtcMinus3.getUTCDate(),
      UTC_MINUS_3_NOON_IN_UTC_HOUR,
      0,
      0,
      0,
    ),
  );
}

export function toBusinessDateIsoString(input = new Date()) {
  const businessDateAtNoonUtc = toBusinessDateAtNoon(input);
  const shiftedBackToUtcMinus3 = new Date(
    businessDateAtNoonUtc.getTime() + UTC_MINUS_3_OFFSET_HOURS * 60 * 60 * 1000,
  );

  const year = shiftedBackToUtcMinus3.getUTCFullYear();
  const month = String(shiftedBackToUtcMinus3.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shiftedBackToUtcMinus3.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}T12:00:00-03:00`;
}

export function toBusinessDateDateOnlyString(input = new Date()) {
  return toBusinessDateIsoString(input).slice(0, 10);
}

export function shiftBusinessDateDays(input = new Date(), dayOffset = 0) {
  const businessDate = toBusinessDateAtNoon(input);
  const shifted = new Date(businessDate.getTime() + dayOffset * DAY_IN_MS);
  return toBusinessDateAtNoon(shifted);
}

export function parseDateOnlyToBusinessDate(dateOnly) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateOnly));

  if (!match) {
    throw new Error("Expected date in format YYYY-MM-DD");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const dateAtUtcNoonForUtcMinus3 = new Date(
    Date.UTC(year, month - 1, day, UTC_MINUS_3_NOON_IN_UTC_HOUR, 0, 0, 0),
  );

  if (
    dateAtUtcNoonForUtcMinus3.getUTCFullYear() !== year ||
    dateAtUtcNoonForUtcMinus3.getUTCMonth() !== month - 1 ||
    dateAtUtcNoonForUtcMinus3.getUTCDate() !== day
  ) {
    throw new Error("Invalid calendar date");
  }

  return dateAtUtcNoonForUtcMinus3;
}
