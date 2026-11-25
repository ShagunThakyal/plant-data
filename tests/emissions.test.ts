import { describe, expect, it } from "vitest";

import {
	applicableFactors,
	entryUnits,
	findFactor,
	isEntryUnit,
	toFactorUnit,
	totals,
	unitLabel,
} from "@/lib/emissions";
import type { EmissionFactor } from "@/lib/factors";

function factor(key: string): EmissionFactor {
	const found = findFactor(key);
	if (!found) {
		throw new Error(`No factor ${key}`);
	}
	return found;
}

function line(key: string, quantityInFactorUnit: number | null) {
	const { kgCo2PerUnit, scope } = factor(key);
	return { quantityInFactorUnit, kgCo2PerUnit, scope };
}

describe("applicableFactors", () => {
	it("gives integrated plants every item, and grinding units every item but clinker", () => {
		expect(applicableFactors("INTEGRATED").map((f) => f.key)).toContain("clinker");
		const grinding = applicableFactors("GRINDING_UNIT").map((f) => f.key);
		expect(grinding).not.toContain("clinker");
		expect(grinding).toContain("grid_power");
	});
});

describe("entry units", () => {
	it("offers the factor's own unit first, then the other unit of the same kind", () => {
		expect(entryUnits(factor("coal"))).toEqual(["t", "kg"]);
		expect(entryUnits(factor("diesel"))).toEqual(["L", "kL"]);
		expect(entryUnits(factor("grid_power"))).toEqual(["MWh", "kWh"]);
	});

	it("never offers million tonnes, and labels units in words", () => {
		const offered = applicableFactors("INTEGRATED").flatMap(entryUnits);
		expect(offered).not.toContain("Mt");
		expect(isEntryUnit(factor("coal"), "Mt")).toBe(false);
		expect(offered.map(unitLabel)).not.toContain("MT");
		expect(unitLabel("t")).toBe("tonnes");
		expect(unitLabel("kL")).toBe("kilolitres");
	});

	it("refuses a unit of another kind", () => {
		expect(isEntryUnit(factor("coal"), "L")).toBe(false);
		expect(isEntryUnit(factor("diesel"), "kL")).toBe(true);
	});
});

describe("toFactorUnit", () => {
	it("converts what plants send to the factor's unit", () => {
		// P04 Nalgonda, October 2026: power 1,23,00,000 kWh; HSD 95 KL.
		expect(toFactorUnit(factor("grid_power"), 12_300_000, "kWh")).toBe(12_300);
		expect(toFactorUnit(factor("diesel"), 95, "kL")).toBe(95_000);
	});
});

describe("totals", () => {
	it("adds Scope 1 and Scope 2 apart, in tonnes of CO2", () => {
		// P01 Chittorgarh, October 2026, from samples/P01_Chittorgarh_2026-10.csv.
		const result = totals([
			line("coal", 35_000),
			line("petcoke", 7_600),
			line("diesel", 160_000),
			line("grid_power", 4_500),
			line("clinker", 285_800),
		]);
		// 35,000 x 2.441 + 7,600 x 3.169 + 160,000 x 0.00268 + 285,800 x 0.525
		expect(result.scope1Tonnes).toBeCloseTo(85_435 + 24_084.4 + 428.8 + 150_045, 6);
		// 4,500 MWh x 0.675
		expect(result.scope2Tonnes).toBeCloseTo(3_037.5, 6);
	});

	it("treats blank and missing lines as adding nothing", () => {
		expect(totals([line("coal", null), line("grid_power", 1_000)])).toEqual({ scope1Tonnes: 0, scope2Tonnes: 675 });
		expect(totals([])).toEqual({ scope1Tonnes: 0, scope2Tonnes: 0 });
	});

	it("skips a line with no frozen factor", () => {
		expect(totals([{ quantityInFactorUnit: 100, kgCo2PerUnit: null, scope: null }])).toEqual({
			scope1Tonnes: 0,
			scope2Tonnes: 0,
		});
	});
});
