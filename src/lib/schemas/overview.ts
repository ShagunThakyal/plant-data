import { z } from "zod";

import { REPORT_STATUSES } from "@/lib/reportStatus";

const tonnes = z.object({ scope1Tonnes: z.number(), scope2Tonnes: z.number() });
const coverage = z.object({ approved: z.number(), expected: z.number() });

export const overviewOutput = z.object({
	financialYear: z.string(),
	periods: z.array(z.object({ period: z.string(), isDue: z.boolean() })),
	plants: z.array(
		z.object({
			plant: z.object({ id: z.string(), code: z.string(), name: z.string() }),
			months: z.array(
				z.object({
					period: z.string(),
					status: z.enum(["NOT_DUE", "NOT_STARTED", ...REPORT_STATUSES]),
					isPastDue: z.boolean(),
					approved: tonnes.nullable(),
				}),
			),
			approved: tonnes,
			coverage,
		}),
	),
	months: z.array(z.object({ period: z.string(), approved: tonnes, coverage })),
	quarters: z.array(z.object({ quarter: z.number(), periods: z.array(z.string()), approved: tonnes, coverage })),
	yearToDate: z.object({ approved: tonnes, coverage }),
});
export type OverviewOutput = z.infer<typeof overviewOutput>;
