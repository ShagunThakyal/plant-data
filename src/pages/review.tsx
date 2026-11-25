import { AlertTriangle, Inbox } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";

import { AppLayout } from "@/components/layout/AppLayout";
import { OrenButton } from "@/components/ui/OrenButton";
import { Badge } from "@/components/ui/badge";
import {
	EmptyState,
	EmptyStateActions,
	EmptyStateDescription,
	EmptyStateIcon,
	EmptyStateTitle,
} from "@/components/ui/empty-state";
import { PageHeader, PageHeaderDescription, PageHeaderHeading } from "@/components/ui/page-header";
import {
	Table,
	TableBody,
	TableCell,
	TableFullRow,
	TableHead,
	TableHeader,
	TableLoadingRows,
	TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatPeriod } from "@/lib/period";
import { api } from "@/utils/api";

const COLUMNS = 7;

/** Months waiting for review, the longest-waiting first. */
export default function ReviewQueuePage() {
	const router = useRouter();
	const queue = api.report.reviewQueue.useQuery();
	const rows = queue.data ?? [];

	return (
		<AppLayout title="Review">
			<PageHeader bordered>
				<PageHeaderHeading>Waiting for review</PageHeaderHeading>
				<PageHeaderDescription>
					Submitted plant months, those with figures to look at first. Approved months count in the company figures.
				</PageHeaderDescription>
			</PageHeader>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Plant</TableHead>
						<TableHead>Month</TableHead>
						<TableHead>Submitted</TableHead>
						<TableHead>Flags</TableHead>
						<TableHead align="right">Scope 1 (t CO2)</TableHead>
						<TableHead align="right">Scope 2 (t CO2)</TableHead>
						<TableHead />
					</TableRow>
				</TableHeader>
				<TableBody>
					{queue.isLoading && <TableLoadingRows columns={COLUMNS} />}

					{queue.isError && (
						<TableFullRow columns={COLUMNS}>
							<EmptyState>
								<EmptyStateIcon icon={AlertTriangle} />
								<EmptyStateTitle>We could not load the review queue</EmptyStateTitle>
								<EmptyStateDescription>Check your connection, then try again.</EmptyStateDescription>
								<EmptyStateActions>
									<OrenButton data-testid="review-retry" onClick={() => void queue.refetch()}>
										Try Again
									</OrenButton>
								</EmptyStateActions>
							</EmptyState>
						</TableFullRow>
					)}

					{queue.isSuccess && rows.length === 0 && (
						<TableFullRow columns={COLUMNS}>
							<EmptyState>
								<EmptyStateIcon icon={Inbox} />
								<EmptyStateTitle>Nothing waiting</EmptyStateTitle>
								<EmptyStateDescription>Months appear here when a plant submits them.</EmptyStateDescription>
							</EmptyState>
						</TableFullRow>
					)}

					{rows.map((item) => {
						const href = `/months/${item.plant.id}/${item.period}`;
						return (
							<TableRow
								key={`${item.plant.id}-${item.period}`}
								interactive
								onClick={() => void router.push(href)}
								data-testid={`review-row-${item.plant.code}-${item.period}`}
							>
								<TableCell>
									<Link
										href={href}
										className="font-medium hover:underline"
										onClick={(event) => event.stopPropagation()}
									>
										{item.plant.code} {item.plant.name}
									</Link>
								</TableCell>
								<TableCell>{formatPeriod(item.period)}</TableCell>
								<TableCell>
									<span className="flex flex-col">
										<span>
											{item.submittedByName}, {formatDateTime(item.submittedAt)}
										</span>
										{item.isResubmission && (
											<span>
												<Badge tone="warning">Resubmitted</Badge>
											</span>
										)}
									</span>
								</TableCell>
								<TableCell>
									{item.flagCount > 0 ? (
										<Badge tone="warning" data-testid={`review-flags-${item.plant.code}-${item.period}`}>
											{item.flagCount} to look at
										</Badge>
									) : (
										<span className="text-text-secondary">None</span>
									)}
								</TableCell>
								<TableCell align="right">{formatNumber(item.totals.scope1Tonnes, 1)}</TableCell>
								<TableCell align="right">{formatNumber(item.totals.scope2Tonnes, 1)}</TableCell>
								<TableCell className="text-text-secondary">
									{item.canReview ? (
										<span className="text-text-link">Review</span>
									) : (
										"Your plant: another reviewer checks it"
									)}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</AppLayout>
	);
}
