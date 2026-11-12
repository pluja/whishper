const MICROS_PER_DOLLAR = 1_000_000;
const MICROSECONDS_PER_MINUTE = 60_000_000;
// Prices above this per minute of audio are a typo, not a real offer.
export const MAX_PRICE_MICROS_PER_MINUTE = 100 * MICROS_PER_DOLLAR;

const wholeCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const smallAmount = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumSignificantDigits: 2,
});

// Speech APIs charge fractions of a cent per minute, so small amounts keep
// their first significant digits instead of rounding to $0.00.
export function formatUsd(micros: number): string {
  const dollars = micros / MICROS_PER_DOLLAR;
  if (dollars === 0 || dollars >= 0.01) return wholeCents.format(dollars);
  return smallAmount.format(dollars);
}

export function formatPricePerMinute(micros: number): string {
  return `${formatUsd(micros)} per minute`;
}

export function priceForDuration(
  priceMicrosPerMinute: number,
  durationUs: number,
): number {
  return Math.round(
    (priceMicrosPerMinute * durationUs) / MICROSECONDS_PER_MINUTE,
  );
}

// Reads a dollar amount such as "0.006" or "$0.006". Empty means no price.
export function parseUsdMicros(input: string): number | null | undefined {
  const text = input.trim().replace(/^\$/, "").trim();
  if (text === "") return null;
  if (!/^\d+(\.\d+)?$/.test(text)) return undefined;
  return Math.round(Number(text) * MICROS_PER_DOLLAR);
}

export function microsToUsdInput(micros: number | null): string {
  if (micros === null) return "";
  return String(micros / MICROS_PER_DOLLAR);
}
