import { eq } from "drizzle-orm";
import type { Executor } from "@/db";
import { db } from "@/db";
import { settings } from "@/db/schema";

export type Settings = typeof settings.$inferSelect;

export async function getSettings(ex: Executor = db): Promise<Settings> {
  const [s] = await ex.select().from(settings).where(eq(settings.id, 1));
  if (!s) throw new Error("Store settings missing — run `npm run db:seed`.");
  return s;
}
