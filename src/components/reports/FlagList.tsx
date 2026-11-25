import { Callout } from "@/components/ui/callout";
import type { Flag } from "@/lib/flags";

/**
 * The figures worth a second look, with the plant's note on each flagged line beside it. Warnings only: they
 * never stop a submission or an approval.
 */
export function FlagList({
	flags,
	notes,
	intro,
}: {
	flags: Flag[];
	/** Each line's note, by factor key. */
	notes: Record<string, string | null>;
	intro: string;
}) {
	if (flags.length === 0) {
		return null;
	}
	return (
		<Callout
			tone="warning"
			title={`${flags.length} ${flags.length === 1 ? "figure" : "figures"} to look at`}
			data-testid="report-flags"
		>
			<p>{intro}</p>
			<ul className="mt-1 flex list-disc flex-col gap-1.5 pl-5">
				{flags.map((flag, index) => {
					const note = flag.factorKey ? notes[flag.factorKey] : null;
					return (
						<li key={`${flag.kind}-${flag.factorKey}-${index}`} data-testid={`flag-${flag.kind}-${flag.factorKey}`}>
							{flag.message}
							{note && <span className="block text-text-primary">Plant's note: "{note}"</span>}
						</li>
					);
				})}
			</ul>
		</Callout>
	);
}
