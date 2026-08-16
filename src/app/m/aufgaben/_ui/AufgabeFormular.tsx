"use client";

import { useActionState, useState } from "react";
import { Button, Checkbox, Input } from "antd";
import { aufgabeEinstellenAction } from "../actions";
import { NACHWEIS_ART_TEXT } from "../_lib/anzeige";
import { NACHWEIS_ARTEN, PRIORITAETEN } from "../_db/schema";
import { FORM_START, feldFehler, feldWert, type FormState } from "../_lib/formState";
import { SPACE } from "@/core/theme/tokens";
import { PrioritaetChip } from "./Chip";
import { DatumFeld, WahlFeld, ZeitFeld } from "./Felder";
import s from "./aufgaben.module.css";

/*
 * „AUFGABE EINSTELLEN" (Aufgabe 15, Spec §8.3) — Vorbild `RoutineFormular.tsx`/`PersonenFormular.tsx`:
 *
 *  1. `"use client"` STEHT IN ZEILE 1, VOR JEDEM KOMMENTAR.
 *  2. KEIN antd-`Form`/`Form.Item` — Meldung von Hand am Feld, `useActionState`. DIE AUSWAHLFELDER
 *     SIND SEIT DER FUENFTEN OBERFLAECHEN-RUNDE (2026-08-16) antds `Select`/`DatePicker`/
 *     `TimePicker`, gebuendelt in `_ui/Felder.tsx` — hier stand ein natives `<select>` fuer die
 *     NACHWEISART und je ein `<Input type="date">`/`<Input type="time">` fuer Frist und Uhrzeit.
 *     Die Begruendung, die dafuer stand („kein zweites Formular-Vokabular im Modul"), hat sich mit
 *     dem Betreiberurteil umgedreht: antd IST jetzt das Vokabular, und ein natives Feld daneben
 *     waere das zweite. Die volle Herleitung steht im Kopf von `Felder.tsx`.
 *     DIE PRIORITAET HAT DIESE FORM SEIT DER DRITTEN OBERFLAECHEN-RUNDE VERLASSEN — sie ist
 *     eine Chip-Wahl aus nativen Radios, begruendet an der Stelle selbst.
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
  /*
   * DER ABSENDEZAEHLER LEERT DIE AUSWAHLFELDER NACH EINER ERFOLGREICHEN ANLAGE — dieselbe Bauart
   * und derselbe Grund wie in `PersonenFormular.tsx`: die `Input`-Felder daneben sind
   * unkontrolliert und werden von React nach einer abgeschlossenen Action selbst zurueckgesetzt,
   * ein kontrolliertes antd-Auswahlfeld nicht. Ohne ihn stuende die Frist der eben eingestellten
   * Aufgabe noch im Formular fuer die naechste, waehrend Titel und Erklaerung schon leer sind —
   * und genau diese Mischung liest sich als „die Eingabe ist noch da", nicht als „das war's".
   *
   * ER STEIGT BEIM ABSENDEN, NICHT BEIM ERGEBNIS: `state` traegt in diesem Moment noch die alte
   * Antwort. Kommt danach ein FELDFEHLER zurueck, wechselt `feldWert(state, …)` und damit der
   * zweite Teil des Schluessels — das Feld montiert ein zweites Mal, jetzt mit der
   * zurueckgetragenen Eingabe (s. Kopfkommentar von `Felder.tsx`).
   */
  const [absendeZaehler, setAbsendeZaehler] = useState(0);
  const absenden = (daten: FormData): void => {
    setAbsendeZaehler((n) => n + 1);
    formAction(daten);
  };

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
      action={absenden}
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

      {/*
       * ══ DIE PRIORITAET WIRD GEWAEHLT, NICHT AUSGEKLAPPT (Oberflaechen-Runde 2026-08-16, dritte
       *    Haelfte). Hier stand ein `<select>` mit drei Eintraegen — die Bauform, die das Urteil des
       *    Betreibers meint („so wirkt es eher wie eine alte Formularanwendung"): drei sichtbare
       *    Werte hinter zwei Klicks, und der gewaehlte steht in einer Systemschrift, die mit der
       *    Rangskala des Moduls nichts zu tun hat.
       *
       *    DIE DREI STUFEN SIND IM MODUL BEREITS EINE FORMSPRACHE (`PRIORITAET_FORM`: gefuellt /
       *    Kontur / nur Wort, `_lib/anzeige.ts`). Sie hier zu zeigen, macht aus der Auswahl eine
       *    VORSCHAU: man waehlt das Aussehen, das die Aufgabe gleich in jeder Liste haben wird,
       *    statt eines Wortes in einem Aufklapper. `PrioritaetChip` ist genau der Baustein, den die
       *    Listen benutzen — es entsteht keine zweite Fassung.
       *
       *    NATIVE RADIOS, KEIN antd-`Radio.Group` UND KEIN `Segmented`: `Radio.Group` waere ein
       *    Compound-Zugriff (Falle 1) und beide brauchten `onChange`, also einen Funktions-Prop.
       *    Mit `<input type="radio">` bleibt das Feld ohne JavaScript bedienbar, traegt seinen Wert
       *    unter demselben Namen `prioritaet` und geht durch dieselbe `aufgabeEinstellenAction` mit
       *    demselben `istGueltigePrioritaet`-Riegel. Fachlich aendert sich nichts.
       *
       *    `<fieldset>`/`<legend>` STATT `<label htmlFor>`: drei Bedienelemente haben keine EINE
       *    Beschriftung, auf die ein `for` zeigen koennte — die Gruppenbeschriftung ist genau das,
       *    wofuer `legend` da ist, und Bildschirmleser sagen sie zu jeder der drei Stufen an.
       */}
      <fieldset className={s.prioWahl}>
        <legend style={{ marginBlockEnd: SPACE.xs, padding: 0 }}>Priorität</legend>
        <div className={s.prioWahlLeiste}>
          {PRIORITAETEN.map((p) => (
            <label key={p} className={s.prioWahlOption}>
              <input
                type="radio"
                name="prioritaet"
                value={p}
                defaultChecked={p === vorgabePrioritaet}
                className={s.prioWahlFeld}
              />
              <PrioritaetChip prioritaet={p} />
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="af-faelligAm" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Frist
        </label>
        <DatumFeld
          id="af-faelligAm"
          name="faelligAm"
          wert={feldWert(state, "faelligAm", "")}
          stand={absendeZaehler}
          fehler={faelligAmFehler}
          beschriebenVon={faelligAmFehler ? "af-faelligAm-err" : undefined}
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
        <ZeitFeld
          id="af-faelligUhrzeit"
          name="faelligUhrzeit"
          wert={feldWert(state, "faelligUhrzeit", "")}
          stand={absendeZaehler}
          fehler={faelligUhrzeitFehler}
          beschriebenVon={faelligUhrzeitFehler ? "af-faelligUhrzeit-err" : undefined}
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
        {/*
         * antds `Checkbox` UND NICHT MEHR EIN NACKTES `<input type="checkbox">` — dieselbe Runde
         * und dieselbe Begruendung wie bei den Auswahlfeldern. WICHTIG UND GEPRUEFT: antd rendert
         * darunter ein ECHTES `<input type="checkbox">` und reicht `id`, `name` und `value` daran
         * durch (`@rc-component/checkbox` spreizt seine restlichen Props auf das Element). Am
         * Formularvertrag aendert sich also nichts — ein nicht angehaktes Feld sendet weiterhin
         * GAR NICHTS, worauf sich `aufgabeEinstellenAction`s `istGesetzt` stuetzt.
         */}
        <Checkbox
          id="af-nachweispflicht"
          name="nachweisPflicht"
          value="true"
          checked={nachweisPflicht}
          onChange={(e) => setNachweisPflicht(e.target.checked)}
        >
          Nachweispflicht
        </Checkbox>
      </div>

      {nachweisPflicht ? (
        <div>
          <label htmlFor="af-nachweisart" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
            Nachweisform
          </label>
          <WahlFeld
            id="af-nachweisart"
            name="nachweisArt"
            wert={vorgabeNachweisArt}
            stand={absendeZaehler}
            optionen={NACHWEIS_ARTEN.map((art) => ({
              wert: art,
              text: NACHWEIS_ART_TEXT[art],
            }))}
          />
        </div>
      ) : (
        <input type="hidden" name="nachweisArt" value={vorgabeNachweisArt} />
      )}

      {darfFuerAndere ? (
        <div>
          <Checkbox
            id="af-fuerSichSelbst"
            name="fuerSichSelbst"
            value="true"
            defaultChecked={fuerSichSelbstVorbelegt}
          >
            Für mich selbst einstellen
          </Checkbox>
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
