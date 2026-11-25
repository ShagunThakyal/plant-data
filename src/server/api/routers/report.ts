import { ownerPlantMonths, reportKeyInput, reportView, saveReportInput } from "@/lib/schemas/report";
import { protectedProcedure, router } from "@/server/api/trpc";
import { getReport, listOwnerMonths, saveDraft, submitReport } from "@/server/services/report";

export const reportRouter = router({
	/** The months of the plants the user owns. */
	myMonths: protectedProcedure.output(ownerPlantMonths.array()).query(({ ctx }) => listOwnerMonths(ctx.db, ctx.user)),

	get: protectedProcedure
		.input(reportKeyInput)
		.output(reportView)
		.query(({ ctx, input }) => getReport(ctx.db, ctx.user, input)),

	saveDraft: protectedProcedure
		.input(saveReportInput)
		.output(reportView)
		.mutation(({ ctx, input }) => saveDraft(ctx.db, ctx.user, input)),

	submit: protectedProcedure
		.input(saveReportInput)
		.output(reportView)
		.mutation(({ ctx, input }) => submitReport(ctx.db, ctx.user, input)),
});
