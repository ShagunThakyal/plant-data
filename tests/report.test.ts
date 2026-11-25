import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EMISSION_FACTORS } from "@/lib/factors";
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
	const otherCompany = await createTestCompany();
	const [owner, otherOwner, reviewer, head, outsider] = await Promise.all([
		createTestUser(company.id, [ROLES.DATA_OWNER], "Owner"),
		createTestUser(company.id, [ROLES.DATA_OWNER], "Other owner"),
		createTestUser(company.id, [ROLES.REVIEWER], "Reviewer"),
		createTestUser(company.id, [ROLES.SUSTAINABILITY_HEAD], "Head"),
		createTestUser(otherCompany.id, [ROLES.SUSTAINABILITY_HEAD], "Outsider"),
	]);
	const plant = await createTestPlant(company.id, { code: "P01" });
	const grindingUnit = await createTestPlant(company.id, { code: "P07", type: "GRINDING_UNIT" });
	const otherPlant = await createTestPlant(company.id, { code: "P02" });
	await makeDataOwner(plant.id, owner.id);
	await makeDataOwner(grindingUnit.id, owner.id);
	await makeDataOwner(otherPlant.id, otherOwner.id);
	return { company, otherCompany, owner, otherOwner, reviewer, head, outsider, plant, grindingUnit, otherPlant };
}

let fx: Fixture;

beforeAll(async () => {
	fx = await setUp();
});

afterAll(async () => {
	await deleteTestCompany(fx.company.id);
	await deleteTestCompany(fx.otherCompany.id);
});

/** P01 Chittorgarh's October 2026, from samples/, with power in kWh as some plants send it. */
const FULL_MONTH: LineInput[] = [
	{ factorKey: "coal", quantity: 35_000, unit: "t", note: null },
	{ factorKey: "petcoke", quantity: 7_600, unit: "t", note: null },
	{ factorKey: "diesel", quantity: 160, unit: "kL", note: null },
	{ factorKey: "furnace_oil", quantity: 0, unit: "t", note: null },
	{ factorKey: "grid_power", quantity: 4_500_000, unit: "kWh", note: "As per bill" },
	{ factorKey: "clinker", quantity: 285_800, unit: "t", note: null },
];

function lineOf<L extends { factorKey: string }>(view: { lines: L[] }, key: string): L {
	const line = view.lines.find((candidate) => candidate.factorKey === key);
	if (!line) {
		throw new Error(`No ${key} line`);
	}
	return line;
}

// Each test uses its own month, so tests do not depend on each other.

describe("report.get", () => {
	it("shows a month not yet started, with a blank line for each item the plant reports", async () => {
		const view = await callerFor(fx.owner).report.get({ plantId: fx.plant.id, period: "2026-04" });
		expect(view).toMatchObject({ status: "NOT_STARTED", version: null, canEdit: true, factorsArePreview: true });
		expect(view.lines.map((line) => line.factorKey)).toEqual(EMISSION_FACTORS.map((factor) => factor.key));
		expect(view.lines.every((line) => line.quantity === null)).toBe(true);
	});

	it("gives a grinding unit no clinker line", async () => {
		const view = await callerFor(fx.owner).report.get({ plantId: fx.grindingUnit.id, period: "2026-04" });
		expect(view.lines.map((line) => line.factorKey)).not.toContain("clinker");
	});

	it("lets reviewers and the head see a month, but not change it", async () => {
		for (const user of [fx.reviewer, fx.head]) {
			const view = await callerFor(user).report.get({ plantId: fx.plant.id, period: "2026-04" });
			expect(view.canEdit).toBe(false);
		}
	});

	it("hides another plant's months from a data owner, and every month from another company", async () => {
		await expect(
			callerFor(fx.owner).report.get({ plantId: fx.otherPlant.id, period: "2026-04" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(callerFor(fx.outsider).report.get({ plantId: fx.plant.id, period: "2026-04" })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("refuses a month that has not ended, or is before April 2026", async () => {
		for (const period of ["2099-01", "2026-03"]) {
			await expect(callerFor(fx.owner).report.get({ plantId: fx.plant.id, period })).rejects.toMatchObject({
				code: "BAD_REQUEST",
			});
		}
	});
});

describe("report.saveDraft", () => {
	it("saves the numbers as entered and converted, and can be saved again", async () => {
		const key = { plantId: fx.plant.id, period: "2026-05" };
		const first = await callerFor(fx.owner).report.saveDraft({ ...key, version: null, lines: FULL_MONTH.slice(0, 2) });
		expect(first).toMatchObject({ status: "DRAFT", version: 1 });
		expect(lineOf(first, "coal").quantity).toBe(35_000);
		expect(lineOf(first, "grid_power").quantity).toBeNull();

		const second = await callerFor(fx.owner).report.saveDraft({ ...key, version: 1, lines: FULL_MONTH });
		expect(second.version).toBe(2);
		expect(lineOf(second, "grid_power")).toMatchObject({
			quantity: 4_500_000,
			unit: "kWh",
			quantityInFactorUnit: 4_500,
			note: "As per bill",
		});
		// The earlier coal entry is still there.
		expect(lineOf(second, "coal").quantity).toBe(35_000);
	});

	it("is only for the plant's own data owner", async () => {
		const input = { plantId: fx.plant.id, period: "2026-06", version: null, lines: FULL_MONTH };
		await expect(callerFor(fx.reviewer).report.saveDraft(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(callerFor(fx.head).report.saveDraft(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(callerFor(fx.otherOwner).report.saveDraft(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("refuses a save made on an out-of-date version", async () => {
		const key = { plantId: fx.plant.id, period: "2026-07" };
		await callerFor(fx.owner).report.saveDraft({ ...key, version: null, lines: [] });
		await callerFor(fx.owner).report.saveDraft({ ...key, version: 1, lines: [] });
		await expect(callerFor(fx.owner).report.saveDraft({ ...key, version: 1, lines: [] })).rejects.toMatchObject({
			code: "CONFLICT",
		});
		await expect(callerFor(fx.owner).report.saveDraft({ ...key, version: null, lines: [] })).rejects.toMatchObject({
			code: "CONFLICT",
		});
	});

	it("lets only one of two saves of the same version through", async () => {
		const key = { plantId: fx.plant.id, period: "2026-08" };
		await callerFor(fx.owner).report.saveDraft({ ...key, version: null, lines: [] });
		const results = await Promise.allSettled([
			callerFor(fx.owner).report.saveDraft({ ...key, version: 1, lines: FULL_MONTH.slice(0, 1) }),
			callerFor(fx.owner).report.saveDraft({ ...key, version: 1, lines: FULL_MONTH.slice(1, 2) }),
		]);
		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		const rejected = results.find((result) => result.status === "rejected");
		expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({ code: "CONFLICT" });
	});

	it("refuses million tonnes, units of the wrong kind, and items the plant does not report", async () => {
		const key = { plantId: fx.grindingUnit.id, period: "2026-05", version: null };
		for (const line of [
			{ factorKey: "coal", quantity: 1, unit: "Mt", note: null },
			{ factorKey: "coal", quantity: 1, unit: "L", note: null },
			{ factorKey: "clinker", quantity: 1, unit: "t", note: null },
		]) {
			await expect(callerFor(fx.owner).report.saveDraft({ ...key, lines: [line] })).rejects.toMatchObject({
				code: "BAD_REQUEST",
			});
		}
	});

	it("refuses negative numbers and more than 4 decimal places", async () => {
		const key = { plantId: fx.grindingUnit.id, period: "2026-06", version: null };
		for (const quantity of [-1, 1.00001]) {
			await expect(
				callerFor(fx.owner).report.saveDraft({
					...key,
					lines: [{ factorKey: "coal", quantity, unit: "t", note: null }],
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		}
	});
});

describe("report.submit", () => {
	it("needs every line filled", async () => {
		const input = { plantId: fx.plant.id, period: "2026-09", version: null, lines: FULL_MONTH.slice(0, 3) };
		await expect(callerFor(fx.owner).report.submit(input)).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringContaining("Grid electricity"),
		});
		// Nothing was saved: the save and the submit are one transaction.
		const view = await callerFor(fx.owner).report.get({ plantId: fx.plant.id, period: "2026-09" });
		expect(view.status).toBe("NOT_STARTED");
	});

	it("waits for review, freezes each line's factor, records who submitted, and locks the numbers", async () => {
		const key = { plantId: fx.plant.id, period: "2026-10" };
		const view = await callerFor(fx.owner).report.submit({ ...key, version: null, lines: FULL_MONTH });
		expect(view).toMatchObject({ status: "SUBMITTED", canEdit: false, factorsArePreview: false });
		expect(view.totals.scope2Tonnes).toBeCloseTo(3_037.5, 6);
		expect(view.history).toEqual([
			expect.objectContaining({ action: "SUBMIT", fromStatus: "DRAFT", toStatus: "SUBMITTED", actorName: "Owner" }),
		]);

		const stored = await prisma.reportLine.findMany({ where: { report: { plantId: fx.plant.id, period: "2026-10" } } });
		expect(stored.every((line) => line.factorKgCo2PerUnit !== null && line.factorScope !== null)).toBe(true);
		const event = await prisma.reportEvent.findFirstOrThrow({
			where: { report: { plantId: fx.plant.id, period: "2026-10" } },
		});
		expect(event.snapshot).toMatchObject({ totals: { scope2Tonnes: 3_037.5 } });

		await expect(
			callerFor(fx.owner).report.saveDraft({ ...key, version: view.version, lines: FULL_MONTH }),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});
});

describe("factors added later", () => {
	it("shows a blank line for an item an old draft is missing, and adds it on save", async () => {
		const key = { plantId: fx.otherPlant.id, period: "2026-05" };
		await callerFor(fx.otherOwner).report.saveDraft({ ...key, version: null, lines: FULL_MONTH });
		// As if furnace oil had been added to the factor table after this draft was saved.
		await prisma.reportLine.deleteMany({
			where: { report: { plantId: fx.otherPlant.id, period: "2026-05" }, factorKey: "furnace_oil" },
		});

		const view = await callerFor(fx.otherOwner).report.get(key);
		expect(lineOf(view, "furnace_oil").quantity).toBeNull();
		expect(lineOf(view, "coal").quantity).toBe(35_000);

		const saved = await callerFor(fx.otherOwner).report.saveDraft({ ...key, version: 1, lines: [] });
		const lines = await prisma.reportLine.findMany({
			where: { report: { plantId: fx.otherPlant.id, period: "2026-05" } },
		});
		expect(lines.map((line) => line.factorKey).sort()).toEqual(EMISSION_FACTORS.map((factor) => factor.key).sort());
		expect(lineOf(saved, "coal").quantity).toBe(35_000);
	});

	it("leaves an approved month's lines as they are, and its totals still add up", async () => {
		const key = { plantId: fx.otherPlant.id, period: "2026-06" };
		await callerFor(fx.otherOwner).report.submit({ ...key, version: null, lines: FULL_MONTH });
		await prisma.monthlyReport.update({
			where: { plantId_period: { plantId: fx.otherPlant.id, period: "2026-06" } },
			data: { status: "APPROVED" },
		});
		await prisma.reportLine.deleteMany({
			where: { report: { plantId: fx.otherPlant.id, period: "2026-06" }, factorKey: "furnace_oil" },
		});

		const view = await callerFor(fx.head).report.get(key);
		expect(view.lines.map((line) => line.factorKey)).not.toContain("furnace_oil");
		expect(view.totals.scope2Tonnes).toBeCloseTo(3_037.5, 6);
	});
});

describe("last month's approved value", () => {
	it("is shown beside each line when last month was approved, and not otherwise", async () => {
		// 2026-06 of the other plant was approved above; 2026-07 shows its values.
		const view = await callerFor(fx.otherOwner).report.get({ plantId: fx.otherPlant.id, period: "2026-07" });
		expect(lineOf(view, "grid_power").reference).toEqual({
			quantity: 4_500_000,
			unit: "kWh",
			quantityInFactorUnit: 4_500,
		});

		// P01's April 2026 was never started, so May has nothing to compare with.
		const noReference = await callerFor(fx.owner).report.get({ plantId: fx.plant.id, period: "2026-05" });
		expect(noReference.lines.every((line) => line.reference === null)).toBe(true);
	});
});

describe("report.myMonths", () => {
	it("lists every reportable month of the owner's plants, with where each stands", async () => {
		const plants = await callerFor(fx.owner).report.myMonths();
		expect(plants.map((entry) => entry.plant.code)).toEqual(["P01", "P07"]);
		const p01 = plants[0].months;
		expect(p01[p01.length - 1]).toMatchObject({ period: "2026-04", status: "NOT_STARTED", isPastDue: true });
		expect(p01.find((month) => month.period === "2026-10")).toMatchObject({ status: "SUBMITTED", isPastDue: false });
	});

	it("is empty for someone who owns no plant", async () => {
		expect(await callerFor(fx.reviewer).report.myMonths()).toEqual([]);
	});
});
