import { describe, expect, it } from "vitest";

import {
	currentPeriod,
	dueDate,
	formatPeriod,
	isPastDue,
	isReportablePeriod,
	periodSchema,
	previousPeriod,
	reportablePeriods,
} from "@/lib/period";

// India is UTC+5:30, so midnight on 1 November in India is 18:30 UTC on 31 October.
const LAST_SECOND_OF_OCTOBER_IN_INDIA = new Date("2026-10-31T18:29:59Z");
const FIRST_SECOND_OF_NOVEMBER_IN_INDIA = new Date("2026-10-31T18:30:00Z");

describe("periodSchema", () => {
	it("accepts YYYY-MM with a month from 01 to 12", () => {
		for (const period of ["2026-01", "2026-10", "2026-12"]) {
			expect(periodSchema.safeParse(period).success).toBe(true);
		}
	});

	it("refuses anything else", () => {
		for (const period of ["2026-00", "2026-13", "2026-1", "26-10", "2026/10", " 2026-10", "2026-10-01", ""]) {
			expect(periodSchema.safeParse(period).success, period).toBe(false);
		}
	});
});

describe("currentPeriod", () => {
	it("changes month at midnight in India, not in UTC", () => {
		expect(currentPeriod(LAST_SECOND_OF_OCTOBER_IN_INDIA)).toBe("2026-10");
		expect(currentPeriod(FIRST_SECOND_OF_NOVEMBER_IN_INDIA)).toBe("2026-11");
	});
});

describe("isReportablePeriod", () => {
	it("allows a month only once it has ended in India", () => {
		expect(isReportablePeriod("2026-10", LAST_SECOND_OF_OCTOBER_IN_INDIA)).toBe(false);
		expect(isReportablePeriod("2026-10", FIRST_SECOND_OF_NOVEMBER_IN_INDIA)).toBe(true);
	});

	it("starts at April 2026", () => {
		const now = new Date("2026-11-26T06:00:00Z");
		expect(isReportablePeriod("2026-03", now)).toBe(false);
		expect(isReportablePeriod("2026-04", now)).toBe(true);
	});

	it("refuses the current month, future months and badly written ones", () => {
		const now = new Date("2026-11-26T06:00:00Z");
		expect(isReportablePeriod("2026-11", now)).toBe(false);
		expect(isReportablePeriod("2027-01", now)).toBe(false);
		expect(isReportablePeriod("2026-7", now)).toBe(false);
	});
});

describe("reportablePeriods", () => {
	it("lists every ended month from April 2026, newest first", () => {
		expect(reportablePeriods(new Date("2026-11-26T06:00:00Z"))).toEqual([
			"2026-10",
			"2026-09",
			"2026-08",
			"2026-07",
			"2026-06",
			"2026-05",
			"2026-04",
		]);
	});

	it("is empty before the first month has ended", () => {
		expect(reportablePeriods(new Date("2026-04-15T06:00:00Z"))).toEqual([]);
	});
});

describe("previousPeriod", () => {
	it("crosses the year", () => {
		expect(previousPeriod("2027-01")).toBe("2026-12");
		expect(previousPeriod("2026-10")).toBe("2026-09");
	});
});

describe("due dates", () => {
	it("falls on the 10th of the next month, across the year", () => {
		expect(dueDate("2026-10")).toBe("2026-11-10");
		expect(dueDate("2026-12")).toBe("2027-01-10");
	});

	it("is past due from the 11th in India", () => {
		expect(isPastDue("2026-10", new Date("2026-11-10T18:29:59Z"))).toBe(false);
		expect(isPastDue("2026-10", new Date("2026-11-10T18:30:00Z"))).toBe(true);
	});
});

describe("formatPeriod", () => {
	it("writes the month in words", () => {
		expect(formatPeriod("2026-10")).toBe("October 2026");
		expect(formatPeriod("2027-01")).toBe("January 2027");
	});
});
