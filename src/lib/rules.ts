// Every reporting rule that is a number or a setting, in one place, so it is easy to find and tune.
// What each one means and why: DECISIONS.md.

/** The first month plants report: April 2026, the start of FY 2026-27. */
export const FIRST_REPORTABLE_PERIOD = "2026-04";

/** Months end, and fall due, in India time. Every plant is in India. */
export const REPORTING_TIME_ZONE = "Asia/Kolkata";

/** A month not yet submitted is overdue after this day of the following month. */
export const DUE_DAY_OF_NEXT_MONTH = 10;

// Anomaly flags: warnings for the owner and the reviewer. They never block a submission. DECISIONS.md, section 6.

/** (a) A line differing from last month's approved value by more than this share is flagged. */
export const BIG_CHANGE_SHARE = 0.3;

/**
 * (b) Grid power per tonne of clinker outside this range (kWh per tonne), at integrated plants. Whole-plant
 * power on a clinker basis; why 50-150 is in DECISIONS.md. Source: GCCA GNR (about 70 kWh/t clinker up to
 * clinker, about 104 kWh/t cement for the whole plant) and CII Energy Benchmarking for the Indian Cement Industry.
 */
export const POWER_PER_TONNE_CLINKER_KWH = { min: 50, max: 150 } as const;

/** (b) Clinker in a month above this share of the plant's cement capacity for a month (capacity / 12). */
export const CLINKER_SHARE_OF_MONTHLY_CAPACITY = 1;
