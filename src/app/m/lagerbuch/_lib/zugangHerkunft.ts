import { auditAccessActor } from "@/core/audit/server";
import type { AuditActor } from "@/core/audit/types";
import type { HelferZugang } from "./helferZugang";

/**
 * DIE VIER FRAGEN, DIE MAN EINEM `HelferZugang` STELLT — DRK-305.
 *
 * KEIN "use client" (Falle 6): die Werte lesen Server Components und Server
 * Actions.
 *
 * Bis DRK-305 gab es nur eine Herkunft, und jede dieser vier Antworten stand
 * darum als Ausdruck an ihrer Verwendungsstelle: `zugang.tokenId` im
 * Ziel-Cookie, `` `Zugang: Token ${code} · ${label}` `` in drei Seiten,
 * `quelleTyp: "token" as const` in zwei Actions, `auditAccessActor(…)` in drei.
 * Mit der zweiten Herkunft hat jede davon zwei Antworten — und zwoelf verstreute
 * Fallunterscheidungen sind zwoelf Gelegenheiten, die naechste zu vergessen.
 *
 * ⚠️ WAS EINE VERGESSENE STELLE KOSTET, ist je Frage verschieden, und keine
 * davon meldet sich:
 *
 *  * `journalQuelle` — ein fest verdrahtetes `quelleTyp: "token"` schriebe eine
 *    OIDC-Kennung in die Token-Spalte. `quelleAufloeser` (`_db/quelle.ts`) sucht
 *    sie dann unter `tokens.code`, findet nichts und zeigt die ROHE Kennung.
 *    Das Journal ist append-only: die Zeile bleibt für immer falsch.
 *  * `zugangsKennung` — die Bindung des Ziel-Cookies. Eine leere Kennung machte
 *    die Wahl aller Personen ununterscheidbar (`_lib/entnahmeZiel.ts` schreibt
 *    aus, warum `tk1` kein Präfix von `tk12` sein darf).
 *  * `zugangsAkteur` — `auditAccessActor` heißt „Gemeinsamer Zugangscode". Für
 *    eine angemeldete Person ist das schlicht falsch: das Protokoll führte eine
 *    namentlich bekannte Handlung als anonyme Kartenbenutzung.
 *  * `sitzungsEtikett` — die einzige Stelle, an der der Schirm sagt, WER hier
 *    gerade bucht.
 */

/**
 * DIE KENNUNG DIESES ZUGANGS — für Bindungen, nie für die Anzeige.
 *
 * Token: die Zeilen-Id des Kärtchens. Konto: der OIDC-`sub`. Beide sind stabil,
 * beide sind kollisionsfrei, und beide enthalten kein `|` — das ist die
 * Bedingung, unter der `zielWert` sie in den Cookie-Wert einbetten darf
 * (`_lib/entnahmeZiel.ts`).
 */
export function zugangsKennung(zugang: HelferZugang): string {
  return zugang.herkunft === "token" ? zugang.tokenId : zugang.sub;
}

/**
 * DIE JOURNAL-QUELLE — `quelleTyp`/`quelleId`, wie sie in jede append-only-Zeile
 * geht.
 *
 * ⚠️ BEIM TOKEN IST ES DER CODE, NICHT DIE ZEILEN-ID. Das Journal zeigt ihn als
 * Klarnamen an, und der Weg dorthin geht über `tokens.code` (`_db/quelle.ts`).
 * Wer hier `tokenId` einsetzt, bekommt eine Zeile, die auf nichts auflöst.
 *
 * ⚠️ BEIM KONTO IST ES DER `sub`, NICHT DER NAME. Namen ändern sich; der
 * Nachweis darf das nicht. `quelleAufloeser` schlägt den Namen zur Anzeige in
 * `users` nach — deshalb legt der Konto-Zweig die Zeile dort an, bevor er den
 * Zugang herausgibt (`_lib/helferZugang.ts`).
 *
 * Der Rückgabetyp ist ABSICHTLICH die enge Literal-Union der Spalte
 * (`_db/schema.ts`): ein `string` hier ginge durch jedes `.values({ … })` und
 * schriebe eine Herkunft, die kein Lesepfad kennt.
 */
export function journalQuelle(
  zugang: HelferZugang,
): { quelleTyp: "token" | "oidc"; quelleId: string } {
  return zugang.herkunft === "token"
    ? { quelleTyp: "token", quelleId: zugang.code }
    : { quelleTyp: "oidc", quelleId: zugang.sub };
}

/**
 * DER AKTEUR FÜRS ZUGRIFFSPROTOKOLL.
 *
 * `auditAccessActor` trägt den Namen „Gemeinsamer Zugangscode" und identifiziert
 * ausdrücklich einen ZUGANG, nie eine Person (`core/audit/server.ts`). Für das
 * Konto ist genau das Gegenteil wahr, also steht dort ein `kind: "user"`.
 *
 * ⚠️ NICHT `auditActor(viewer)` AUS `core/audit/server` — die Funktion erwartet
 * einen Viewer, und hier liegt keiner mehr vor; ein `{ sub }`-Objekt daraus zu
 * basteln wäre eine zweite Wahrheit über dieselbe Form. Der Name wird wie dort
 * auf 256 Zeichen gekappt, damit eine Protokollzeile nicht an einem
 * Anzeigenamen wächst.
 */
export function zugangsAkteur(zugang: HelferZugang): AuditActor {
  if (zugang.herkunft === "token") return auditAccessActor("lagerbuch", zugang.tokenId);
  return {
    kind: "user",
    id: zugang.sub,
    ...(zugang.name ? { name: zugang.name.slice(0, 256) } : {}),
  };
}

/**
 * DAS ETIKETT IM RAHMENKOPF — der einzige Satz, der sagt, wer hier gerade
 * arbeitet.
 *
 * ⚠️ DER CODE STEHT NUR IM TOKEN-FALL DA, und das war schon vorher so: er ist
 * das Secret selbst, aber die Person, die ihn liest, hat das Kärtchen gerade in
 * der Hand. Für das Konto gibt es kein Gegenstück — ein `sub` auf dem Schirm
 * sagt niemandem etwas.
 *
 * Ein Name aus Leerzeichen ist kein Name (dieselbe Regel wie in `_lib/konto.ts`
 * und `_db/quelle.ts`); ohne Namen bleibt die Rolle stehen, nicht die Kennung.
 */
export function sitzungsEtikett(zugang: HelferZugang): string {
  if (zugang.herkunft === "token") return `Zugang: Token ${zugang.code} · ${zugang.label}`;
  return `Angemeldet: ${zugang.name?.trim() || "Lagerbuch-Verwaltung"}`;
}
