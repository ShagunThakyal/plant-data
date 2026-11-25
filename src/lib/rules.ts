// Every reporting rule that is a number or a setting, in one place, so it is easy to find and tune.
// What each one means and why: DECISIONS.md.

/** The first month plants report: April 2026, the start of FY 2026-27. */
export const FIRST_REPORTABLE_PERIOD = "2026-04";

/** Months end, and fall due, in India time. Every plant is in India. */
export const REPORTING_TIME_ZONE = "Asia/Kolkata";

/** A month not yet submitted is overdue after this day of the following month. */
export const DUE_DAY_OF_NEXT_MONTH = 10;
