import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ROLES } from "@/lib/roles";
import type { LineInput } from "@/lib/schemas/report";
import { prisma } from "@/server/db";

import {
	callerFor,
	createTestCompany,
	createTestPlant,
	createTestUser,
	deleteTestCompany,
	makeDataOwner,
} from "./helpers";

type Fixture = Awaited<ReturnType<typeof setUp>>;

async function setUp() {
	const company = await createTestCompany();
	const [owner, reviewer, secondReviewer, reviewerWhoOwns, head] = await Promise.all([
		createTestUser(company.id, [ROLES.DATA_OWNER], "Owner"),
		createTestUser(company.id, [ROLES.REVIEWER], "Reviewer"),
		createTestUser(company.id, [ROLES.REVIEWER], "Second reviewer"),
		createTestUser(company.id, [ROLES.REVIEWER, ROLES.DATA_OWNER], "Reviewer who owns P05"),
		createTestUser(company.id, [ROLES.SUSTAINABILITY_HEAD], "Head"),
	]);
	// Capacity as at P04 Nalgonda, whose October figures LINES uses.
	const plant = await createTestPlant(company.id, { code: "P01", cementCapacityTpa: 2_500_000 });
	const ownedByReviewer = await createTestPlant(company.id, { code: "P05", cementCapacityTpa: 2_500_000 });
	await makeDataOwner(plant.id, owner.id);
	await makeDataOwner(ownedByReviewer.id, reviewerWhoOwns.id);
	return { company, owner, reviewer, secondReviewer, reviewerWhoOwns, head, plant, ownedByReviewer };
}

let fx: Fixture;

beforeAll(async () => {
	fx = await setUp();
});

afterAll(async () => {
	await deleteTestCompany(fx.company.id);
});

const LINES: LineInput[] = [
	{ factorKey: "coal", quantity: 11_000, unit: "t", note: null },
	{ factorKey: "petcoke", quantity: 1_500, unit: "t", note: null },
	{ factorKey: "diesel", quantity: 95, unit: "kL", note: null },
	{ factorKey: "furnace_oil", quantity: 0, unit: "t", note: null },
	{ factorKey: "grid_power", quantity: 12_300_000, unit: "kWh", note: "As per bill" },
	{ factorKey: "clinker", quantity: 101_700, unit: "t", note: null },
];

/** Submits a month as the given owner and returns its key and version. */
async function submitted(period: string, owner = fx.owner, plantId = fx.plant.id) {
	const view = await callerFor(owner).report.submit({ plantId, period, version: null, lines: LINES });
	return { plantId, period, version: view.version ?? 0 };
}

describe("approve", () => {
	it("approves the submitted version and records who approved it", async () => {
		const key = await submitted("2026-04");
		const view = await callerFor(fx.reviewer).report.approve(key);
		expect(view.status).toBe("APPROVED");
		expect(view.history.map((event) => [event.action, event.actorName])).toEqual([
			["SUBMIT", "Owner"],
			["APPROVE", "Reviewer"],
		]);
		const approval = await prisma.reportEvent.findFirstOrThrow({
			where: { action: "APPROVE", report: { plantId: fx.plant.id, period: "2026-04" } },
		});
		expect(approval.version).toBe(key.version);
		expect(approval.snapshot).toMatchObject({ totals: { scope2Tonnes: 8_302.5 } });
	});

	it("is not for data owners or the head, and never for a reviewer's own plant", async () => {
		const key = await submitted("2026-05");
		await expect(callerFor(fx.owner).report.approve(key)).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(callerFor(fx.head).report.approve(key)).rejects.toMatchObject({ code: "FORBIDDEN" });

		const own = await submitted("2026-05", fx.reviewerWhoOwns, fx.ownedByReviewer.id);
		await expect(callerFor(fx.reviewerWhoOwns).report.approve(own)).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "You own this plant's data, so someone else must review it.",
		});
		const view = await callerFor(fx.reviewerWhoOwns).report.get(own);
		expect(view).toMatchObject({ canApprove: false, canSendBack: false });
	});

	it("refuses a version the reviewer did not look at", async () => {
		const key = await submitted("2026-06");
		await expect(callerFor(fx.reviewer).report.approve({ ...key, version: key.version - 1 })).rejects.toMatchObject({
			code: "CONFLICT",
		});
	});
});

describe("two reviewers acting at once", () => {
	it("lets exactly one of approve and send back through, and records only that one", async () => {
		const key = await submitted("2026-07");
		const results = await Promise.allSettled([
			callerFor(fx.reviewer).report.approve(key),
			callerFor(fx.secondReviewer).report.sendBack({ ...key, comment: "Check the coal figure." }),
		]);
		const fulfilled = results.filter((result) => result.status === "fulfilled");
		const rejected = results.filter((result) => result.status === "rejected");
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect(rejected[0].status === "rejected" && rejected[0].reason).toMatchObject({ code: "CONFLICT" });

		const events = await prisma.reportEvent.findMany({
			where: { report: { plantId: fx.plant.id, period: "2026-07" } },
		});
		expect(events.map((event) => event.action).sort()).toEqual(
			[
				"SUBMIT",
				fulfilled[0].status === "fulfilled" && fulfilled[0].value.status === "APPROVED" ? "APPROVE" : "RETURN",
			].sort(),
		);
	});

	it("lets only one of two approvals through", async () => {
		const key = await submitted("2026-08");
		const results = await Promise.allSettled([
			callerFor(fx.reviewer).report.approve(key),
			callerFor(fx.secondReviewer).report.approve(key),
		]);
		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		const approvals = await prisma.reportEvent.count({
			where: { action: "APPROVE", report: { plantId: fx.plant.id, period: "2026-08" } },
		});
		expect(approvals).toBe(1);
	});
});

describe("send back and resubmit", () => {
	it("returns the month to its owner with the comment, then waits for review again", async () => {
		const key = await submitted("2026-09");
		await expect(callerFor(fx.reviewer).report.sendBack({ ...key, comment: "   " })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});

		const returned = await callerFor(fx.reviewer).report.sendBack({
			...key,
			comment: "Power looks low for the clinker made.",
		});
		expect(returned.status).toBe("RETURNED");

		const ownerView = await callerFor(fx.owner).report.get(key);
		expect(ownerView).toMatchObject({
			canEdit: true,
			returnComment: { action: "RETURN", actorName: "Reviewer", comment: "Power looks low for the clinker made." },
		});

		const corrected = LINES.map((line) =>
			line.factorKey === "grid_power" ? { ...line, quantity: 13_100_000, note: "Corrected: two bills" } : line,
		);
		const resubmitted = await callerFor(fx.owner).report.submit({
			...key,
			version: ownerView.version,
			lines: corrected,
		});
		expect(resubmitted.status).toBe("SUBMITTED");
		expect(resubmitted.history.map((event) => event.action)).toEqual(["SUBMIT", "RETURN", "SUBMIT"]);

		const queue = await callerFor(fx.reviewer).report.reviewQueue();
		expect(queue.find((item) => item.period === "2026-09")).toMatchObject({ isResubmission: true, canReview: true });
	});
});

describe("factors frozen at every submit", () => {
	it("uses the factor frozen at the submit that was approved", async () => {
		const key = await submitted("2026-10");
		const sentBack = await callerFor(fx.reviewer).report.sendBack({ ...key, comment: "Please recheck." });
		// The grid factor as frozen at the first submit is changed, as if the factor table had been different then.
		await prisma.reportLine.updateMany({
			where: { report: { plantId: fx.plant.id, period: "2026-10" }, factorKey: "grid_power" },
			data: { factorKgCo2PerUnit: 1 },
		});
		const resubmitted = await callerFor(fx.owner).report.submit({ ...key, version: sentBack.version, lines: LINES });
		const approved = await callerFor(fx.reviewer).report.approve({ ...key, version: resubmitted.version ?? 0 });
		// The resubmit froze today's factor (0.675 t per MWh), not the stale one.
		expect(approved.totals.scope2Tonnes).toBeCloseTo(8_302.5, 6);
	});
});

describe("reopen", () => {
	it("sends an approved month back to its owner with a reason, by a reviewer or the head", async () => {
		const key = await submitted("2026-04", fx.reviewerWhoOwns, fx.ownedByReviewer.id);
		const approved = await callerFor(fx.reviewer).report.approve(key);
		await expect(
			callerFor(fx.reviewerWhoOwns).report.reopen({ ...key, version: approved.version ?? 0, comment: "Mine" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		const reopened = await callerFor(fx.head).report.reopen({
			...key,
			version: approved.version ?? 0,
			comment: "Auditor found a missing diesel invoice.",
		});
		expect(reopened.status).toBe("RETURNED");
		expect(reopened.returnComment).toMatchObject({ action: "REOPEN", actorName: "Head" });
		// The earlier approval stays in the history.
		expect(reopened.history.map((event) => event.action)).toEqual(["SUBMIT", "APPROVE", "REOPEN"]);
	});
});

describe("reviewQueue", () => {
	it("lists flagged months first, each group oldest first, marking a reviewer's own plant as not theirs", async () => {
		const queue = await callerFor(fx.reviewerWhoOwns).report.reviewQueue();
		for (const group of [queue.filter((item) => item.flagCount > 0), queue.filter((item) => item.flagCount === 0)]) {
			const times = group.map((item) => item.submittedAt.getTime());
			expect(times).toEqual([...times].sort((a, b) => a - b));
		}
		expect(queue.map((item) => item.flagCount > 0)).toEqual(
			[...queue.map((item) => item.flagCount > 0)].sort((a, b) => Number(b) - Number(a)),
		);
		expect(queue.every((item) => (item.plant.code === "P05" ? !item.canReview : item.canReview))).toBe(true);
	});

	it("is only for reviewers and the head", async () => {
		await expect(callerFor(fx.owner).report.reviewQueue()).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(Array.isArray(await callerFor(fx.head).report.reviewQueue())).toBe(true);
	});
});

describe("overview", () => {
	it("counts only approved months, and only the user's company", async () => {
		const overview = await callerFor(fx.head).report.overview();
		const p01 = overview.plants.find((row) => row.plant.code === "P01");
		const approvedPeriods = p01?.months.filter((month) => month.approved).map((month) => month.period);
		// Exactly the months the tests above approved, whichever way the race went.
		const stored = await prisma.monthlyReport.findMany({
			where: { plantId: fx.plant.id, status: "APPROVED" },
			select: { period: true },
		});
		expect(approvedPeriods?.sort()).toEqual(stored.map((report) => report.period).sort());
		expect(overview.plants.map((row) => row.plant.code)).toEqual(["P01", "P05"]);
		// P01 September is waiting for review, so it shows but adds nothing.
		expect(p01?.months.find((month) => month.period === "2026-09")).toMatchObject({
			status: "SUBMITTED",
			approved: null,
		});
	});

	it("is not for data owners", async () => {
		await expect(callerFor(fx.owner).report.overview()).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("flags in context", () => {
	it("shows the reviewer what changed since the previous submission, and the owner while correcting", async () => {
		const key = await submitted("2026-06", fx.reviewerWhoOwns, fx.ownedByReviewer.id);
		const sentBack = await callerFor(fx.reviewer).report.sendBack({ ...key, comment: "Recheck power." });

		const owner = await callerFor(fx.reviewerWhoOwns).report.get(key);
		expect(owner.flags).toEqual([]); // Nothing changed yet.

		const corrected = LINES.map((line) => (line.factorKey === "grid_power" ? { ...line, quantity: 13_100_000 } : line));
		const resubmitted = await callerFor(fx.reviewerWhoOwns).report.submit({
			...key,
			version: sentBack.version,
			lines: corrected,
		});
		const reviewerView = await callerFor(fx.reviewer).report.get(key);
		expect(reviewerView.flags).toEqual([
			expect.objectContaining({ kind: "CHANGED_SINCE_SUBMISSION", factorKey: "grid_power" }),
		]);
		expect(resubmitted.flags.map((flag) => flag.kind)).toEqual(["CHANGED_SINCE_SUBMISSION"]);
	});

	it("compares with last month's approved values, and lists flagged months first in the queue", async () => {
		// P05 April was approved in the reopen test and is back with its owner; approve a fresh pair instead.
		const plant = await createTestPlant(fx.company.id, { code: "P09", cementCapacityTpa: 2_500_000 });
		await makeDataOwner(plant.id, fx.owner.id);
		const april = await submitted("2026-04", fx.owner, plant.id);
		await callerFor(fx.reviewer).report.approve(april);

		const copied = await submitted("2026-05", fx.owner, plant.id);
		const view = await callerFor(fx.reviewer).report.get(copied);
		// Every non-zero line equals April's; furnace oil is 0 both months and is not flagged.
		expect(view.flags.map((flag) => `${flag.kind}:${flag.factorKey}`).sort()).toEqual(
			["clinker", "coal", "diesel", "grid_power", "petcoke"].map((key) => `SAME_AS_LAST_MONTH:${key}`).sort(),
		);
		expect(lineOf(view, "coal").reference).toEqual({ quantity: 11_000, unit: "t", quantityInFactorUnit: 11_000 });

		const queue = await callerFor(fx.reviewer).report.reviewQueue();
		const firstUnflagged = queue.findIndex((item) => item.flagCount === 0);
		const lastFlagged = queue.map((item) => item.flagCount > 0).lastIndexOf(true);
		expect(firstUnflagged === -1 || lastFlagged < firstUnflagged).toBe(true);
		expect(queue.find((item) => item.plant.code === "P09")?.flagCount).toBe(5);
	});
});

function lineOf<L extends { factorKey: string }>(view: { lines: L[] }, key: string): L {
	const line = view.lines.find((candidate) => candidate.factorKey === key);
	if (!line) {
		throw new Error(`No ${key} line`);
	}
	return line;
}
