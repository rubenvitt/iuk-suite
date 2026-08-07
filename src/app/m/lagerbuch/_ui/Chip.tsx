import type { ReactNode } from "react";
import type { AmpelTon } from "../_lib/format";
import { Ikone, type IkonName } from "./ikonen";
import s from "./verwaltung.module.css";

/**
 * DER STATUSCHIP — 80 Verwendungen, eigenes Markup, KEIN antd-`Tag`.
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
 * DIE FARBE KOMMT NICHT ALS PROP, sondern ueber die Klasse aus den
 * CSS-Variablen (§6.6.2a). Nur so traegt der Chip beide Modi, ohne dass der
 * Server den Modus kennen muss — der Moduswechsel ist reines CSS
 * (`:root[data-theme="dark"]`), und eine Server Component weisz gar nicht,
 * welcher gilt.
 *
 * DIE NAMENSFALLE, die aus dem Bestand mitwandert: `s["gruen"]` waere
 * `undefined` und ergaebe `className="chip undefined"` — mit Polster und
 * Rundung, aber OHNE FARBE. Der Riegel dagegen ist der Typ `AmpelTon`, nicht
 * die Wachsamkeit; `ampelTon()` aus `_lib/format.ts` bildet `"gruen"` auf
 * `"ok"` ab und ist die einzige Quelle fuer diesen Wert.
 *
 * UND DIE REGEL UEBER DER FARBE: jeder Chip traegt TEXT, nie nur Farbe. Das
 * Zeichen ist `aria-hidden` und Zugabe — `chargeText` und `geraetFaelligChip`
 * (Teil 3, T39) liefern den Text, und sie wandern mit statt durch ein farbiges
 * Zeichen ersetzt zu werden.
 */
export function Chip({
  ton,
  zeichen,
  children,
}: {
  ton: AmpelTon;
  zeichen?: IkonName;
  children: ReactNode;
}) {
  return (
    <span className={`${s.chip} ${s[ton]}`}>
      {zeichen ? <Ikone name={zeichen} groesse={12} /> : null}
      {children}
    </span>
  );
}
