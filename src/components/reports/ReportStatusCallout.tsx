import { Callout } from "@/components/ui/callout";
import { formatDateTime } from "@/lib/format";
import { dueDate } from "@/lib/period";
import type { ReportView } from "@/lib/schemas/report";

function formatDay(day: string): string {
	return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
		new Date(`${day}T00:00:00Z`),
	);
}

/** Where the month stands, in one box at the top of the page. */
export function ReportStatusCallout({ report }: { report: ReportView }) {
	const last = report.history.at(-1);

	if (report.returnComment) {
		const { action, actorName, createdAt, comment } = report.returnComment;
		return (
			<Callout
				tone="warning"
				title={`${action === "REOPEN" ? "Reopened" : "Sent back"} by ${actorName}, ${formatDateTime(createdAt)}`}
				data-testid="report-return-comment"
			>
				<p className="whitespace-pre-line">{comment}</p>
				{report.canEdit && <p>Correct the numbers below, then submit again.</p>}
			</Callout>
		);
	}
	if (report.status === "SUBMITTED" && last) {
		return (
			<Callout tone="info" title="Waiting for review">
				Submitted by {last.actorName}, {formatDateTime(last.createdAt)}. The numbers are locked while a reviewer checks
				them.
			</Callout>
		);
	}
	if (report.status === "APPROVED" && last) {
		return (
			<Callout tone="success" title="Approved">
				Approved by {last.actorName}, {formatDateTime(last.createdAt)}. These figures count in the company totals.
			</Callout>
		);
	}
	if (report.isPastDue) {
		return (
			<Callout tone="error" title="Overdue">
				This month was due by {formatDay(dueDate(report.period))}.
			</Callout>
		);
	}
	return null;
}
