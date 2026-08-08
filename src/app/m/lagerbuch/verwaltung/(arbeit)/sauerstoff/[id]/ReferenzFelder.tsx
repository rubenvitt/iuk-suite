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

/**
 * Der Schluessel haengt an der IDENTITAET, nicht an den WERTEN.
 *
 * `key={JSON.stringify(props)}` sah nach demselben Zweck aus, tat aber etwas
 * anderes: jedes `onBlur` speichert, `revalidatePath` rendert die Seite neu,
 * die neuen Props ergeben einen neuen Schluessel — und der unmountet den
 * Teilbaum mitten im Tippen. Der Fokus faellt auf `body`, die Zeichen, die
 * inzwischen ins Nachbarfeld gingen, landen nirgends, und es gibt keine
 * Meldung; die Person haelt das Feld fuer kaputt.
 *
 * Mit der `id` bleibt der Remount da, wo er gebraucht wird — beim Wechsel auf
 * eine ANDERE Flasche, wo React die Komponente sonst samt fremdem Zustand
 * wiederverwendet. Waehrend derselben Flasche ist der lokale Zustand die
 * Wahrheit: nur diese Insel schreibt sie.
 */
export function ReferenzFelder(props: ReferenzWerte) {
  return <ReferenzFelderInhalt key={props.id} start={props} />;
}

function ReferenzFelderInhalt({ start }: { start: ReferenzWerte }) {
  const [werte, setWerte] = useState(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const aktuell = useRef(start);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speicherGeneration = useRef(0);
  const wurzel = useRef<HTMLDivElement>(null);

  /**
   * Neue Serverwerte fuer DIESELBE Flasche ziehen die Felder nach — aber nur,
   * wenn niemand gerade in diesen Feldern steht. Siehe den Kommentar am
   * Schluessel oben: der wertabhaengige `key` hat nicht abgeglichen, sondern
   * unmountet, und dabei den Fokus mitgenommen.
   */
  useEffect(() => {
    const fokus = document.activeElement;
    if (fokus && wurzel.current?.contains(fokus)) return;
    aktuell.current = start;
    setWerte(start);
  }, [start]);

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
        // Der Satz aus der Action, nicht die Modulkonstante: nur er
        // unterscheidet „Lagerort nicht gefunden." von einem Schreibfehler
        // und sagt der Person, ob neu laden oder erneut versuchen hilft.
        setFehler(ergebnis.ok ? null : ergebnis.fehler);
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
        ref={wurzel}
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
