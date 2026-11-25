import { type Totals, totals } from "@/lib/emissions";
import {
	currentPeriod,
	financialQuarter,
	financialYearLabel,
	financialYearPeriods,
	financialYearStart,
	isPastDue,
	isReportablePeriod,
	previousPeriod,
} from "@/lib/period";
import type { MonthStatus, ReportStatusValue } from "@/lib/reportStatus";
import { FIRST_REPORTABLE_PERIOD } from "@/lib/rules";

// Meera's company picture. Only approved months count towards any figure. DECISIONS.md, section 7.

export type OverviewPlantInput = { id: string; code: string; name: string };

export type OverviewReportInput = {
	plantId: string;
	period: string;
	status: ReportStatusValue;
	/** The lines with the factors frozen at submit. */
	lines: { quantityInFactorUnit: number | null; factorKgCo2PerUnit: number | null; factorScope: number | null }[];
};

/** A month that has not ended yet is not due. */
export type OverviewCellStatus = MonthStatus | "NOT_DUE";

export type Coverage = { approved: number; expected: number };

export type Overview = {
	financialYear: string;
	periods: { period: string; isDue: boolean }[];
	plants: {
		plant: OverviewPlantInput;
		months: { period: string; status: OverviewCellStatus; isPastDue: boolean; approved: Totals | null }[];
		approved: Totals;
		coverage: Coverage;
	}[];
	months: { period: string; approved: Totals; coverage: Coverage }[];
	quarters: { quarter: 1 | 2 | 3 | 4; periods: string[]; approved: Totals; coverage: Coverage }[];
	yearToDate: { approved: Totals; coverage: Coverage };
};

function add(a: Totals, b: Totals): Totals {
	return { scope1Tonnes: a.scope1Tonnes + b.scope1Tonnes, scope2Tonnes: a.scope2Tonnes + b.scope2Tonnes };
}

const ZERO: Totals = { scope1Tonnes: 0, scope2Tonnes: 0 };

/** The financial year to show: the one containing the latest month that has ended (or the first year). */
export function currentFinancialYearStart(now: Date): number {
	const latestEnded = previousPeriod(currentPeriod(now));
	return financialYearStart(latestEnded < FIRST_REPORTABLE_PERIOD ? FIRST_REPORTABLE_PERIOD : latestEnded);
}

/**
 * Where every plant's months stand in a financial year, and the approved CO2 by plant, month, quarter and
 * year to date. A month counts only when approved; coverage says how many plant-months that is out of those
 * that are due.
 */
export function buildOverview(
	plants: OverviewPlantInput[],
	reports: OverviewReportInput[],
	startYear: number,
	now: Date,
): Overview {
	const periods = financialYearPeriods(startYear).map((period) => ({ period, isDue: isReportablePeriod(period, now) }));
	const byKey = new Map(reports.map((report) => [`${report.plantId}:${report.period}`, report]));

	const plantRows = plants.map((plant) => {
		const months = periods.map(({ period, isDue }) => {
			const report = byKey.get(`${plant.id}:${period}`);
			const status: OverviewCellStatus = !isDue ? "NOT_DUE" : (report?.status ?? "NOT_STARTED");
			const approved =
				report?.status === "APPROVED"
					? totals(
							report.lines.map((line) => ({
								quantityInFactorUnit: line.quantityInFactorUnit,
								kgCo2PerUnit: line.factorKgCo2PerUnit,
								scope: line.factorScope,
							})),
						)
					: null;
			const isLate = (status === "NOT_STARTED" || status === "DRAFT") && isPastDue(period, now);
			return { period, status, isPastDue: isLate, approved };
		});
		return {
			plant,
			months,
			approved: months.reduce((sum, month) => (month.approved ? add(sum, month.approved) : sum), ZERO),
			coverage: {
				approved: months.filter((month) => month.approved).length,
				expected: months.filter((month) => month.status !== "NOT_DUE").length,
			},
		};
	});

	const monthRows = periods.map(({ period, isDue }, index) => {
		const cells = plantRows.map((row) => row.months[index]);
		return {
			period,
			approved: cells.reduce((sum, cell) => (cell.approved ? add(sum, cell.approved) : sum), ZERO),
			coverage: { approved: cells.filter((cell) => cell.approved).length, expected: isDue ? cells.length : 0 },
		};
	});

	const sumMonths = (rows: typeof monthRows) => ({
		approved: rows.reduce((sum, row) => add(sum, row.approved), ZERO),
		coverage: rows.reduce(
			(sum, row) => ({
				approved: sum.approved + row.coverage.approved,
				expected: sum.expected + row.coverage.expected,
			}),
			{ approved: 0, expected: 0 },
		),
	});

	const quarters = ([1, 2, 3, 4] as const).map((quarter) => {
		const rows = monthRows.filter((row) => financialQuarter(row.period) === quarter);
		return { quarter, periods: rows.map((row) => row.period), ...sumMonths(rows) };
	});

	return {
		financialYear: financialYearLabel(startYear),
		periods,
		plants: plantRows,
		months: monthRows,
		quarters,
		yearToDate: sumMonths(monthRows),
	};
}
