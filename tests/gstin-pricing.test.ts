import { describe, expect, it } from "vitest";
import { gstinChecksum, validateGstin } from "../src/lib/gstin";
import { checkWholesaleQty, priceLadder, snapWholesaleQty, wholesaleUnitPrice } from "../src/lib/pricing";

describe("validateGstin", () => {
  it("accepts a known-valid GSTIN (any case, spaces)", () => {
    const r = validateGstin(" 27aapfu0939f1zv ");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.stateCode).toBe("27");
      expect(r.pan).toBe("AAPFU0939F");
    }
  });
  it("rejects a bad checksum", () => {
    const r = validateGstin("27AAPFU0939F1ZW");
    expect(r.ok).toBe(false);
  });
  it("rejects an unknown state code", () => {
    const body = "40AAPFU0939F1Z";
    expect(validateGstin(body + gstinChecksum(body)).ok).toBe(false);
  });
  it("rejects wrong length and format", () => {
    expect(validateGstin("27AAPFU0939F1Z").ok).toBe(false);
    expect(validateGstin("2AAAPFU0939F1ZV").ok).toBe(false);
  });
});

describe("wholesale pricing", () => {
  const breaks = [
    { minQty: 4, unitPricePaise: 20_000_00 },
    { minQty: 10, unitPricePaise: 19_500_00 },
  ];
  it("applies the price-list adjustment below the first break", () => {
    expect(wholesaleUnitPrice({ basePaise: 21_000_00, adjustmentBps: -300, breaks, qty: 2 })).toEqual({
      unitPricePaise: 20_370_00,
      source: "LIST",
    });
  });
  it("highest eligible break wins over the adjustment", () => {
    expect(wholesaleUnitPrice({ basePaise: 21_000_00, adjustmentBps: -300, breaks, qty: 12 }).unitPricePaise).toBe(19_500_00);
    expect(wholesaleUnitPrice({ basePaise: 21_000_00, adjustmentBps: -300, breaks, qty: 4 }).unitPricePaise).toBe(20_000_00);
  });
  it("ladder starts at MOQ", () => {
    expect(priceLadder({ basePaise: 21_000_00, adjustmentBps: 0, breaks, minQty: 2 }).map((r) => r.minQty)).toEqual([2, 4, 10]);
  });
  it("MOQ and step rules", () => {
    expect(checkWholesaleQty(1, 2, 2)).toMatch(/Minimum/);
    expect(checkWholesaleQty(3, 2, 2)).toMatch(/steps/);
    expect(checkWholesaleQty(4, 2, 2)).toBeNull();
    expect(snapWholesaleQty(5, 2, 2)).toBe(6);
    expect(snapWholesaleQty(0, 2, 2)).toBe(2);
  });
});
