"use client";

import { useState } from "react";
import { Alert, App, Button, Tag } from "antd";
import { Kartentabelle } from "@/core/tabelle";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { csvUebernehmenAction, csvVorschauAction } from "../../_actions/stammdaten";
import { KOPFZEILEN, dekodiere, type Importklasse, type Vorschauzeile } from "../../_lib/stammdaten/csv";
import type { Stammdatenart } from "../../_lib/stammdaten/typen";

/*
 * Kein Rot auf der Datenfläche (Falle 3: `colorError === colorPrimary`). „Fehler“ trägt die
 * Warnfarbe, und jede Klasse steht zusätzlich als Wort da — Bedeutung nie allein über Farbe.
 */
const KLASSE: Record<Importklasse, { text: string; farbe: string }> = {
  neu: { text: "Neu", farbe: "green" },
  geaendert: { text: "Geändert", farbe: "blue" },
  unveraendert: { text: "Unverändert", farbe: "default" },
  fehler: { text: "Fehler", farbe: "warning" },
};

/**
 * CSV-Import einer Stammdatenart: Datei wählen → Vorschau (Probelauf auf dem Server, schreibt
 * nichts) → „Übernehmen“ (plant auf dem Server neu und schreibt). Der Browser dekodiert nur
 * die Bytes (UTF-8, sonst Windows-1252); Parsen und Abgleich laufen beide Male serverseitig.
 */
export function CsvImport({ art, onFertig }: { art: Stammdatenart; onFertig: () => void }) {
  const { message } = App.useApp();
  const [text, setText] = useState<string | null>(null);
  const [zeilen, setZeilen] = useState<Vorschauzeile[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const kopf = KOPFZEILEN[art];

  async function gewaehlt(datei: File | undefined): Promise<void> {
    setZeilen(null);
    setFehler(null);
    setText(null);
    if (!datei) return;
    setLaeuft(true);
    try {
      const inhalt = dekodiere(new Uint8Array(await datei.arrayBuffer()));
      const ergebnis = await csvVorschauAction(art, inhalt);
      if (ergebnis.ok) {
        setText(inhalt);
        setZeilen(ergebnis.wert);
      } else {
        setFehler(ergebnis.fehler);
      }
    } catch {
      setFehler("Die Datei ließ sich nicht lesen. Bitte noch einmal wählen.");
    } finally {
      setLaeuft(false);
    }
  }

  async function uebernehmen(): Promise<void> {
    if (text === null) return;
    setLaeuft(true);
    try {
      const ergebnis = await csvUebernehmenAction(art, text);
      if (ergebnis.ok) {
        void message.success(`${ergebnis.wert.neu} angelegt, ${ergebnis.wert.geaendert} geändert.`);
        onFertig();
      } else {
        setFehler(ergebnis.fehler);
      }
    } catch {
      setFehler("Übernehmen ist fehlgeschlagen. Bitte noch einmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  }

  const anzahl = (k: Importklasse) => zeilen?.filter((z) => z.klasse === k).length ?? 0;
  const schreibbar = anzahl("neu") + anzahl("geaendert") > 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.lg }}>
      <p style={{ margin: 0 }}>
        Die Datei braucht die Kopfzeile „{kopf.join(";")}“. Trennzeichen Semikolon oder Komma, Excel-CSV geht direkt.
      </p>

      <div>
        <label htmlFor="csv-datei" style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
          CSV-Datei wählen
        </label>
        <input
          id="csv-datei"
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV-Datei"
          disabled={laeuft}
          onChange={(e) => {
            const eingabe = e.target;
            // Zurücksetzen, sonst löst dieselbe Datei kein zweites `onChange` mehr aus (z. B. nach einer korrigierten CSV mit gleichem Namen).
            void gewaehlt(eingabe.files?.[0]).finally(() => {
              eingabe.value = "";
            });
          }}
        />
      </div>

      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}

      {zeilen ? (
        <>
          <p style={{ margin: 0 }}>
            {anzahl("neu")} neu · {anzahl("geaendert")} geändert · {anzahl("unveraendert")} unverändert · {anzahl("fehler")} mit Fehler
          </p>
          <Kartentabelle<Vorschauzeile>
            rowKey="zeile"
            aria-label="Vorschau des Imports"
            dataSource={zeilen}
            leer={{ nichts: "Die Datei enthält keine Datenzeilen." }}
            columns={[
              { title: "Zeile", key: "zeile", render: (_: unknown, z: Vorschauzeile) => z.zeile },
              ...kopf.map((spalte) => ({
                title: spalte,
                key: `wert-${spalte}`,
                render: (_: unknown, z: Vorschauzeile) => z.werte[spalte] ?? "",
              })),
              {
                title: "Ergebnis",
                key: "ergebnis",
                render: (_: unknown, z: Vorschauzeile) => <Tag color={KLASSE[z.klasse].farbe}>{KLASSE[z.klasse].text}</Tag>,
              },
              { title: "Hinweis", key: "hinweis", render: (_: unknown, z: Vorschauzeile) => z.fehler ?? "" },
            ]}
          />
          <div>
            <Button type="primary" disabled={!schreibbar || laeuft} loading={laeuft} onClick={() => void uebernehmen()}>
              Übernehmen
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
