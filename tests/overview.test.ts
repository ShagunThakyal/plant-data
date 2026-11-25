import { describe, expect, it } from "vitest";

import { type OverviewReportInput, buildOverview, currentFinancialYearStart } from "@/lib/overview";

const NOW = new Date("2026-11-26T06:00:00Z"); // April to October 2026 have ended.
const PLANTS = [
	{ id: "p1", code: "P01", name: "One" },
	{ id: "p2", code: "P02", name: "Two" },
];

/** 1,000 t of coal (2,441 t CO2, Scope 1) and 1,000 MWh of power (675 t CO2, Scope 2). */
function report(plantId: string, period: string, status: OverviewReportInput["status"]): OverviewReportInput {
	return {
		plantId,
		period,
		status,
		lines: [
			{ quantityInFactorUnit: 1_000, factorKgCo2PerUnit: 2_441, factorScope: 1 },
			{ quantityInFactorUnit: 1_000, factorKgCo2PerUnit: 675, factorScope: 2 },
		],
	};
}

describe("buildOverview", () => {
	it("counts only approved months, with Scope 1 and Scope 2 apart", () => {
		const overview = buildOverview(
			PLANTS,
			[report("p1", "2026-10", "APPROVED"), report("p2", "2026-10", "SUBMITTED"), report("p2", "2026-09", "RETURNED")],
			2026,
			NOW,
		);
		const october = overview.months.find((month) => month.period === "2026-10");
		expect(october).toEqual({
			period: "2026-10",
			approved: { scope1Tonnes: 2_441, scope2Tonnes: 675 },
			coverage: { approved: 1, expected: 2 },
		});
		expect(overview.yearToDate.approved).toEqual({ scope1Tonnes: 2_441, scope2Tonnes: 675 });
	});

	it("shows every plant's month, with months not yet ended as not due", () => {
		const overview = buildOverview(PLANTS, [report("p2", "2026-10", "SUBMITTED")], 2026, NOW);
		expect(overview.financialYear).toBe("FY 2026-27");
		const p2 = overview.plants[1].months;
		expect(p2.find((month) => month.period === "2026-10")?.status).toBe("SUBMITTED");
		expect(p2.find((month) => month.period === "2026-04")).toMatchObject({ status: "NOT_STARTED", isPastDue: true });
		expect(p2.find((month) => month.period === "2026-11")?.status).toBe("NOT_DUE");
		expect(overview.periods.filter((period) => period.isDue)).toHaveLength(7);
	});

	it("groups months into quarters and counts coverage only for months that are due", () => {
		const reports = ["2026-04", "2026-05", "2026-06"].flatMap((period) => [
			report("p1", period, "APPROVED"),
			report("p2", period, "APPROVED"),
		]);
		const overview = buildOverview(PLANTS, reports, 2026, NOW);
		const [q1, q2, q3, q4] = overview.quarters;
		expect(q1).toMatchObject({ periods: ["2026-04", "2026-05", "2026-06"], coverage: { approved: 6, expected: 6 } });
		expect(q1.approved.scope1Tonnes).toBeCloseTo(6 * 2_441, 6);
		expect(q2.coverage).toEqual({ approved: 0, expected: 6 });
		// Only October has ended in Q3; nothing in Q4 is due.
		expect(q3.coverage).toEqual({ approved: 0, expected: 2 });
		expect(q4.coverage).toEqual({ approved: 0, expected: 0 });
		expect(overview.yearToDate.coverage).toEqual({ approved: 6, expected: 14 });
	});

	it("adds up per plant", () => {
		const overview = buildOverview(
			PLANTS,
			[report("p1", "2026-04", "APPROVED"), report("p1", "2026-05", "APPROVED"), report("p1", "2026-06", "DRAFT")],
			2026,
			NOW,
		);
		expect(overview.plants[0].approved).toEqual({ scope1Tonnes: 4_882, scope2Tonnes: 1_350 });
		expect(overview.plants[0].coverage).toEqual({ approved: 2, expected: 7 });
	});

	it("handles an approved month with a line missing", () => {
		const partial = { ...report("p1", "2026-04", "APPROVED"), lines: [report("p1", "2026-04", "APPROVED").lines[1]] };
		const overview = buildOverview(PLANTS, [partial], 2026, NOW);
		expect(overview.plants[0].approved).toEqual({ scope1Tonnes: 0, scope2Tonnes: 675 });
	});
});

describe("currentFinancialYearStart", () => {
	it("is the year of the latest month that has ended, and never before the first reportable month", () => {
		expect(currentFinancialYearStart(NOW)).toBe(2026);
		expect(currentFinancialYearStart(new Date("2027-04-15T06:00:00Z"))).toBe(2026);
		expect(currentFinancialYearStart(new Date("2027-05-15T06:00:00Z"))).toBe(2027);
		expect(currentFinancialYearStart(new Date("2026-04-15T06:00:00Z"))).toBe(2026);
	});
});
