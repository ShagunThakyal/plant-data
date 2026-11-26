import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { AppLayout } from "@/components/layout/AppLayout";
import { OrenButton } from "@/components/ui/OrenButton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	EmptyState,
	EmptyStateActions,
	EmptyStateDescription,
	EmptyStateIcon,
	EmptyStateTitle,
} from "@/components/ui/empty-state";
import { PageHeader, PageHeaderDescription, PageHeaderHeading } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import type { Coverage, OverviewCellStatus } from "@/lib/overview";
import { formatPeriod, shortMonth } from "@/lib/period";
import { MONTH_STATUS_LABELS } from "@/lib/reportStatus";
import type { OverviewOutput } from "@/lib/schemas/overview";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

const QUARTER_MONTHS = ["Apr–Jun", "Jul–Sep", "Oct–Dec", "Jan–Mar"];

const CELL: Record<OverviewCellStatus, { label: string; className: string }> = {
	APPROVED: { label: "Approved", className: "bg-badge-success-soft-bg text-badge-success-soft-text" },
	SUBMITTED: { label: "Review", className: "bg-badge-info-soft-bg text-badge-info-soft-text" },
	RETURNED: { label: "Sent back", className: "bg-badge-warning-soft-bg text-badge-warning-soft-text" },
	DRAFT: { label: "Draft", className: "bg-badge-neutral-soft-bg text-badge-neutral-soft-text" },
	NOT_STARTED: { label: "Not started", className: "bg-badge-neutral-soft-bg text-text-secondary" },
	NOT_DUE: { label: "", className: "" },
};

function tonnes(value: number): string {
	return formatNumber(value, 0);
}

function CoverageBadge({ coverage }: { coverage: Coverage }) {
	if (coverage.expected === 0) {
		return <Badge tone="neutral">Not due yet</Badge>;
	}
	if (coverage.approved === coverage.expected) {
		return <Badge tone="success">Complete</Badge>;
	}
	return <Badge tone="warning">Incomplete: not ready to report</Badge>;
}

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
	return (
		<Card>
			<CardContent className="flex flex-col gap-1">
				<span className="text-xs text-text-secondary">{label}</span>
				<span className="text-2xl font-semibold tabular-nums">{value}</span>
				<span className="text-xs text-text-secondary">{detail}</span>
			</CardContent>
		</Card>
	);
}

function Quarters({ data }: { data: OverviewOutput }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>By quarter</CardTitle>
			</CardHeader>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Quarter</TableHead>
						<TableHead align="right">Scope 1 approved (t CO2)</TableHead>
						<TableHead align="right">Scope 2 approved (t CO2)</TableHead>
						<TableHead>Plant-months approved</TableHead>
						<TableHead>Ready for the board?</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{data.quarters.map((quarter) => (
						<TableRow key={quarter.quarter} data-testid={`overview-q${quarter.quarter}`}>
							<TableCell className="font-medium">
								Q{quarter.quarter} ({QUARTER_MONTHS[quarter.quarter - 1]})
							</TableCell>
							<TableCell align="right">{tonnes(quarter.approved.scope1Tonnes)}</TableCell>
							<TableCell align="right">{tonnes(quarter.approved.scope2Tonnes)}</TableCell>
							<TableCell>
								{quarter.coverage.expected === 0 ? "—" : `${quarter.coverage.approved} of ${quarter.coverage.expected}`}
							</TableCell>
							<TableCell>
								<CoverageBadge coverage={quarter.coverage} />
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</Card>
	);
}

function PlantGrid({ data }: { data: OverviewOutput }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Plants by month</CardTitle>
			</CardHeader>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Plant</TableHead>
						<TableHead align="right">Scope 1 (t)</TableHead>
						<TableHead align="right">Scope 2 (t)</TableHead>
						{data.periods.map(({ period }) => (
							<TableHead key={period} align="center">
								{shortMonth(period)}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{data.plants.map((row) => (
						<TableRow key={row.plant.id} data-testid={`overview-plant-${row.plant.code}`}>
							<TableCell className="font-medium whitespace-nowrap">
								<Link href={`/plants/${row.plant.id}`} className="hover:underline">
									{row.plant.code}
								</Link>{" "}
								<span className="text-text-secondary">{row.plant.name.replace(/^Nimbus /, "")}</span>
							</TableCell>
							<TableCell align="right">{tonnes(row.approved.scope1Tonnes)}</TableCell>
							<TableCell align="right">{tonnes(row.approved.scope2Tonnes)}</TableCell>
							{row.months.map((month) => (
								<TableCell key={month.period} align="center" className="px-1">
									{month.status === "NOT_DUE" ? (
										<span className="text-text-disabled">·</span>
									) : (
										<Link
											href={`/months/${row.plant.id}/${month.period}`}
											title={`${formatPeriod(month.period)}: ${MONTH_STATUS_LABELS[month.status]}${
												month.approved
													? `, Scope 1 ${tonnes(month.approved.scope1Tonnes)} t, Scope 2 ${tonnes(month.approved.scope2Tonnes)} t`
													: ""
											}`}
											className={cn(
												"inline-block rounded px-1.5 py-0.5 text-xs whitespace-nowrap hover:underline",
												CELL[month.status].className,
												month.isPastDue && "ring-1 ring-feedback-error-fg",
											)}
											data-testid={`overview-cell-${row.plant.code}-${month.period}`}
										>
											{CELL[month.status].label}
										</Link>
									)}
								</TableCell>
							))}
						</TableRow>
					))}
					<TableRow className="bg-surface-muted font-medium">
						<TableCell>Approved plants</TableCell>
						<TableCell align="right">{tonnes(data.yearToDate.approved.scope1Tonnes)}</TableCell>
						<TableCell align="right">{tonnes(data.yearToDate.approved.scope2Tonnes)}</TableCell>
						{data.months.map((month) => (
							<TableCell key={month.period} align="center" className="px-1 text-xs">
								{month.coverage.expected === 0 ? "" : `${month.coverage.approved}/${month.coverage.expected}`}
							</TableCell>
						))}
					</TableRow>
				</TableBody>
			</Table>
			<CardContent className="text-xs text-text-secondary">
				Scope 1 and Scope 2 are each plant's approved t CO2 for the year to date; the bottom row is the company. A red
				outline marks an overdue month. Hover over a month for its figures, or open it.
			</CardContent>
		</Card>
	);
}

/** Meera's view: where every plant's data stands, and the approved CO2 she can use. */
export default function OverviewPage() {
	const overview = api.report.overview.useQuery();

	if (overview.isError) {
		return (
			<AppLayout title="Overview">
				<EmptyState>
					<EmptyStateIcon icon={AlertTriangle} />
					<EmptyStateTitle>We could not load the overview</EmptyStateTitle>
					<EmptyStateDescription>{overview.error.message}</EmptyStateDescription>
					<EmptyStateActions>
						<OrenButton data-testid="overview-retry" onClick={() => void overview.refetch()}>
							Try Again
						</OrenButton>
					</EmptyStateActions>
				</EmptyState>
			</AppLayout>
		);
	}

	if (!overview.data) {
		return (
			<AppLayout title="Overview">
				<div className="flex flex-col gap-3" aria-busy>
					<Skeleton className="h-8 w-80" />
					<Skeleton className="h-24 w-full" />
					<Skeleton className="h-64 w-full" />
				</div>
			</AppLayout>
		);
	}

	const data = overview.data;
	const { approved, coverage } = data.yearToDate;
	return (
		<AppLayout title="Overview">
			<PageHeader bordered>
				<PageHeaderHeading>Company CO2, {data.financialYear}</PageHeaderHeading>
				<PageHeaderDescription>
					Only approved months count in these figures. A month waiting for review, sent back or not yet sent adds
					nothing.
				</PageHeaderDescription>
			</PageHeader>

			<div className="flex flex-col gap-6">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<Tile
						label="Scope 1 approved, year to date"
						value={`${tonnes(approved.scope1Tonnes)} t CO2`}
						detail="Fuel burned and clinker made"
					/>
					<Tile
						label="Scope 2 approved, year to date"
						value={`${tonnes(approved.scope2Tonnes)} t CO2`}
						detail="Grid power bought"
					/>
					<Tile
						label="Plant-months approved"
						value={`${coverage.approved} of ${coverage.expected}`}
						detail={
							coverage.approved === coverage.expected
								? "Every month due so far is approved."
								: "The totals above leave out every month not yet approved."
						}
					/>
				</div>
				<Quarters data={data} />
				<PlantGrid data={data} />
			</div>
		</AppLayout>
	);
}
