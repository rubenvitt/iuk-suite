"use client";

import { useActionState, useState } from "react";
import { Input, Popover } from "antd";
import { einplanenAction } from "../actions";
import type { AufgabeRow } from "../_db/schema";
import { FORM_START, feldFehler, feldWert } from "../_lib/formState";
import { Ikone } from "./ikonen";
import s from "./aufgaben.module.css";

/*
 * „ANDERS EINPLANEN" DIREKT AM DATUM (Oberflaechen-Runde 2026-08-16, dritte Haelfte) — DIE
 * ZEILENFASSUNG VON `einplanenAction`, an die Stelle von Verweis → andere Seite → Anker →
 * Formular → Absenden.
 *
 * DAS URTEIL, GEGEN DAS DIESE DATEI GESCHRIEBEN IST, IST DASSELBE WIE BEI `ZuweisenInline.tsx`:
 * „nutze mehr Input-Moeglichkeiten, so wirkt es eher wie eine alte Formularanwendung." Fuer die
 * Terminfrage stimmt es sogar staerker als fuer die Zuweisung, denn hier war es nicht einmal ein
 * Modal, sondern ein SEITENWECHSEL: „Anders einplanen" fuehrte auf `/plan/<person>#einplanen-<id>`,
 * also fort von der Liste, in der man gerade liest, zu einem Formular, das dieselbe Aufgabe noch
 * einmal nennt. Wer danach die naechste Aufgabe umplanen wollte, ging zurueck und wieder hin.
 *
 * ══ WAS SICH FACHLICH AENDERT: NICHTS. Dieselbe `einplanenAction`, dieselben Feldnamen
 *    (`aufgabeId`, `planDatum`, `planUhrzeit`), dieselbe Optionalitaet der Uhrzeit, dieselbe
 *    Fehlerbehandlung ueber `feldFehler`. `uebergang()` entscheidet unveraendert, ob der Uebergang
 *    `einplanen` zulaessig ist (`verteilt` und `in_arbeit`, je mit `darfPlanAendern`), und WER die
 *    Insel ueberhaupt zu sehen bekommt, entscheidet weiterhin die Aufrufstelle — in
 *    `EinstiegBufdi.tsx` dasselbe `zeigeAktionen = darfPlanAendern(...)`, das den Verweis vorher
 *    gatete, in `Fuehrungskarte.tsx` dasselbe `props.darfPlanAendern`. Diese Datei fragt nichts
 *    selbst; sie nimmt nur entgegen.
 *
 * ══ `dauerMinuten` STEHT ABSICHTLICH NICHT IM FELD, obwohl `einplanenAction` es kennt. Das Feld ist
 *    dort optional („leer = unveraendert"), und die Zeilenfrage lautet WANN, nicht WIE LANGE. Wer
 *    die Dauer aendern will, hat den vollen Weg auf `/plan/<person>` unveraendert — er ist nicht
 *    fort, nur nicht in der Zeile. Dieselbe Abwaegung, die `ZuweisenInline` fuer den Zeitvorschlag
 *    bei `umverteilen` trifft.
 *
 * ══ KEINE BESTAETIGUNG, UND DAS IST GEPRUEFT, NICHT UEBERSEHEN: `_lib/lebenszyklus.ts` fuehrt
 *    `einplanen` mit `planLoeschen: false` — es SETZT einen Tag, es leert nichts. Es gibt also keine
 *    Folge zu nennen, und ein „Sind Sie sicher?" waere genau die leere Rueckfrage, die die
 *    Hausregel verbietet. Die Gegenprobe steht eine Datei weiter: `ZuweisenInline`s
 *    `umverteilen`-Zweig traegt `planLoeschen: true` und deshalb SEHR WOHL einen Folgesatz ueber
 *    der Auswahl. Wer hier je eine Folge ergaenzt, schuldet sie im selben Muster.
 *
 * ══ WARUM EINE CLIENT-INSEL (Falle 9): `Popover` braucht `onOpenChange`, also einen
 *    Funktions-Prop, und `useActionState` braucht einen Hook. Beides ginge aus einer Server
 *    Component nicht ueber die RSC-Grenze. Die Insel definiert ihre Funktionen selbst und
 *    importiert `einplanenAction` DIREKT; hinein gehen nur serialisierbare Daten.
 *    `Fuehrungskarte.tsx` bleibt damit Server Component — ihr eigener Quelltext-Scan besteht
 *    darauf.
 *
 * ══ KEIN `type="primary"` UND KEIN antd-`Button` AM AUSLOESER: der Zaehlriegel in
 *    `e2e/aufgaben.spec.ts` laesst innerhalb von `data-testid="aufgaben-flaeche"` hoechstens einen
 *    `.ant-btn-primary` zu, und der gehoert der Fuehrungskarte (Regel P). Der Ausloeser traegt
 *    `.zeilenKnopf` — dieselbe stille Form, die der Verweis vorher trug, und dieselbe
 *    44px-Zusage.
 */

/**
 * DAS ABSENDEN IST EIN EIGENER KNOPF UND NICHT — wie bei `ZuweisenInline` — die Auswahl selbst.
 * Der Unterschied ist nicht Nachlaessigkeit, sondern der Gegenstand: dort besteht die Entscheidung
 * aus einer Auswahl unter benannten Personen, hier aus einem GETIPPTEN Datum. Ein Datumsfeld hat
 * keinen „Klick, der die Wahl ist"; ein `onChange`-Absenden wuerde bei jeder Teil-Eingabe feuern
 * (der Browser meldet auch unvollstaendige Zwischenstaende) und aus einem Tippfehler eine
 * Planaenderung machen.
 */
export function EinplanenInline({
  aufgabe,
  beschriftung = "Anders einplanen",
}: {
  aufgabe: AufgabeRow;
  /**
   * Die Aufschrift des Ausloesers. Vorgabe ist der Wortlaut, den der Verweis vorher trug — die
   * Fuehrungskarte und die Zone benutzen ihn unveraendert, damit ein bestehender Griff
   * (`getByRole("link"/"button", { name: "Anders einplanen" })`) nur die Elementart wechselt.
   */
  beschriftung?: string;
}) {
  /*
   * SICHTBARKEIT IST ABGELEITET, KEIN ZWEITER ZUSTAND — dasselbe Muster und derselbe Grund wie in
   * `ZuweisenInline.tsx`: eine eingeplante Aufgabe kann in DERSELBEN Zone mit DEMSELBEN `key`
   * stehen bleiben (eine ueberfaellige Aufgabe bleibt ueberfaellig, auch wenn sie einen neuen Tag
   * bekommt). Ein `useState(false)` ueberlebte die Revalidierung, das Feld bliebe offen stehen und
   * zeigte still den alten Wert. Gemerkt wird deshalb „offen, SOLANGE der Plan derselbe ist";
   * wechselt der Plan, stimmt die Bedingung nicht mehr und das Feld schliesst — ohne `useEffect`,
   * der „frisch gemountet" von „gerade abgeschickt" unterscheiden muesste.
   */
  const marke = `${aufgabe.planDatum ?? ""}|${aufgabe.planUhrzeit ?? ""}`;
  const [offenFuer, setOffenFuer] = useState<string | null>(null);
  const offen = offenFuer !== null && offenFuer === marke;
  const [state, formAction, isPending] = useActionState(einplanenAction, FORM_START);
  const datumFehler = feldFehler(state, "planDatum");
  const uhrzeitFehler = feldFehler(state, "planUhrzeit");

  /*
   * DIE VORBELEGUNG IST DER VORSCHLAG, WO EINER OFFEN IST, SONST DER HEUTIGE PLAN. Genau die
   * Reihenfolge, die `EinplanenFormular` auf `/plan/<person>` fuehrt — nur dass dort der Vorschlag
   * NICHT vorbelegt wird, weil die Seite den Annehmen-Weg getrennt anbietet. In der Zeile steht
   * „Annehmen: <Tag>" direkt daneben; wer trotzdem dieses Feld oeffnet, will vom Vorschlag
   * ABWEICHEN und braucht ihn als Ausgangspunkt, nicht ein leeres Feld.
   *
   * `feldWert` LIEGT DAVOR, NICHT DAHINTER: nach einem Feldfehler kommt der getippte Wert zurueck
   * und darf nicht von der Vorbelegung ueberschrieben werden.
   */
  const datumVorgabe = feldWert(
    state,
    "planDatum",
    aufgabe.planDatum ?? aufgabe.vorschlagDatum ?? "",
  );
  const uhrzeitVorgabe = feldWert(
    state,
    "planUhrzeit",
    aufgabe.planUhrzeit ?? aufgabe.vorschlagUhrzeit ?? "",
  );

  const inhalt = (
    <form action={formAction} className={s.zuweisenFeld}>
      <input type="hidden" name="aufgabeId" value={aufgabe.id} />
      <div className={s.zuweisenVorschlag}>
        <label htmlFor={`ei-${aufgabe.id}-datum`}>Tag</label>
        <Input
          id={`ei-${aufgabe.id}-datum`}
          name="planDatum"
          type="date"
          defaultValue={datumVorgabe}
          status={datumFehler ? "error" : undefined}
          aria-invalid={datumFehler ? true : undefined}
          aria-describedby={datumFehler ? `ei-${aufgabe.id}-datum-err` : undefined}
        />
        {datumFehler ? (
          <p id={`ei-${aufgabe.id}-datum-err`} className={s.zuweisenFehler}>
            {datumFehler}
          </p>
        ) : null}
        <label htmlFor={`ei-${aufgabe.id}-zeit`}>Uhrzeit (optional)</label>
        <Input
          id={`ei-${aufgabe.id}-zeit`}
          name="planUhrzeit"
          type="time"
          defaultValue={uhrzeitVorgabe}
          status={uhrzeitFehler ? "error" : undefined}
          aria-invalid={uhrzeitFehler ? true : undefined}
          aria-describedby={uhrzeitFehler ? `ei-${aufgabe.id}-zeit-err` : undefined}
        />
        {uhrzeitFehler ? (
          <p id={`ei-${aufgabe.id}-zeit-err`} className={s.zuweisenFehler}>
            {uhrzeitFehler}
          </p>
        ) : null}
      </div>
      {/*
       * `.zuweisenZiel` FUER DIE GEMEINSAME MECHANIK (44px, eigener Fokusring im Portal, neutrale
       * Hoverflaeche) UND `.absendenKnopf` FUER DAS, WAS HIER ANDERS IST. Der Unterschied ist im
       * Bildschirmabzug gefunden worden und steht am Stylesheet ausgeschrieben: `.zuweisenZiel` ist
       * randlos, weil es fuer eine LISTE gebaut ist — unter fuenf gleichen Namenszeilen ist
       * „anklickbar" aus der Wiederholung ablesbar. Als EINZELNE Zeile unter zwei Eingabefeldern
       * sah dasselbe Element aus wie eine Beschriftung.
       */}
      <button type="submit" disabled={isPending} className={`${s.zuweisenZiel} ${s.absendenKnopf}`}>
        <span className={s.zuweisenName}>Einplanen</span>
      </button>
    </form>
  );

  return (
    /*
     * `data-offen` UND DIE `:has()`-REGEL IM STYLESHEET — identisch zu `ZuweisenInline`: die
     * Aktionsspur einer Zeile ist ohne Zuwendung durchsichtig, und der Popover-Inhalt liegt im
     * Portal, wo `:focus-within` an der Zeile nicht mehr greift. Ohne die Marke verschwaende der
     * Ausloeser unter seinem eigenen geoeffneten Feld, sobald die Maus die Zeile verlaesst.
     */
    <span className={s.zuweisenHuelle} data-offen={offen ? "true" : undefined}>
      <Popover
        open={offen}
        onOpenChange={(auf) => setOffenFuer(auf ? marke : null)}
        trigger="click"
        placement="bottomRight"
        content={inhalt}
      >
        <button
          type="button"
          className={s.zeilenKnopf}
          data-testid={`einplanen-${aufgabe.id}`}
        >
          <Ikone name="kalender" /> {beschriftung}
        </button>
      </Popover>
    </span>
  );
}
