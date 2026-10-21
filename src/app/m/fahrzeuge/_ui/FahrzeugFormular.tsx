"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Alert, Button, Input, Radio, Switch } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { fahrzeugSpeichernAction } from "../_actions/verwaltung";
import type { FeldFehler } from "../_lib/actionErgebnis";
import type { FahrzeugDTO } from "../_lib/daten";
import { ARTEN, type Art } from "../_lib/eingabe";

interface Zustand {
  art: Art;
  typ: string;
  funkrufname: string;
  funkkenner: string;
  kennzeichen: string;
  standort: string;
  bemerkung: string;
  aktiv: boolean;
}

function zustandAus(f: FahrzeugDTO | null): Zustand {
  if (!f) return { art: "fahrzeug", typ: "", funkrufname: "", funkkenner: "", kennzeichen: "", standort: "", bemerkung: "", aktiv: true };
  return {
    art: f.art, typ: f.typ, funkrufname: f.funkrufname, funkkenner: f.funkkenner ?? "", kennzeichen: f.kennzeichen ?? "",
    standort: f.standort, bemerkung: f.bemerkung ?? "", aktiv: f.aktiv,
  };
}

type Textfeld = "typ" | "funkrufname" | "funkkenner" | "kennzeichen" | "standort";

/**
 * Anlegen und Bearbeiten eines Fahrzeugs (Vorbild `einsatzbuch/_ui/stammdaten/StammdatenFormular.tsx`:
 * eigenes `<form>` mit `useState`, kein antd-`Form`). Geprüft wird auf dem Server, dessen Feldfehler
 * stehen unter dem jeweiligen Feld.
 */
export function FahrzeugFormular({ eintrag, onFertig }: { eintrag: FahrzeugDTO | null; onFertig: () => void }) {
  const [z, setZ] = useState<Zustand>(() => zustandAus(eintrag));
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<FeldFehler>({});
  const [laeuft, setLaeuft] = useState(false);
  const basis = useId();
  const setze = <K extends keyof Zustand>(feld: K, wert: Zustand[K]) => setZ((alt) => ({ ...alt, [feld]: wert }));

  function absenden(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault();
    setFehler(null);
    setFeldFehler({});
    setLaeuft(true);
    void fahrzeugSpeichernAction(eintrag?.id ?? null, z)
      .then((ergebnis) => {
        if (ergebnis.ok) {
          onFertig();
          return;
        }
        setFehler(ergebnis.fehler);
        setFeldFehler(ergebnis.feldFehler ?? {});
      })
      .catch(() => setFehler("Speichern ist fehlgeschlagen. Bitte noch einmal versuchen."))
      .finally(() => setLaeuft(false));
  }

  const text = (feld: Textfeld, label: string, hilfe?: string) => (
    <Feld id={`${basis}-${feld}`} label={label} fehler={feldFehler[feld]} hilfe={hilfe}>
      <Input
        id={`${basis}-${feld}`}
        value={z[feld]}
        status={feldFehler[feld] ? "error" : undefined}
        aria-describedby={feldFehler[feld] ? `${basis}-${feld}-fehler` : hilfe ? `${basis}-${feld}-hilfe` : undefined}
        onChange={(e) => setze(feld, e.target.value)}
      />
    </Feld>
  );

  return (
    <form onSubmit={absenden} style={{ display: "grid", gap: SPACE.md }}>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}

      <Radio.Group
        aria-label="Art"
        value={z.art}
        onChange={(e) => setze("art", e.target.value as Art)}
        options={ARTEN.map((a) => ({ value: a.wert, label: a.text }))}
        optionType="button"
      />
      {text("typ", "Typ", "Zum Beispiel RTW, KTW-B, ELW 1")}
      {text("funkrufname", "Funkrufname", "Zum Beispiel Rotkreuz Uelzen 11-83-1")}
      {text("funkkenner", "Funkkenner", "Zum Beispiel 11-83-1. Leer lassen, wenn keiner vergeben ist.")}
      {text("kennzeichen", "Kennzeichen")}
      {text("standort", "Standort")}
      <Feld id={`${basis}-bemerkung`} label="Bemerkung" fehler={feldFehler.bemerkung}>
        <Input.TextArea
          id={`${basis}-bemerkung`}
          value={z.bemerkung}
          autoSize={{ minRows: 2, maxRows: 6 }}
          status={feldFehler.bemerkung ? "error" : undefined}
          onChange={(e) => setze("bemerkung", e.target.value)}
        />
      </Feld>

      <label style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
        <Switch checked={z.aktiv} onChange={(an) => setze("aktiv", an)} />
        Im Dienst
      </label>

      <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
        <Button type="primary" htmlType="submit" loading={laeuft}>
          Speichern
        </Button>
        <Button onClick={onFertig}>Abbrechen</Button>
      </div>
    </form>
  );
}

/** Label über dem Feld, Hilfe und Fehlertext darunter — die Fehler kommen aus der Server Action. */
function Feld({ id, label, fehler, hilfe, children }: { id: string; label: string; fehler?: string; hilfe?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
        {label}
      </label>
      {children}
      {fehler ? (
        <div id={`${id}-fehler`} style={{ ...SCHRIFT.neben, marginBlockStart: SPACE.xs }}>
          {fehler}
        </div>
      ) : hilfe ? (
        <div id={`${id}-hilfe`} style={{ ...SCHRIFT.neben, marginBlockStart: SPACE.xs }}>
          {hilfe}
        </div>
      ) : null}
    </div>
  );
}
