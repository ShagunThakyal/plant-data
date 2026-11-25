import { TRPCError } from "@trpc/server";

import { type Overview, buildOverview, currentFinancialYearStart } from "@/lib/overview";
import { financialYearPeriods } from "@/lib/period";
import { ROLES, hasRole } from "@/lib/roles";
import type { SessionUser } from "@/lib/schemas/session";
import type { Db } from "@/server/db";
import { companyScope } from "@/server/helpers/scope";

/** The company picture for the current financial year. For the Head of Sustainability and reviewers. */
export async function getOverview(db: Db, user: SessionUser, now = new Date()): Promise<Overview> {
	if (!hasRole(user, ROLES.SUSTAINABILITY_HEAD, ROLES.REVIEWER)) {
		throw new TRPCError({ code: "FORBIDDEN", message: "Only the sustainability team sees the company overview." });
	}
	const startYear = currentFinancialYearStart(now);
	const [plants, reports] = await Promise.all([
		db.plant.findMany({
			where: companyScope(user),
			orderBy: { code: "asc" },
			select: { id: true, code: true, name: true },
		}),
		db.monthlyReport.findMany({
			where: companyScope(user, { period: { in: financialYearPeriods(startYear) } }),
			select: {
				plantId: true,
				period: true,
				status: true,
				lines: { select: { quantityInFactorUnit: true, factorKgCo2PerUnit: true, factorScope: true } },
			},
		}),
	]);
	return buildOverview(plants, reports, startYear, now);
}
