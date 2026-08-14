"use client";

import { useActionState } from "react";
import { Button, Input } from "antd";
import { personAendernAction, personAnlegenAction } from "../actions";
import type { PersonRow } from "../_db/schema";
import { ROLLE_TEXT } from "../_lib/anzeige";
import { ROLLEN } from "../_db/schema";
import { FORM_START, feldFehler, feldWert } from "../_lib/formState";
import { SPACE } from "@/core/theme/tokens";

/*
 * DIE PERSONENVERWALTUNG — ANLEGEN UND AENDERN (Aufgabe 14, Spec §4). Vorbild `RoutineFormular.tsx`:
 *
 *  1. `"use client"` STEHT IN ZEILE 1, VOR JEDEM KOMMENTAR.
 *  2. KEIN antd-`Form`/`Form.Item`, KEIN antd-`Select` (Falle 1 gilt hier zwar nicht — eine
 *     Client-Insel darf Compounds nutzen —, aber ein natives `<select>` bleibt im Vokabular dieser
 *     Datei: dieselbe "kein zweites Formular-Muster im Modul"-Ueberlegung wie bei den nativen
 *     Kontrollkaestchen in `RoutineFormular.tsx`).
 *  3. KEIN `@ant-design/icons`.
 *  4. `values` TRAEGT JEDES GESENDETE FELD ZURUECK (`personFormularGemeinsam` in `actions.ts`).
 *
 * EIN FORMULAR FUER ANLEGEN UND AENDERN: `person` UNGESETZT heisst "neu anlegen"
 * (`personAnlegenAction`, das `sub`-Feld ist ein echtes Eingabefeld), GESETZT heisst "aendern"
 * (`personAendernAction`, `sub` erscheint nur noch als READ-ONLY-Text). Der Aufrufer setzt bei einem
 * Wechsel des Ziels einen neuen `key`, damit `useActionState` mit einem frischen Startwert beginnt.
 *
 * WARUM `sub` NACH DEM ANLEGEN NICHT MEHR EDITIERBAR IST: der `sub` ist die Pocket-ID-Kennung, ueber
 * die `personFuerSeite` (`_lib/zugang.ts`) eine Sitzung auf genau diese Zeile abbildet. Ein
 * geaendertes `sub` haengte die GESAMTE Geschichte einer Person (Aufgaben, Nachweise, Verlauf) still
 * an eine andere Anmeldung um — "laut statt still" (Lehre 5 dieser Aufgabenreihe) verlangt hier eine
 * Entscheidung, keinen stillen Zugriff: das Feld verschwindet aus dem Formular, statt eine
 * Aenderung zuzulassen, die niemand beabsichtigt haben kann.
 *
 * WOHER DIE KOORDINATION DEN `sub` KENNT, OHNE ZU RATEN (Brief verlangt genau diese Begruendung):
 * die betroffene Person sieht ihren EIGENEN `sub` auf `_ui/NichtEingetragenSeite.tsx` (dem Ausgang
 * aus dem Modulzugang-ohne-Personen-Zeile-Fall) und gibt ihn muendlich oder schriftlich an die
 * Koordination weiter — die Koordination traegt hier NUR EIN, was sie von der betroffenen Person
 * bekommen hat, sie raet nichts.
 */
export function PersonenFormular({ person }: { person?: PersonRow }) {
  const action = person ? personAendernAction : personAnlegenAction;
  const [state, formAction, isPending] = useActionState(action, FORM_START);

  const nameFehler = feldFehler(state, "name");
  const initialenFehler = feldFehler(state, "initialen");
  const rolleFehler = feldFehler(state, "rolle");
  const sollMinutenFehler = feldFehler(state, "sollMinutenTag");
  const aktivVonFehler = feldFehler(state, "aktivVon");
  const aktivBisFehler = feldFehler(state, "aktivBis");
  const subFehler = feldFehler(state, "sub");

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: SPACE.md, maxWidth: 480 }}
    >
      {person ? <input type="hidden" name="personId" value={person.id} /> : null}

      {!person ? (
        <div>
          <label htmlFor="pf-sub" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
            Pocket-ID-Kennung
          </label>
          <Input
            id="pf-sub"
            name="sub"
            defaultValue={feldWert(state, "sub", "")}
            status={subFehler ? "error" : undefined}
            aria-invalid={subFehler ? true : undefined}
            aria-describedby={subFehler ? "pf-sub-err" : "pf-sub-hinweis"}
          />
          {/*
           * DER AUSGANG AUS `NichtEingetragenSeite.tsx` (Brief: "kein Feld, das die Koordination
           * raten laesst"). Die betroffene Person sieht ihren eigenen `sub` dort und gibt ihn
           * weiter — dieser Text erklaert, woher der Wert kommt, statt ihn erraten zu lassen.
           */}
          <p id="pf-sub-hinweis" style={{ margin: `${SPACE.xs}px 0 0` }}>
            Die betroffene Person findet ihre eigene Kennung auf der Hinweisseite, die sie nach dem
            Anmelden sieht („Du bist noch nicht im Modul eingetragen.“) — sie gibt sie dir weiter.
          </p>
          {subFehler ? (
            <p id="pf-sub-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
              {subFehler}
            </p>
          ) : null}
        </div>
      ) : (
        <div>
          <span style={{ display: "block", marginBlockEnd: SPACE.xs }}>Pocket-ID-Kennung</span>
          {/*
           * READ-ONLY, NICHT ALS FORMULARFELD (Kopfkommentar): ein `sub` ist nach dem Anlegen
           * unveraenderlich, damit keine Geschichte still umgehaengt wird.
           */}
          <p style={{ margin: 0 }}>
            <code>{person.sub}</code>
          </p>
        </div>
      )}

      <div>
        <label htmlFor="pf-name" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Name
        </label>
        <Input
          id="pf-name"
          name="name"
          defaultValue={feldWert(state, "name", person?.name ?? "")}
          status={nameFehler ? "error" : undefined}
          aria-invalid={nameFehler ? true : undefined}
          aria-describedby={nameFehler ? "pf-name-err" : undefined}
        />
        {nameFehler ? (
          <p id="pf-name-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {nameFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="pf-initialen" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Initialen
        </label>
        <Input
          id="pf-initialen"
          name="initialen"
          defaultValue={feldWert(state, "initialen", person?.initialen ?? "")}
          status={initialenFehler ? "error" : undefined}
          aria-invalid={initialenFehler ? true : undefined}
          aria-describedby={initialenFehler ? "pf-initialen-err" : undefined}
        />
        {initialenFehler ? (
          <p id="pf-initialen-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {initialenFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="pf-rolle" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Rolle
        </label>
        <select
          id="pf-rolle"
          name="rolle"
          defaultValue={feldWert(state, "rolle", person?.rolle ?? ROLLEN[0])}
          aria-invalid={rolleFehler ? true : undefined}
          aria-describedby={rolleFehler ? "pf-rolle-err" : undefined}
        >
          {ROLLEN.map((rolle) => (
            <option key={rolle} value={rolle}>
              {ROLLE_TEXT[rolle]}
            </option>
          ))}
        </select>
        {rolleFehler ? (
          <p id="pf-rolle-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {rolleFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="pf-soll" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Soll-Minuten pro Tag
        </label>
        <Input
          id="pf-soll"
          name="sollMinutenTag"
          type="number"
          min={1}
          defaultValue={feldWert(state, "sollMinutenTag", (person?.sollMinutenTag ?? 468).toString())}
          status={sollMinutenFehler ? "error" : undefined}
          aria-invalid={sollMinutenFehler ? true : undefined}
          aria-describedby={sollMinutenFehler ? "pf-soll-err" : undefined}
        />
        {sollMinutenFehler ? (
          <p id="pf-soll-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {sollMinutenFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="pf-aktiv-von" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Aktiv von
        </label>
        <Input
          id="pf-aktiv-von"
          name="aktivVon"
          type="date"
          defaultValue={feldWert(state, "aktivVon", person?.aktivVon ?? "")}
          status={aktivVonFehler ? "error" : undefined}
          aria-invalid={aktivVonFehler ? true : undefined}
          aria-describedby={aktivVonFehler ? "pf-aktiv-von-err" : undefined}
        />
        {aktivVonFehler ? (
          <p id="pf-aktiv-von-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {aktivVonFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="pf-aktiv-bis" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Aktiv bis (leer = unbefristet)
        </label>
        <Input
          id="pf-aktiv-bis"
          name="aktivBis"
          type="date"
          defaultValue={feldWert(state, "aktivBis", person?.aktivBis ?? "")}
          status={aktivBisFehler ? "error" : undefined}
          aria-invalid={aktivBisFehler ? true : undefined}
          aria-describedby={aktivBisFehler ? "pf-aktiv-bis-err" : undefined}
        />
        {aktivBisFehler ? (
          <p id="pf-aktiv-bis-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {aktivBisFehler}
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
        {person ? "Speichern" : "Person anlegen"}
      </Button>
    </form>
  );
}
