import { eq } from "drizzle-orm";
import { getDb } from "@/app/m/portal/_db/client";
import { einstellungen } from "@/app/m/portal/_db/schema";

const ANSPRECHPARTNER = "ansprechpartner";

/** `null`, wenn nichts gepflegt ist — der Leerzustand zeigt dann nur die Erklärung. */
export async function leseAnsprechpartner(): Promise<string | null> {
  const db = getDb();
  const zeilen = await db
    .select()
    .from(einstellungen)
    .where(eq(einstellungen.schluessel, ANSPRECHPARTNER))
    .limit(1);
  return zeilen[0]?.wert.trim() || null;
}

export async function setzeAnsprechpartner(wert: string): Promise<void> {
  const db = getDb();
  await db
    .insert(einstellungen)
    .values({ schluessel: ANSPRECHPARTNER, wert })
    .onConflictDoUpdate({ target: einstellungen.schluessel, set: { wert } });
}
