// Demo monthly data for Nimbus Cement, FY 2026-27, so every screen has something to show. Made through the
// same services the app uses, so each month has real events, snapshots and frozen factors.
import type { PrismaClient } from "@prisma/client";

import { ROLES, hasRole } from "@/lib/roles";
import type { LineInput } from "@/lib/schemas/report";
import type { SessionUser } from "@/lib/schemas/session";
import { saveDraft, submitReport } from "@/server/services/report";
import { review } from "@/server/services/review";
import { getSessionUser } from "@/server/services/session";

type Plant = { id: string; code: string; type: "INTEGRATED" | "GRINDING_UNIT"; cementCapacityTpa: number };

/** A fixed wobble of a few percent, so months differ but the seed comes out the same every time. */
function wobble(plantIndex: number, monthIndex: number): number {
	return 1 + 0.05 * Math.sin(plantIndex * 1.7 + monthIndex * 2.3);
}

function round(value: number, step: number): number {
	return Math.round(value / step) * step;
}

/**
 * A plausible month for the plant. A plant with a sample file gets its own October figures, varied a little;
 * P01's power is the exception, at a normal 95 kWh per tonne of clinker, so its October 4,500 MWh (likely a
 * missing zero) stands out. Other plants get figures from their capacity: about 85% utilisation, 3.2 GJ of
 * kiln fuel per tonne of clinker.
 */
function typicalMonth(plant: Plant, plantIndex: number, monthIndex: number): LineInput[] {
	const w = wobble(plantIndex, monthIndex);
	const sample = OCTOBER_SAMPLES[plant.code];
	if (sample) {
		const clinker = sample.find((line) => line.factorKey === "clinker")?.quantity ?? 0;
		return sample.map((line) => {
			if (plant.code === "P01" && line.factorKey === "grid_power") {
				return { ...line, quantity: round(clinker * 0.095 * w, 10), note: null };
			}
			return { ...line, quantity: line.quantity === null ? null : round(line.quantity * w, 1), note: null };
		});
	}
	const cementPerMonth = (plant.cementCapacityTpa / 12) * 0.85 * w;
	// P04 and P08 send power in kWh and diesel in kilolitres; the rest use the factor units.
	const sendsKwh = plant.code === "P04" || plant.code === "P08";
	const line = (factorKey: string, quantity: number, unit: string): LineInput => ({
		factorKey,
		quantity,
		unit,
		note: null,
	});

	if (plant.type === "GRINDING_UNIT") {
		const powerMwh = round(cementPerMonth * 0.03, 10);
		return [
			line("coal", 0, "t"),
			line("petcoke", 0, "t"),
			line("diesel", sendsKwh ? round(55 * w, 1) : round(55_000 * w, 1_000), sendsKwh ? "kL" : "L"),
			line("furnace_oil", round(cementPerMonth * 0.004, 5), "t"),
			line("grid_power", sendsKwh ? powerMwh * 1_000 : powerMwh, sendsKwh ? "kWh" : "MWh"),
		];
	}
	const clinker = round(cementPerMonth * 0.8, 100);
	const powerMwh = round(clinker * 0.095, 10);
	return [
		line("coal", round((clinker * 3.2 * 0.8) / 25.8, 50), "t"),
		line("petcoke", round((clinker * 3.2 * 0.2) / 32.5, 50), "t"),
		line("diesel", sendsKwh ? round(0.55 * clinker * 0.001, 1) : round(0.55 * clinker, 1_000), sendsKwh ? "kL" : "L"),
		line("furnace_oil", 0, "t"),
		line("grid_power", sendsKwh ? powerMwh * 1_000 : powerMwh, sendsKwh ? "kWh" : "MWh"),
		line("clinker", clinker, "t"),
	];
}

/** October 2026 exactly as the plants sent it (samples/), in the units they used. */
const OCTOBER_SAMPLES: Record<string, LineInput[]> = {
	P01: [
		{ factorKey: "coal", quantity: 35_000, unit: "t", note: null },
		{ factorKey: "petcoke", quantity: 7_600, unit: "t", note: null },
		{ factorKey: "diesel", quantity: 160_000, unit: "L", note: null },
		{ factorKey: "furnace_oil", quantity: 0, unit: "t", note: null },
		{ factorKey: "grid_power", quantity: 4_500, unit: "MWh", note: null },
		{ factorKey: "clinker", quantity: 285_800, unit: "t", note: null },
	],
	P04: [
		{ factorKey: "coal", quantity: 11_000, unit: "t", note: "Imported and Indian coal together" },
		{ factorKey: "petcoke", quantity: 1_500, unit: "t", note: null },
		{ factorKey: "diesel", quantity: 95, unit: "kL", note: "DG sets and mining fleet" },
		{ factorKey: "furnace_oil", quantity: 0, unit: "t", note: null },
		{ factorKey: "grid_power", quantity: 12_300_000, unit: "kWh", note: "As per TSSPDCL bill" },
		{ factorKey: "clinker", quantity: 101_700, unit: "t", note: null },
	],
	P08: [
		{ factorKey: "coal", quantity: 0, unit: "t", note: null },
		{ factorKey: "petcoke", quantity: 0, unit: "t", note: null },
		{ factorKey: "diesel", quantity: 60, unit: "kL", note: null },
		{ factorKey: "furnace_oil", quantity: 500, unit: "t", note: "Hot air generator" },
		{ factorKey: "grid_power", quantity: 3_060_000, unit: "kWh", note: null },
	],
};

const PERIODS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];

type Plan = { status: "APPROVED" | "SUBMITTED" | "RETURNED" | "DRAFT"; lines?: LineInput[]; comment?: string };

/** What state each plant's September and October are in; April to August are approved everywhere. */
const LATER_MONTHS: Record<string, Partial<Record<string, Plan>>> = {
	P01: { "2026-10": { status: "SUBMITTED", lines: OCTOBER_SAMPLES.P01 } },
	P02: { "2026-10": { status: "APPROVED" } },
	P03: {
		"2026-09": {
			status: "RETURNED",
			comment: "Coal is about 40% up on August for similar clinker. Please check it against the weighbridge register.",
		},
		"2026-10": undefined,
	},
	P04: { "2026-10": { status: "SUBMITTED", lines: OCTOBER_SAMPLES.P04 } },
	P05: { "2026-10": { status: "SUBMITTED" } },
	P06: { "2026-09": { status: "SUBMITTED" }, "2026-10": undefined },
	P07: { "2026-10": undefined },
	P08: { "2026-10": { status: "DRAFT", lines: OCTOBER_SAMPLES.P08 } },
	P09: { "2026-10": undefined },
};

function planFor(code: string, period: string): Plan | undefined {
	const later = LATER_MONTHS[code] ?? {};
	if (period in later) {
		return later[period];
	}
	return { status: "APPROVED" };
}

/** The day in the month after `period`, at 10:30 India time. */
function dayAfter(period: string, day: number): Date {
	const [year, month] = period.split("-").map(Number);
	return new Date(Date.UTC(year, month, day, 5, 0));
}

async function backdateLatestEvent(prisma: PrismaClient, reportId: string, at: Date) {
	const event = await prisma.reportEvent.findFirstOrThrow({ where: { reportId }, orderBy: { createdAt: "desc" } });
	await prisma.reportEvent.update({ where: { id: event.id }, data: { createdAt: at } });
}

async function userByEmail(prisma: PrismaClient, email: string): Promise<SessionUser> {
	const row = await prisma.user.findUniqueOrThrow({ where: { email } });
	const user = await getSessionUser(prisma, row.id);
	if (!user) {
		throw new Error(`Seed user ${email} is missing.`);
	}
	return user;
}

export async function seedReports(prisma: PrismaClient, companyId: string): Promise<number> {
	if ((await prisma.monthlyReport.count({ where: { companyId } })) > 0) {
		return 0;
	}
	const vikram = await userByEmail(prisma, "vikram.joshi@nimbuscement.in");
	const priya = await userByEmail(prisma, "priya.nair@nimbuscement.in");
	const plants = await prisma.plant.findMany({
		where: { companyId },
		orderBy: { code: "asc" },
		select: { id: true, code: true, type: true, cementCapacityTpa: true, dataOwners: { select: { id: true } } },
	});

	let made = 0;
	for (const [plantIndex, plant] of plants.entries()) {
		const owner = await getSessionUser(prisma, plant.dataOwners[0]?.id ?? "");
		if (!owner || !hasRole(owner, ROLES.DATA_OWNER)) {
			continue;
		}
		// Priya reviews other plants; Vikram reviews hers, and alternates with her elsewhere.
		const reviewerFor = (monthIndex: number) => (plant.code === "P05" || monthIndex % 2 === 0 ? vikram : priya);

		for (const [monthIndex, period] of PERIODS.entries()) {
			const plan = planFor(plant.code, period);
			if (!plan) {
				continue;
			}
			const key = { plantId: plant.id, period };
			let lines = plan.lines ?? typicalMonth(plant, plantIndex, monthIndex);
			if (plan.status === "RETURNED") {
				// The figure the reviewer questions: coal up by 40%.
				lines = lines.map((line) =>
					line.factorKey === "coal" && line.quantity !== null
						? { ...line, quantity: round(line.quantity * 1.4, 50) }
						: line,
				);
			}

			if (plan.status === "DRAFT") {
				await saveDraft(prisma, owner, { ...key, version: null, lines });
				made++;
				continue;
			}
			const submitted = await submitReport(prisma, owner, { ...key, version: null, lines });
			const report = await prisma.monthlyReport.findUniqueOrThrow({
				where: { plantId_period: key },
				select: { id: true },
			});
			await backdateLatestEvent(prisma, report.id, dayAfter(period, 5 + (plantIndex % 3)));

			if (plan.status === "APPROVED") {
				await review(prisma, reviewerFor(monthIndex), "APPROVE", { ...key, version: submitted.version ?? 0 });
				await backdateLatestEvent(prisma, report.id, dayAfter(period, 9 + (plantIndex % 4)));
			} else if (plan.status === "RETURNED") {
				await review(prisma, vikram, "RETURN", {
					...key,
					version: submitted.version ?? 0,
					comment: plan.comment ?? "Please check.",
				});
				await backdateLatestEvent(prisma, report.id, dayAfter(period, 12));
			}
			made++;
		}
	}
	return made;
}
