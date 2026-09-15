"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Input, InputNumber } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { flascheSpeichern } from "../../../../_actions/sauerstoff";
import {
  wechselGrenzeBar,
  O2_WECHSEL_MAX_PROZENT,
  O2_WECHSEL_MIN_PROZENT,
} from "../../../../_lib/domain/o2";
import { SCHRIFT } from "../../../../_lib/schrift";

const ZAHL_DEBOUNCE_MS = 400;
const SPEICHER_FEHLER = "Sauerstoffflasche konnte nicht gespeichert werden.";

type ReferenzWerte = {
  id: string;
  name: string;
  lagerortId: string;
  groesseLiter: number | null;
  nennfuelldruckBar: number;
  /**
   * % vom Nennfuelldruck, ab dem der Wechselhinweis erscheint (DRK-308).
   *
   * ⚠️ DIESES FELD MUSS MITREISEN, auch wenn niemand es anfasst. `flascheSpeichern`
   * schreibt die Stammzeile GANZ, und das Zod-Schema belegt einen fehlenden Wert
   * mit der Vorgabe 25 vor. Ohne die Zeile im `speichern`-Aufruf unten setzte
   * also jede Namensaenderung den eingestellten Grenzwert still auf 25 zurueck —
   * eine Datenaenderung, die niemand ausgeloest hat und die kein Tor sieht.
   */
  wechselAbProzent: number;
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
        // Siehe den Hinweis am Typ: fehlt diese Zeile, faellt der Grenzwert bei
        // JEDEM Speichern still auf die Vorgabe zurueck.
        wechselAbProzent: snapshot.wechselAbProzent,
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
    aenderung:
      | Pick<ReferenzWerte, "groesseLiter">
      | Pick<ReferenzWerte, "nennfuelldruckBar">
      | Pick<ReferenzWerte, "wechselAbProzent">,
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
    <div style={{ display: "grid", gap: SPACE.md }}>
      <div
        ref={wurzel}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          // 14 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32) und hat keine
          // Geschwisterzeile in dieser Datei; bleibt Literal.
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
        <Feld label="Wechselhinweis ab (%)">
          <InputNumber<number>
            min={O2_WECHSEL_MIN_PROZENT}
            max={O2_WECHSEL_MAX_PROZENT}
            precision={0}
            value={werte.wechselAbProzent}
            aria-label="Wechselhinweis ab Prozent vom Nennfülldruck"
            addonAfter="%"
            onChange={(wert) => {
              if (wert !== null) zahlAendern({ wechselAbProzent: wert });
            }}
            onBlur={zahlSpeichern}
            style={{ width: "100%" }}
          />
        </Feld>
      </div>
      {/* ⚠️ DIE BAR-ZAHL FOLGT BEIDEN FELDERN, nicht nur dem Prozentfeld: wer den
          Nennfuelldruck aendert, aendert mit, was derselbe Prozentwert in bar
          bedeutet. Und bar ist die Einheit, in der jemand spaeter am Manometer
          abliest — der Prozentwert allein ist dort nicht pruefbar. */}
      {werte.nennfuelldruckBar > 0 ? (
        <span style={SCHRIFT.neben}>
          Der Wechselhinweis erscheint ab{" "}
          {wechselGrenzeBar(werte.nennfuelldruckBar, werte.wechselAbProzent)} bar und darunter.
        </span>
      ) : null}
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
    </div>
  );
}

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // 5 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32) und hat keine
    // Geschwisterzeile in dieser Datei; bleibt Literal.
    <label style={{ display: "grid", gap: 5 }}>
      <span style={SCHRIFT.feldname}>{label}</span>
      {children}
    </label>
  );
}
