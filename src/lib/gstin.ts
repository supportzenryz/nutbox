// GSTIN validation: format + Luhn mod-36 checksum + state code.
// Format: 2-digit state · 10-char PAN · entity no. · "Z" · checksum.
import { STATES } from "./states";

const PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function gstinChecksum(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const factor = i % 2 === 0 ? 1 : 2; // left-to-right 1,2,1,2… (== right-to-left 2,1,… over 14 chars)
    const p = ALPHABET.indexOf(first14[i]) * factor;
    sum += Math.floor(p / 36) + (p % 36);
  }
  return ALPHABET[(36 - (sum % 36)) % 36];
}

export type GstinCheck = { ok: true; gstin: string; stateCode: string; pan: string } | { ok: false; error: string };

export function validateGstin(input: string): GstinCheck {
  const gstin = input.trim().toUpperCase().replace(/\s+/g, "");
  if (gstin.length !== 15) return { ok: false, error: "A GSTIN has exactly 15 characters." };
  if (!PATTERN.test(gstin)) return { ok: false, error: "That doesn't match the GSTIN format (e.g. 33AABCN1234F1Z5)." };
  const stateCode = gstin.slice(0, 2);
  if (!STATES[stateCode]) return { ok: false, error: `State code ${stateCode} isn't a valid GST state code.` };
  if (gstinChecksum(gstin.slice(0, 14)) !== gstin[14])
    return { ok: false, error: "The last character (checksum) doesn't match. Check the GSTIN for typos." };
  return { ok: true, gstin, stateCode, pan: gstin.slice(2, 12) };
}
