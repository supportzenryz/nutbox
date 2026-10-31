import { describe, expect, it } from "vitest";
import { allocate, computeOrderTax, financialYearCode, formatInvoiceNo, needsEwayBill } from "../src/lib/tax";

describe("allocate", () => {
  it("splits exactly, largest remainder", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(7, [0, 0])).toEqual([0, 0]);
    const parts = allocate(12345, [333, 1000, 7]);
    expect(parts.reduce((a, b) => a + b)).toBe(12345);
  });
});

describe("computeOrderTax — retail (inclusive)", () => {
  it("back-calculates taxable value from MRP-style price at 5%", () => {
    const r = computeOrderTax({
      lines: [{ key: "a", qty: 1, unitPricePaise: 105_00, gstRateBps: 500 }],
      mode: "INCLUSIVE",
      intraState: true,
    });
    expect(r.taxablePaise).toBe(100_00);
    expect(r.cgstPaise).toBe(250);
    expect(r.sgstPaise).toBe(250);
    expect(r.igstPaise).toBe(0);
    expect(r.totalPaise).toBe(105_00);
  });

  it("total always equals what the shopper saw (gross − discount + shipping)", () => {
    const r = computeOrderTax({
      lines: [
        { key: "a", qty: 3, unitPricePaise: 369_00, gstRateBps: 500 },
        { key: "b", qty: 1, unitPricePaise: 1_249_00, gstRateBps: 500 },
      ],
      mode: "INCLUSIVE",
      intraState: false,
      discountPaise: 236_00,
      shippingPaise: 79_00,
    });
    expect(r.totalPaise).toBe(3 * 369_00 + 1_249_00 - 236_00 + 79_00);
    expect(r.cgstPaise + r.sgstPaise).toBe(0);
    expect(r.lines.reduce((a, l) => a + l.discountPaise, 0)).toBe(236_00);
  });

  it("odd paisa of tax goes to SGST on intra-state", () => {
    const r = computeOrderTax({
      lines: [{ key: "a", qty: 1, unitPricePaise: 101, gstRateBps: 500 }],
      mode: "EXCLUSIVE",
      intraState: true,
    });
    expect(r.cgstPaise + r.sgstPaise).toBe(5);
    expect(r.sgstPaise - r.cgstPaise).toBe(1);
  });
});

describe("computeOrderTax — wholesale (exclusive)", () => {
  it("adds 5% IGST inter-state, freight taxed at principal rate", () => {
    const r = computeOrderTax({
      lines: [{ key: "bag", qty: 2, unitPricePaise: 21_250_00, gstRateBps: 500 }],
      mode: "EXCLUSIVE",
      intraState: false,
      shippingPaise: 600_00,
    });
    expect(r.taxablePaise).toBe(42_500_00 + 600_00);
    expect(r.igstPaise).toBe(Math.round(42_500_00 * 0.05) + 30_00);
    expect(r.totalPaise).toBe(r.taxablePaise + r.igstPaise);
  });

  it("rejects bad quantities", () => {
    expect(() =>
      computeOrderTax({ lines: [{ key: "x", qty: 0, unitPricePaise: 1, gstRateBps: 500 }], mode: "EXCLUSIVE", intraState: true }),
    ).toThrow();
  });

  it("caps discount at items gross", () => {
    const r = computeOrderTax({
      lines: [{ key: "x", qty: 1, unitPricePaise: 100_00, gstRateBps: 500 }],
      mode: "INCLUSIVE",
      intraState: true,
      discountPaise: 500_00,
    });
    expect(r.discountPaise).toBe(100_00);
    expect(r.totalPaise).toBe(0);
  });
});

describe("invoice helpers", () => {
  it("financial year flips on 1 April IST", () => {
    expect(financialYearCode(new Date("2026-10-31T10:00:00Z"))).toBe("2627");
    expect(financialYearCode(new Date("2027-03-31T18:00:00Z"))).toBe("2627"); // 31 Mar 23:30 IST
    expect(financialYearCode(new Date("2027-03-31T18:31:00Z"))).toBe("2728"); // 1 Apr 00:01 IST
  });
  it("invoice numbers stay within 16 characters", () => {
    expect(formatInvoiceNo("NB", "2627", 1)).toBe("NB/2627/00001");
    expect(() => formatInvoiceNo("NUTBOXLONG", "2627", 1)).toThrow();
  });
  it("e-way bill only for inter-state > ₹50,000", () => {
    expect(needsEwayBill(50_000_01, "INTER")).toBe(true);
    expect(needsEwayBill(50_000_00, "INTER")).toBe(false);
    expect(needsEwayBill(90_000_00, "INTRA")).toBe(false);
  });
});
