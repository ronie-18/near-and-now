/**
 * Calendar date in India (IST, UTC+05:30, no daylight saving).
 *
 * The API runs on Vercel in UTC, so `toISOString().slice(0, 10)` and
 * `getDate()` give the UTC day: an order placed between 00:00 and 05:29 IST
 * came out dated the previous day — on the GST invoice (sometimes the previous
 * tax month) and in the order code. Every date a customer, store or tax
 * document sees is an Indian date. (2026-10-27)
 */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** `YYYY-MM-DD` of `at` in IST. */
export function istDateString(at: Date | string | number = new Date()): string {
  return new Date(new Date(at).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
