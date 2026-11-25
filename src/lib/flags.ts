import { findFactor } from "@/lib/emissions";
import { formatNumber } from "@/lib/format";
import { BIG_CHANGE_SHARE, CLINKER_SHARE_OF_MONTHLY_CAPACITY, POWER_PER_TONNE_CLINKER_KWH } from "@/lib/rules";
import type { PlantTypeValue } from "@/lib/schemas/plant";

// Anomaly flags: the figures a reviewer should look at first. Warnings only; they never block a submission.
// Pure, so the owner's form (as they type) and the server (for reviewers) use the same rules. DECISIONS.md §6.

export const FLAG_KINDS = [
	"BIG_CHANGE",
	"SAME_AS_LAST_MONTH",
	"CLINKER_ABOVE_CAPACITY",
	"POWER_PER_TONNE_CLINKER",
	"UNEXPECTED_ZERO",
	"CHANGED_SINCE_SUBMISSION",
] as const;
export type FlagKind = (typeof FLAG_KINDS)[number];

export type Flag = { kind: FlagKind; factorKey: string | null; message: string };

/** One line's values, all in the factor's unit. Null means blank, or nothing to compare with. */
export type FlagLine = {
	factorKey: string;
	value: number | null;
	/** Last month's approved value. */
	lastApproved: number | null;
	/** The value at the previous submission of this month, if it was submitted before. */
	previousSubmission: number | null;
};

export type FlagInput = {
	plantType: PlantTypeValue;
	cementCapacityTpa: number;
	lines: FlagLine[];
};

const KILN_FUELS = ["coal", "petcoke", "furnace_oil"];

function amount(factorKey: string, value: number): string {
	const factor = findFactor(factorKey);
	return `${formatNumber(value, 2)} ${factor ? factor.unit : ""}`.trim();
}

function label(factorKey: string): string {
	return findFactor(factorKey)?.label ?? factorKey;
}

/** A line as the month view has it: its value and the two values it is compared with, as entered and converted. */
type ComparedValue = { quantityInFactorUnit: number | null } | null;
export type LineWithComparisons = {
	factorKey: string;
	quantityInFactorUnit: number | null;
	reference: ComparedValue;
	previousSubmission: ComparedValue;
};

export function toFlagLines(lines: readonly LineWithComparisons[]): FlagLine[] {
	return lines.map((line) => ({
		factorKey: line.factorKey,
		value: line.quantityInFactorUnit,
		lastApproved: line.reference?.quantityInFactorUnit ?? null,
		previousSubmission: line.previousSubmission?.quantityInFactorUnit ?? null,
	}));
}

/** Every flag for a month. A line that is blank or missing is simply not checked. */
export function computeFlags({ plantType, cementCapacityTpa, lines }: FlagInput): Flag[] {
	const flags: Flag[] = [];
	const value = (key: string) => lines.find((line) => line.factorKey === key)?.value ?? null;

	for (const line of lines) {
		if (line.value === null) {
			continue;
		}
		const { factorKey, value: now, lastApproved: before, previousSubmission } = line;

		// (a) Big change from last month's approved value.
		if (before !== null && !(before === 0 && now === 0)) {
			const change = before === 0 ? Number.POSITIVE_INFINITY : Math.abs(now - before) / before;
			if (change > BIG_CHANGE_SHARE) {
				flags.push({
					kind: "BIG_CHANGE",
					factorKey,
					message:
						before === 0
							? `${label(factorKey)} was 0 last month and is ${amount(factorKey, now)} now.`
							: `${label(factorKey)} is ${now > before ? "up" : "down"} ${formatNumber(change * 100, 0)}% on last month's approved ${amount(factorKey, before)}.`,
				});
			}
		}

		// (d) Exactly the same as last month: possibly copied. Not for a line that is 0 both months.
		if (before !== null && now === before && now !== 0) {
			flags.push({
				kind: "SAME_AS_LAST_MONTH",
				factorKey,
				message: `${label(factorKey)} is exactly the same as last month (${amount(factorKey, now)}).`,
			});
		}

		// (e) Changed since the previous submission of this month.
		if (previousSubmission !== null && now !== previousSubmission) {
			flags.push({
				kind: "CHANGED_SINCE_SUBMISSION",
				factorKey,
				message: `${label(factorKey)} changed from ${amount(factorKey, previousSubmission)} to ${amount(factorKey, now)} since the last submission.`,
			});
		}
	}

	const clinker = value("clinker");
	const power = value("grid_power");

	// (b) Clinker above what the plant can make in a month.
	const monthlyCapacity = (cementCapacityTpa / 12) * CLINKER_SHARE_OF_MONTHLY_CAPACITY;
	if (plantType === "INTEGRATED" && clinker !== null && clinker > monthlyCapacity) {
		flags.push({
			kind: "CLINKER_ABOVE_CAPACITY",
			factorKey: "clinker",
			message: `Clinker of ${amount("clinker", clinker)} is more than the plant's cement capacity for a month (${amount("clinker", monthlyCapacity)}).`,
		});
	}

	// (b) Grid power per tonne of clinker outside the usual range.
	if (plantType === "INTEGRATED" && clinker !== null && clinker > 0 && power !== null) {
		const kwhPerTonne = (power * 1000) / clinker;
		const { min, max } = POWER_PER_TONNE_CLINKER_KWH;
		if (kwhPerTonne < min || kwhPerTonne > max) {
			flags.push({
				kind: "POWER_PER_TONNE_CLINKER",
				factorKey: "grid_power",
				message: `Grid power is ${formatNumber(kwhPerTonne, 0)} kWh per tonne of clinker; plants usually use ${min} to ${max}. A captive power plant can explain a low figure.`,
			});
		}
	}

	// (c) Zero where the plant type needs a value.
	if (plantType === "INTEGRATED" && clinker === 0) {
		flags.push({
			kind: "UNEXPECTED_ZERO",
			factorKey: "clinker",
			message: "No clinker made. An integrated plant usually makes clinker every month.",
		});
	}
	if (power === 0) {
		flags.push({ kind: "UNEXPECTED_ZERO", factorKey: "grid_power", message: "No grid power bought." });
	}
	const kilnFuels = KILN_FUELS.map(value);
	if (plantType === "INTEGRATED" && kilnFuels.every((fuel) => fuel === 0)) {
		flags.push({
			kind: "UNEXPECTED_ZERO",
			factorKey: null,
			message: "No coal, petroleum coke or furnace oil burned. An integrated plant's kiln needs fuel.",
		});
	}

	return flags;
}
