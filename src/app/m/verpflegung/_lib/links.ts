import { qrSvg } from "@/core/qr";
import type { VerpflegungDb } from "../_db/client";
import { helferLinkZiel } from "./ansicht";
import { ladeLinks } from "./daten";
import { linkGilt } from "./helfer";
import type { LinkZeile } from "./typen";

/**
 * Die Helfer-Links für die Verwaltung. Adresse und QR nur für Links, die gerade gelten — ein gesperrter Code
 * steht nirgends mehr zum Abschreiben, und der Code selbst geht nie an den Browser. Kein `"use client"`.
 */
export async function linkZeilen(db: Pick<VerpflegungDb, "select">, basis: string, jetzt = Date.now()): Promise<LinkZeile[]> {
  return Promise.all(ladeLinks(db).map(async (l) => {
    const stand = !l.aktiv ? "gesperrt" : linkGilt(l, jetzt) ? "aktiv" : "abgelaufen";
    const adresse = stand === "aktiv" ? helferLinkZiel(basis, l.code) : null;
    return { ...l, code: "", stand, adresse, qr: adresse ? await qrSvg(adresse) : null };
  }));
}
