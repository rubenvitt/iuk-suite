"use client";

import { useEffect, useState, useTransition } from "react";
import { liesMerkliste, loescheGeraetedaten, type MerkEintrag } from "../_lib/merkgeraet";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * Die Merkliste, wie sie auf DIESEM Geraet liegt — samt Hinweis und
 * Loeschknopf (Spec §7.5).
 *
 * ⛔ DER GRIFF HEISST `zeichen-merkliste-geraet` UND NICHT `zeichen-merkliste`:
 * der zweite Name ist in Aufgabe 6 an die ONLINE-Merkliste vergeben. Derselbe
 * Name auf zwei Flaechen macht den PWA-Fall in Aufgabe 10 blind oder
 * mehrdeutig.
 *
 * ⛔ DER HINWEIS STEHT UNMITTELBAR BEI DER LISTE, nicht in einer Fusszeile. Er
 * ist kein Riegel, er ist eine Aussage: offline gibt es keine
 * Authentifizierung, und auf einem geteilten Geraet sieht die Titel auch, wer
 * sich nach dir anmeldet.
 *
 * ⛔ EIGENES `<button>` MIT `minHeight: 44` ALS LITERAL. Eigenes Markup erbt den
 * antd-Token nicht (Falle 5), und `--ant-*` ist ausserhalb von antds
 * Scope-Klasse unsichtbar (Falle 2, still). 44 ist die Untergrenze des Repos
 * (WCAG 2.5.5 AAA) und dieselbe Zahl, die `Arbeitsdichte` an die
 * antd-Bedienelemente dieser Flaeche legt.
 */
export function MerklisteGeraet() {
  const [eintraege, setEintraege] = useState<readonly MerkEintrag[]>([]);
  const [geladen, setGeladen] = useState(false);
  const [laeuft, starte] = useTransition();

  useEffect(() => {
    let lebt = true;
    void liesMerkliste().then((liste) => {
      if (!lebt) return;
      setEintraege(liste);
      setGeladen(true);
    });
    return () => {
      lebt = false;
    };
  }, []);

  // Vor dem ersten Lesen gar nichts zeigen: eine leere Liste, die sich gleich
  // fuellt, sieht aus wie „nichts gemerkt" und ist eine Falschaussage.
  if (!geladen) return null;

  return (
    <section
      data-testid="zeichen-merkliste-geraet"
      style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}
    >
      <h2 style={{ ...SCHRIFT.unterTitel, margin: 0 }}>Deine Merkliste</h2>

      {eintraege.length === 0 ? (
        <p style={{ ...SCHRIFT.text, margin: 0 }} data-testid="zeichen-merkliste-geraet-leer">
          Auf diesem Gerät liegt noch keine Merkliste. Öffne die Merkliste einmal mit Verbindung,
          dann ist sie danach auch ohne da.
        </p>
      ) : (
        <ul
          style={{ ...SCHRIFT.text, margin: 0, paddingInlineStart: SPACE.lg }}
          data-testid="zeichen-merkliste-geraet-liste"
        >
          {eintraege.map((e) => (
            <li key={e.id} style={{ minHeight: 44, display: "flex", alignItems: "center" }}>
              {e.titel}
            </li>
          ))}
        </ul>
      )}

      <p style={{ ...SCHRIFT.neben, margin: 0 }} data-testid="zeichen-merkliste-geraet-hinweis">
        Deine Merkliste ist auf diesem Gerät gespeichert, damit sie ohne Verbindung da ist. Auf
        einem geteilten Gerät sieht sie auch, wer sich nach dir anmeldet. Der Knopf darunter
        löscht nur die Merkliste — die gespeicherten Zeichen bleiben.
      </p>

      <button
        type="button"
        data-testid="zeichen-merkliste-geraet-loeschen"
        disabled={laeuft}
        onClick={() =>
          starte(async () => {
            await loescheGeraetedaten();
            setEintraege([]);
          })
        }
        style={{
          ...SCHRIFT.text,
          minHeight: 44,
          alignSelf: "flex-start",
          paddingInline: SPACE.md,
          border: "1px solid var(--iuk-linie)",
          borderRadius: 4,
          background: "transparent",
          color: "inherit",
          cursor: "pointer",
        }}
      >
        Von diesem Gerät löschen
      </button>
    </section>
  );
}
