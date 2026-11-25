import { Prisma, type PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import {
	applicableFactors,
	entryUnits,
	findFactor,
	isEntryUnit,
	lineTonnesCo2,
	toFactorUnit,
	totals,
	unitLabel,
} from "@/lib/emissions";
import { EMISSION_FACTORS } from "@/lib/factors";
import { isPastDue, previousPeriod, reportablePeriods } from "@/lib/period";
import {
	EDITABLE_STATUSES,
	type MonthStatus,
	type ReportAction,
	type ReportStatusValue,
	checkAction,
	isEditable,
} from "@/lib/reportStatus";
import { ROLES, hasRole } from "@/lib/roles";
import type {
	LineInput,
	OwnerPlantMonths,
	ReportEventView,
	ReportKeyInput,
	ReportLineView,
	ReportView,
	SaveReportInput,
} from "@/lib/schemas/report";
import type { SessionUser } from "@/lib/schemas/session";
import type { Db } from "@/server/db";
import { companyScope } from "@/server/helpers/scope";

// Monthly reports: the owner's side (open, save, submit). Rules: DECISIONS.md.

const plantSelect = { id: true, code: true, name: true, type: true, companyId: true } as const;

type PlantForReport = Prisma.PlantGetPayload<{ select: typeof plantSelect }> & { ownsPlant: boolean };

/**
 * The plant, loaded through the user's company, with whether the user is one of its data owners. Throws
 * NOT_FOUND when the plant is not in the user's company, or the user may not see its data.
 */
async function loadPlant(db: Db, user: SessionUser, plantId: string): Promise<PlantForReport> {
	const plant = await db.plant.findFirst({
		where: companyScope(user, { id: plantId }),
		select: { ...plantSelect, dataOwners: { where: { id: user.id }, select: { id: true } } },
	});
	if (!plant) {
		throw new TRPCError({ code: "NOT_FOUND", message: "We could not find this plant." });
	}
	const { dataOwners, ...fields } = plant;
	const ownsPlant = dataOwners.length > 0;
	if (!ownsPlant && !hasRole(user, ROLES.REVIEWER, ROLES.SUSTAINABILITY_HEAD)) {
		throw new TRPCError({ code: "NOT_FOUND", message: "We could not find this plant." });
	}
	return { ...fields, ownsPlant };
}

const reportInclude = {
	lines: true,
	events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } },
} as const satisfies Prisma.MonthlyReportInclude;

type ReportWithDetail = Prisma.MonthlyReportGetPayload<{ include: typeof reportInclude }>;

function conflict(message = "This month changed since you opened it. Reload to see the latest, then try again.") {
	return new TRPCError({ code: "CONFLICT", message });
}

function canEdit(user: SessionUser, plant: PlantForReport, status: MonthStatus): boolean {
	return plant.ownsPlant && hasRole(user, ROLES.DATA_OWNER) && isEditable(status);
}

/** Past due applies to months not yet submitted. A sent-back month was submitted on time. */
function monthIsPastDue(period: string, status: MonthStatus, now: Date): boolean {
	return (status === "NOT_STARTED" || status === "DRAFT") && isPastDue(period, now);
}

function toEventView(event: ReportWithDetail["events"][number]): ReportEventView {
	return {
		id: event.id,
		action: event.action as ReportAction,
		fromStatus: event.fromStatus,
		toStatus: event.toStatus,
		comment: event.comment,
		version: event.version,
		actorName: event.actor.name,
		createdAt: event.createdAt,
	};
}

type StoredLine = ReportWithDetail["lines"][number];

/**
 * The lines to show. A month the owner can still change shows one line per applicable factor, blank where
 * none is stored yet (so a factor added later appears), priced with the current factors. A submitted or
 * approved month shows exactly the lines stored, with the factors frozen at submit.
 */
function buildLines(
	plantType: PlantForReport["type"],
	stored: StoredLine[],
	frozen: boolean,
	reference: Map<string, StoredLine>,
): ReportLineView[] {
	const byKey = new Map(stored.map((line) => [line.factorKey, line]));
	const keys = frozen
		? EMISSION_FACTORS.map((factor) => factor.key as string)
				.filter((key) => byKey.has(key))
				.concat(stored.map((line) => line.factorKey).filter((key) => !findFactor(key)))
		: applicableFactors(plantType).map((factor) => factor.key);

	return keys.map((key) => {
		const factor = findFactor(key);
		const line = byKey.get(key);
		const previous = reference.get(key);
		const kgCo2PerUnit = frozen ? (line?.factorKgCo2PerUnit ?? null) : (factor?.kgCo2PerUnit ?? null);
		const scope = frozen ? (line?.factorScope ?? null) : (factor?.scope ?? null);
		const quantityInFactorUnit = line?.quantityInFactorUnit ?? null;
		return {
			factorKey: key,
			label: factor?.label ?? key,
			scope,
			factorUnit: (frozen ? line?.factorUnit : undefined) ?? factor?.unit ?? line?.unit ?? "",
			unitOptions: factor ? entryUnits(factor).map((unit) => ({ value: unit, label: unitLabel(unit) })) : [],
			quantity: line?.quantity ?? null,
			unit: line?.unit ?? factor?.unit ?? "",
			note: line?.note ?? null,
			quantityInFactorUnit,
			kgCo2PerUnit,
			factorSource: frozen ? (line?.factorSource ?? null) : (factor?.source ?? null),
			tonnesCo2: lineTonnesCo2({ quantityInFactorUnit, kgCo2PerUnit, scope }),
			reference: previous ? { quantity: previous.quantity, unit: previous.unit } : null,
		};
	});
}

/** Last month's approved lines by factor, or an empty map if last month is not approved. */
async function approvedLinesOfPreviousMonth(db: Db, plantId: string, period: string): Promise<Map<string, StoredLine>> {
	const previous = await db.monthlyReport.findUnique({
		where: { plantId_period: { plantId, period: previousPeriod(period) } },
		select: { status: true, lines: true },
	});
	if (previous?.status !== "APPROVED") {
		return new Map();
	}
	return new Map(previous.lines.map((line) => [line.factorKey, line]));
}

export async function getReport(db: Db, user: SessionUser, key: ReportKeyInput, now = new Date()): Promise<ReportView> {
	const plant = await loadPlant(db, user, key.plantId);
	const report = await db.monthlyReport.findUnique({
		where: { plantId_period: { plantId: plant.id, period: key.period } },
		include: reportInclude,
	});
	const status: MonthStatus = report?.status ?? "NOT_STARTED";
	const frozen = !isEditable(status);
	const lines = buildLines(
		plant.type,
		report?.lines ?? [],
		frozen,
		await approvedLinesOfPreviousMonth(db, plant.id, key.period),
	);
	const events = (report?.events ?? []).map(toEventView);
	const lastEvent = events.at(-1);
	const returnComment =
		status === "RETURNED" && lastEvent && (lastEvent.action === "RETURN" || lastEvent.action === "REOPEN")
			? lastEvent
			: null;

	return {
		plant: { id: plant.id, code: plant.code, name: plant.name, type: plant.type },
		period: key.period,
		status,
		version: report?.version ?? null,
		isPastDue: monthIsPastDue(key.period, status, now),
		canEdit: canEdit(user, plant, status),
		factorsArePreview: !frozen,
		lines,
		totals: totals(lines),
		returnComment,
		history: events,
	};
}

/** Checks the entered lines against the plant's items and their units. Returns them by factor key. */
function validateLines(plant: PlantForReport, lines: LineInput[]): Map<string, LineInput> {
	const applicable = new Set(applicableFactors(plant.type).map((factor) => factor.key as string));
	const byKey = new Map<string, LineInput>();
	for (const line of lines) {
		const factor = findFactor(line.factorKey);
		if (!factor || !applicable.has(line.factorKey)) {
			throw new TRPCError({ code: "BAD_REQUEST", message: `${plant.code} does not report "${line.factorKey}".` });
		}
		if (!isEntryUnit(factor, line.unit)) {
			throw new TRPCError({ code: "BAD_REQUEST", message: `Choose a unit for ${factor.label} from the list.` });
		}
		if (byKey.has(line.factorKey)) {
			throw new TRPCError({ code: "BAD_REQUEST", message: `${factor.label} is listed twice.` });
		}
		byKey.set(line.factorKey, line);
	}
	return byKey;
}

/**
 * Saves the owner's numbers: creates the month on its first save, otherwise updates it only if it is still
 * at the version the owner opened and still editable. Every applicable item gets a line, blank if not entered.
 * Returns the report id and its new version.
 */
async function writeDraft(
	tx: Prisma.TransactionClient,
	user: SessionUser,
	plant: PlantForReport,
	input: SaveReportInput,
): Promise<{ id: string; version: number; status: ReportStatusValue }> {
	if (!canEdit(user, plant, "DRAFT")) {
		throw new TRPCError({ code: "FORBIDDEN", message: "Only this plant's data owner can enter its numbers." });
	}
	const entered = validateLines(plant, input.lines);
	const existing = await tx.monthlyReport.findUnique({
		where: { plantId_period: { plantId: plant.id, period: input.period } },
		select: { id: true, version: true, status: true, lines: true },
	});

	let report: { id: string; version: number; status: ReportStatusValue };
	if (!existing) {
		if (input.version !== null) {
			throw conflict();
		}
		report = await tx.monthlyReport.create({
			// The company comes from the plant loaded through the user's company, never from input.
			data: { companyId: plant.companyId, plantId: plant.id, period: input.period },
			select: { id: true, version: true, status: true },
		});
	} else {
		if (input.version === null) {
			throw conflict("Someone else has started this month. Reload to see their numbers.");
		}
		if (!isEditable(existing.status)) {
			throw conflict("This month has been submitted, so it can no longer be changed. Reload to see where it stands.");
		}
		const updated = await tx.monthlyReport.updateMany({
			where: { id: existing.id, version: input.version, status: { in: [...EDITABLE_STATUSES] } },
			data: { version: { increment: 1 } },
		});
		if (updated.count === 0) {
			throw conflict();
		}
		report = { id: existing.id, version: input.version + 1, status: existing.status };
	}

	const kept = new Map((existing?.lines ?? []).map((line) => [line.factorKey, line]));
	await tx.reportLine.deleteMany({ where: { reportId: report.id } });
	await tx.reportLine.createMany({
		data: applicableFactors(plant.type).map((factor) => {
			const line = entered.get(factor.key);
			const previous = kept.get(factor.key);
			const quantity = line ? line.quantity : (previous?.quantity ?? null);
			const unit = line ? line.unit : (previous?.unit ?? factor.unit);
			const note = line ? line.note || null : (previous?.note ?? null);
			return {
				reportId: report.id,
				factorKey: factor.key,
				quantity,
				unit,
				note,
				quantityInFactorUnit:
					quantity === null || !isEntryUnit(factor, unit) ? null : toFactorUnit(factor, quantity, unit),
			};
		}),
	});
	return report;
}

function isUniqueViolation(error: unknown): boolean {
	return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Runs a report change in a transaction. Two first saves of the same month racing become a CONFLICT. */
async function inTransaction<T>(db: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
	try {
		return await db.$transaction(work);
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw conflict("Someone else has started this month. Reload to see their numbers.");
		}
		throw error;
	}
}

export async function saveDraft(db: PrismaClient, user: SessionUser, input: SaveReportInput): Promise<ReportView> {
	const plant = await loadPlant(db, user, input.plantId);
	await inTransaction(db, (tx) => writeDraft(tx, user, plant, input));
	return getReport(db, user, input);
}

/** The lines as they stand, with their frozen factors, and the totals. Kept on every status change. */
async function snapshot(tx: Prisma.TransactionClient, reportId: string): Promise<Prisma.InputJsonValue> {
	const lines = await tx.reportLine.findMany({ where: { reportId }, orderBy: { factorKey: "asc" } });
	const snapshotLines = lines.map(({ id: _id, reportId: _reportId, ...line }) => line);
	const sums = totals(
		lines.map((line) => ({
			quantityInFactorUnit: line.quantityInFactorUnit,
			kgCo2PerUnit: line.factorKgCo2PerUnit,
			scope: line.factorScope,
		})),
	);
	return { lines: snapshotLines, totals: sums };
}

/**
 * Moves a month from one state to another, only if it is still in the state and at the version the user acted
 * on. Records the event with a snapshot. Throws CONFLICT if someone else changed the month first.
 */
export async function transition(
	tx: Prisma.TransactionClient,
	user: SessionUser,
	report: { id: string; companyId: string; status: ReportStatusValue; version: number },
	action: ReportAction,
	to: ReportStatusValue,
	comment: string | null,
): Promise<void> {
	const updated = await tx.monthlyReport.updateMany({
		where: { id: report.id, status: report.status, version: report.version },
		data: { status: to, version: { increment: 1 } },
	});
	if (updated.count === 0) {
		throw conflict();
	}
	await tx.reportEvent.create({
		data: {
			companyId: report.companyId,
			reportId: report.id,
			action,
			fromStatus: report.status,
			toStatus: to,
			comment,
			version: report.version,
			snapshot: await snapshot(tx, report.id),
			actorId: user.id,
		},
	});
}

/** Saves the owner's numbers and submits them for review, in one transaction. Freezes each line's factor. */
export async function submitReport(db: PrismaClient, user: SessionUser, input: SaveReportInput): Promise<ReportView> {
	const plant = await loadPlant(db, user, input.plantId);
	await inTransaction(db, async (tx) => {
		const saved = await writeDraft(tx, user, plant, input);
		const check = checkAction("SUBMIT", { status: saved.status, roles: user.roles, ownsPlant: plant.ownsPlant });
		if (!check.ok) {
			throw new TRPCError({ code: "FORBIDDEN", message: check.reason });
		}
		const lines = await tx.reportLine.findMany({ where: { reportId: saved.id } });
		const blank = lines.filter((line) => line.quantity === null).map((line) => findFactor(line.factorKey)?.label);
		if (blank.length > 0) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Fill in every item before submitting. Still blank: ${blank.join(", ")}. Enter 0 if none was used.`,
			});
		}
		for (const line of lines) {
			const factor = findFactor(line.factorKey);
			if (!factor) {
				continue;
			}
			await tx.reportLine.update({
				where: { id: line.id },
				data: {
					factorKgCo2PerUnit: factor.kgCo2PerUnit,
					factorUnit: factor.unit,
					factorSource: factor.source,
					factorScope: factor.scope,
				},
			});
		}
		await transition(
			tx,
			user,
			{ id: saved.id, companyId: plant.companyId, status: saved.status, version: saved.version },
			"SUBMIT",
			check.to,
			null,
		);
	});
	return getReport(db, user, input);
}

/** Every reportable month of every plant the user owns, newest first, with where each stands. */
export async function listOwnerMonths(db: Db, user: SessionUser, now = new Date()): Promise<OwnerPlantMonths[]> {
	const periods = reportablePeriods(now);
	const plants = await db.plant.findMany({
		where: companyScope(user, { dataOwners: { some: { id: user.id } } }),
		orderBy: { code: "asc" },
		select: {
			id: true,
			code: true,
			name: true,
			reports: { where: { period: { in: periods } }, select: { period: true, status: true } },
		},
	});
	return plants.map(({ reports, ...plant }) => {
		const statusByPeriod = new Map(reports.map((report) => [report.period, report.status]));
		return {
			plant,
			months: periods.map((period) => {
				const status: MonthStatus = statusByPeriod.get(period) ?? "NOT_STARTED";
				return { period, status, isPastDue: monthIsPastDue(period, status, now) };
			}),
		};
	});
}
