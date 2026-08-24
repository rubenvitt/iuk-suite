"use client";

import { useMemo, useState } from "react";
import { Input } from "antd";
import { filtereAusleihen } from "../_lib/filter";
import { RueckgabeDialog } from "./RueckgabeDialog";
import s from "./ausleihe.module.css";

/**
 * DIE LISTE DER OFFENEN AUSLEIHEN (Spec 1 §4.4 Schritte 1, 2 und 5, `:3556-3562`).
 *
 * ⛔ `"use client"`, und die Gruende sind aufzaehlbar: der Suchtext, die gewaehlte Ausleihe,
 * der Erfolgssatz. Die REINE Funktion liegt ausdruecklich NICHT hier, sondern in
 * `_lib/filter.ts` OHNE Direktive (Falle 6, `CLAUDE.md`) — dieselbe Arbeitsteilung wie in
 * `_ui/GeraeteListe.tsx` und `_ui/AusleihVorgang.tsx`.
 *
 * ⛔ DIE SUCHE GEHT UEBER ANDERE FELDER ALS DIE DER UEBERSICHT: Rufname UND Entleihername
 * (`filtereAusleihen`, `_lib/filter.ts`; Falle № 10 der Analyse,
 * `docs/radio-portierung-analyse.md:1370-1374`). ⛔ WER EINE EINZIGE SUCHE BAUT, AENDERT
 * BEIDE VERHALTEN (ebd. `:1377`) — geteilt wird nur `normalisiereSuchtext`.
 *
 * ⛔ KEINE SEITENBLAETTERUNG (§4.9.6, `briefs/A20.md:17-18`): die Alt-API kennt
 * `take`/`skip`, die Oberflaeche benutzt sie nicht. Unter hundert Leihen waere Blaetterwerk
 * Mechanik ohne Anlass. ⛔ UND KEINE MEHRFACH-RUECKGABE (ebd. `:19-20`): eine Karte, ein
 * Dialog, eine Ausleihe.
 *
 * ⛔ KEIN `size` AUF EINEM BEDIENELEMENT (Falle 4, `CLAUDE.md:18-22`), KEIN
 * `@ant-design/icons` (Entscheidung E5, Falle 7) und KEINE `Table` (Entscheidung E4).
 *
 * ⚠️ DIE SUCHE FINDET UEBER DEN ENTLEIHERNAMEN, DIE KARTE ZEIGT IHN NICHT — und das ist
 * uebernommen, nicht uebersehen: der Bestand sucht ueber `${callSign} ${borrowerName}`
 * (`lib/loan-filter.ts:8`) und zeigt auf der Karte nur Rufname und Zeitpunkt
 * (`LoanedDeviceCard.tsx:59-64`). Spec:3558 schreibt genau diese Karte fort. ⬜ Wer den
 * Namen auf die Karte holt, aendert eine Anzeige, die der Cutover-Feldabgleich als
 * unveraendert fuehrt — das braucht eine Betreiberentscheidung, keine stille Ergaenzung.
 */

/**
 * Was die Insel von einer offenen Ausleihe braucht.
 *
 * ⛔ EIGENER SATZ, KEIN BEZUG AUF `OffeneAusleihe` (`_db/leihen.ts:104-109`) — dieselbe
 * Begruendung wie an `AuswahlGeraet` (`_ui/AusleihVorgang.tsx:61-69`): waechst das
 * Lesemodell um ein Feld, kommt es hier nicht von selbst an, sondern erst, wenn jemand es
 * HIER hinschreibt. Und `_db/leihen.ts` zoege ueber seine Importe Drizzle und die
 * Moduldatenbank in das Client-Bundle.
 * ⛔ `seitText` IST EINE FERTIGE ZEICHENKETTE (§4.1 Punkt 1, Spec:3336-3341): kein `Date`
 * ueberquert die RSC-Grenze, sonst zeigte die Flaeche die Zeitzone des BROWSERS.
 */
export type ListenAusleihe = {
  readonly id: string;
  readonly rufname: string;
  readonly entleiher: string;
  readonly seitText: string;
};

export function RueckgabeListe({ ausleihen }: { readonly ausleihen: readonly ListenAusleihe[] }) {
  const [suchtext, setSuchtext] = useState("");
  const [gewaehlt, setGewaehlt] = useState<ListenAusleihe | null>(null);
  const [offen, setOffen] = useState(false);
  const [erfolg, setErfolg] = useState<string | null>(null);

  const treffer = useMemo(() => filtereAusleihen(ausleihen, suchtext), [ausleihen, suchtext]);

  /*
   * ⛔ DER ZWEITE ANTIPP ERSETZT DIE AUSWAHL, ER SAMMELT NICHT (§4.9.6). ⛔ UND DER
   * ERFOLGSSATZ DES VORIGEN VORGANGS WIRD DABEI ZURUECKGENOMMEN: ein Satz ueber eine
   * abgeschlossene Rueckgabe ueber einem Dialog zu einer anderen Ausleihe ist eine falsche
   * Auskunft. Der Alt-Kiosk hat das Problem nicht, weil sein Toast von selbst verschwindet
   * (`routes/return.tsx:43`); ein Satz im Baum tut das nicht.
   */
  function oeffnen(ausleihe: ListenAusleihe): void {
    setErfolg(null);
    setGewaehlt(ausleihe);
    setOffen(true);
  }

  /*
   * ⛔ SCHLIESSEN LAESST DIE AUSWAHL STEHEN, NUR DER DIALOG GEHT ZU — 1:1 aus
   * `routes/return.tsx:100` (`onOpenChange={setIsDialogOpen}`, `selectedLoan` bleibt).
   * Dadurch bleibt `RueckgabeDialog` GEMOUNTET, und ein Wechsel auf eine andere Ausleihe
   * laeuft durch dessen Ruecksetz-Effekt statt durch einen Neuaufbau. ⛔ WER IHN HIER
   * ABRAEUMT, macht die Zusage „leert die Notiz beim Wechsel" konstruktiv gruen: ein
   * frischer Baum hat ohnehin ein leeres Feld.
   */
  function schliessen(): void {
    setOffen(false);
  }

  /*
   * ⛔ NACH DEM ERFOLG WIRD BEIDES ABGERAEUMT (1:1 `routes/return.tsx:44-45`): die Leihzeile
   * existiert nicht mehr, ein Dialog darauf haette keinen Gegenstand.
   * ⛔ DER RUFNAME KOMMT AUS DEM RUECKGABEWERT DES SERVERS, nicht aus der Karte
   * (`_actions/ausleihe.ts:190-197` leitet ausdruecklich NICHT um, damit er erhalten bleibt).
   */
  function erledigt(rufname: string): void {
    setErfolg(`${rufname} zurückgegeben.`);
    setOffen(false);
    setGewaehlt(null);
  }

  return (
    <div className={s.rueckgabe}>
      {erfolg !== null && (
        /*
          ⛔ KEIN TOAST (Entscheidung E6, Spec:3754-3776) und KEIN ERGEBNISPARAMETER IN DER
          ADRESSE wie bei der Ausleihe (`/geraete?gebucht=<n>`): `rueckgabeBuchen` leitet
          nicht um, damit die getippte Notiz einen Fehlerschluss ueberlebt. Der Satz lebt
          deshalb im Zustand dieser Insel.
          ⛔ `role="status" aria-live="polite"` UND NICHT `alert`. Das Ruling
          (`.superpowers/sdd/planteil3/progress.md:603-634`) regelt in seiner Kopfzeile
          ausdruecklich FEHLER-Meldungsorte, „nicht jede `role`-Region" — dies ist eine
          BESTAETIGUNG. A19 hat denselben Fall an seinem Erfolgssatz genauso entschieden
          (`_ui/SitzungErneuern.tsx:118-126`); zwei Toene fuer dieselbe Sache waeren genau
          das, was die A11-Zeile verhindern soll.
          ⬜ WAS DIESE WAHL NICHT BELEGT: dass ein `polite` hier ankommt. Auch diese Region
          wird zusammen mit ihrem Inhalt eingehaengt, und dafuer nennt Punkt 1 des Rulings
          den gemessenen Verschluckungsfall. Der Betreiber kann sie umkehren — dann faellt
          ein Attributpaar und je eine Zeile in `_ui/RueckgabeListe.test.tsx`.
          ⛔ GRUEN AUS DEM CHIP-SATZ, nicht `colorSuccess` — ein Farbsystem je Flaeche
          (Entscheidung E6); die Farbe steht im Stylesheet.
        */
        <p className={s.rueckgabeErfolg} role="status" aria-live="polite" data-rolle="radio-rueckgabe-erfolg">
          {erfolg}
        </p>
      )}

      {ausleihen.length > 0 && (
        /*
          ⛔ DIE SUCHZEILE ERSCHEINT NUR BEI OFFENEN AUSLEIHEN (Spec:3559, woertlich: „Die
          Suchzeile erscheint heute nur bei `loans.length > 0` (`routes/return.tsx:60`); das
          bleibt"). ⛔ UND DIE BEDINGUNG LIEST DIE UNGEFILTERTE LISTE: der Bestand haengt die
          Suchzeile an `loans` (`:60`), den Leerzustand aber an die GEFILTERTE Liste
          (`LoanedDeviceList.tsx:54`). Wer beide an dieselbe Liste haengte, naehme mit dem
          letzten Treffer auch das Feld weg, in das man gerade getippt hat.
          ⚠️ VON `page.tsx` AUS IST DER FALL `ausleihen.length === 0` NICHT ERREICHBAR — dort
          steht dann ein antd `Empty` an der Stelle dieser Insel. Die Bedingung traegt
          trotzdem die Zusage des Bestands woertlich, und diese Insel kennt ihren zweiten
          Aufrufer nicht.
          ⛔ `allowClear` STATT EINES EIGENEN 44er-KNOPFS (antd-Zuordnung): der Bestand baut
          das Loeschkreuz von Hand nach (`routes/return.tsx:75-84`), antd bringt
          Tastaturbedienung und Bildschirmleser-Beschriftung mit.
          ⛔ DER SUCHTEXT STEHT NICHT IN DER URL (§4.5.2, Spec:3633-3635) und nicht in
          `localStorage`.
        */
        <Input
          className={s.suchfeld}
          type="search"
          inputMode="search"
          allowClear
          autoComplete="off"
          spellCheck={false}
          aria-label="Ausleihen durchsuchen"
          placeholder="Rufname oder Name…"
          value={suchtext}
          onChange={(e) => setSuchtext(e.target.value)}
          data-rolle="radio-rueckgabe-suche"
        />
      )}

      {/*
        ⛔ `role="list"` MIT `role="listitem"` DAZWISCHEN, 1:1 aus `LoanedDeviceList.tsx:68-80`
        — ein `<button>` unmittelbar unter `role="list"` waere ein ungueltiges Kind, und die
        Zahl der Eintraege ginge einer Bildschirmleserin verloren.
      */}
      <div className={s.leihkarten} role="list" aria-label="Ausgeliehene Geräte">
        {treffer.map((ausleihe) => (
          <div key={ausleihe.id} role="listitem">
            {/*
              ⛔ EIN ECHTER `<button>`, KEIN `div` MIT `role="button"`. Der Bestand baut das
              zweite (`LoanedDeviceCard.tsx:53-56`: `role`, `tabIndex`, eigener `onKeyDown`
              fuer Enter und Leertaste) — ein Nachbau dessen, was ein `<button>` mitbringt.
              Das Ledger bindet die Auswahlflaechen dieses Moduls auf EIN Bedienmodell
              (`.superpowers/sdd/planteil3/progress.md:675-684`), und A19 hat dieselbe Wahl
              schon getroffen (`_ui/AusleihVorgang.tsx:332-345`).
              ⛔ DIE BESCHRIFTUNG NENNT DEN VORGANG (`LoanedDeviceCard.tsx:55`): „41/12"
              allein sagt einer Bildschirmleserin nicht, was ein Antippen tut.
              ⛔ DAS WORT „Uhr" HAENGT HIER UND NICHT IN `datumMitUhrzeit`
              (`_lib/anzeige.ts:52-58`) — sonst stuende an jedem zweiten Ort „Uhr Uhr".
            */}
            <button
              type="button"
              className={s.leihkarte}
              aria-label={`${ausleihe.rufname} zurückgeben`}
              onClick={() => oeffnen(ausleihe)}
              data-rolle="radio-leihkarte"
              data-id={ausleihe.id}
              data-rufname={ausleihe.rufname}
            >
              <span className={s.leihkarteRufname} data-rolle="radio-leihkarte-rufname">
                {ausleihe.rufname}
              </span>
              <span className={s.leihkarteZeit}>Ausgeliehen am {ausleihe.seitText} Uhr</span>
            </button>
          </div>
        ))}
      </div>

      {ausleihen.length > 0 && treffer.length === 0 && (
        /*
          ⛔ ZWEI LAGEN, ZWEI SAETZE, wie auf der Uebersicht (`_ui/GeraeteListe.tsx:165-179`):
          „Keine Geräte ausgeliehen" gilt fuer die leere Liste und steht als antd `Empty` auf
          der SEITE; hier gibt es Ausleihen, nur keinen Treffer.
          ⛔ DER SATZ NENNT DEN SUCHTEXT (`DeviceGroupedList.tsx:22`): „Keine Treffer" ueber
          einer vollen Liste laesst niemanden erkennen, warum.
        */
        <p className={s.leerTreffer} data-rolle="radio-rueckgabe-leer-treffer">
          {`Keine Treffer für „${suchtext.trim()}“`}
        </p>
      )}

      {gewaehlt !== null && (
        <RueckgabeDialog
          ausleihe={gewaehlt}
          offen={offen}
          onSchliessen={schliessen}
          onErledigt={erledigt}
        />
      )}
    </div>
  );
}
