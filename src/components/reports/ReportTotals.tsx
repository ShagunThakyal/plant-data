import { formatNumber } from "@/lib/format";

/** Scope 1 and Scope 2 CO2 for the month, side by side. */
export function ReportTotals({
	scope1Tonnes,
	scope2Tonnes,
	note,
}: {
	scope1Tonnes: number;
	scope2Tonnes: number;
	note?: string;
}) {
	return (
		<div className="flex flex-col gap-2">
			<dl className="grid grid-cols-2 gap-4 sm:max-w-md">
				<div className="flex flex-col">
					<dt className="text-xs text-text-secondary">Scope 1 (direct)</dt>
					<dd className="text-xl font-semibold tabular-nums" data-testid="total-scope1">
						{formatNumber(scope1Tonnes, 1)} t CO2
					</dd>
				</div>
				<div className="flex flex-col">
					<dt className="text-xs text-text-secondary">Scope 2 (bought power)</dt>
					<dd className="text-xl font-semibold tabular-nums" data-testid="total-scope2">
						{formatNumber(scope2Tonnes, 1)} t CO2
					</dd>
				</div>
			</dl>
			{note && <p className="text-xs text-text-secondary">{note}</p>}
		</div>
	);
}
