/**
 * Nur für `route.test.ts` unter `api/`: baut Codes, Sitzungen und Rechner ohne Umweg über HTTP,
 * damit jeder Route-Test sich auf SEINEN Handler konzentrieren kann. Kein Teil des Drahtvertrags —
 * hier wird direkt gegen die Datenbank gearbeitet, wie es Task 2 in den eigenen Tests auch tut
 * (Vorbild `freigabe.test.ts`, `rechner.test.ts`).
 */
import { erzeugeCode, type Einrichtungswunsch } from "./einmalcode";
import { richteEin, type Einrichtungsergebnis } from "./rechner";
import { erzeugeSitzung, sitzungAus, type SitzungZeile } from "./sitzung";
import { s256 } from "./token";
import type { Db } from "../stammdaten/daten";

/** Legt einen Einmalcode an und liefert ihn zusammen mit seinem PKCE-Verifier (nicht die Challenge: die steht als `s256(verifier)` in der DB, `loeseEin` prüft das nach). */
export function codeFuer(
  db: Db,
  o: { sub?: string; name?: string; jetzt: Date; einrichtung?: Einrichtungswunsch | null; verifier?: string },
): { code: string; verifier: string } {
  const verifier = o.verifier ?? "v".repeat(43);
  const code = erzeugeCode(db, {
    challenge: s256(verifier), sub: o.sub ?? "sub-1", name: o.name ?? "Jana Albers",
    jetzt: o.jetzt, einrichtung: o.einrichtung ?? null,
  });
  return { code, verifier };
}

/** Legt eine gültige Sitzung direkt an (ohne den Tausch-Schritt) und löst sie sofort auf. */
export function sitzungFuer(
  db: Db,
  o: { sub?: string; name?: string; rechnerId?: string | null; einrichtung?: Einrichtungswunsch | null; jetzt: Date },
): { token: string; sitzung: SitzungZeile } {
  const { token } = erzeugeSitzung(db, {
    sub: o.sub ?? "sub-1", name: o.name ?? "Jana Albers",
    rechnerId: o.rechnerId ?? null, einrichtung: o.einrichtung ?? null, jetzt: o.jetzt,
  });
  const sitzung = sitzungAus(db, token, o.jetzt);
  if (!sitzung) throw new Error("Sitzung fehlt");
  return { token, sitzung };
}

/** Richtet über eine frische Sitzung einen Rechner ein und liefert die Einrichtungsantwort. */
export async function richteRechnerEin(
  db: Db,
  o: { art?: "echt" | "test"; name?: string; jetzt: Date; env: Record<string, string | undefined> },
): Promise<Extract<Einrichtungsergebnis, { ok: true }>["antwort"]> {
  const einrichtung: Einrichtungswunsch = { art: o.art ?? "test", name: o.name ?? "Übungsrechner", ersetzen: false };
  const { sitzung } = sitzungFuer(db, { einrichtung, jetzt: o.jetzt });
  const e = await richteEin(db, sitzung, { art: einrichtung.art, name: einrichtung.name }, { jetzt: o.jetzt, env: o.env });
  if (!e.ok) throw new Error(`richteEin: ${e.code}`);
  return e.antwort;
}
