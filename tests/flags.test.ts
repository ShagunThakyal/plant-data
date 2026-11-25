import { describe, expect, it } from "vitest";

import { type FlagLine, computeFlags } from "@/lib/flags";
import type { PlantTypeValue } from "@/lib/schemas/plant";

/** P04 Nalgonda, October 2026 (samples/), in factor units: 12,300 MWh for 1,01,700 t clinker = 121 kWh/t. */
const P04: FlagLine[] = [
	{ factorKey: "coal", value: 11_000, lastApproved: null, previousSubmission: null },
	{ factorKey: "petcoke", value: 1_500, lastApproved: null, previousSubmission: null },
	{ factorKey: "diesel", value: 95_000, lastApproved: null, previousSubmission: null },
	{ factorKey: "furnace_oil", value: 0, lastApproved: null, previousSubmission: null },
	{ factorKey: "grid_power", value: 12_300, lastApproved: null, previousSubmission: null },
	{ factorKey: "clinker", value: 101_700, lastApproved: null, previousSubmission: null },
];
const INTEGRATED: { plantType: PlantTypeValue; cementCapacityTpa: number } = {
	plantType: "INTEGRATED",
	cementCapacityTpa: 2_500_000,
};

function withLine(key: string, change: Partial<FlagLine>): FlagLine[] {
	return P04.map((line) => (line.factorKey === key ? { ...line, ...change } : line));
}

function kinds(lines: FlagLine[], plant = INTEGRATED) {
	return computeFlags({ ...plant, lines }).map((flag) => `${flag.kind}:${flag.factorKey}`);
}

describe("computeFlags", () => {
	it("raises nothing for a normal month", () => {
		expect(kinds(P04)).toEqual([]);
	});

	it("(a) flags a change of more than 30% on last month's approved value, either way", () => {
		expect(kinds(withLine("coal", { lastApproved: 8_000 }))).toEqual(["BIG_CHANGE:coal"]);
		expect(kinds(withLine("coal", { lastApproved: 16_000 }))).toEqual(["BIG_CHANGE:coal"]);
		expect(kinds(withLine("coal", { lastApproved: 10_000 }))).toEqual([]);
		expect(kinds(withLine("furnace_oil", { value: 50, lastApproved: 0 }))).toEqual(["BIG_CHANGE:furnace_oil"]);
	});

	it("(d) flags a value exactly equal to last month's, but not 0 both months", () => {
		expect(kinds(withLine("coal", { lastApproved: 11_000 }))).toEqual(["SAME_AS_LAST_MONTH:coal"]);
		expect(kinds(withLine("furnace_oil", { lastApproved: 0 }))).toEqual([]);
	});

	it("(e) flags a line changed since the previous submission", () => {
		const flags = computeFlags({ ...INTEGRATED, lines: withLine("grid_power", { previousSubmission: 4_500 }) });
		expect(flags).toEqual([
			{
				kind: "CHANGED_SINCE_SUBMISSION",
				factorKey: "grid_power",
				message: "Grid electricity changed from 4,500 MWh to 12,300 MWh since the last submission.",
			},
		]);
		expect(kinds(withLine("grid_power", { previousSubmission: 12_300 }))).toEqual([]);
	});

	it("(b) flags clinker above the plant's monthly cement capacity", () => {
		// 2.5 Mt a year is 2,08,333 t a month.
		expect(kinds(withLine("clinker", { value: 210_000 }))).toContain("CLINKER_ABOVE_CAPACITY:clinker");
		expect(kinds(withLine("clinker", { value: 200_000 }))).not.toContain("CLINKER_ABOVE_CAPACITY:clinker");
	});

	it("(b) flags grid power outside 50 to 150 kWh per tonne of clinker, as at P01 in the samples", () => {
		// P01 Chittorgarh: 4,500 MWh for 2,85,800 t clinker = 16 kWh/t.
		const p01 = withLine("grid_power", { value: 4_500 }).map((line) =>
			line.factorKey === "clinker" ? { ...line, value: 285_800 } : line,
		);
		expect(kinds(p01, { plantType: "INTEGRATED", cementCapacityTpa: 4_000_000 })).toEqual([
			"POWER_PER_TONNE_CLINKER:grid_power",
		]);
		expect(kinds(withLine("grid_power", { value: 16_000 }))).toEqual(["POWER_PER_TONNE_CLINKER:grid_power"]);
	});

	it("(c) flags zeros an integrated plant should not have", () => {
		expect(kinds(withLine("clinker", { value: 0 }))).toEqual(["UNEXPECTED_ZERO:clinker"]);
		expect(kinds(withLine("grid_power", { value: 0 }))).toContain("UNEXPECTED_ZERO:grid_power");
		const noKilnFuel = P04.map((line) => (["coal", "petcoke"].includes(line.factorKey) ? { ...line, value: 0 } : line));
		expect(kinds(noKilnFuel)).toEqual(["UNEXPECTED_ZERO:null"]);
	});

	it("does not apply clinker checks to a grinding unit, which has no clinker line", () => {
		const paradip: FlagLine[] = [
			{ factorKey: "coal", value: 0, lastApproved: null, previousSubmission: null },
			{ factorKey: "furnace_oil", value: 500, lastApproved: null, previousSubmission: null },
			{ factorKey: "grid_power", value: 3_060, lastApproved: null, previousSubmission: null },
		];
		expect(kinds(paradip, { plantType: "GRINDING_UNIT", cementCapacityTpa: 1_500_000 })).toEqual([]);
	});

	it("skips blank and missing lines", () => {
		const blanks = P04.map((line) => ({ ...line, value: null, lastApproved: 5 }));
		expect(kinds(blanks)).toEqual([]);
		expect(kinds([])).toEqual([]);
	});
});
