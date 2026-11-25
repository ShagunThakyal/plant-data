import { ROLES, type Role, hasRole } from "@/lib/roles";

// How a month moves between states, and who may move it. DECISIONS.md, sections 1 to 3.

export const REPORT_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "RETURNED"] as const;
export type ReportStatusValue = (typeof REPORT_STATUSES)[number];

/** A month with no report yet. Worked out, never stored. */
export type MonthStatus = ReportStatusValue | "NOT_STARTED";

export const MONTH_STATUS_LABELS: Record<MonthStatus, string> = {
	NOT_STARTED: "Not started",
	DRAFT: "Draft",
	SUBMITTED: "Waiting for review",
	APPROVED: "Approved",
	RETURNED: "Sent back",
};

/** The states in which the plant's data owner can change the numbers. */
export const EDITABLE_STATUSES: readonly ReportStatusValue[] = ["DRAFT", "RETURNED"];

export function isEditable(status: MonthStatus): boolean {
	return status === "NOT_STARTED" || EDITABLE_STATUSES.includes(status);
}

export const REPORT_ACTIONS = ["SUBMIT", "APPROVE", "RETURN", "REOPEN"] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

type ActionRule = {
	from: readonly ReportStatusValue[];
	to: ReportStatusValue;
	roles: readonly Role[];
	/** SUBMIT: only the plant's data owner. The rest: never the plant's data owner (no self-review). */
	plantOwner: "must" | "must-not";
	needsComment: boolean;
};

export const ACTION_RULES: Record<ReportAction, ActionRule> = {
	SUBMIT: {
		from: ["DRAFT", "RETURNED"],
		to: "SUBMITTED",
		roles: [ROLES.DATA_OWNER],
		plantOwner: "must",
		needsComment: false,
	},
	APPROVE: {
		from: ["SUBMITTED"],
		to: "APPROVED",
		roles: [ROLES.REVIEWER],
		plantOwner: "must-not",
		needsComment: false,
	},
	RETURN: {
		from: ["SUBMITTED"],
		to: "RETURNED",
		roles: [ROLES.REVIEWER],
		plantOwner: "must-not",
		needsComment: true,
	},
	REOPEN: {
		from: ["APPROVED"],
		to: "RETURNED",
		roles: [ROLES.REVIEWER, ROLES.SUSTAINABILITY_HEAD],
		plantOwner: "must-not",
		needsComment: true,
	},
};

export type ActionCheck = { ok: true; to: ReportStatusValue } | { ok: false; reason: string };

/** Whether this user may take this action on a month in this state. Says why not, in words for the user. */
export function checkAction(
	action: ReportAction,
	{ status, roles, ownsPlant }: { status: ReportStatusValue; roles: readonly string[]; ownsPlant: boolean },
): ActionCheck {
	const rule = ACTION_RULES[action];
	if (!hasRole({ roles }, ...rule.roles)) {
		return { ok: false, reason: "You do not have the role for this." };
	}
	if (rule.plantOwner === "must" && !ownsPlant) {
		return { ok: false, reason: "Only this plant's data owner can do this." };
	}
	if (rule.plantOwner === "must-not" && ownsPlant) {
		return { ok: false, reason: "You own this plant's data, so someone else must review it." };
	}
	if (!rule.from.includes(status)) {
		return {
			ok: false,
			reason: `This month is ${MONTH_STATUS_LABELS[status].toLowerCase()}, so it cannot be changed this way.`,
		};
	}
	return { ok: true, to: rule.to };
}
