"use client";

import { useActionState } from "react";
import { Button, Input } from "antd";
import { routineAendernAction, routineAnlegenAction } from "../actions";
import { FORM_START, feldFehler, feldWert, type FormState } from "../_lib/formState";
import type { RoutineRow } from "../_db/schema";
import { WOCHENTAG_BIT } from "../_lib/anzeige";
import { SPACE } from "@/core/theme/tokens";

/*
 * DIE ERSTE CLIENT-INSEL DES MODULS (Aufgabe 11, Brief). Vier Stellen, an denen sie scheitern kann,
 * ohne dass ein Gate es sieht — und wie diese Datei jede davon behandelt:
 *
 *  1. `"use client"` STEHT IN ZEILE 1, VOR JEDEM KOMMENTAR — auch vor diesem hier.
 *  2. KEIN antd-`Form`, KEIN `Form.Item`: `feedback/_ui/StartFormular.tsx` verzichtet bewusst ganz
 *     darauf und rendert die Meldung von Hand am Feld (`useActionState`-Muster) — DIESE Datei folgt
 *     genau dem, statt ein zweites Formular-Muster im Modul aufzumachen. `Input` selbst ist KEIN
 *     Compound-Zugriff und waere ohnehin in einer Client-Insel erlaubt; die Wochentage sind eine
 *     Checkbox-GRUPPE aus nativen `<input type="checkbox">`, kein `Checkbox`/`Checkbox.Group` aus
 *     antd — fuenf native Kontrollkaestchen erreichen dieselbe Funktion ohne ein weiteres
 *     Antd-Muster einzufuehren, und `.modul input:focus-visible` (`aufgaben.module.css`) deckt ihren
 *     Fokusring bereits ab.
 *  3. KEIN `@ant-design/icons` — auch hier nicht. Diese Datei braucht ohnehin keine Zeichen.
 *  4. `values` TRAEGT JEDE GESENDETE WOCHENTAGSAUSWAHL ZURUECK: `routineFormularGemeinsam`
 *     (`actions.ts`) legt die gewaehlten Indizes kommagetrennt in `state.values.wochentage` ab, und
 *     `gewaehlteIndizes` unten liest genau diese Liste zurueck — ohne sie waere nach einem Feldfehler
 *     die ganze Wochentagsauswahl weg (Aufgabe 9 hatte denselben Fehler bei `fuerSichSelbst`).
 *
 * EIN FORMULAR FUER ANLEGEN UND AENDERN (Vorbild `qr/admin/preset-form.tsx`): `routine` UNGESETZT
 * heisst „neu anlegen" (`routineAnlegenAction`, leere Felder), GESETZT heisst „aendern"
 * (`routineAendernAction`, vorbelegte Felder plus verstecktes `routineId`). Der Aufrufer (die Seite)
 * setzt bei einem Wechsel des Ziels einen neuen `key`, damit `useActionState` mit einem frischen
 * Startwert beginnt statt den Fehlerzustand des vorigen Ziels stehen zu lassen.
 */

const WOCHENTAG_LABEL = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"] as const;

/** Die Umkehrung von `maskeAusIndizes` (`actions.ts`) — fuer die Vorbelegung beim Aendern. */
function indizesAusMaske(maske: number): number[] {
  return WOCHENTAG_BIT.flatMap((bit, i) => ((maske & bit) !== 0 ? [i] : []));
}

/**
 * Wie `feldWert`, nur fuer die Mehrfachauswahl: im Fehlerzustand die zurueckgetragene Liste, sonst
 * die Vorbelegung — nie `state.values` UND `vorbelegung` vermischt.
 */
function gewaehlteIndizes(state: FormState, vorbelegung: number[]): number[] {
  if (state.ok) return vorbelegung;
  const roh = state.values.wochentage ?? "";
  if (roh === "") return [];
  return roh.split(",").map(Number);
}

export function RoutineFormular({ routine }: { routine?: RoutineRow }) {
  const action = routine ? routineAendernAction : routineAnlegenAction;
  const [state, formAction, isPending] = useActionState(action, FORM_START);

  const indizes = gewaehlteIndizes(state, routine ? indizesAusMaske(routine.wochentage) : []);

  const titelFehler = feldFehler(state, "titel");
  const wochentageFehler = feldFehler(state, "wochentage");
  const uhrzeitFehler = feldFehler(state, "uhrzeit");
  const dauerFehler = feldFehler(state, "dauerMinuten");

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: SPACE.md, maxWidth: 480 }}
    >
      {routine ? <input type="hidden" name="routineId" value={routine.id} /> : null}

      <div>
        <label htmlFor="rt-titel" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Titel
        </label>
        <Input
          id="rt-titel"
          name="titel"
          defaultValue={feldWert(state, "titel", routine?.titel ?? "")}
          status={titelFehler ? "error" : undefined}
          aria-invalid={titelFehler ? true : undefined}
          aria-describedby={titelFehler ? "rt-titel-err" : undefined}
        />
        {titelFehler ? (
          <p id="rt-titel-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {titelFehler}
          </p>
        ) : null}
      </div>

      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend style={{ padding: 0, marginBlockEnd: SPACE.xs }}>Wochentage</legend>
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          {WOCHENTAG_LABEL.map((label, i) => (
            <label
              key={label}
              htmlFor={`rt-wochentag-${i}`}
              style={{ display: "flex", alignItems: "center", gap: SPACE.xs }}
            >
              <input
                id={`rt-wochentag-${i}`}
                type="checkbox"
                name="wochentage"
                value={i}
                defaultChecked={indizes.includes(i)}
                aria-invalid={wochentageFehler ? true : undefined}
                aria-describedby={wochentageFehler ? "rt-wochentage-err" : undefined}
              />
              {label}
            </label>
          ))}
        </div>
        {wochentageFehler ? (
          <p id="rt-wochentage-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {wochentageFehler}
          </p>
        ) : null}
      </fieldset>

      <div>
        <label htmlFor="rt-uhrzeit" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Uhrzeit (optional)
        </label>
        <Input
          id="rt-uhrzeit"
          name="uhrzeit"
          type="time"
          defaultValue={feldWert(state, "uhrzeit", routine?.uhrzeit ?? "")}
          status={uhrzeitFehler ? "error" : undefined}
          aria-invalid={uhrzeitFehler ? true : undefined}
          aria-describedby={uhrzeitFehler ? "rt-uhrzeit-err" : undefined}
        />
        {uhrzeitFehler ? (
          <p id="rt-uhrzeit-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {uhrzeitFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="rt-dauer" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Dauer in Minuten
        </label>
        <Input
          id="rt-dauer"
          name="dauerMinuten"
          type="number"
          min={1}
          defaultValue={feldWert(state, "dauerMinuten", routine?.dauerMinuten?.toString() ?? "")}
          status={dauerFehler ? "error" : undefined}
          aria-invalid={dauerFehler ? true : undefined}
          aria-describedby={dauerFehler ? "rt-dauer-err" : undefined}
        />
        {dauerFehler ? (
          <p id="rt-dauer-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {dauerFehler}
          </p>
        ) : null}
      </div>

      <Button
        type="primary"
        htmlType="submit"
        loading={isPending}
        disabled={isPending}
        style={{ alignSelf: "flex-start" }}
      >
        {routine ? "Speichern" : "Routine anlegen"}
      </Button>
    </form>
  );
}
