import { Controller, type UseFormReturn } from "react-hook-form";

import { OrenInput } from "@/components/ui/OrenInput";
import { Badge } from "@/components/ui/badge";
import { OrenSelect } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { unitLabel } from "@/lib/emissions";
import { formatNumber } from "@/lib/format";
import { parseQuantity } from "@/lib/quantity";
import type { ReportLineView } from "@/lib/schemas/report";
import { convert, isUnit } from "@/lib/units";

export type LineFormValues = { factorKey: string; quantity: string; unit: string; note: string };
export type ReportFormValues = { lines: LineFormValues[] };

function formatQuantity(quantity: number | null, unit: string): string {
	if (quantity === null) {
		return "Blank";
	}
	return `${formatNumber(quantity, 4)} ${isUnit(unit) ? unitLabel(unit) : unit}`;
}

/** The line's CO2 in tonnes, from what is typed now, or null if it cannot be worked out yet. */
export function previewTonnes(line: ReportLineView, values: LineFormValues | undefined): number | null {
	if (!values || line.kgCo2PerUnit === null || !isUnit(values.unit) || !isUnit(line.factorUnit)) {
		return null;
	}
	const parsed = parseQuantity(values.quantity);
	if (!parsed.ok || parsed.value === null) {
		return null;
	}
	return (convert(parsed.value, values.unit, line.factorUnit) * line.kgCo2PerUnit) / 1000;
}

function ScopeBadge({ scope }: { scope: number | null }) {
	return scope === null ? null : <Badge tone={scope === 1 ? "info" : "neutral"}>Scope {scope}</Badge>;
}

function Reference({ line }: { line: ReportLineView }) {
	return line.reference ? (
		<span data-testid={`reference-${line.factorKey}`}>
			{formatQuantity(line.reference.quantity, line.reference.unit)}
		</span>
	) : (
		<span className="text-text-secondary">No approved value</span>
	);
}

function TonnesCell({ tonnes }: { tonnes: number | null }) {
	return <TableCell align="right">{tonnes === null ? "—" : formatNumber(tonnes, 1)}</TableCell>;
}

function Header() {
	return (
		<TableHeader>
			<TableRow>
				<TableHead>Item</TableHead>
				<TableHead>Quantity</TableHead>
				<TableHead>Unit</TableHead>
				<TableHead>Last month (approved)</TableHead>
				<TableHead>Note</TableHead>
				<TableHead align="right">t CO2</TableHead>
			</TableRow>
		</TableHeader>
	);
}

function ItemCell({ line }: { line: ReportLineView }) {
	return (
		<TableCell>
			<span className="flex flex-col items-start gap-1">
				<span className="font-medium">{line.label}</span>
				<ScopeBadge scope={line.scope} />
			</span>
		</TableCell>
	);
}

/** The month's lines as inputs, for the plant's data owner. */
export function EditableLinesTable({
	lines,
	form,
}: {
	lines: ReportLineView[];
	form: UseFormReturn<ReportFormValues>;
}) {
	const values = form.watch("lines");
	return (
		<Table>
			<Header />
			<TableBody>
				{lines.map((line, index) => {
					const error = form.formState.errors.lines?.[index]?.quantity;
					return (
						<TableRow key={line.factorKey} data-testid={`line-${line.factorKey}`}>
							<ItemCell line={line} />
							<TableCell className="w-44 align-top">
								<OrenInput
									aria-label={`${line.label} quantity`}
									inputMode="decimal"
									placeholder="Quantity"
									v3Size="sm"
									error={error}
									register={form.register(`lines.${index}.quantity`, {
										validate: (text) => {
											const parsed = parseQuantity(text);
											return parsed.ok || parsed.message;
										},
									})}
									data-testid={`quantity-${line.factorKey}`}
								/>
							</TableCell>
							<TableCell className="w-36 align-top">
								<Controller
									control={form.control}
									name={`lines.${index}.unit`}
									render={({ field }) => (
										<OrenSelect
											size="sm"
											options={line.unitOptions}
											value={field.value}
											onValueChange={field.onChange}
											data-testid={`unit-${line.factorKey}`}
										/>
									)}
								/>
							</TableCell>
							<TableCell className="align-top">
								<Reference line={line} />
							</TableCell>
							<TableCell className="w-56 align-top">
								<OrenInput
									aria-label={`${line.label} note`}
									placeholder="Optional"
									v3Size="sm"
									register={form.register(`lines.${index}.note`)}
									data-testid={`note-${line.factorKey}`}
								/>
							</TableCell>
							<TonnesCell tonnes={previewTonnes(line, values[index])} />
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}

/** The month's lines as they were saved, for anyone who cannot change them. */
export function ReadOnlyLinesTable({ lines }: { lines: ReportLineView[] }) {
	return (
		<Table>
			<Header />
			<TableBody>
				{lines.map((line) => (
					<TableRow key={line.factorKey} data-testid={`line-${line.factorKey}`}>
						<ItemCell line={line} />
						<TableCell>{line.quantity === null ? "Blank" : formatNumber(line.quantity, 4)}</TableCell>
						<TableCell>{isUnit(line.unit) ? unitLabel(line.unit) : line.unit}</TableCell>
						<TableCell>
							<Reference line={line} />
						</TableCell>
						<TableCell className="whitespace-normal">{line.note ?? ""}</TableCell>
						<TonnesCell tonnes={line.tonnesCo2} />
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
