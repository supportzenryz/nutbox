import { describe, expect, it } from "vitest";
import { normaliseUpiRef, UPI_ID_RE, UPI_REF_RE, upiAmount, upiPayUri } from "../src/lib/upi";

describe("direct UPI links", () => {
  it("formats paise as rupees with exactly two decimals, without floats", () => {
    expect(upiAmount(129900)).toBe("1299.00");
    expect(upiAmount(105)).toBe("1.05");
    expect(upiAmount(7)).toBe("0.07");
    expect(upiAmount(1_234_567_89)).toBe("1234567.89");
    expect(() => upiAmount(0)).toThrow();
    expect(() => upiAmount(10.5)).toThrow();
  });

  it("builds an NPCI upi://pay link with payee, amount, currency and order note", () => {
    const uri = upiPayUri({ upiId: "nutbox@okhdfcbank", payeeName: "Nutbox Foods & Co", amountPaise: 89950, note: "Nutbox order NB-1042" });
    expect(uri).toBe("upi://pay?pa=nutbox@okhdfcbank&pn=Nutbox%20Foods%20%26%20Co&am=899.50&cu=INR&tn=Nutbox%20order%20NB-1042");
  });

  it("accepts real-looking UPI IDs and rejects junk", () => {
    for (const ok of ["nutbox@okhdfcbank", "9876543210@ybl", "nutbox.store@icici", "q123-45@paytm"]) expect(UPI_ID_RE.test(ok)).toBe(true);
    for (const bad of ["nutbox", "@ybl", "nutbox@", "nut box@ybl", "a@b@c", "x@1bank"]) expect(UPI_ID_RE.test(bad)).toBe(false);
  });

  it("cleans pasted UPI references down to the 12 digits", () => {
    expect(normaliseUpiRef("UTR: 4312 9876 5012")).toBe("431298765012");
    expect(normaliseUpiRef("UPI Ref. No. 431298765012")).toBe("431298765012");
    expect(UPI_REF_RE.test(normaliseUpiRef(" 431298765012 "))).toBe(true);
    expect(UPI_REF_RE.test(normaliseUpiRef("T2510311234567890"))).toBe(false);
  });
});
