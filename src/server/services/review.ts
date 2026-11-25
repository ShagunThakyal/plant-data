import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import { totals } from "@/lib/emissions";
import { computeFlags, toFlagLines } from "@/lib/flags";
import { previousPeriod } from "@/lib/period";
import { type ReportAction, checkAction } from "@/lib/reportStatus";
import { ROLES, hasRole } from "@/lib/roles";
import type { ReportView, ReviewInput, ReviewQueueItem } from "@/lib/schemas/report";
import type { SessionUser } from "@/lib/schemas/session";
import type { Db } from "@/server/db";
import { companyScope } from "@/server/helpers/scope";
import { type ComparedLine, getReport, loadPlant, previousSubmission, transition } from "@/server/services/report";

// Monthly reports: the reviewer's side (queue, approve, send back, reopen). Rules: DECISIONS.md.

/**
 * Takes a reviewer's action on a month, only if it is still at the version the reviewer looked at. The
 * status rules decide who may take which action from which state; the transition records it.
 */
export async function review(
	db: PrismaClient,
	user: SessionUser,
	action: Exclude<ReportAction, "SUBMIT">,
	input: ReviewInput & { comment?: string },
): Promise<ReportView> {
	const plant = await loadPlant(db, user, input.plantId);
	await db.$transaction(async (tx) => {
		const report = await tx.monthlyReport.findUnique({
			where: { plantId_period: { plantId: plant.id, period: input.period } },
			select: { id: true, companyId: true, status: true },
		});
		if (!report) {
			throw new TRPCError({ code: "NOT_FOUND", message: "This month has not been submitted." });
		}
		const check = checkAction(action, { status: report.status, roles: user.roles, ownsPlant: plant.ownsPlant });
		if (!check.ok) {
			throw new TRPCError({ code: "FORBIDDEN", message: check.reason });
		}
		await transition(
			tx,
			user,
			{ id: report.id, companyId: report.companyId, status: report.status, version: input.version },
			action,
			check.to,
			input.comment ?? null,
		);
	});
	return getReport(db, user, input);
}

/** Last month's approved lines for each queued month, keyed by "plantId:period" of the queued month. */
async function approvedPreviousMonths(
	db: Db,
	user: SessionUser,
	months: { plantId: string; period: string }[],
): Promise<Map<string, Map<string, ComparedLine>>> {
	const previous = await db.monthlyReport.findMany({
		where: companyScope(user, {
			status: "APPROVED" as const,
			OR: months.map(({ plantId, period }) => ({ plantId, period: previousPeriod(period) })),
		}),
		select: {
			plantId: true,
			period: true,
			lines: { select: { factorKey: true, quantity: true, unit: true, quantityInFactorUnit: true } },
		},
	});
	const byPreviousKey = new Map(
		previous.map((report) => [
			`${report.plantId}:${report.period}`,
			new Map(report.lines.map((line) => [line.factorKey, line])),
		]),
	);
	return new Map(
		months.map(({ plantId, period }) => [
			`${plantId}:${period}`,
			byPreviousKey.get(`${plantId}:${previousPeriod(period)}`) ?? new Map(),
		]),
	);
}

/** Months waiting for review in the user's company: flagged months first, then the longest-waiting. */
export async function listReviewQueue(db: Db, user: SessionUser): Promise<ReviewQueueItem[]> {
	if (!hasRole(user, ROLES.REVIEWER, ROLES.SUSTAINABILITY_HEAD)) {
		throw new TRPCError({ code: "FORBIDDEN", message: "Only reviewers see the review queue." });
	}
	const reports = await db.monthlyReport.findMany({
		where: companyScope(user, { status: "SUBMITTED" as const }),
		select: {
			plantId: true,
			period: true,
			plant: {
				select: {
					id: true,
					code: true,
					name: true,
					type: true,
					cementCapacityTpa: true,
					dataOwners: { where: { id: user.id }, select: { id: true } },
				},
			},
			lines: {
				select: { factorKey: true, quantityInFactorUnit: true, factorKgCo2PerUnit: true, factorScope: true },
			},
			events: {
				where: { action: "SUBMIT" },
				orderBy: { createdAt: "asc" },
				select: { createdAt: true, snapshot: true, actor: { select: { name: true } } },
			},
		},
	});
	const lastMonth = await approvedPreviousMonths(db, user, reports);

	return reports
		.map(({ plantId, plant: { dataOwners, type, cementCapacityTpa, ...plant }, period, lines, events }) => {
			const latest = events.at(-1);
			const reference = lastMonth.get(`${plantId}:${period}`) ?? new Map();
			const submitted = previousSubmission(
				"SUBMITTED",
				events.map((event) => event.snapshot),
			);
			const flags = computeFlags({
				plantType: type,
				cementCapacityTpa,
				lines: toFlagLines(
					lines.map((line) => ({
						factorKey: line.factorKey,
						quantityInFactorUnit: line.quantityInFactorUnit,
						reference: reference.get(line.factorKey) ?? null,
						previousSubmission: submitted.get(line.factorKey) ?? null,
					})),
				),
			});
			return {
				plant,
				period,
				submittedByName: latest?.actor.name ?? "",
				submittedAt: latest?.createdAt ?? new Date(0),
				isResubmission: events.length > 1,
				canReview: dataOwners.length === 0 && hasRole(user, ROLES.REVIEWER),
				flagCount: flags.length,
				totals: totals(
					lines.map((line) => ({
						quantityInFactorUnit: line.quantityInFactorUnit,
						kgCo2PerUnit: line.factorKgCo2PerUnit,
						scope: line.factorScope,
					})),
				),
			};
		})
		.sort(
			(a, b) => Number(b.flagCount > 0) - Number(a.flagCount > 0) || a.submittedAt.getTime() - b.submittedAt.getTime(),
		);
}
