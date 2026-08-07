"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Input, InputNumber } from "antd";
import { flascheSpeichern } from "../../../../_actions/sauerstoff";
import { SCHRIFT } from "../../../../_lib/schrift";

const ZAHL_DEBOUNCE_MS = 400;
const SPEICHER_FEHLER = "Sauerstoffflasche konnte nicht gespeichert werden.";

type ReferenzWerte = {
  id: string;
  name: string;
  lagerortId: string;
  groesseLiter: number | null;
  nennfuelldruckBar: number;
};

export function ReferenzFelder(props: ReferenzWerte) {
  return <ReferenzFelderInhalt key={JSON.stringify(props)} start={props} />;
}

function ReferenzFelderInhalt({ start }: { start: ReferenzWerte }) {
  const [werte, setWerte] = useState(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const aktuell = useRef(start);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speicherGeneration = useRef(0);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function spiegeln(aenderung: Partial<ReferenzWerte>): ReferenzWerte {
    const naechste = { ...aktuell.current, ...aenderung };
    aktuell.current = naechste;
    setWerte(naechste);
    return naechste;
  }

  async function speichern(snapshot: ReferenzWerte): Promise<void> {
    const generation = ++speicherGeneration.current;
    setFehler(null);
    try {
      const ergebnis = await flascheSpeichern({
        id: snapshot.id,
        name: snapshot.name.trim(),
        lagerortId: snapshot.lagerortId,
        groesseLiter: snapshot.groesseLiter ?? undefined,
        nennfuelldruckBar: snapshot.nennfuelldruckBar,
      });
      if (generation === speicherGeneration.current) {
        setFehler(ergebnis.ok ? null : SPEICHER_FEHLER);
      }
    } catch {
      if (generation === speicherGeneration.current) setFehler(SPEICHER_FEHLER);
    }
  }

  function timerLoeschen(): void {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
  }

  function nameAendern(name: string): void {
    spiegeln({ name });
  }

  function nameSpeichern(): void {
    timerLoeschen();
    const name = aktuell.current.name.trim();
    void speichern(spiegeln({ name }));
  }

  function zahlAendern(
    aenderung: Pick<ReferenzWerte, "groesseLiter"> | Pick<ReferenzWerte, "nennfuelldruckBar">,
  ): void {
    spiegeln(aenderung);
    timerLoeschen();
    timer.current = setTimeout(() => {
      timer.current = null;
      void speichern(aktuell.current);
    }, ZAHL_DEBOUNCE_MS);
  }

  function zahlSpeichern(): void {
    if (!timer.current) return;
    timerLoeschen();
    void speichern(aktuell.current);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
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
            onChange={(ereignis) => nameAendern(ereignis.target.value)}
            onBlur={nameSpeichern}
          />
        </Feld>
        <Feld label="Größe (l)">
          <InputNumber<number>
            min={1}
            precision={0}
            value={werte.groesseLiter}
            aria-label="Größe in Litern"
            onChange={(wert) => zahlAendern({ groesseLiter: wert })}
            onBlur={zahlSpeichern}
            style={{ width: "100%" }}
          />
        </Feld>
        <Feld label="Nennfülldruck (bar)">
          <InputNumber<number>
            min={1}
            precision={0}
            value={werte.nennfuelldruckBar}
            aria-label="Nennfülldruck"
            onChange={(wert) => {
              if (wert !== null) zahlAendern({ nennfuelldruckBar: wert });
            }}
            onBlur={zahlSpeichern}
            style={{ width: "100%" }}
          />
        </Feld>
      </div>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
    </div>
  );
}

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={SCHRIFT.feldname}>{label}</span>
      {children}
    </label>
  );
}
