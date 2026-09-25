/**
 * Anlegen und Wiederherstellen des EINEN echten Schlüsselpaars der Suite (Spec §12).
 * Beide Wege laufen über `erzeugeNotfalldatei`/`oeffneNotfalldatei`: ohne gültige
 * Notfall-Sicherung entsteht nie ein echtes Paar — ein verlorener privater Schlüssel
 * (KEK-Rotation, Rechnerverlust) wäre sonst unwiderruflich.
 */
import { eq } from "drizzle-orm";
import { schluesselpaar } from "../../_db/schema";
import type { Bytes } from "../kern/bytes";
import { zuBase64, sha256Hex } from "../kern/bytes";
import { erzeugeSchluesselpaar } from "../kern/umschlag";
import type { Db } from "../stammdaten/daten";
import { erzeugeNotfalldatei, oeffneNotfalldatei, type Notfalldatei } from "./notfall";
import { echtesPaar, legePaarAn, verschluesselePrivat } from "./paar";

export class EchtesPaarVorhanden extends Error {
  constructor(id: string) {
    super(`Es gibt schon ein echtes Schlüsselpaar (${id}). Schlüsselwechsel gehört nicht zu v2.0.`);
  }
}
export class AnderesPaarVorhanden extends Error {
  constructor(vorhanden: string, sicherung: string) {
    super(`In der Suite liegt das Paar ${vorhanden}, die Sicherung gehört zu ${sicherung}.`);
  }
}

/** Zeitpunkt mit Offset in der Zone des Prozesses, z. B. 2026-09-24T10:00:00+02:00. */
function mitOffset(d: Date): string {
  const m = -d.getTimezoneOffset();
  const v = m >= 0 ? "+" : "-";
  const a = Math.abs(m);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${v}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}

export interface EchtesPaarVorbereitung {
  notfall: Notfalldatei;
  /**
   * Schreibt die DB-Zeile — erst hier entsteht das echte Paar. Der Aufrufer ruft dies
   * NACHDEM `notfall` sicher weggeschrieben ist (Datei, QR, …), nie davor. Prüft unmittelbar
   * vor dem Einfügen erneut, ob inzwischen (z. B. durch einen parallelen Aufruf) ein echtes
   * Paar entstanden ist, und wirft in dem Fall `EchtesPaarVorhanden` statt einer zweiten Zeile.
   */
  speichere(kek: Bytes): Promise<{ schluesselId: string }>;
}

/**
 * Erzeugt Schlüsselpaar und Notfall-Sicherung, legt aber NOCH KEINE DB-Zeile an — das
 * übernimmt `speichere` auf dem Ergebnis, erst nachdem die Sicherung sicher außerhalb des
 * Prozessspeichers liegt (Datei + QR). Ohne diese Trennung entstünde bei einem Schreibfehler
 * der Sicherungsdateien (voller Platte, fehlender/schreibgeschützter Ordner, Aufruffehler) ein
 * echtes Paar, dessen Sicherung nur im Arbeitsspeicher existierte und mit dem Prozess verloren
 * ginge — der nächste Aufruf fände bereits ein Paar vor (`EchtesPaarVorhanden`) und könnte
 * keine Sicherung mehr nachliefern.
 */
export async function bereiteEchtesPaarVor(
  db: Db,
  o: { kennwort: string; jetzt: Date },
): Promise<EchtesPaarVorbereitung> {
  const vorhanden = echtesPaar(db);
  if (vorhanden) throw new EchtesPaarVorhanden(vorhanden.schluesselId);
  // Erst die Sicherung (prüft die Kennwortlänge), dann die Zeile: ohne Sicherung kein Paar.
  const p = await erzeugeSchluesselpaar();
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", p.privateKey));
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", p.publicKey));
  const kopf = { schluesselId: (await sha256Hex(spki)).slice(0, 16), oeffentlich: zuBase64(spki), erstellt: mitOffset(o.jetzt) };
  const notfall = await erzeugeNotfalldatei(pkcs8, kopf, o.kennwort);
  return {
    notfall,
    async speichere(kek: Bytes) {
      const nochVorhanden = echtesPaar(db);
      if (nochVorhanden) throw new EchtesPaarVorhanden(nochVorhanden.schluesselId);
      const neu = await legePaarAn(db, { art: "echt", rechnerId: null, kek, jetzt: o.jetzt, paar: { pkcs8, oeffentlich: kopf.oeffentlich } });
      return { schluesselId: neu.schluesselId };
    },
  };
}

/**
 * Bequemlichkeitshülle für Aufrufer, die Vorbereiten und Speichern nicht trennen müssen
 * (z. B. Tests ohne eigene Dateisicherung). Das Skript (`scripts/einsatzbuch-schluessel.ts`)
 * nutzt stattdessen `bereiteEchtesPaarVor` direkt, um zwischen beiden Schritten die
 * Notfall-Dateien zu schreiben.
 */
export async function erzeugeEchtesPaar(
  db: Db,
  o: { kek: Bytes; kennwort: string; jetzt: Date },
): Promise<{ schluesselId: string; notfall: Notfalldatei }> {
  const { notfall, speichere } = await bereiteEchtesPaarVor(db, o);
  const { schluesselId } = await speichere(o.kek);
  return { schluesselId, notfall };
}

export async function stelleEchtesPaarWiederHer(
  db: Db,
  o: { kek: Bytes; notfall: Notfalldatei; kennwort: string },
): Promise<{ schluesselId: string; ersetzt: boolean }> {
  const pkcs8 = await oeffneNotfalldatei(o.notfall, o.kennwort);
  const id = o.notfall.kopf.schluesselId;
  const vorhanden = echtesPaar(db);
  if (vorhanden && vorhanden.schluesselId !== id) throw new AnderesPaarVorhanden(vorhanden.schluesselId, id);
  if (vorhanden) {
    db.update(schluesselpaar)
      .set({ privatVerschluesselt: await verschluesselePrivat(pkcs8, id, o.kek) })
      .where(eq(schluesselpaar.id, vorhanden.id))
      .run();
    return { schluesselId: id, ersetzt: true };
  }
  await legePaarAn(db, { art: "echt", rechnerId: null, kek: o.kek, jetzt: new Date(), paar: { pkcs8, oeffentlich: o.notfall.kopf.oeffentlich } });
  return { schluesselId: id, ersetzt: false };
}
