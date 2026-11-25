import { describe, expect, it } from "vitest";

import { REPORT_ACTIONS, REPORT_STATUSES, type ReportAction, checkAction, isEditable } from "@/lib/reportStatus";
import { ROLES } from "@/lib/roles";

const owner = { roles: [ROLES.DATA_OWNER], ownsPlant: true };
const reviewer = { roles: [ROLES.REVIEWER], ownsPlant: false };
const head = { roles: [ROLES.SUSTAINABILITY_HEAD], ownsPlant: false };
// Priya Nair: a reviewer who is also a plant's data owner.
const reviewerWhoOwnsThePlant = { roles: [ROLES.REVIEWER, ROLES.DATA_OWNER], ownsPlant: true };

describe("checkAction", () => {
	it("follows draft → submitted → approved, and submitted → returned → submitted", () => {
		expect(checkAction("SUBMIT", { ...owner, status: "DRAFT" })).toEqual({ ok: true, to: "SUBMITTED" });
		expect(checkAction("APPROVE", { ...reviewer, status: "SUBMITTED" })).toEqual({ ok: true, to: "APPROVED" });
		expect(checkAction("RETURN", { ...reviewer, status: "SUBMITTED" })).toEqual({ ok: true, to: "RETURNED" });
		expect(checkAction("SUBMIT", { ...owner, status: "RETURNED" })).toEqual({ ok: true, to: "SUBMITTED" });
	});

	it("lets a reviewer or the head reopen an approved month, back to the owner", () => {
		expect(checkAction("REOPEN", { ...reviewer, status: "APPROVED" })).toEqual({ ok: true, to: "RETURNED" });
		expect(checkAction("REOPEN", { ...head, status: "APPROVED" })).toEqual({ ok: true, to: "RETURNED" });
	});

	it("allows exactly the listed moves and no others", () => {
		const allowed = new Set([
			"SUBMIT:DRAFT",
			"SUBMIT:RETURNED",
			"APPROVE:SUBMITTED",
			"RETURN:SUBMITTED",
			"REOPEN:APPROVED",
		]);
		const everyone = { roles: Object.values(ROLES) };
		for (const action of REPORT_ACTIONS) {
			for (const status of REPORT_STATUSES) {
				const ownsPlant = action === "SUBMIT";
				const result = checkAction(action as ReportAction, { ...everyone, ownsPlant, status });
				expect(result.ok, `${action} from ${status}`).toBe(allowed.has(`${action}:${status}`));
			}
		}
	});

	it("keeps submitting to the plant's own data owner", () => {
		expect(checkAction("SUBMIT", { ...reviewer, status: "DRAFT" }).ok).toBe(false);
		expect(checkAction("SUBMIT", { roles: [ROLES.DATA_OWNER], ownsPlant: false, status: "DRAFT" }).ok).toBe(false);
	});

	it("stops anyone reviewing their own plant", () => {
		for (const action of ["APPROVE", "RETURN"] as const) {
			const result = checkAction(action, { ...reviewerWhoOwnsThePlant, status: "SUBMITTED" });
			expect(result).toEqual({ ok: false, reason: "You own this plant's data, so someone else must review it." });
		}
		expect(checkAction("REOPEN", { ...reviewerWhoOwnsThePlant, status: "APPROVED" }).ok).toBe(false);
	});

	it("does not let a data owner or the head approve or return", () => {
		expect(checkAction("APPROVE", { ...owner, ownsPlant: false, status: "SUBMITTED" }).ok).toBe(false);
		expect(checkAction("APPROVE", { ...head, status: "SUBMITTED" }).ok).toBe(false);
		expect(checkAction("RETURN", { ...head, status: "SUBMITTED" }).ok).toBe(false);
	});
});

describe("isEditable", () => {
	it("is true only before submitting and after a month is sent back", () => {
		expect(isEditable("NOT_STARTED")).toBe(true);
		expect(isEditable("DRAFT")).toBe(true);
		expect(isEditable("RETURNED")).toBe(true);
		expect(isEditable("SUBMITTED")).toBe(false);
		expect(isEditable("APPROVED")).toBe(false);
	});
});
