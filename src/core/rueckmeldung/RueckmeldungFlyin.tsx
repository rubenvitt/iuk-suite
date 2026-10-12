"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Alert, Button, Drawer, Input, Radio, Result, type InputRef } from "antd";
import { nanoid } from "nanoid";

import {
  ARTEN,
  TEXT_MAX,
  TITEL_MAX,
  pruefeEingabe,
  type RueckmeldungArt,
} from "@/core/rueckmeldung/eingabe";
import {
  OFFEN,
  SERVER_FLYIN_STAND,
  abonniereFlyin,
  liesFlyinStand,
  schliesseRueckmeldung,
} from "@/core/rueckmeldung/flyinZustand";
import { sendeRueckmeldung } from "@/core/rueckmeldung/senden";
import { flyinBreite } from "@/core/theme/flyin";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * DAS RÜCKMELDE-FLYIN (IDA-214) — das Formular der Suite statt des externen
 * ClickUp-Formulars. Montiert einmal in `SuiteNav`, geöffnet über
 * `flyinZustand.ts` von Nutzermenü, schwebendem Knopf und Portal-Kachel.
 *
 * Es bleibt über der Arbeitsfläche, statt einen neuen Tab zu öffnen: wer mitten
 * in einer Buchung etwas melden will, verliert sie nicht.
 *
 * ⚠️ FALLE 24: `autoFocus={false}` und keine Fokus-Rückgabe beim Schließen. Den
 * Fokus setzt das Formular selbst ins Titelfeld; ohne `autoFocus={false}` nähme
 * ihn der Container der Schublade NACH diesem Effekt wieder weg, und Getipptes
 * liefe ins Leere (Vorbild `kommplan/_ui/editor/StelleFlyin.tsx`).
 *
 * ⚠️ FALLE 13: Breite über `flyinBreite()`. Falle 4: kein `size` an den Feldern.
 */
export const RUECKMELDUNG_FLYIN_GRUND = 480;

const ART_NAME: Record<RueckmeldungArt, string> = {
  fehler: "Etwas klappt nicht",
  idee: "Idee oder Wunsch",
  sonstiges: "Sonstiges",
};

const PLATZHALTER: Record<RueckmeldungArt, string> = {
  fehler: "Was hast du gemacht, was ist passiert, und was hättest du erwartet?",
  idee: "Was wünschst du dir, und wobei würde es dir helfen?",
  sonstiges: "Was möchtest du uns sagen?",
};

/**
 * Der Entwurf überlebt ein versehentliches Schließen und einen Fehlschlag,
 * aber nicht den Tab. `sessionStorage` kann werfen (privates Fenster,
 * gesperrte Website-Daten); dann gibt es eben keinen Entwurf.
 */
const ENTWURF = "iuk-rueckmeldung-entwurf";
interface Entwurf {
  art: RueckmeldungArt | null;
  titel: string;
  text: string;
}
const LEER: Entwurf = { art: null, titel: "", text: "" };

function liesEntwurf(): Entwurf {
  try {
    const roh = JSON.parse(globalThis.sessionStorage?.getItem(ENTWURF) ?? "null") as Partial<Entwurf> | null;
    if (!roh) return LEER;
    return {
      art: (ARTEN as readonly unknown[]).includes(roh.art) ? (roh.art as RueckmeldungArt) : null,
      titel: typeof roh.titel === "string" ? roh.titel : "",
      text: typeof roh.text === "string" ? roh.text : "",
    };
  } catch {
    return LEER;
  }
}

function schreibeEntwurf(entwurf: Entwurf | null): void {
  try {
    if (entwurf) globalThis.sessionStorage?.setItem(ENTWURF, JSON.stringify(entwurf));
    else globalThis.sessionStorage?.removeItem(ENTWURF);
  } catch {
    // Kein Speicher, kein Entwurf.
  }
}

const NETZFEHLER =
  "Die Rückmeldung konnte gerade nicht zugestellt werden. Dein Text bleibt stehen — versuch es gleich noch einmal.";

export function RueckmeldungFlyin({ modulKey }: { modulKey: string }) {
  const stand = useSyncExternalStore(abonniereFlyin, liesFlyinStand, () => SERVER_FLYIN_STAND);
  const offen = stand === OFFEN;
  return (
    <Drawer
      open={offen}
      onClose={schliesseRueckmeldung}
      title="Feedback geben"
      size={flyinBreite(RUECKMELDUNG_FLYIN_GRUND)}
      destroyOnHidden
      autoFocus={false}
      focusable={{ focusTriggerAfterClose: false }}
    >
      {offen ? <Formular modulKey={modulKey} /> : null}
    </Drawer>
  );
}

function Formular({ modulKey }: { modulKey: string }) {
  const basis = useId();
  const titelRef = useRef<InputRef>(null);
  // Eine ID je geöffnetem Formular: ein Doppelklick oder „Nochmal senden"
  // trägt dieselbe, und Zunder legt dann nichts doppelt an.
  const [id] = useState(() => nanoid());
  const [entwurf, setEntwurf] = useState<Entwurf>(liesEntwurf);
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [kennung, setKennung] = useState<string | null>(null);

  useEffect(() => {
    titelRef.current?.focus();
  }, []);

  const aendere = (teil: Partial<Entwurf>) => {
    const neu = { ...entwurf, ...teil };
    setEntwurf(neu);
    schreibeEntwurf(neu);
  };

  const absenden = async (ereignis: FormEvent) => {
    ereignis.preventDefault();
    if (sendet) return;
    const eingabe = {
      id,
      art: entwurf.art ?? "",
      titel: entwurf.titel,
      text: entwurf.text,
      modulKey,
      seite: window.location.href,
      browser: navigator.userAgent,
      fenster: `${window.innerWidth}×${window.innerHeight}`,
      thema: document.documentElement.dataset.theme ?? "",
    };
    // Dieselbe Prüfung wie auf dem Server, damit ein fehlender Titel nicht
    // erst eine Runde zum Server kostet. Entscheidend bleibt die des Servers.
    const vorab = pruefeEingabe(eingabe);
    if (!vorab.ok) {
      setMeldung(vorab.grund);
      return;
    }
    setSendet(true);
    setMeldung(null);
    try {
      const ergebnis = await sendeRueckmeldung(eingabe);
      if (ergebnis.ok) {
        schreibeEntwurf(null);
        setKennung(ergebnis.kennung);
      } else {
        setMeldung(ergebnis.grund);
      }
    } catch {
      setMeldung(NETZFEHLER);
    } finally {
      setSendet(false);
    }
  };

  if (kennung) {
    return (
      <Result
        status="success"
        data-testid="rueckmeldung-danke"
        title="Danke für deine Rückmeldung!"
        subTitle={
          <>
            Sie hat die Nummer <strong data-testid="rueckmeldung-kennung">{kennung}</strong>. Nenn sie,
            wenn du später danach fragst.
          </>
        }
        extra={<Button onClick={schliesseRueckmeldung}>Schließen</Button>}
      />
    );
  }

  const art = entwurf.art;
  return (
    <form
      data-testid="rueckmeldung-formular"
      onSubmit={absenden}
      style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}
    >
      <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
        <legend style={{ ...SCHRIFT.kicker, color: "var(--iuk-gedaempft)", marginBlockEnd: SPACE.sm }}>
          Worum geht es?
        </legend>
        {/* Untereinander statt `Segmented`: drei Beschriftungen nebeneinander
            passen bei 320px nicht in die Schublade. */}
        <Radio.Group
          value={art}
          onChange={(e) => aendere({ art: e.target.value as RueckmeldungArt })}
          style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}
          options={ARTEN.map((a) => ({ value: a, label: ART_NAME[a] }))}
        />
      </fieldset>

      <div>
        <label htmlFor={`${basis}-titel`} style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Kurz zusammengefasst
        </label>
        <Input
          id={`${basis}-titel`}
          ref={titelRef}
          data-testid="rueckmeldung-titel"
          value={entwurf.titel}
          maxLength={TITEL_MAX}
          showCount
          onChange={(e) => aendere({ titel: e.target.value })}
        />
      </div>

      <div>
        <label htmlFor={`${basis}-text`} style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Beschreibung
        </label>
        <Input.TextArea
          id={`${basis}-text`}
          data-testid="rueckmeldung-text"
          value={entwurf.text}
          maxLength={TEXT_MAX}
          showCount
          autoSize={{ minRows: 5, maxRows: 14 }}
          placeholder={PLATZHALTER[art ?? "sonstiges"]}
          onChange={(e) => aendere({ text: e.target.value })}
        />
      </div>

      <p style={{ ...SCHRIFT.neben, color: "var(--iuk-gedaempft)", margin: 0 }}>
        Bitte keine Patienten- oder Einsatzdaten eintragen. Mitgeschickt werden dein Name, die Seite, auf der
        du gerade bist, die Version der Suite und dein Browser.
      </p>

      {/* `warning` statt `error`: `colorError` ist das Rot der Primäraktion (Falle 3). */}
      {meldung ? <Alert type="warning" showIcon title={meldung} data-testid="rueckmeldung-fehler" /> : null}

      <Button type="primary" htmlType="submit" loading={sendet} data-testid="rueckmeldung-senden">
        Absenden
      </Button>
    </form>
  );
}
