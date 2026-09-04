"use client";

import { useActionState, useState } from "react";
import { Alert, Button } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { AKTION_FEHLGESCHLAGEN } from "../../_lib/aktionsfehler";
import { speichereEigenesZeichen, type SpeichernZustand } from "../../actions";
import css from "./baukasten.module.css";

/*
 * ⛔ KEIN `Form`/`Form.Item` (Compound-Zugriff, in einer Server Component
 * verboten — und hier waere es eine zweite Bauform fuer dasselbe). Stattdessen
 * `useActionState` mit nativem `<label htmlFor>`, `aria-invalid` und einem
 * GEDAEMPFTEN Fehlertext: `colorError === colorPrimary === #c8000f` (Falle 3),
 * roter Text saehe aus wie eine Primaeraktion.
 *
 * Die Server Action wird DIREKT IMPORTIERT, nie als Prop durchgereicht (Falle 9).
 */

const START: SpeichernZustand = { ok: false, art: "fehler", feldFehler: {}, werte: {} };

/**
 * ⛔ DIE ACTION WIRD UMHUELLT, WEIL SIE WIRFT. `speichereEigenesZeichen` wirft
 * ohne Sitzung — richtig, denn eine Action, die unerlaubt aufgerufen wird, darf
 * nicht „nichts tun und aussehen wie Erfolg". Ungefangen reicht `useActionState`
 * den Wurf beim naechsten Rendern weiter, und die abgelaufene Sitzung nimmt die
 * ganze Baukastenflaeche mit — samt der Zusammenstellung, an der jemand gerade
 * gearbeitet hat. Derselbe Satz wie in den beiden Katalog-Inseln (Korrektur 9 des
 * Auftrags).
 *
 * Die Huelle laeuft im BROWSER und ruft die Server Action von dort — sie ist
 * selbst keine. Das kostet hier nichts: die Insel laedt ohnehin nur mit
 * JavaScript (`dynamic(..., { ssr: false })`), ein Formular ohne JS gibt es auf
 * dieser Flaeche nicht.
 */
async function speichereGefangen(
  vorher: SpeichernZustand,
  formData: FormData,
): Promise<SpeichernZustand> {
  try {
    return await speichereEigenesZeichen(vorher, formData);
  } catch {
    return {
      ok: false,
      art: "fehler",
      werte: {},
      feldFehler: { spec: AKTION_FEHLGESCHLAGEN },
    };
  }
}

export function SpeichernFormular(props: { specJson: string; svg: string; bereit: boolean }) {
  const [zustand, absenden] = useActionState(speichereGefangen, START);
  const [name, setName] = useState("");

  /*
   * ⛔ ZWEI FEHLERQUELLEN, EIN TEXTPLATZ — UND NUR EINE DAVON GEHOERT ANS
   * NAMENSFELD (Abschlussreview). Vorher las eine einzige Zeile
   * `feldFehler.name ?? feldFehler.spec` und haengte `aria-invalid` an das
   * Namensfeld, was auch immer sie fand. Ein SPEC-Fehler (die Zusammenstellung
   * taugt nicht, oder die Action wurde abgewiesen) sagte einem Bildschirmleser
   * damit „Name, ungueltig", obwohl am Namen nichts falsch ist — die Fassung
   * schickte jemanden ein Feld reparieren, das in Ordnung war.
   *
   * Der Text steht weiter an derselben Stelle; nur die ZUORDNUNG haengt jetzt
   * daran, welcher der beiden Fehler es ist.
   */
  const fehlerfall = !zustand.ok && zustand.art === "fehler" ? zustand : null;
  const namensFehler = fehlerfall?.feldFehler.name;
  const fehler = namensFehler ?? fehlerfall?.feldFehler.spec;
  const rueckfrage = !zustand.ok && zustand.art === "rueckfrage" ? zustand : null;

  return (
    <form action={absenden} data-testid="tz-speichern">
      <input type="hidden" name="spec" value={props.specJson} />
      <input type="hidden" name="svg" value={props.svg} />
      {/*
        ⛔ KEIN VERSTECKTES FELD UND KEIN REACT-STATE FUER DIE BESTAETIGUNG.
        `setBestaetigung` wirkte erst nach dem Re-Render; das Formular geht im
        selben Ereignis raus und truege noch den ALTEN Wert — „Ueberschreiben"
        loeste dieselbe Rueckfrage endlos erneut aus, und eine stehengebliebene
        Bestaetigung ueberschriebe beim naechsten Speichern ungefragt.
        Stattdessen traegt der ausloesende Submit-Knopf name+value; genau sein
        Wert landet in der FormData, und der gewoehnliche Speichern-Knopf traegt
        keinen — `bestaetigung` fehlt dann schlicht.
      */}

      <label htmlFor="tz-name">Name</label>
      <input
        id="tz-name"
        name="name"
        className={css.feld}
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-invalid={namensFehler ? true : undefined}
        aria-describedby={namensFehler ? "tz-name-fehler" : undefined}
      />
      {fehler && (
        /* Beim Spec-Fehler ist dieser Absatz die Beschreibung KEINES Feldes —
           dann traegt er keine `id` (nichts verweist darauf) und meldet sich
           stattdessen selbst an, damit er nicht stumm erscheint. */
        <p
          id={namensFehler ? "tz-name-fehler" : undefined}
          role={namensFehler ? undefined : "status"}
          className={css.hinweis}
          data-testid="tz-speichern-fehler"
        >
          {fehler}
        </p>
      )}

      {rueckfrage && (
        /* `type="warning"`, NIE `type="error"` — Falle 3. Und es ist auch kein
           Fehler: es ist eine Frage. */
        <Alert
          type="warning"
          showIcon
          data-testid="tz-rueckfrage"
          title={rueckfrage.text}
          style={{ marginBlockStart: SPACE.sm }}
          action={
            <Button
              htmlType="submit"
              data-testid="tz-rueckfrage-ja"
              name="bestaetigung"
              value={rueckfrage.frage === "name" ? "ueberschreiben" : "zusaetzlich"}
            >
              {rueckfrage.frage === "name" ? "Überschreiben" : "Trotzdem sichern"}
            </Button>
          }
        />
      )}

      {zustand.ok && (
        <Alert
          type="success"
          showIcon
          data-testid="tz-gespeichert"
          title={`„${zustand.name}“ ist gespeichert.`}
          style={{ marginBlockStart: SPACE.sm }}
        />
      )}

      <Button
        htmlType="submit"
        type="primary"
        disabled={!props.bereit}
        data-testid="tz-speichern-knopf"
        style={{ marginBlockStart: SPACE.sm }}
      >
        Speichern
      </Button>
    </form>
  );
}
