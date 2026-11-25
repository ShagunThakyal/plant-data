import { z } from "zod";

import { FLAG_KINDS } from "@/lib/flags";
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

/** Approve, send back or reopen the month at the version the reviewer looked at. */
export const reviewInput = reportKeyInput.extend({
	version: z.number().int().positive(),
});
export type ReviewInput = z.infer<typeof reviewInput>;

export const reviewWithCommentInput = reviewInput.extend({
	comment: z.string().trim().min(1, "Say what needs to change.").max(2000, "Keep the comment under 2,000 characters."),
});
export type ReviewWithCommentInput = z.infer<typeof reviewWithCommentInput>;

// Outputs

export const monthStatus = z.enum(["NOT_STARTED", ...REPORT_STATUSES]);

export const unitOption = z.object({ value: z.string(), label: z.string() });

const comparedValue = z.object({
	quantity: z.number().nullable(),
	unit: z.string(),
	quantityInFactorUnit: z.number().nullable(),
});

export const flagView = z.object({ kind: z.enum(FLAG_KINDS), factorKey: z.string().nullable(), message: z.string() });
export type FlagView = z.infer<typeof flagView>;

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
	/** Last month's approved value, if last month was approved. */
	reference: comparedValue.nullable(),
	/** This line at the previous submission of this month, if there was one. */
	previousSubmission: comparedValue.nullable(),
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
	plant: z.object({
		id: z.string(),
		code: z.string(),
		name: z.string(),
		type: z.enum(PLANT_TYPES),
		cementCapacityTpa: z.number(),
	}),
	period: z.string(),
	status: monthStatus,
	version: z.number().nullable(),
	isPastDue: z.boolean(),
	/** Whether this user can change the numbers and submit. */
	canEdit: z.boolean(),
	canApprove: z.boolean(),
	canSendBack: z.boolean(),
	canReopen: z.boolean(),
	/** True while totals use the current factor table; false once factors are frozen at submit. */
	factorsArePreview: z.boolean(),
	lines: z.array(reportLineView),
	totals: z.object({ scope1Tonnes: z.number(), scope2Tonnes: z.number() }),
	/** Figures worth a reviewer's look. Warnings only. */
	flags: z.array(flagView),
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

export const reviewQueueItem = z.object({
	plant: z.object({ id: z.string(), code: z.string(), name: z.string() }),
	period: z.string(),
	submittedByName: z.string(),
	submittedAt: z.date(),
	/** True when the month was sent back before and this is a corrected submission. */
	isResubmission: z.boolean(),
	/** False when the user owns the plant's data, so someone else must review it. */
	canReview: z.boolean(),
	flagCount: z.number(),
	totals: z.object({ scope1Tonnes: z.number(), scope2Tonnes: z.number() }),
});
export type ReviewQueueItem = z.infer<typeof reviewQueueItem>;
