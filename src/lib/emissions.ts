import { EMISSION_FACTORS, type EmissionFactor } from "@/lib/factors";
import type { PlantTypeValue } from "@/lib/schemas/plant";
import { type Dimension, UNITS, type Unit, convert, isUnit } from "@/lib/units";

/** The items a plant reports each month. Grinding units buy clinker instead of making it, so have no clinker line. */
export function applicableFactors(plantType: PlantTypeValue): EmissionFactor[] {
	return EMISSION_FACTORS.filter((factor) => plantType === "INTEGRATED" || factor.key !== "clinker");
}

export function findFactor(key: string): EmissionFactor | undefined {
	return EMISSION_FACTORS.find((factor) => factor.key === key);
}

/**
 * The units a person can pick for each kind of quantity. Million tonnes is deliberately missing: plant files
 * write "MT" for metric tonnes, and offering "Mt" invites a million-fold mistake.
 */
const ENTRY_UNITS: Record<Dimension, Unit[]> = {
	mass: ["t", "kg"],
	volume: ["L", "kL"],
	energy: ["kWh", "MWh"],
};

/** The units a factor's quantity can be entered in, the factor's own unit first. */
export function entryUnits(factor: EmissionFactor): Unit[] {
	const units = ENTRY_UNITS[UNITS[factor.unit].dimension];
	return [factor.unit, ...units.filter((unit) => unit !== factor.unit)];
}

/** The unit in words, as people pick it: "tonnes", "kilolitres", "kWh". */
export function unitLabel(unit: Unit): string {
	return UNITS[unit].label;
}

export function isEntryUnit(factor: EmissionFactor, unit: string): unit is Unit {
	return isUnit(unit) && entryUnits(factor).includes(unit);
}

/** A quantity entered in `unit`, converted to the factor's unit. */
export function toFactorUnit(factor: EmissionFactor, quantity: number, unit: Unit): number {
	return convert(quantity, unit, factor.unit);
}

/** What the totals need from a line: the quantity in the factor's unit, and the factor it is calculated with. */
export type LineForTotals = {
	quantityInFactorUnit: number | null;
	kgCo2PerUnit: number | null;
	scope: number | null;
};

export type Totals = { scope1Tonnes: number; scope2Tonnes: number };

export function lineTonnesCo2(line: LineForTotals): number | null {
	if (line.quantityInFactorUnit === null || line.kgCo2PerUnit === null) {
		return null;
	}
	return (line.quantityInFactorUnit * line.kgCo2PerUnit) / 1000;
}

/** Scope 1 and Scope 2 CO2 in tonnes. A blank line, or one that does not exist, adds nothing. */
export function totals(lines: readonly LineForTotals[]): Totals {
	const result: Totals = { scope1Tonnes: 0, scope2Tonnes: 0 };
	for (const line of lines) {
		const tonnes = lineTonnesCo2(line);
		if (tonnes === null) {
			continue;
		}
		if (line.scope === 1) {
			result.scope1Tonnes += tonnes;
		} else if (line.scope === 2) {
			result.scope2Tonnes += tonnes;
		}
	}
	return result;
}
