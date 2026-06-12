// Formatting helpers — locale ka-GE, currency GEL (₾) for orders / USD ($) for
// Meta Ads, timestamps in Asia/Tbilisi (GMT+4). Never mix currencies.

const LOCALE = "ka-GE";
const TBILISI_TZ = "Asia/Tbilisi";

export function formatGEL(amount: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: "GEL",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(value: number): string {
  return value.toLocaleString(LOCALE);
}

/** Whole-lari amount for large stats — no decimal noise. */
export function formatGEL0(amount: number): string {
  return `₾${Math.round(amount).toLocaleString(LOCALE)}`;
}

/** Whole-dollar amount for large stats — no decimal noise. */
export function formatUSD0(amount: number): string {
  return `$${Math.round(amount).toLocaleString(LOCALE)}`;
}

export function formatPercent(fraction: number, digits = 1): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(fraction);
}

/** Render a date/time in Asia/Tbilisi (GMT+4). */
export function tbilisiTime(input: string | number | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TBILISI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function tbilisiDate(input: string | number | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TBILISI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
