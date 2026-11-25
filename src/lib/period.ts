import { z } from "zod";

import { DUE_DAY_OF_NEXT_MONTH, FIRST_REPORTABLE_PERIOD, REPORTING_TIME_ZONE } from "@/lib/rules";

// A period is a month written "YYYY-MM". Periods sort as strings, so comparing them compares months.

export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const periodSchema = z.string().regex(PERIOD_PATTERN, "Choose a month, written as YYYY-MM.");

/** A month a plant can report: well formed, from the first reportable month, and already ended. */
export const reportablePeriodSchema = periodSchema.refine((period) => isReportablePeriod(period, new Date()), {
	message: "You can only report a month that has ended, from April 2026 on.",
});

const indiaDate = new Intl.DateTimeFormat("en-CA", {
	timeZone: REPORTING_TIME_ZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

/** Today's date in India: "2026-11-26". */
function todayInIndia(now: Date): string {
	// The en-CA locale writes dates as YYYY-MM-DD.
	return indiaDate.format(now);
}

/** The month it is now in India: "2026-11". */
export function currentPeriod(now: Date): string {
	return todayInIndia(now).slice(0, 7);
}

function shiftPeriod(period: string, months: number): string {
	const [year, month] = period.split("-").map(Number);
	const index = year * 12 + (month - 1) + months;
	return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function previousPeriod(period: string): string {
	return shiftPeriod(period, -1);
}

export function isReportablePeriod(period: string, now: Date): boolean {
	return PERIOD_PATTERN.test(period) && period >= FIRST_REPORTABLE_PERIOD && period < currentPeriod(now);
}

/** Every month a plant can report now, newest first. */
export function reportablePeriods(now: Date): string[] {
	const periods: string[] = [];
	for (
		let period = previousPeriod(currentPeriod(now));
		period >= FIRST_REPORTABLE_PERIOD;
		period = previousPeriod(period)
	) {
		periods.push(period);
	}
	return periods;
}

/** The last day to submit a month: "2026-11-10" for October 2026. */
export function dueDate(period: string): string {
	return `${shiftPeriod(period, 1)}-${String(DUE_DAY_OF_NEXT_MONTH).padStart(2, "0")}`;
}

/** True once the due date has passed in India. Whether the month was submitted is for the caller to check. */
export function isPastDue(period: string, now: Date): boolean {
	return todayInIndia(now) > dueDate(period);
}

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

/** "October 2026" */
export function formatPeriod(period: string): string {
	const [year, month] = period.split("-").map(Number);
	return `${MONTH_NAMES[month - 1]} ${year}`;
}
