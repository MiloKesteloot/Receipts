/**
 * Picks round y-axis tick values from 0 up to at least `maxValue`
 * (steps of 1, 2, or 5 times a power of ten).
 * @param maxValue Largest value the axis must show (must be >= 0)
 * @param targetCount Roughly how many steps to use above 0
 * @returns Ascending tick values starting at 0
 */
export function niceTicks(maxValue: number, targetCount = 4): number[] {
  if (!(maxValue > 0)) return [0, 1];
  const rawStep = maxValue / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const multiplier =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = multiplier * magnitude;
  const top = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) {
    ticks.push(Math.round(value));
  }
  return ticks;
}

/**
 * Formats cents for an axis label: whole dollars when possible, `k` above
 * $1,000. Example: `250000` -> `"$2.5k"`, `4000` -> `"$40"`.
 * @param cents Amount in cents
 * @returns Compact dollar label
 */
export function formatAxisDollars(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1000) {
    const thousands = dollars / 1000;
    return `$${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`;
  }
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/**
 * Days since the Unix epoch for a `YYYY-MM-DD` key, for spacing dates on a
 * time axis.
 * @param dayKey Day key such as `"2026-11-03"`
 * @returns Whole day number
 */
export function dayNumber(dayKey: string): number {
  const [year, month, day] = dayKey.split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}
