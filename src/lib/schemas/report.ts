import { z } from "zod";

import { reportablePeriodSchema } from "@/lib/period";
import { REPORT_ACTIONS, REPORT_STATUSES } from "@/lib/reportStatus";
import { PLANT_TYPES } from "@/lib/schemas/plant";

// Inputs

export const MAX_QUANTITY = 1_000_000_000_000;

/** At most 4 decimal places. */
function hasAtMostFourDecimals(value: number): boolean {
	return Math.round(value * 10_000) / 10_000 === value;
}

export const quantitySchema = z
	.number({ invalid_type_error: "Enter a number." })
	.finite("Enter a number.")
	.nonnegative("Enter zero or more.")
	.max(MAX_QUANTITY, "Enter a smaller number.")
	.refine(hasAtMostFourDecimals, "Use at most 4 decimal places.");

export const reportKeyInput = z.object({
	plantId: z.string().min(1),
	period: reportablePeriodSchema,
});
export type ReportKeyInput = z.infer<typeof reportKeyInput>;

export const lineInput = z.object({
	factorKey: z.string().min(1),
	quantity: quantitySchema.nullable(),
	unit: z.string().min(1),
	note: z.string().trim().max(500, "Keep the note under 500 characters.").nullable(),
});
export type LineInput = z.infer<typeof lineInput>;

export const saveReportInput = reportKeyInput.extend({
	/** The version the user opened; null when the month had not been started. */
	version: z.number().int().positive().nullable(),
	lines: z.array(lineInput).max(20),
});
export type SaveReportInput = z.infer<typeof saveReportInput>;

// Outputs

export const monthStatus = z.enum(["NOT_STARTED", ...REPORT_STATUSES]);

export const unitOption = z.object({ value: z.string(), label: z.string() });

export const reportLineView = z.object({
	factorKey: z.string(),
	label: z.string(),
	scope: z.number().nullable(),
	factorUnit: z.string(),
	unitOptions: z.array(unitOption),
	quantity: z.number().nullable(),
	unit: z.string(),
	note: z.string().nullable(),
	quantityInFactorUnit: z.number().nullable(),
	kgCo2PerUnit: z.number().nullable(),
	factorSource: z.string().nullable(),
	tonnesCo2: z.number().nullable(),
	/** Last month's approved value, as entered, if last month was approved. */
	reference: z.object({ quantity: z.number().nullable(), unit: z.string() }).nullable(),
});
export type ReportLineView = z.infer<typeof reportLineView>;

export const reportEventView = z.object({
	id: z.string(),
	action: z.enum(REPORT_ACTIONS),
	fromStatus: z.enum(REPORT_STATUSES),
	toStatus: z.enum(REPORT_STATUSES),
	comment: z.string().nullable(),
	version: z.number(),
	actorName: z.string(),
	createdAt: z.date(),
});
export type ReportEventView = z.infer<typeof reportEventView>;

export const reportView = z.object({
	plant: z.object({ id: z.string(), code: z.string(), name: z.string(), type: z.enum(PLANT_TYPES) }),
	period: z.string(),
	status: monthStatus,
	version: z.number().nullable(),
	isPastDue: z.boolean(),
	/** Whether this user can change the numbers and submit. */
	canEdit: z.boolean(),
	/** True while totals use the current factor table; false once factors are frozen at submit. */
	factorsArePreview: z.boolean(),
	lines: z.array(reportLineView),
	totals: z.object({ scope1Tonnes: z.number(), scope2Tonnes: z.number() }),
	/** The latest "sent back" or "reopened" comment, while the month is back with its owner. */
	returnComment: reportEventView.nullable(),
	history: z.array(reportEventView),
});
export type ReportView = z.infer<typeof reportView>;

export const ownerMonth = z.object({
	period: z.string(),
	status: monthStatus,
	isPastDue: z.boolean(),
});

export const ownerPlantMonths = z.object({
	plant: z.object({ id: z.string(), code: z.string(), name: z.string() }),
	months: z.array(ownerMonth),
});
export type OwnerPlantMonths = z.infer<typeof ownerPlantMonths>;
