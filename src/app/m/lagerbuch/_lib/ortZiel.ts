/**
 * WOHIN EIN GESCANNTES ORTSETIKETT FUEHRT — DRK-312.
 *
 * Kein "use client", kein Icon-Import (Fallen 6 und 7). Die Weiche
 * `o/[ortId]/page.tsx` liest diese Funktion als Server Component.
 *
 * ⚠️ SIE LEITET AN `tokenZielPfad` WEITER, STATT DIE ZWEI FAELLE NOCH EINMAL
 * HINZUSCHREIBEN. Das ist der Punkt der Datei: „wo landet jemand, der an einem
 * Fahrzeug einsteigt?" ist dieselbe Frage, die ein auf ein Fahrzeug gebundenes
 * Zugangs-Kaertchen schon beantwortet (`_lib/tokenZiel.ts`), und zwei Antworten
 * darauf laufen auseinander, sobald jemand eine davon erweitert — genau die
 * Begruendung, aus der `tokenZielPfad` seinen Fahrzeugzweig ueber
 * `fahrzeugBindungAus` baut. Ein zweites `/helfer/check?fz=` im Modul waere eine
 * zweite Wahrheit, und die faellt erst auf, wenn die Check-Strecke umzieht.
 *
 * ⚠️ WARUM TROTZDEM EINE EIGENE DATEI UND KEIN ZWEITER EXPORT IN `tokenZiel.ts`:
 * jene Datei ist ZEICHENGLEICH aus der Alt-Anwendung uebernommen (§3.1, ihr
 * Kopf schreibt das aus). Ein neuer Export darin loeschte diese Zusage fuer eine
 * Sache, die es in der Alt-Anwendung gar nicht gibt.
 *
 * ⚠️ ES GIBT KEINEN LAGER-ZWEIG MIT EIGENEM ZIEL, und das ist eine
 * ENTSCHEIDUNG, keine Luecke (ClickUp DRK-312): einen Kontext „dieser
 * Lagerort" gibt es im Helfer-Ast nicht — `/helfer` zeigt den Bestand des
 * HANDLAGERS. Genau deshalb traegt der Etikettenbogen ausschliesslich den
 * Handlager und die Einheiten (`_db/etiketten.ts#ortEtikettenDaten`): fuer ein
 * zweites Lager gaebe es zwar eine Zeile, aber kein Ziel, das von ihm handelt —
 * das Etikett zeigte auf einen fremden Bestand. Ein Etikett, das luegt, ist
 * schlimmer als keins.
 */
import { tokenZielPfad } from "./tokenZiel";

/** Genau das, was die Zielwahl braucht — mehr liest diese Funktion nicht. */
export type EtikettOrt = { id: string; typ: "lager" | "fahrzeug" };

/**
 * Der lokale Pfad in AEUSSERER Form (`/helfer/check?fz=…`, `/helfer`), nie die
 * innere (`/m/lagerbuch/…`): er landet in einem `redirect()`, also beim
 * Browser, und der kennt nur den Modul-Host.
 */
export function ortZielPfad(ort: EtikettOrt): string {
  return tokenZielPfad(ort.typ === "fahrzeug" ? "fahrzeug" : null, ort.id);
}
