"use client";

import { useActionState, useState } from "react";
import { Button, Input } from "antd";
import { aufgabeEinstellenAction } from "../actions";
import { NACHWEIS_ART_TEXT, PRIORITAET_TEXT } from "../_lib/anzeige";
import { NACHWEIS_ARTEN, PRIORITAETEN } from "../_db/schema";
import { FORM_START, feldFehler, feldWert, type FormState } from "../_lib/formState";
import { SPACE } from "@/core/theme/tokens";

/*
 * „AUFGABE EINSTELLEN" (Aufgabe 15, Spec §8.3) — Vorbild `RoutineFormular.tsx`/`PersonenFormular.tsx`:
 *
 *  1. `"use client"` STEHT IN ZEILE 1, VOR JEDEM KOMMENTAR.
 *  2. KEIN antd-`Form`/`Form.Item` — Meldung von Hand am Feld, `useActionState`. Native `<select>`
 *     fuer Prioritaet UND Formwahl (dieselbe Ueberlegung wie `PersonenFormular.tsx`s `pf-rolle`:
 *     kein zweites Formular-Vokabular im Modul, obwohl ein antd-`Select` in einer Client-Insel
 *     erlaubt waere).
 *  3. `Input.TextArea` FUER DIE ERKLAERUNG — ein Compound-Zugriff (Falle 1), aber in einer
 *     Client-Insel ausdruecklich erlaubt (Brief). GEPRUEFT, WIE DAS MODUL MEHRZEILIGEN TEXT LOEST,
 *     BEVOR DIESE ENTSCHEIDUNG FIEL (Brief verlangt genau das): `RoutineFormular.tsx`,
 *     `EinplanenFormular.tsx` und `PersonenFormular.tsx` haben KEIN mehrzeiliges Feld — „Erklaerung"
 *     ist das ERSTE im Modul, es gibt also keine bestehende zweite Loesung, von der abzuweichen
 *     waere. Andere Module der Suite nutzen ueberwiegend `Input.TextArea`
 *     (`feedback/_ui/PromptBlock.tsx`, `lagerbuch/_ui/ArtikelDrawer.tsx`,
 *     `lagerbuch/.../geraete/NeuGeraet.tsx`) — `files/_ui/AbgabeFormular.tsx`s natives `<textarea>`
 *     ist der Ausreisser, gebunden an einen eigenen Zeichenzaehler und eigene CSS-Klassen, die
 *     `aufgaben` nicht hat. `Input.TextArea` bleibt damit die Form, die zum uebrigen `Input`-Feld
 *     dieser Datei passt, statt eine dritte Optik einzufuehren.
 *  4. KEIN `@ant-design/icons`.
 *  5. `values` TRAEGT JEDES GESENDETE FELD ZURUECK — `aufgabeEinstellenAction` (Aufgabe 9, Fix-Runde
 *     1) tut das bereits fuer `fuerSichSelbst`/`nachweisPflicht` UND jedes Textfeld; diese Datei baut
 *     das nicht nach, sie liest nur `feldWert`/`checkboxVorbelegt`.
 *
 * „FUER MICH SELBST EINSTELLEN" ERSCHEINT NUR, WO DIE WAHL BESTEHT (Brief, Spec §5.2): jede Rolle
 * darf fuer sich selbst einstellen, nur `auftrag` und die Koordination auch fuer andere — das entscheidet
 * `anfangsZustand()` bereits (`_lib/lebenszyklus.ts`). `darfFuerAndere` kommt darum FERTIG BERECHNET
 * vom Server herein (`darfEinstellenFuerAndere(person, heute)`, `_lib/zugang.ts`), NICHT als Import
 * hier: `zugang.ts` importiert `auth()` aus `@/core/auth` (next-auth) — ein Wert- oder
 * Funktionsimport aus diesem Modul in eine Client-Insel wuerde next-auths serverseitigen Code ins
 * Client-Bundle ziehen, selbst wenn nur eine reine Funktion tatsaechlich aufgerufen wird (derselbe
 * Grund wie `PersonenTabelle.tsx`s `istAktivHeute`-Prop). Fuer eine Rolle OHNE diese Wahl (BuFDi)
 * traegt das Formular ein verstecktes Feld mit `"true"` — die Aufgabe geht dann immer an die
 * einstellende Person selbst, ohne dass die Oberflaeche eine Wahl vortaeuscht, die es nicht gibt.
 *
 * DIE NACHWEISFORM BLEIBT EIN GESENDETES FELD, AUCH WENN DIE PFLICHT NICHT ANGEHAKT IST (Lektion 7):
 * ein verstecktes `<input>` traegt den Vorgabewert weiter, statt das Feld beim Ausblenden ganz
 * wegzulassen — `aufgabeEinstellenAction` wirft sonst auf ein leeres `nachweisArt` (Zugriffs-
 * verletzung, kein Feldfehler, s. deren Kopfkommentar).
 */

function checkboxVorbelegt(state: FormState, feld: string, vorgabe: boolean): boolean {
  if (state.ok) return vorgabe;
  return state.values[feld] === "true";
}

export function AufgabeFormular({ darfFuerAndere }: { darfFuerAndere: boolean }) {
  const [state, formAction, isPending] = useActionState(aufgabeEinstellenAction, FORM_START);
  const [nachweisPflicht, setNachweisPflicht] = useState(() =>
    checkboxVorbelegt(state, "nachweisPflicht", false),
  );

  const titelFehler = feldFehler(state, "titel");
  const beschreibungFehler = feldFehler(state, "beschreibung");
  const faelligAmFehler = feldFehler(state, "faelligAm");
  const faelligUhrzeitFehler = feldFehler(state, "faelligUhrzeit");
  const dauerFehler = feldFehler(state, "dauerMinuten");

  const vorgabePrioritaet = feldWert(state, "prioritaet", "mittel");
  const vorgabeNachweisArt = feldWert(state, "nachweisArt", "text");
  const fuerSichSelbstVorbelegt = checkboxVorbelegt(state, "fuerSichSelbst", false);

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: SPACE.md, maxWidth: 480 }}
    >
      <div>
        <label htmlFor="af-titel" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Titel
        </label>
        <Input
          id="af-titel"
          name="titel"
          defaultValue={feldWert(state, "titel", "")}
          status={titelFehler ? "error" : undefined}
          aria-invalid={titelFehler ? true : undefined}
          aria-describedby={titelFehler ? "af-titel-err" : undefined}
        />
        {titelFehler ? (
          <p id="af-titel-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {titelFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="af-beschreibung" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Erklärung
        </label>
        <Input.TextArea
          id="af-beschreibung"
          name="beschreibung"
          autoSize={{ minRows: 3, maxRows: 8 }}
          defaultValue={feldWert(state, "beschreibung", "")}
          status={beschreibungFehler ? "error" : undefined}
          aria-invalid={beschreibungFehler ? true : undefined}
          aria-describedby={beschreibungFehler ? "af-beschreibung-err" : undefined}
        />
        {beschreibungFehler ? (
          <p id="af-beschreibung-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {beschreibungFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="af-prioritaet" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Priorität
        </label>
        <select id="af-prioritaet" name="prioritaet" defaultValue={vorgabePrioritaet}>
          {PRIORITAETEN.map((p) => (
            <option key={p} value={p}>
              {PRIORITAET_TEXT[p]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="af-faelligAm" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Frist
        </label>
        <Input
          id="af-faelligAm"
          name="faelligAm"
          type="date"
          defaultValue={feldWert(state, "faelligAm", "")}
          status={faelligAmFehler ? "error" : undefined}
          aria-invalid={faelligAmFehler ? true : undefined}
          aria-describedby={faelligAmFehler ? "af-faelligAm-err" : undefined}
        />
        {faelligAmFehler ? (
          <p id="af-faelligAm-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {faelligAmFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="af-faelligUhrzeit" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Frist-Uhrzeit (optional)
        </label>
        <Input
          id="af-faelligUhrzeit"
          name="faelligUhrzeit"
          type="time"
          defaultValue={feldWert(state, "faelligUhrzeit", "")}
          status={faelligUhrzeitFehler ? "error" : undefined}
          aria-invalid={faelligUhrzeitFehler ? true : undefined}
          aria-describedby={faelligUhrzeitFehler ? "af-faelligUhrzeit-err" : undefined}
        />
        {faelligUhrzeitFehler ? (
          <p id="af-faelligUhrzeit-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {faelligUhrzeitFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="af-dauerMinuten" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Dauerschätzung in Minuten
        </label>
        <Input
          id="af-dauerMinuten"
          name="dauerMinuten"
          type="number"
          min={1}
          defaultValue={feldWert(state, "dauerMinuten", "")}
          status={dauerFehler ? "error" : undefined}
          aria-invalid={dauerFehler ? true : undefined}
          aria-describedby={dauerFehler ? "af-dauerMinuten-err" : undefined}
        />
        {dauerFehler ? (
          <p id="af-dauerMinuten-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {dauerFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="af-nachweispflicht"
          style={{ display: "flex", alignItems: "center", gap: SPACE.xs }}
        >
          <input
            id="af-nachweispflicht"
            type="checkbox"
            name="nachweisPflicht"
            value="true"
            checked={nachweisPflicht}
            onChange={(e) => setNachweisPflicht(e.target.checked)}
          />
          Nachweispflicht
        </label>
      </div>

      {nachweisPflicht ? (
        <div>
          <label htmlFor="af-nachweisart" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
            Nachweisform
          </label>
          <select id="af-nachweisart" name="nachweisArt" defaultValue={vorgabeNachweisArt}>
            {NACHWEIS_ARTEN.map((art) => (
              <option key={art} value={art}>
                {NACHWEIS_ART_TEXT[art]}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="nachweisArt" value={vorgabeNachweisArt} />
      )}

      {darfFuerAndere ? (
        <div>
          <label
            htmlFor="af-fuerSichSelbst"
            style={{ display: "flex", alignItems: "center", gap: SPACE.xs }}
          >
            <input
              id="af-fuerSichSelbst"
              type="checkbox"
              name="fuerSichSelbst"
              value="true"
              defaultChecked={fuerSichSelbstVorbelegt}
            />
            Für mich selbst einstellen
          </label>
          <p style={{ margin: `${SPACE.xs}px 0 0` }}>
            Ohne Haken geht die Aufgabe an den Posteingang der Koordination.
          </p>
        </div>
      ) : (
        // KEINE WAHL VORTAEUSCHEN, WO KEINE BESTEHT (Brief): eine BuFDi darf nur fuer sich selbst
        // einstellen (`anfangsZustand()`) — das Formular traegt das als verstecktes Feld statt
        // eines Kontrollkaestchens, das ohnehin immer angehakt bliebe.
        <input type="hidden" name="fuerSichSelbst" value="true" />
      )}

      <Button
        type="primary"
        htmlType="submit"
        loading={isPending}
        disabled={isPending}
        style={{ alignSelf: "flex-start" }}
      >
        Aufgabe einstellen
      </Button>
    </form>
  );
}
