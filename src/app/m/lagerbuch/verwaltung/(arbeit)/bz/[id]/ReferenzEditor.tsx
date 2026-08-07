"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Alert, Card, Input, InputNumber, Select } from "antd";
import { geraetSpeichern } from "../../../../_actions/bz";
import type { LagerortOption } from "../../../../_lib/lesepfade/bz";
import { SCHRIFT } from "../../../../_lib/schrift";

const ZAHL_DEBOUNCE_MS = 400;
const SPEICHER_FEHLER = "BZ-Gerät konnte nicht gespeichert werden.";

export type BzEditorWerte = {
  id: string;
  name: string;
  barcode: string | null;
  lagerortId: string;
  streifenLot: string | null;
  level1Label: string | null;
  level1Min: number | null;
  level1Max: number | null;
  level2Label: string | null;
  level2Min: number | null;
  level2Max: number | null;
};

type TextFeld = "name" | "barcode" | "streifenLot" | "level1Label" | "level2Label";
type ZahlFeld = "level1Min" | "level1Max" | "level2Min" | "level2Max";

export type LagerortSuchOption = {
  label?: ReactNode;
  keywords?: string;
};

type LagerortSelectOption = LagerortSuchOption & {
  value: string;
  label: ReactNode;
};

export function lagerortFilter(
  eingabe: string,
  option?: LagerortSuchOption,
): boolean {
  const nadel = eingabe.trim().toLocaleLowerCase("de");
  const label = typeof option?.label === "string" ? option.label : "";
  return `${label} ${option?.keywords ?? ""}`.toLocaleLowerCase("de").includes(nadel);
}

function optionalerText(wert: string | null): string | undefined {
  const normalisiert = wert?.trim() ?? "";
  return normalisiert || undefined;
}

function optionalZahl(wert: number | null): number | undefined {
  return wert ?? undefined;
}

function payload(w: BzEditorWerte) {
  return {
    id: w.id,
    name: w.name.trim(),
    barcode: optionalerText(w.barcode),
    lagerortId: w.lagerortId,
    streifenLot: optionalerText(w.streifenLot),
    level1Label: optionalerText(w.level1Label),
    level1Min: optionalZahl(w.level1Min),
    level1Max: optionalZahl(w.level1Max),
    level2Label: optionalerText(w.level2Label),
    level2Min: optionalZahl(w.level2Min),
    level2Max: optionalZahl(w.level2Max),
  };
}

export function ReferenzEditor({
  geraet,
  lagerorte,
}: {
  geraet: BzEditorWerte;
  lagerorte: LagerortOption[];
}) {
  const [werte, setWerte] = useState(geraet);
  const [fehler, setFehler] = useState<string | null>(null);
  const aktuell = useRef(geraet);
  const zahlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (zahlTimer.current) clearTimeout(zahlTimer.current);
  }, []);

  function spiegeln(aenderung: Partial<BzEditorWerte>): BzEditorWerte {
    const naechste = { ...aktuell.current, ...aenderung };
    aktuell.current = naechste;
    setWerte(naechste);
    return naechste;
  }

  async function speichern(snapshot: BzEditorWerte): Promise<void> {
    setFehler(null);
    try {
      const ergebnis = await geraetSpeichern(payload(snapshot));
      if (!ergebnis.ok) setFehler(SPEICHER_FEHLER);
    } catch {
      setFehler(SPEICHER_FEHLER);
    }
  }

  function textAendern(feld: TextFeld, wert: string): void {
    spiegeln({ [feld]: wert });
  }

  function textSpeichern(feld: TextFeld): void {
    const roh = aktuell.current[feld];
    const normalisiert = feld === "name"
      ? (roh ?? "").trim()
      : optionalerText(roh) ?? null;
    const snapshot = spiegeln({ [feld]: normalisiert });
    void speichern(snapshot);
  }

  function standortSpeichern(lagerortId: string): void {
    void speichern(spiegeln({ lagerortId }));
  }

  function zahlAendern(feld: ZahlFeld, wert: number | null): void {
    spiegeln({ [feld]: wert });
    if (zahlTimer.current) clearTimeout(zahlTimer.current);
    zahlTimer.current = setTimeout(() => {
      zahlTimer.current = null;
      void speichern(aktuell.current);
    }, ZAHL_DEBOUNCE_MS);
  }

  const standortOptionen: LagerortSelectOption[] = lagerorte.map((lagerort) => ({
    value: lagerort.id,
    label: lagerort.name,
    keywords: `${lagerort.name} ${lagerort.typ}`,
  }));

  return (
    <Card title="Referenz & Streifen-Lot" style={{ marginBlockEnd: 24 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 14,
        }}
      >
        <Feld label="Name">
          <Input
            aria-label="Name"
            value={werte.name}
            onChange={(ereignis) => textAendern("name", ereignis.target.value)}
            onBlur={() => textSpeichern("name")}
          />
        </Feld>
        <Feld label="Barcode">
          <Input
            aria-label="Barcode"
            value={werte.barcode ?? ""}
            onChange={(ereignis) => textAendern("barcode", ereignis.target.value)}
            onBlur={() => textSpeichern("barcode")}
          />
        </Feld>
        <Feld label="Standort">
          <Select<string, LagerortSelectOption>
            aria-label="Standort"
            value={werte.lagerortId}
            options={standortOptionen}
            showSearch
            optionFilterProp="label"
            filterOption={lagerortFilter}
            onChange={standortSpeichern}
            style={{ width: "100%" }}
          />
        </Feld>
        <Feld label="Streifen-Lot">
          <Input
            aria-label="Streifen-Lot"
            value={werte.streifenLot ?? ""}
            onChange={(ereignis) => textAendern("streifenLot", ereignis.target.value)}
            onBlur={() => textSpeichern("streifenLot")}
          />
        </Feld>
        <Feld label="Level-1-Bezeichnung">
          <Input
            aria-label="Level-1-Bezeichnung"
            value={werte.level1Label ?? ""}
            onChange={(ereignis) => textAendern("level1Label", ereignis.target.value)}
            onBlur={() => textSpeichern("level1Label")}
          />
        </Feld>
        <Feld label="Level-1-Untergrenze">
          <InputNumber<number>
            aria-label="Level-1-Untergrenze"
            value={werte.level1Min}
            precision={0}
            onChange={(wert) => zahlAendern("level1Min", wert)}
            style={{ width: "100%" }}
          />
        </Feld>
        <Feld label="Level-1-Obergrenze">
          <InputNumber<number>
            aria-label="Level-1-Obergrenze"
            value={werte.level1Max}
            precision={0}
            onChange={(wert) => zahlAendern("level1Max", wert)}
            style={{ width: "100%" }}
          />
        </Feld>
        <Feld label="Level-2-Bezeichnung">
          <Input
            aria-label="Level-2-Bezeichnung"
            value={werte.level2Label ?? ""}
            onChange={(ereignis) => textAendern("level2Label", ereignis.target.value)}
            onBlur={() => textSpeichern("level2Label")}
          />
        </Feld>
        <Feld label="Level-2-Untergrenze">
          <InputNumber<number>
            aria-label="Level-2-Untergrenze"
            value={werte.level2Min}
            precision={0}
            onChange={(wert) => zahlAendern("level2Min", wert)}
            style={{ width: "100%" }}
          />
        </Feld>
        <Feld label="Level-2-Obergrenze">
          <InputNumber<number>
            aria-label="Level-2-Obergrenze"
            value={werte.level2Max}
            precision={0}
            onChange={(wert) => zahlAendern("level2Max", wert)}
            style={{ width: "100%" }}
          />
        </Feld>
      </div>
      {fehler ? (
        <Alert
          type="warning"
          showIcon={false}
          title={fehler}
          style={{ marginBlockStart: 14 }}
        />
      ) : null}
    </Card>
  );
}

function Feld({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={SCHRIFT.feldname}>{label}</span>
      {children}
    </label>
  );
}
