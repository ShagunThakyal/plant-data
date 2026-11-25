/** Callout: a coloured box that tells the user where something stands, with an optional title. */
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

const TONES = {
	info: { box: "bg-feedback-info-bg text-feedback-info-text", icon: Info },
	success: { box: "bg-feedback-success-bg text-feedback-success-text", icon: CheckCircle2 },
	warning: { box: "bg-feedback-warning-bg text-feedback-warning-text", icon: AlertTriangle },
	error: { box: "bg-feedback-error-bg text-feedback-error-text", icon: XCircle },
} as const;

export function Callout({
	tone,
	title,
	className,
	children,
	...props
}: React.ComponentProps<"div"> & { tone: keyof typeof TONES; title?: string }) {
	const { box, icon: Icon } = TONES[tone];
	return (
		<div className={cn("flex gap-3 rounded-lg px-4 py-3 text-sm", box, className)} {...props}>
			<Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
			<div className="flex min-w-0 flex-col gap-1">
				{title && <p className="font-semibold">{title}</p>}
				{children}
			</div>
		</div>
	);
}
