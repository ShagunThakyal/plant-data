/**
 * Reads a quantity as a person types it. Blank means "not entered yet". Commas and spaces are ignored, so
 * Indian grouping (1,23,00,000) and international grouping (12,300,000) both work.
 */
export function parseQuantity(text: string): { ok: true; value: number | null } | { ok: false; message: string } {
	const cleaned = text.replace(/[,\s]/g, "");
	if (cleaned === "") {
		return { ok: true, value: null };
	}
	if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) {
		return { ok: false, message: "Enter a number, for example 1,23,000 or 4500.5." };
	}
	return { ok: true, value: Number(cleaned) };
}

/** A stored quantity, as it goes back into a text box. */
export function quantityText(value: number | null): string {
	return value === null ? "" : String(value);
}
