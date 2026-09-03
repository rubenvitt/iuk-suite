"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "antd";
import { AKTION_FEHLGESCHLAGEN } from "../_lib/aktionsfehler";
import { legeLernsetAn, setzeLernsetAktiv, type LernsetFormState } from "../actions";
import type { LernsetZeile } from "../_db/lernen";
import s from "./zeichen.module.css";

/*
 * DIE LERNSET-VERWALTUNG — EIGENE CLIENT-KOMPONENTE, KEIN antd `Table`, KEIN `Listy`
 * (Falle 9): sie bekommt ausschliesslich SERIALISIERBARE Zeilen (`LernsetZeile[]`, von
 * `(shell)/verwaltung/lernsets/page.tsx` gelesen) und definiert ihre eigene Darstellung
 * — ein natives `<table>`, keine `columns[].render`-Funktion, die aus einer Server
 * Component herueberkaeme.
 *
 * `legeLernsetAn` und `setzeLernsetAktiv` sind Server Actions und werden DIREKT
 * importiert, nicht als Prop durchgereicht — die einzige erlaubte Ausnahme von
 * „keine Funktionen ueber die RSC-Grenze".
 */

const START: LernsetFormState = { ok: false, feldFehler: {} };

export function LernsetTabelle({ zeilen }: { zeilen: readonly LernsetZeile[] }) {
  const [zustand, absenden] = useActionState(legeLernsetAn, START);
  const [titel, setTitel] = useState("");
  const [laufend, setLaufend] = useState<string | null>(null);
  const [imUebergang, starte] = useTransition();
  const [aktionsfehler, setAktionsfehler] = useState<string | null>(null);

  const fehlerTitel = !zustand.ok ? zustand.feldFehler.titel : undefined;
  const fehlerSlug = !zustand.ok ? zustand.feldFehler.slug : undefined;

  function umschalten(zeile: LernsetZeile) {
    setLaufend(zeile.id);
    starte(async () => {
      setAktionsfehler(null);
      try {
        await setzeLernsetAktiv(zeile.id, !zeile.aktiv);
      } catch {
        setAktionsfehler(AKTION_FEHLGESCHLAGEN);
      }
    });
  }

  return (
    <>
      <form action={absenden} data-testid="lernset-neu" style={{ marginBlockEnd: 24 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <div className={s.feld}>
            <label htmlFor="lernset-neu-titel">Titel</label>
            <input
              id="lernset-neu-titel"
              name="titel"
              className={s.eingabe}
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              aria-invalid={fehlerTitel ? true : undefined}
              data-testid="lernset-neu-titel"
            />
          </div>
          <div className={s.feld}>
            <label htmlFor="lernset-neu-slug">Kürzel (URL)</label>
            <input
              id="lernset-neu-slug"
              name="slug"
              className={s.eingabe}
              placeholder="rettungsdienst"
              aria-invalid={fehlerSlug ? true : undefined}
              data-testid="lernset-neu-slug"
            />
          </div>
          <Button htmlType="submit" type="primary" data-testid="lernset-neu-absenden">
            Anlegen
          </Button>
        </div>
        {(fehlerTitel || fehlerSlug) && (
          <p className={s.hinweis} data-testid="lernset-neu-fehler" role="status">
            {fehlerTitel ?? fehlerSlug}
          </p>
        )}
      </form>

      {aktionsfehler !== null && (
        <p className={s.hinweis} data-testid="lernset-aktionsfehler" role="status">
          {aktionsfehler}
        </p>
      )}

      {zeilen.length === 0 ? (
        <p data-testid="lernset-liste-leer">Noch kein Lernset angelegt.</p>
      ) : (
        <table data-testid="lernset-liste" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "start" }}>Titel</th>
              <th style={{ textAlign: "start" }}>Kürzel</th>
              <th style={{ textAlign: "start" }}>Zeichen</th>
              <th style={{ textAlign: "start" }}>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr
                key={z.id}
                data-testid={`lernset-zeile-${z.slug}`}
                className={s.tabellenzeile}
              >
                <td>
                  <Link href={`/m/zeichen/verwaltung/lernsets/${z.id}`}>{z.titel}</Link>
                </td>
                <td>{z.slug}</td>
                <td>{z.anzahl}</td>
                <td data-testid={`lernset-status-${z.slug}`}>{z.aktiv ? "Sichtbar" : "Entwurf"}</td>
                <td>
                  <Button
                    loading={imUebergang && laufend === z.id}
                    onClick={() => umschalten(z)}
                    data-testid={`lernset-umschalten-${z.slug}`}
                    // ARBEITSDICHTE: 44 als Literal fuer eigenes Markup.
                    style={{ minHeight: 44 }}
                  >
                    {z.aktiv ? "Zurückziehen" : "Veröffentlichen"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
