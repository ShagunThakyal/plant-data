import { Save, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";

import { EditableLinesTable, type ReportFormValues, previewTonnes } from "@/components/reports/ReportLinesTable";
import { ReportTotals } from "@/components/reports/ReportTotals";
import { OrenButton } from "@/components/ui/OrenButton";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { formatPeriod } from "@/lib/period";
import { parseQuantity, quantityText } from "@/lib/quantity";
import type { LineInput, ReportView } from "@/lib/schemas/report";
import { api } from "@/utils/api";

function toFormValues(report: ReportView): ReportFormValues {
	return {
		lines: report.lines.map((line) => ({
			factorKey: line.factorKey,
			quantity: quantityText(line.quantity),
			unit: line.unit,
			note: line.note ?? "",
		})),
	};
}

function toLineInputs(values: ReportFormValues): LineInput[] {
	return values.lines.map((line) => {
		const parsed = parseQuantity(line.quantity);
		return {
			factorKey: line.factorKey,
			quantity: parsed.ok ? parsed.value : null,
			unit: line.unit,
			note: line.note.trim() || null,
		};
	});
}

/** The data owner's form: enter each item, save and come back later, then submit for review. */
export function OwnerReportForm({ report }: { report: ReportView }) {
	const utils = api.useContext();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const form = useForm<ReportFormValues>({ defaultValues: toFormValues(report) });
	const key = { plantId: report.plant.id, period: report.period };

	// When the saved month changes (after a save, or a reload), show what was saved.
	useEffect(() => {
		form.reset(toFormValues(report));
	}, [report, form]);

	async function onSaved(saved: ReportView) {
		utils.report.get.setData(key, saved);
		await utils.report.myMonths.invalidate();
	}

	const save = api.report.saveDraft.useMutation({
		onSuccess: async (saved) => {
			await onSaved(saved);
			toast.success("Draft saved. You can come back and finish it later.");
		},
		onError: (error) => toast.error(error.message),
	});
	const submit = api.report.submit.useMutation({
		onSuccess: async (saved) => {
			setConfirmOpen(false);
			await onSaved(saved);
			toast.success(`${formatPeriod(saved.period)} submitted for review.`);
		},
		onError: (error) => {
			setConfirmOpen(false);
			toast.error(error.message);
		},
	});
	const busy = save.isLoading || submit.isLoading;

	const values = form.watch("lines");
	const live = { scope1Tonnes: 0, scope2Tonnes: 0 };
	report.lines.forEach((line, index) => {
		const tonnes = previewTonnes(line, values[index]) ?? 0;
		if (line.scope === 1) live.scope1Tonnes += tonnes;
		if (line.scope === 2) live.scope2Tonnes += tonnes;
	});
	const blankCount = values.filter((line) => line.quantity.trim() === "").length;

	return (
		<form
			noValidate
			className="flex flex-col gap-6"
			onSubmit={form.handleSubmit((formValues) =>
				save.mutate({ ...key, version: report.version, lines: toLineInputs(formValues) }),
			)}
		>
			<EditableLinesTable lines={report.lines} form={form} />

			<ReportTotals {...live} note="Worked out with today's emission factors. The factors are fixed when you submit." />

			<div className="flex flex-wrap items-center gap-3">
				<OrenButton
					type="submit"
					variant="secondary"
					leftIcon={<Save />}
					isLoading={save.isLoading}
					loadingText="Saving"
					disabled={busy}
					data-testid="report-save"
				>
					Save Draft
				</OrenButton>
				<OrenButton
					leftIcon={<Send />}
					disabled={busy}
					data-testid="report-submit-open"
					onClick={() => void form.handleSubmit(() => setConfirmOpen(true))()}
				>
					Submit for Review
				</OrenButton>
				{blankCount > 0 && (
					<span className="text-sm text-text-secondary">
						{blankCount} {blankCount === 1 ? "item is" : "items are"} still blank. Enter 0 for anything not used.
					</span>
				)}
			</div>

			<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<DialogContent closeButtonDataTestId="report-submit-close">
					<DialogHeader>
						<DialogTitle>Submit {formatPeriod(report.period)}?</DialogTitle>
						<DialogDescription>
							{report.plant.code} {report.plant.name}
						</DialogDescription>
					</DialogHeader>
					<DialogBody className="text-sm text-text-primary">
						A reviewer will check the numbers. You cannot change them after this unless the reviewer sends the month
						back to you.
					</DialogBody>
					<DialogFooter>
						<OrenButton variant="secondary" onClick={() => setConfirmOpen(false)} data-testid="report-submit-cancel">
							Cancel
						</OrenButton>
						<OrenButton
							leftIcon={<Send />}
							isLoading={submit.isLoading}
							loadingText="Submitting"
							data-testid="report-submit-confirm"
							onClick={() => submit.mutate({ ...key, version: report.version, lines: toLineInputs(form.getValues()) })}
						>
							Submit
						</OrenButton>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</form>
	);
}
