import { Badge, type BadgeProps } from "@/components/ui/badge";
import { MONTH_STATUS_LABELS, type MonthStatus } from "@/lib/reportStatus";

const TONES: Record<MonthStatus, BadgeProps["tone"]> = {
	NOT_STARTED: "neutral",
	DRAFT: "neutral",
	SUBMITTED: "info",
	APPROVED: "success",
	RETURNED: "warning",
};

export function MonthStatusBadge({ status, isPastDue = false }: { status: MonthStatus; isPastDue?: boolean }) {
	return (
		<span className="inline-flex flex-wrap items-center gap-1.5">
			<Badge tone={TONES[status]} data-testid={`status-${status}`}>
				{MONTH_STATUS_LABELS[status]}
			</Badge>
			{isPastDue && <Badge tone="error">Overdue</Badge>}
		</span>
	);
}
