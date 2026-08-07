import { eq } from "drizzle-orm";
import type { DB } from "./client";
import { bzGeraete, geraete } from "./schema";

export type BarcodeBesitzer = {
  tabelle: "geraet" | "bzGeraet";
  id: string;
};

function wirfBarcodeKollision(): never {
  const fehler = new Error("Barcode bereits vergeben.");
  fehler.name = "BarcodeKollision";
  throw fehler;
}

/**
 * Erzwingt den gemeinsamen, byte-exakten Barcode-Namensraum der beiden
 * Geraetetabellen. SQLite kann keinen UNIQUE-Index ueber Tabellen hinweg
 * abbilden, deshalb pruefen beide schreibenden Actions hier.
 */
export function pruefeBarcodeFrei(
  db: DB,
  barcode: string,
  ausnahme: BarcodeBesitzer | null,
): void {
  const geraet = db.select({ id: geraete.id }).from(geraete)
    .where(eq(geraete.barcode, barcode)).get();
  if (geraet && !(ausnahme?.tabelle === "geraet" && ausnahme.id === geraet.id)) {
    wirfBarcodeKollision();
  }

  const bzGeraet = db.select({ id: bzGeraete.id }).from(bzGeraete)
    .where(eq(bzGeraete.barcode, barcode)).get();
  if (bzGeraet && !(ausnahme?.tabelle === "bzGeraet" && ausnahme.id === bzGeraet.id)) {
    wirfBarcodeKollision();
  }
}
