import type { ReactNode } from "react";
import { Statuschip, type Statuston } from "@/core/status/Statuschip";
import type { AmpelTon } from "../_lib/format";
import { Ikone, type IkonName } from "./ikonen";

/**
 * DER STATUSCHIP DER VERWALTUNG — 80 Verwendungen, KEIN antd-`Tag`. Seit der
 * Haarlinie (IDA-347, Etappe 3) ein Adapter auf `core/status`: das Lagerbuch
 * behaelt seine Ampel-Namen, der Chip sieht aus wie in jedem anderen Modul.
 * Die Helferflaechen tragen ihren eigenen (`HelferChip`) und bleiben, wie sie
 * sind.
 *
 * KEIN "use client": er steht auf RSC-Seiten (Uebersicht, Check-Detail,
 * Verfallsliste) UND in Client-Inseln. Er ruft nichts auf Modulebene auf und
 * gibt nur JSX zurueck — damit laeuft er in beiden Ebenen.
 *
 * DREI GRUENDE GEGEN `Tag` (§6.6.3):
 *  1. `Tag color="error"` greift auf `colorError` zu — also auf Suite-Rot,
 *     also auf Falle 3. Eine fachsemantische Palette laeszt sich `Tag` nur
 *     unterschieben, indem man ihm eine eigene Farbe als Prop gibt; dann ist
 *     der Baustein nur noch eine Huelle mit Rundung.
 *  2. Der Fehler waere nicht sichtbar kaputt, sondern nur FALSCH. Ein
 *     `Tag color="error"` ist gueltiges antd, im jsdom-DOM steht dieselbe
 *     Klasse, und am Bildschirm sieht es nicht defekt aus. Kein Gate faengt
 *     das.
 *  3. `Tag.CheckableTag` ist ein Compound-Zugriff (Falle 1) — wer `Tag` als
 *     Baustein etabliert, macht den Griff dorthin wahrscheinlicher.
 *
 * DIE FARBE KOMMT NICHT ALS PROP, sondern ueber die Tonklasse des
 * Kernbausteins und deren CSS-Variable (§6.6.2a). Nur so traegt der Chip beide Modi, ohne dass der
 * Server den Modus kennen muss — der Moduswechsel ist reines CSS
 * (`:root[data-theme="dark"]`), und eine Server Component weisz gar nicht,
 * welcher gilt.
 *
 * DIE NAMENSFALLE, die aus dem Bestand mitwandert: ein `"gruen"` faende in
 * `TON` keinen Eintrag. Der Riegel ist der Typ `AmpelTon`, nicht die
 * Wachsamkeit; `ampelTon()` aus `_lib/format.ts` bildet `"gruen"` auf `"ok"`
 * ab und ist die einzige Quelle fuer diesen Wert. `rot` ist im Lagerbuch ein
 * Missstand (abgelaufen, unter Mindestbestand) und damit Ton `fehler` — der
 * einzige, der Rot traegt (Falle 3).
 *
 * UND DIE REGEL UEBER DER FARBE: jeder Chip traegt TEXT, nie nur Farbe. Das
 * Zeichen ist `aria-hidden` und Zugabe — `chargeText` und `geraetFaelligChip`
 * (Teil 3, T39) liefern den Text, und sie wandern mit statt durch ein farbiges
 * Zeichen ersetzt zu werden.
 */
export const TON: Readonly<Record<AmpelTon, Statuston>> = {
  ok: "ok",
  gelb: "warnung",
  rot: "fehler",
  grau: "neutral",
};

export function Chip({
  ton,
  zeichen,
  title,
  children,
}: {
  ton: AmpelTon;
  zeichen?: IkonName;
  /**
   * OPTIONAL, additiv (Ruling A15) — bestehende Aufrufstellen bleiben
   * unveraendert, die Darstellung ohne `title` aendert sich nicht. Nachgezogen
   * aus der eingefrorenen Alt-Anwendung (`lagerbuch/src/app/verwaltung/(admin)/journal/page.tsx:62`):
   * dort trug der Quelle-Chip `title={j.quelleId}` — Label als Text, roher
   * Code im Tooltip. `_db/quelle.ts:9-11` haelt fest, dass die rohe Kennung in
   * der Datenbank nachweisfest bleibt; `title` ist die einzige Stelle in der
   * Oberflaeche, an der sie wieder sichtbar wird.
   */
  title?: string;
  children: ReactNode;
}) {
  return (
    <Statuschip
      ton={TON[ton]}
      title={title}
      symbol={zeichen ? <Ikone name={zeichen} groesse={12} /> : undefined}
    >
      {children}
    </Statuschip>
  );
}
