import { redirect } from "next/navigation";
import { CheckoutError, TransitionError } from "./orders";
import { InventoryError, OutOfStockError } from "./inventory";

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const optStr = (fd: FormData, k: string) => str(fd, k) || null;
export const int = (fd: FormData, k: string) => {
  const n = Number(str(fd, k));
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
};
/** Rupees text field → integer paise. "1,249.50" → 124950 */
export const paise = (fd: FormData, k: string) => {
  const n = Number(str(fd, k).replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

/** Only allow same-site relative redirects. */
export function safeNext(next: string | null | undefined, fallback = "/") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

export function withMsg(path: string, msg: { error?: string; ok?: string }) {
  const u = new URL(path, "http://x");
  u.searchParams.delete("error");
  u.searchParams.delete("ok");
  if (msg.error) u.searchParams.set("error", msg.error.slice(0, 400));
  if (msg.ok) u.searchParams.set("ok", msg.ok.slice(0, 200));
  return u.pathname + u.search;
}

export function userMessage(e: unknown): string {
  if (e instanceof CheckoutError || e instanceof TransitionError || e instanceof InventoryError || e instanceof OutOfStockError) return e.message;
  if (e && typeof e === "object" && "issues" in e) return "Some fields are missing or invalid.";
  console.error(e);
  return "Something went wrong. Nothing was changed — try again.";
}

/** Run a mutation, then redirect back with a success or error message. */
export async function attempt(back: string, ok: string, fn: () => Promise<unknown>): Promise<never> {
  let error: string | undefined;
  try {
    await fn();
  } catch (e) {
    error = userMessage(e);
  }
  redirect(withMsg(back, error ? { error } : { ok }));
}
