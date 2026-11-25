import { AlertTriangle, ArrowLeft, SearchX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";

import { AppLayout } from "@/components/layout/AppLayout";
import { FlagList } from "@/components/reports/FlagList";
import { MonthStatusBadge } from "@/components/reports/MonthStatusBadge";
import { OwnerReportForm } from "@/components/reports/OwnerReportForm";
import { ReportHistory } from "@/components/reports/ReportHistory";
import { ReadOnlyLinesTable } from "@/components/reports/ReportLinesTable";
import { ReportStatusCallout } from "@/components/reports/ReportStatusCallout";
import { ReportTotals } from "@/components/reports/ReportTotals";
import { ReviewActions } from "@/components/reports/ReviewActions";
import { OrenButton } from "@/components/ui/OrenButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	EmptyState,
	EmptyStateActions,
	EmptyStateDescription,
	EmptyStateIcon,
	EmptyStateTitle,
} from "@/components/ui/empty-state";
import { PageHeader, PageHeaderDescription, PageHeaderHeading, PageHeaderRow } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { PERIOD_PATTERN, formatPeriod } from "@/lib/period";
import { homePathFor } from "@/lib/users";
import { api } from "@/utils/api";

const BACK_LABELS: Record<string, string> = {
	"/overview": "Overview",
	"/review": "Review",
	"/months": "My months",
	"/plants": "Plants",
};

/** Back to where this user works: the review queue, their months, or the plant list. */
function BackLink({ ownsMonth }: { ownsMonth: boolean }) {
	const me = api.session.me.useQuery();
	const href = ownsMonth ? "/months" : me.data ? homePathFor(me.data) : "/plants";
	return (
		<Link
			href={href}
			className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-link hover:text-text-link-hover"
			data-testid="report-back"
		>
			<ArrowLeft className="size-4" aria-hidden />
			{BACK_LABELS[href] ?? "Back"}
		</Link>
	);
}

/** One plant's month: the owner enters and submits it here; everyone else sees where it stands. */
export default function ReportPage() {
	const router = useRouter();
	const plantId = typeof router.query.plantId === "string" ? router.query.plantId : "";
	const period = typeof router.query.period === "string" ? router.query.period : "";
	const validKey = plantId !== "" && PERIOD_PATTERN.test(period);
	const report = api.report.get.useQuery({ plantId, period }, { enabled: validKey, retry: false });

	const code = report.error?.data?.code;
	if ((router.isReady && !validKey) || code === "NOT_FOUND" || code === "BAD_REQUEST") {
		return (
			<AppLayout title="Month">
				<EmptyState>
					<EmptyStateIcon icon={SearchX} />
					<EmptyStateTitle>We could not find this month</EmptyStateTitle>
					<EmptyStateDescription>
						The month may not have ended yet, or the link may be wrong. Plants report from April 2026.
					</EmptyStateDescription>
					<EmptyStateActions>
						<OrenButton variant="secondary" data-testid="report-not-found-back" onClick={() => void router.back()}>
							Go Back
						</OrenButton>
					</EmptyStateActions>
				</EmptyState>
			</AppLayout>
		);
	}

	if (report.isError) {
		return (
			<AppLayout title="Month">
				<EmptyState>
					<EmptyStateIcon icon={AlertTriangle} />
					<EmptyStateTitle>We could not load this month</EmptyStateTitle>
					<EmptyStateDescription>Check your connection, then try again.</EmptyStateDescription>
					<EmptyStateActions>
						<OrenButton data-testid="report-retry" onClick={() => void report.refetch()}>
							Try Again
						</OrenButton>
					</EmptyStateActions>
				</EmptyState>
			</AppLayout>
		);
	}

	if (!report.data) {
		return (
			<AppLayout title="Month">
				<div className="flex flex-col gap-3" aria-busy>
					<Skeleton className="h-8 w-80" />
					<Skeleton className="h-4 w-64" />
					<Skeleton className="mt-4 h-80 w-full" />
				</div>
			</AppLayout>
		);
	}

	const data = report.data;
	return (
		<AppLayout title={`${data.plant.code} · ${formatPeriod(data.period)}`}>
			<BackLink ownsMonth={data.canEdit} />
			<PageHeader bordered>
				<PageHeaderRow>
					<div className="flex flex-col gap-1">
						<PageHeaderHeading>
							{formatPeriod(data.period)} · {data.plant.code} {data.plant.name}
						</PageHeaderHeading>
						<PageHeaderDescription>Fuel burned, grid power bought and clinker made in the month.</PageHeaderDescription>
					</div>
					<MonthStatusBadge status={data.status} isPastDue={data.isPastDue} />
				</PageHeaderRow>
			</PageHeader>

			<div className="flex flex-col gap-6">
				<ReportStatusCallout report={data} />

				{data.canEdit ? (
					<OwnerReportForm report={data} />
				) : (
					<>
						<FlagList
							flags={data.flags}
							notes={Object.fromEntries(data.lines.map((line) => [line.factorKey, line.note]))}
							intro="Check these before approving. They are warnings, not errors; the plant's notes are shown beside them."
						/>
						<ReadOnlyLinesTable lines={data.lines} />
						<ReportTotals
							scope1Tonnes={data.totals.scope1Tonnes}
							scope2Tonnes={data.totals.scope2Tonnes}
							note={
								data.factorsArePreview
									? "Worked out with today's emission factors. The factors are fixed when the month is submitted."
									: "Worked out with the emission factors fixed when the month was submitted."
							}
						/>
						<ReviewActions report={data} />
					</>
				)}

				<Card>
					<CardHeader>
						<CardTitle>History</CardTitle>
					</CardHeader>
					<CardContent>
						<ReportHistory events={data.history} />
					</CardContent>
				</Card>
			</div>
		</AppLayout>
	);
}
