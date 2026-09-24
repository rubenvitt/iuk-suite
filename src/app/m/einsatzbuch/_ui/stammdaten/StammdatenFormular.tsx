"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Alert, AutoComplete, Button, Input, InputNumber, Switch } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { fahrzeugSpeichernAction, personSpeichernAction, stichwortSpeichernAction } from "../../_actions/stammdaten";
import type { FeldFehler } from "../../_lib/actionErgebnis";
import { ORTE, QUALIS } from "../../_lib/stammdaten/vorlage";
import type { FahrzeugDTO, PersonDTO, Stammdatenart, StichwortDTO } from "../../_lib/stammdaten/typen";
import type { Stammeintrag } from "./StammdatenTabelle";

const QUALI_OPTIONEN = QUALIS.map((q) => ({ value: q }));
const ORT_OPTIONEN = ORTE.map(([ort]) => ({ value: ort }));

/** Die Textfelder aller drei Arten in einem Zustand; welche davon gelten, entscheidet `art`. */
interface Zustand {
  typ: string;
  kennung: string;
  ruf: string;
  standort: string;
  name: string;
  quali: string;
  ov: string;
  gruppe: string;
  reihenfolge: number | null;
  aktiv: boolean;
}

function zustandAus(art: Stammdatenart, eintrag: Stammeintrag | null): Zustand {
  const leer: Zustand = { typ: "", kennung: "", ruf: "", standort: "", name: "", quali: "", ov: "", gruppe: "", reihenfolge: 0, aktiv: true };
  if (!eintrag) return leer;
  if (art === "fahrzeuge") {
    const f = eintrag as FahrzeugDTO;
    return { ...leer, typ: f.typ, kennung: f.kennung, ruf: f.ruf, standort: f.standort, aktiv: f.aktiv };
  }
  if (art === "personal") {
    const p = eintrag as PersonDTO;
    return { ...leer, name: p.name, quali: p.quali, ov: p.ov, aktiv: p.aktiv };
  }
  const s = eintrag as StichwortDTO;
  return { ...leer, gruppe: s.gruppe, name: s.name, reihenfolge: s.reihenfolge, aktiv: s.aktiv };
}

/**
 * Anlegen und Bearbeiten eines Stammdateneintrags (Vorbild `uav/_ui/admin/AufgabeFormular.tsx`:
 * eigenes `<form>` mit `useState`, kein antd-`Form`). Die Actions sind direkt importiert
 * (Falle 9); geprüft wird auf dem Server, dessen Feldfehler stehen unter dem jeweiligen Feld.
 */
export function StammdatenFormular({
  art,
  eintrag,
  onGespeichert,
  onAbbrechen,
}: {
  art: Stammdatenart;
  /** `null`: anlegen. Sonst wird dieser Eintrag geändert. */
  eintrag: Stammeintrag | null;
  onGespeichert: () => void;
  onAbbrechen: () => void;
}) {
  const [z, setZ] = useState<Zustand>(() => zustandAus(art, eintrag));
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<FeldFehler>({});
  const [laeuft, setLaeuft] = useState(false);
  const basis = useId();
  const setze = <K extends keyof Zustand>(feld: K, wert: Zustand[K]) => setZ((alt) => ({ ...alt, [feld]: wert }));

  function speichere() {
    const id = eintrag?.id ?? null;
    if (art === "fahrzeuge") return fahrzeugSpeichernAction(id, { typ: z.typ, kennung: z.kennung, ruf: z.ruf, standort: z.standort, aktiv: z.aktiv });
    if (art === "personal") return personSpeichernAction(id, { name: z.name, quali: z.quali, ov: z.ov, aktiv: z.aktiv });
    return stichwortSpeichernAction(id, { gruppe: z.gruppe, name: z.name, reihenfolge: z.reihenfolge, aktiv: z.aktiv });
  }

  function absenden(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault();
    setFehler(null);
    setFeldFehler({});
    setLaeuft(true);
    void speichere()
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

  /** Ein Textfeld mit sichtbarem Label und Feldfehler darunter. */
  const text = (feld: "typ" | "kennung" | "ruf" | "standort" | "name" | "gruppe", label: string) => (
    <Feld id={`${basis}-${feld}`} label={label} fehler={feldFehler[feld]}>
      <Input
        id={`${basis}-${feld}`}
        value={z[feld]}
        status={feldFehler[feld] ? "error" : undefined}
        aria-describedby={feldFehler[feld] ? `${basis}-${feld}-fehler` : undefined}
        onChange={(e) => setze(feld, e.target.value)}
      />
    </Feld>
  );
  /** Freitext mit Vorschlägen: neue Werte bleiben möglich, die Vorlage ist nur eine Hilfe. */
  const vorschlag = (feld: "quali" | "ov", label: string, optionen: { value: string }[]) => (
    <Feld id={`${basis}-${feld}`} label={label} fehler={feldFehler[feld]}>
      <AutoComplete
        id={`${basis}-${feld}`}
        value={z[feld]}
        options={optionen}
        status={feldFehler[feld] ? "error" : undefined}
        aria-describedby={feldFehler[feld] ? `${basis}-${feld}-fehler` : undefined}
        onChange={(wert: string) => setze(feld, wert)}
        showSearch={{
          filterOption: (eingabe, option) => (option?.value ?? "").toLowerCase().includes(eingabe.toLowerCase()),
        }}
      />
    </Feld>
  );

  return (
    <form onSubmit={absenden} style={{ display: "grid", gap: SPACE.md }}>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}

      {art === "fahrzeuge" ? (
        <>
          {text("typ", "Typ")}
          {text("kennung", "Kennung")}
          {text("ruf", "Funkrufname")}
          {text("standort", "Standort")}
        </>
      ) : null}

      {art === "personal" ? (
        <>
          {text("name", "Name (Nachname, Vorname)")}
          {vorschlag("quali", "Qualifikation", QUALI_OPTIONEN)}
          {vorschlag("ov", "Ortsverein", ORT_OPTIONEN)}
        </>
      ) : null}

      {art === "stichworte" ? (
        <>
          {text("gruppe", "Gruppe")}
          {text("name", "Stichwort")}
          <Feld id={`${basis}-reihenfolge`} label="Reihenfolge" fehler={feldFehler.reihenfolge}>
            <InputNumber
              id={`${basis}-reihenfolge`}
              min={0}
              max={9999}
              precision={0}
              value={z.reihenfolge}
              status={feldFehler.reihenfolge ? "error" : undefined}
              aria-describedby={feldFehler.reihenfolge ? `${basis}-reihenfolge-fehler` : undefined}
              onChange={(wert) => setze("reihenfolge", typeof wert === "number" ? wert : null)}
            />
          </Feld>
        </>
      ) : null}

      <label style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
        <Switch checked={z.aktiv} onChange={(an) => setze("aktiv", an)} />
        Aktiv
      </label>

      <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
        <Button type="primary" htmlType="submit" loading={laeuft}>
          Speichern
        </Button>
        <Button onClick={onAbbrechen}>Abbrechen</Button>
      </div>
    </form>
  );
}

/** Label über dem Feld, Fehlertext darunter — die Fehler kommen aus der Server Action. */
export function Feld({ id, label, fehler, children }: { id: string; label: string; fehler?: string; children: ReactNode }) {
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
      ) : null}
    </div>
  );
}
