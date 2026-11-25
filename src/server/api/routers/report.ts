import {
	ownerPlantMonths,
	reportKeyInput,
	reportView,
	reviewInput,
	reviewQueueItem,
	reviewWithCommentInput,
	saveReportInput,
} from "@/lib/schemas/report";
import { protectedProcedure, router } from "@/server/api/trpc";
import { getReport, listOwnerMonths, saveDraft, submitReport } from "@/server/services/report";
import { listReviewQueue, review } from "@/server/services/review";

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

	/** Months waiting for review, longest-waiting first. Reviewers and the Head of Sustainability. */
	reviewQueue: protectedProcedure.output(reviewQueueItem.array()).query(({ ctx }) => listReviewQueue(ctx.db, ctx.user)),

	approve: protectedProcedure
		.input(reviewInput)
		.output(reportView)
		.mutation(({ ctx, input }) => review(ctx.db, ctx.user, "APPROVE", input)),

	sendBack: protectedProcedure
		.input(reviewWithCommentInput)
		.output(reportView)
		.mutation(({ ctx, input }) => review(ctx.db, ctx.user, "RETURN", input)),

	reopen: protectedProcedure
		.input(reviewWithCommentInput)
		.output(reportView)
		.mutation(({ ctx, input }) => review(ctx.db, ctx.user, "REOPEN", input)),
});
