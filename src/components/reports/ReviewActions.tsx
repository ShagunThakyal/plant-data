import { Check, RotateCcw, Undo2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { OrenButton } from "@/components/ui/OrenButton";
import { OrenTextarea } from "@/components/ui/OrenTextarea";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { formatNumber } from "@/lib/format";
import { formatPeriod } from "@/lib/period";
import type { ReportView } from "@/lib/schemas/report";
import { api } from "@/utils/api";

type Kind = "approve" | "sendBack" | "reopen";

const COPY: Record<Kind, { title: string; button: string; done: string; commentLabel?: string; help: string }> = {
	approve: {
		title: "Approve",
		button: "Approve",
		done: "approved. It now counts in the company figures.",
		help: "Once approved, these figures count in the company totals Meera reports. Only a reviewer or the Head of Sustainability can reopen it, with a reason.",
	},
	sendBack: {
		title: "Send back",
		button: "Send Back",
		done: "sent back to the plant.",
		commentLabel: "What needs to change?",
		help: "The plant's data owner sees your comment, corrects the numbers and submits again.",
	},
	reopen: {
		title: "Reopen",
		button: "Reopen",
		done: "reopened and sent back to the plant.",
		commentLabel: "Why is it being reopened?",
		help: "The month stops counting in the company figures until it is approved again. The earlier approval stays in the history.",
	},
};

/** Approve, send back or reopen a month: only the buttons the server says this user may use. */
export function ReviewActions({ report }: { report: ReportView }) {
	const utils = api.useContext();
	const [open, setOpen] = useState<Kind | null>(null);
	const [comment, setComment] = useState("");
	const [commentError, setCommentError] = useState<string | undefined>();
	const key = { plantId: report.plant.id, period: report.period };
	const version = report.version ?? 0;

	const handlers = {
		onSuccess: async (saved: ReportView) => {
			const kind = open;
			setOpen(null);
			utils.report.get.setData(key, saved);
			await utils.report.reviewQueue.invalidate();
			if (kind) {
				toast.success(`${report.plant.code} ${formatPeriod(report.period)} ${COPY[kind].done}`);
			}
		},
		onError: (error: { message: string }) => {
			setOpen(null);
			toast.error(error.message);
		},
	};
	const approve = api.report.approve.useMutation(handlers);
	const sendBack = api.report.sendBack.useMutation(handlers);
	const reopen = api.report.reopen.useMutation(handlers);
	const busy = approve.isLoading || sendBack.isLoading || reopen.isLoading;

	function start(kind: Kind) {
		setComment("");
		setCommentError(undefined);
		setOpen(kind);
	}

	function confirm() {
		if (open === "approve") {
			approve.mutate({ ...key, version });
			return;
		}
		if (comment.trim() === "") {
			setCommentError("Write a comment so the plant knows what to fix.");
			return;
		}
		(open === "sendBack" ? sendBack : reopen).mutate({ ...key, version, comment });
	}

	if (!report.canApprove && !report.canSendBack && !report.canReopen) {
		return null;
	}
	const copy = open ? COPY[open] : null;

	return (
		<>
			<div className="flex flex-wrap gap-3">
				{report.canApprove && (
					<OrenButton
						leftIcon={<Check />}
						disabled={busy}
						onClick={() => start("approve")}
						data-testid="review-approve-open"
					>
						Approve
					</OrenButton>
				)}
				{report.canSendBack && (
					<OrenButton
						variant="secondary"
						leftIcon={<Undo2 />}
						disabled={busy}
						onClick={() => start("sendBack")}
						data-testid="review-send-back-open"
					>
						Send Back
					</OrenButton>
				)}
				{report.canReopen && (
					<OrenButton
						variant="secondary"
						leftIcon={<RotateCcw />}
						disabled={busy}
						onClick={() => start("reopen")}
						data-testid="review-reopen-open"
					>
						Reopen
					</OrenButton>
				)}
			</div>

			<Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
				<DialogContent closeButtonDataTestId="review-dialog-close">
					{copy && (
						<>
							<DialogHeader>
								<DialogTitle>
									{copy.title} {formatPeriod(report.period)}?
								</DialogTitle>
								<DialogDescription>
									{report.plant.code} {report.plant.name} · Scope 1 {formatNumber(report.totals.scope1Tonnes, 1)} t,
									Scope 2 {formatNumber(report.totals.scope2Tonnes, 1)} t CO2
								</DialogDescription>
							</DialogHeader>
							<DialogBody className="flex flex-col gap-4 text-sm text-text-primary">
								<p>{copy.help}</p>
								{copy.commentLabel && (
									<OrenTextarea
										label={copy.commentLabel}
										isRequired
										rows={4}
										value={comment}
										errorMessage={commentError}
										onChange={(event) => setComment(event.target.value)}
										data-testid="review-comment"
									/>
								)}
							</DialogBody>
							<DialogFooter>
								<OrenButton variant="secondary" onClick={() => setOpen(null)} data-testid="review-cancel">
									Cancel
								</OrenButton>
								<OrenButton isLoading={busy} loadingText="Saving" onClick={confirm} data-testid="review-confirm">
									{copy.button}
								</OrenButton>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
