import type { ReactNode } from "react";
import { SCHRIFT } from "../_lib/schrift";

/**
 * DER KOPF JEDER VERWALTUNGSSEITE — ersetzt `.mainhead` (`globals.css:197`).
 *
 * KEINE CLIENT-DIREKTIVE, und das ist der Punkt: die Ueberschrift ist NACKTES
 * `<h1>` mit einer Typografie-Rolle aus `_lib/schrift.ts`, nicht
 * `Typography.Title`. Ein Compound-Zugriff auf antd ergibt in einer Server
 * Component HTTP 500 (Falle 1) — und die Alternative „macht die Ueberschrift
 * halt zu einer Client-Insel" kostete 23 Client-Grenzen fuer eine Zeile Text.
 *
 * `aktionen` steht rechts oben (Anlegen-Knopf, Aktiv-Schalter, Export),
 * `beschreibung` darunter. Beide sind optional; die meisten Detailseiten
 * tragen nur `titel` und `aktionen`.
 *
 * Die Rolle kommt als INLINE-STIL und nicht als CSS-Klasse: `_lib/schrift.ts`
 * ist die eine Quelle, und eine zweite Abschrift in `verwaltung.module.css`
 * waere genau die Doppelung, gegen die die Rollen-Datei gebaut ist.
 */
export function SeitenKopf({
  titel,
  beschreibung,
  aktionen,
}: {
  titel: string;
  beschreibung?: ReactNode;
  aktionen?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        marginBlockEnd: 16,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h1 style={{ ...SCHRIFT.titel, margin: 0 }}>{titel}</h1>
        {beschreibung ? (
          <p style={{ ...SCHRIFT.neben, margin: "6px 0 0", maxWidth: "72ch" }}>{beschreibung}</p>
        ) : null}
      </div>
      {aktionen ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{aktionen}</div> : null}
    </div>
  );
}
