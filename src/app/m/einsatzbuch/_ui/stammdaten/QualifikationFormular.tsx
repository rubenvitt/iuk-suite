"use client";

import { useId, useState, type FormEvent } from "react";
import { Alert, Button, Input, InputNumber } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { qualifikationSpeichernAction } from "../../_actions/stammdaten";
import type { FeldFehler } from "../../_lib/actionErgebnis";
import type { QualifikationDTO } from "../../_lib/stammdaten/typen";
import { Feld } from "./StammdatenFormular";

/**
 * Anlegen und Bearbeiten einer Qualifikation (IDA-282), gebaut wie `StammdatenFormular`: eigenes
 * `<form>`, Action direkt importiert (Falle 9), Feldfehler vom Server unter dem Feld.
 */
export function QualifikationFormular({
  eintrag,
  vorschlagRang,
  anzahl,
  onGespeichert,
  onAbbrechen,
}: {
  /** `null`: anlegen. */
  eintrag: QualifikationDTO | null;
  /** Rang einer neuen Qualifikation: hinter der bisher niedrigsten. */
  vorschlagRang: number;
  /** Wie viele Personen die Qualifikation tragen; nur beim Bearbeiten. */
  anzahl: number;
  onGespeichert: () => void;
  onAbbrechen: () => void;
}) {
  const [kurz, setKurz] = useState(eintrag?.kurz ?? "");
  const [lang, setLang] = useState(eintrag?.lang ?? "");
  const [rang, setRang] = useState<number | null>(eintrag?.rang ?? vorschlagRang);
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<FeldFehler>({});
  const [laeuft, setLaeuft] = useState(false);
  const basis = useId();

  function absenden(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault();
    setFehler(null);
    setFeldFehler({});
    // Ein geleertes Feld liefert `null`; das Schema hätte dafür nur einen englischen Typfehler.
    if (rang === null) {
      setFeldFehler({ rang: "Bitte eine Zahl von 1 bis 99 eintragen" });
      return;
    }
    setLaeuft(true);
    void qualifikationSpeichernAction(eintrag?.id ?? null, { kurz, lang, rang })
      .then((ergebnis) => {
        if (ergebnis.ok) {
          onGespeichert();
          return;
        }
        setFehler(ergebnis.fehler);
        setFeldFehler(ergebnis.feldFehler ?? {});
      })
      .catch(() => setFehler("Speichern ist fehlgeschlagen. Bitte noch einmal versuchen."))
      .finally(() => setLaeuft(false));
  }

  const kurzGeaendert = eintrag !== null && kurz.trim() !== eintrag.kurz;

  return (
    <form onSubmit={absenden} style={{ display: "grid", gap: SPACE.md }}>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}

      <Feld id={`${basis}-kurz`} label="Kurzform" fehler={feldFehler.kurz}>
        <Input
          id={`${basis}-kurz`}
          value={kurz}
          status={feldFehler.kurz ? "error" : undefined}
          aria-describedby={`${basis}-kurz-hinweis${feldFehler.kurz ? ` ${basis}-kurz-fehler` : ""}`}
          onChange={(e) => setKurz(e.target.value)}
        />
        <div id={`${basis}-kurz-hinweis`} style={{ ...SCHRIFT.neben, marginBlockStart: SPACE.xs }}>
          {kurzGeaendert && anzahl > 0
            ? `Die neue Kurzform gilt beim Speichern für ${anzahl === 1 ? "eine Person" : `${anzahl} Personen`}. Abgeschlossene Einsätze behalten die alte.`
            : "Steht im Einsatzbuch-Rechner am Personal, höchstens 20 Zeichen."}
        </div>
      </Feld>

      <Feld id={`${basis}-lang`} label="Bezeichnung" fehler={feldFehler.lang}>
        <Input
          id={`${basis}-lang`}
          value={lang}
          status={feldFehler.lang ? "error" : undefined}
          aria-describedby={feldFehler.lang ? `${basis}-lang-fehler` : undefined}
          onChange={(e) => setLang(e.target.value)}
        />
      </Feld>

      {/* Bewusst ohne `min`/`max` wie bei der Reihenfolge der Stichworte: so lehnt der Server
          einen Wert außerhalb am Feld ab, statt dass antd ihn still klemmt. */}
      <Feld id={`${basis}-rang`} label="Rang" fehler={feldFehler.rang}>
        <InputNumber
          id={`${basis}-rang`}
          precision={0}
          value={rang}
          status={feldFehler.rang ? "error" : undefined}
          aria-describedby={`${basis}-rang-hinweis${feldFehler.rang ? ` ${basis}-rang-fehler` : ""}`}
          onChange={(wert) => setRang(typeof wert === "number" ? wert : null)}
        />
        <div id={`${basis}-rang-hinweis`} style={{ ...SCHRIFT.neben, marginBlockStart: SPACE.xs }}>
          1 ist die höchste. Hat jemand im Helferverzeichnis mehrere Qualifikationen, gilt die mit dem höchsten Rang.
        </div>
      </Feld>

      <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
        <Button type="primary" htmlType="submit" loading={laeuft}>
          Speichern
        </Button>
        <Button onClick={onAbbrechen}>Abbrechen</Button>
      </div>
    </form>
  );
}
