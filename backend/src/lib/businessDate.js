const UTC_MINUS_3_OFFSET_HOURS = -3;
const UTC_MINUS_3_NOON_IN_UTC_HOUR = 12 - UTC_MINUS_3_OFFSET_HOURS;

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
