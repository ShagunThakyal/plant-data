import { History } from "lucide-react";

import { EmptyState, EmptyStateDescription, EmptyStateIcon, EmptyStateTitle } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/format";
import type { ReportAction } from "@/lib/reportStatus";
import type { ReportEventView } from "@/lib/schemas/report";

const ACTION_LABELS: Record<ReportAction, string> = {
	SUBMIT: "Submitted for review",
	APPROVE: "Approved",
	RETURN: "Sent back",
	REOPEN: "Reopened",
};

/** Every status change of a month, oldest first: who did what, when, and why. */
export function ReportHistory({ events }: { events: ReportEventView[] }) {
	if (events.length === 0) {
		return (
			<EmptyState className="py-6">
				<EmptyStateIcon icon={History} />
				<EmptyStateTitle>Not submitted yet</EmptyStateTitle>
				<EmptyStateDescription>Each submission, approval and send-back shows here.</EmptyStateDescription>
			</EmptyState>
		);
	}
	return (
		<ol className="flex flex-col gap-3" data-testid="report-history">
			{events.map((event) => (
				<li key={event.id} className="flex flex-col gap-0.5 border-l-2 border-border-default pl-3">
					<span className="text-sm text-text-primary">
						<span className="font-medium">{ACTION_LABELS[event.action]}</span> by {event.actorName}
					</span>
					<span className="text-xs text-text-secondary">{formatDateTime(event.createdAt)}</span>
					{event.comment && <p className="mt-1 text-sm whitespace-pre-line text-text-primary">"{event.comment}"</p>}
				</li>
			))}
		</ol>
	);
}
