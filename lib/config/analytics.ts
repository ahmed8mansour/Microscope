// Fixed reporting timezone for all admin revenue/analytics window boundaries
// ("today", "this month", per-day grouping). A single declared timezone
// keeps these figures stable and reconcilable rather than depending on the
// server's or a browser's local time (spec edge case "Revenue period
// boundaries"; research R6).
export const REPORTING_TIMEZONE = 'Australia/Melbourne';
