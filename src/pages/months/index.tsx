import { AlertTriangle, CalendarDays, ChevronRight } from "lucide-react";
import Link from "next/link";

import { AppLayout } from "@/components/layout/AppLayout";
import { MonthStatusBadge } from "@/components/reports/MonthStatusBadge";
import { OrenButton } from "@/components/ui/OrenButton";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
	EmptyState,
	EmptyStateActions,
	EmptyStateDescription,
	EmptyStateIcon,
	EmptyStateTitle,
} from "@/components/ui/empty-state";
import { PageHeader, PageHeaderDescription, PageHeaderHeading } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPeriod } from "@/lib/period";
import { isEditable } from "@/lib/reportStatus";
import { api } from "@/utils/api";

const ACTION_LABELS = { NOT_STARTED: "Start", DRAFT: "Continue", RETURNED: "Correct" } as const;

/** The data owner's months: what each plant has sent, and what is still to do. */
export default function MyMonthsPage() {
	const plants = api.report.myMonths.useQuery();

	return (
		<AppLayout title="My months">
			<PageHeader bordered>
				<PageHeaderHeading>My months</PageHeaderHeading>
				<PageHeaderDescription>
					Send each month's fuel, power and clinker after the month ends, by the 10th of the next month.
				</PageHeaderDescription>
			</PageHeader>

			{plants.isLoading && (
				<div className="flex flex-col gap-3" aria-busy>
					<Skeleton className="h-12 w-full" />
					<Skeleton className="h-64 w-full" />
				</div>
			)}

			{plants.isError && (
				<EmptyState>
					<EmptyStateIcon icon={AlertTriangle} />
					<EmptyStateTitle>We could not load your months</EmptyStateTitle>
					<EmptyStateDescription>Check your connection, then try again.</EmptyStateDescription>
					<EmptyStateActions>
						<OrenButton data-testid="months-retry" onClick={() => void plants.refetch()}>
							Try Again
						</OrenButton>
					</EmptyStateActions>
				</EmptyState>
			)}

			{plants.data?.length === 0 && (
				<EmptyState>
					<EmptyStateIcon icon={CalendarDays} />
					<EmptyStateTitle>No plants to report for</EmptyStateTitle>
					<EmptyStateDescription>You are not the data owner of any plant.</EmptyStateDescription>
				</EmptyState>
			)}

			<div className="flex flex-col gap-6">
				{plants.data?.map(({ plant, months }) => (
					<Card key={plant.id} data-testid={`months-plant-${plant.code}`}>
						<CardHeader>
							<CardTitle>
								{plant.code} {plant.name}
							</CardTitle>
						</CardHeader>
						<ul className="divide-y divide-border-default">
							{months.map((month) => (
								<li key={month.period}>
									<Link
										href={`/months/${plant.id}/${month.period}`}
										className="flex items-center gap-3 px-5 py-3 hover:bg-surface-hover focus-visible:bg-surface-hover"
										data-testid={`month-${plant.code}-${month.period}`}
									>
										<span className="w-36 shrink-0 text-sm font-medium text-text-primary">
											{formatPeriod(month.period)}
										</span>
										<span className="flex-1">
											<MonthStatusBadge status={month.status} isPastDue={month.isPastDue} />
										</span>
										<span className="text-sm text-text-link">
											{isEditable(month.status) ? ACTION_LABELS[month.status as keyof typeof ACTION_LABELS] : "View"}
										</span>
										<ChevronRight className="size-4 text-text-secondary" aria-hidden />
									</Link>
								</li>
							))}
						</ul>
					</Card>
				))}
			</div>
		</AppLayout>
	);
}
