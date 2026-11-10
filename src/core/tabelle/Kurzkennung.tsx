"use client";

/**
 * EINE LANGE KENNUNG IN EINER TABELLENZELLE — gekürzt, mit „Kopieren" (IDA-393).
 *
 * Zugangs-Codes, Abgabelinks und persönliche Links standen im Klartext in der Zeile und gaben
 * der Spalte die Breite ihres längsten Werts: bei 1280px schob das Status und Aktionen aus dem
 * Bild. Lesen muss man so einen Wert nie ganz — man vergleicht den Anfang und kopiert ihn.
 * Deshalb: die ersten `zeichen` Zeichen, dann „…", daneben ein Knopf, der den GANZEN Wert
 * kopiert. Der volle Wert steht im `title`.
 */

import { App, Button } from "antd";
import { Icons8Ikone } from "../ikonen/Icons8Ikone";
import { SCHRIFT } from "../theme/schrift";
import { kuerze } from "./kuerzen";

export type KurzkennungProps = {
  /** Was kopiert wird — der ganze Wert. */
  wert: string;
  /** Was angezeigt wird, wenn es nicht der Anfang von `wert` sein soll (z. B. ohne Schema). */
  anzeige?: string;
  /** Wie viele Zeichen sichtbar bleiben. */
  zeichen?: number;
  /** Wofür der Wert steht — der Knopf heißt „<was> kopieren". */
  was: string;
  /** Die Meldung nach dem Kopieren. */
  kopiert?: string;
  /** Mit `href`: der gekürzte Wert ist ein Link. */
  href?: string;
};

export function Kurzkennung({ wert, anzeige, zeichen = 12, was, kopiert, href }: KurzkennungProps) {
  const { message } = App.useApp();
  const text = kuerze(anzeige ?? wert, zeichen);
  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(wert);
      message.success(kopiert ?? `${was} kopiert.`);
    } catch {
      message.info({ content: `Kopieren ging nicht. ${was}: ${wert}`, duration: 15 });
    }
  };
  const stil = { ...SCHRIFT.mono, whiteSpace: "nowrap" as const };
  return (
    <span data-rolle="kurzkennung" style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
      {href
        ? <a href={href} target="_blank" rel="noreferrer" title={wert} style={stil}>{text}</a>
        : <span title={wert} style={stil}>{text}</span>}
      <Button type="text" aria-label={`${was} kopieren`} icon={<Icons8Ikone name="copy" groesse={16} />} onClick={() => void kopieren()} />
    </span>
  );
}
