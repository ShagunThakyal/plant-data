import { describe, expect, it } from "vitest";

import { parseQuantity, quantityText } from "@/lib/quantity";

describe("parseQuantity", () => {
	it("reads plain, decimal and grouped numbers", () => {
		expect(parseQuantity("4500")).toEqual({ ok: true, value: 4500 });
		expect(parseQuantity("4500.25")).toEqual({ ok: true, value: 4500.25 });
		expect(parseQuantity(".5")).toEqual({ ok: true, value: 0.5 });
		expect(parseQuantity("1,23,00,000")).toEqual({ ok: true, value: 12_300_000 });
		expect(parseQuantity(" 12,300,000 ")).toEqual({ ok: true, value: 12_300_000 });
		expect(parseQuantity("0")).toEqual({ ok: true, value: 0 });
	});

	it("treats blank as not entered, which is different from zero", () => {
		expect(parseQuantity("")).toEqual({ ok: true, value: null });
		expect(parseQuantity("   ")).toEqual({ ok: true, value: null });
	});

	it("refuses text, negatives and units typed into the number", () => {
		for (const text of ["N/A", "-5", "4500 kWh", "1.2.3", "1e6"]) {
			expect(parseQuantity(text).ok, text).toBe(false);
		}
	});
});

describe("quantityText", () => {
	it("round-trips a stored value", () => {
		expect(quantityText(null)).toBe("");
		expect(quantityText(12_300_000)).toBe("12300000");
		expect(quantityText(0.1)).toBe("0.1");
	});
});
