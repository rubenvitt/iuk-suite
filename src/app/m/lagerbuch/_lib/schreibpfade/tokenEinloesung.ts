import { eq } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { tokens } from "../../_db/schema";
import { createHelferSitzung, type HelferPayload } from "../helferSitzung";

/**
 * DIE TOKEN-EINLOESUNG — §7.5.2, Schritt 4. Portiert aus
 * `lagerbuch/src/actions/token-redeem.ts` mit drei entschiedenen Aenderungen.
 *
 * SIE LIEGT UNTER `_lib/schreibpfade/`, WEIL SIE SCHREIBT: `tokens.lastUsedAt`
 * (token-redeem.ts:16). §2.1 h ist kategorisch — „jeder Schreibweg unter
 * `_lib/schreibpfade/`".
 *
 * ⚠️ WARUM FALLE 16 TEUER IST — DIE KOSTENAUSSAGE AUF DEM STAND VON 8-F.
 * Der Schaden eines cross-origin-Redirects ist eine EINLOESUNG OHNE SITZUNG:
 * `redeemToken` laeuft auf dem fremden Host durch, schreibt `lastUsedAt`, und
 * das Cookie landet auf einer Origin, auf der es niemand benutzen kann. Die
 * Helferin steht am Regal und hat nichts. DESHALB antwortet `t/[code]/route.ts`
 * mit RELATIVEM Location (§7.2.3), und DESHALB steht der Host-Riegel VOR dieser
 * Funktion, nicht dahinter — beide Konstruktionsentscheidungen bleiben
 * unveraendert richtig.
 *
 * ⚠️ NICHT MEHR GUELTIG (korrigiert im Abschluss von Teil 4): die aus der
 * Alt-Anwendung uebernommene Begruendung, ein einmal eingeloester Code sei
 * „nicht mehr loeschbar, sondern nur noch sperrbar". Das Schema dieses Moduls
 * entscheidet das GEGENTEILIG — `_db/schema.ts:412-413`: `lastUsedAt` ist
 * „reines Anzeigefeld, OHNE Einfluss auf Gueltigkeit und (nach Entscheidung
 * 8-F) auch ohne Einfluss auf Loeschbarkeit". Ein Kaertchen wird JEDE SCHICHT
 * gescannt und bleibt nach der Einloesung einloesbar
 * (`tokenEinloesung.test.ts`, „BLEIBT NACH DER EINLOESUNG EINLOESBAR").
 * `loeschen.ts:89-99` ist eine HERKUNFTSMARKE in die ALT-Anwendung
 * (`lagerbuch/src/actions/loeschen.ts`); im neuen Modul gibt es die Datei
 * nicht. Wer die Marke fuer geltendes Recht haelt, haelt die Auflagen oben fuer
 * entbehrlich — und holt Falle 16 zurueck.
 *
 * KEIN "use client": drei Aufrufer, alle serverseitig.
 */

export type EinloesungTreffer = {
  ok: true;
  cookieValue: string;
  tokenId: string;
  zielTyp: "fahrzeug" | "artikel" | null;
  zielId: string | null;
};

export type Einloesung = EinloesungTreffer | { ok: false };

/**
 * @param code  Der BEREITS NORMALISIERTE Code. Diese Funktion normalisiert
 *              NICHT: das tut `_lib/code.ts#normalisiereCode` (Teil 2, T17) beim
 *              Aufrufer (§7.5.2, Schritt 3). Zwei Normalisierungen an zwei Orten
 *              sind der Ort, an dem sie auseinanderlaufen — und die des
 *              Bestands (`trim().toUpperCase()`) ist auf einer reinen
 *              Ziffernfolge ohnehin wirkungslos (Falle 24).
 * @param db    PFLICHT, kein Vorgabewert. `_db/client.ts#getDb()` ist der
 *              einzige Opener des Moduls (§5.13.2); ein Schreibpfad, der ihn
 *              selbst riefe, waere der erste, der die Regel aufweicht.
 *
 * DER NICHT-TREFFER IST EINE EINZIGE FORM. „unbekannt" und „gesperrt" sind von
 * aussen NICHT unterscheidbar — ein Rueckgabewert, der sie traennte, waere ein
 * Orakel darueber, welche der 10^6 Ziffernfolgen je vergeben waren. Das Gate
 * zeigt fuer beide denselben Satz (§3.9, `grund=code`).
 */
export async function redeemToken(code: string, db: DB): Promise<Einloesung> {
  const t = db.select().from(tokens).where(eq(tokens.code, code)).get();
  if (!t || !t.aktiv) return { ok: false };

  // NUR bei einem Treffer. Ein gesperrtes Kaertchen traegt sonst nach jedem
  // Scanversuch eine frische Spur, und die Token-Verwaltung zeigte Aktivitaet,
  // die es nicht gibt.
  db.update(tokens).set({ lastUsedAt: new Date() }).where(eq(tokens.id, t.id)).run();

  // §3.4.3: die Nutzlast wird auf {tokenId} GEKUERZT. `code` und `label` kommen
  // ab jetzt aus der DB-Zeile (§3.4.4) — sie stehen dort ohnehin und sind dort
  // AKTUELL, waehrend ein Cookie sie zwoelf Stunden lang einfriert.
  const payload: HelferPayload = { tokenId: t.id };
  return {
    ok: true,
    cookieValue: await createHelferSitzung(payload),
    tokenId: t.id,
    zielTyp: t.zielTyp,
    zielId: t.zielId,
  };
}
