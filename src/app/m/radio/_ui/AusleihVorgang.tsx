"use client";

import { useActionState, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button, Input } from "antd";
import { ausleiheAnlegen } from "../_actions/ausleihe";
import { AUSWAHL_MAX, AUSWAHL_PARAMETER, auswahlSchreiben } from "../_lib/auswahl";
import { filtereGeraete } from "../_lib/filter";
import { ausleihText, KEINE_GERAETE_ERFASST, type AusleihErgebnis } from "../_lib/meldungen";
import { statusEtikett, type GeraeteStatus } from "../_lib/status";
import { EntleiherFeld, ENTLEIHER_MAX } from "./EntleiherFeld";
import { Ikone } from "./ikonen";
import { SitzungErneuern } from "./SitzungErneuern";
import { StatusChip } from "./StatusChip";
import s from "./ausleihe.module.css";

/**
 * DIE INSEL DES AUSLEIHVORGANGS (Spec 1 §4.3, `:3417-3553`).
 *
 * ⛔ `"use client"`, und die Gruende sind aufzaehlbar: `useActionState` auf
 * `ausleiheAnlegen`, das Umschalten der Auswahl mit `router.replace`, und das Namensfeld
 * mit seinen Vorschlaegen. Die REINEN Funktionen liegen ausdruecklich NICHT hier, sondern
 * in `_lib/auswahl.ts` und `_lib/filter.ts` OHNE Direktive — beide Seiten der RSC-Grenze
 * lesen sie (Falle 6, `CLAUDE.md`, Punkt 6).
 *
 * ⛔ DIE ACTION WIRD DIREKT IMPORTIERT, nicht als Prop durchgereicht (Falle 9,
 * `CLAUDE.md:52-70`). Ein `action`-Prop aus `page.tsx` waere typkorrekt, und `pnpm build`
 * saehe es nicht.
 *
 * ⛔ KEIN `size` AUF EINEM BEDIENELEMENT (Falle 4, `CLAUDE.md:18-22`): die Flaeche laeuft
 * ohne `FullShell` und erbt `controlHeight: TAP = 56` (`src/core/theme/theme.ts:50-51`);
 * `size="large"` waere 72. Die Nachbaumasze 44 und 64 sind CSS-Klassen (Entscheidung E8) —
 * ⛔ kein zweiter `ConfigProvider`, der waere eine Client-Komponente.
 * ⛔ KEIN `@ant-design/icons` (Entscheidung E5, Falle 7) und KEINE `Table` (Entscheidung E4).
 *
 * ⛔ DIE AUSWAHL IST EINE KNOPFREIHE MIT `aria-pressed`, KEIN MEHRFACH-`listbox`. Der
 * Bestand baut `role="listbox" aria-multiselectable` mit `role="option"`-Zeilen
 * (`DeviceSelector.tsx:36`, `DeviceRow.tsx:44-47`) — OHNE Pfeiltastenbedienung, also ein
 * drittes Bedienmodell neben dem, das dieses Modul bereits faehrt: der Statusfilter der
 * Uebersicht ist eine Knopfreihe mit `aria-pressed` (`_ui/GeraeteListe.tsx`,
 * `_lib/filter.ts:43-45`). Das Ledger bindet genau das: „A19/A20 bauen ihre Auswahlflaechen
 * nach derselben Zeile, damit das Modul nicht zwei Bedienmodelle fuer dieselbe Sache
 * fuehrt" (`.superpowers/sdd/planteil3/progress.md:675-684`). ⬜ Wer auf echte
 * Mehrfachauswahl mit Pfeiltasten umstellt, stellt BEIDE Flaechen um und braucht dieselbe
 * Betreiberentscheidung wie dort.
 *
 * ⬜ WAS DIESE FLAECHE GEGENUEBER DEM BESTAND NICHT HAT, und das steht hier statt zu
 * verschwinden: die Alt-Ausleihseite rendert die VOLLE Filterleiste des Kiosk
 * (`DeviceSelector.tsx:28-35` → `DeviceFilterBar`: Suche, vier Statusfilter, Trefferzeile)
 * und gruppiert nach Standort (`DeviceGroupedList`). Hier steht die Suche — dieselbe
 * `filtereGeraete` wie auf der Uebersicht, kein zweiter Suchort —, aber KEINE Statusfilter
 * und KEINE Standortgruppen. Grund: auf dieser Flaeche ist nur ein freies Geraet waehlbar,
 * die vier Statusfilter haetten also drei Zustaende ohne Handlung; und ein zweiter
 * Gruppierungsort neben `_ui/GeraeteListe.tsx` waere eine zweite Wahrheit ueber dieselbe
 * Einteilung. Die Browse-Flaeche ist `/geraete`. ⬜ Wer die Gruppen hier will, hebt
 * `gruppiereNachStandort` in einen gemeinsamen Baustein — nicht in eine Kopie.
 */

/**
 * Was die Insel von einer Zeile braucht.
 *
 * ⛔ EIGENER SATZ, KEIN BEZUG AUF `GeraetMitLeihstand` (`_db/leihen.ts:92-101`) — dieselbe
 * Begruendung wie an `ZeilenGeraet` (`_ui/GeraeteZeile.tsx`): waechst das Lesemodell um ein
 * Feld, kommt es hier nicht von selbst an, sondern erst, wenn jemand es HIER hinschreibt.
 * Das ist die tragende Haelfte der Datenschutz-Zusage aus §4.1 Punkt 2 (Spec:3343-3348).
 * ⛔ Und `_db/leihen.ts` zoege ueber seine Importe Drizzle und die Moduldatenbank in das
 * Client-Bundle.
 *
 * ⛔ KEIN `entleiher` UND KEIN `seit`, anders als auf der Uebersicht. Wer ein vergebenes
 * Geraet gerade hat, ist die Auskunft der Uebersicht (`_ui/GeraeteZeile.tsx`); sie hier zu
 * wiederholen hiesse, ihre Nebenzeilen-Logik ein zweites Mal zu schreiben. Auf dieser
 * Flaeche traegt die Nebenzeile, was beim WAEHLEN hilft: Geraetetyp und Standort.
 *
 * ⚠️ `suchschluessel` ENTHAELT DIE SERIENNUMMER (`_db/leihen.ts`, §4.1 Punkt 2) — sie geht
 * NUR dort ein und ist kein eigenes Feld. Zeichengleich zu `ListenGeraet`
 * (`_ui/GeraeteListe.tsx`); `(ausleihe)/ausleihen/page.test.tsx` misst es an dieser Grenze.
 */
export type AuswahlGeraet = {
  readonly id: string;
  readonly rufname: string;
  readonly geraetetyp: string | null;
  readonly standort: string | null;
  readonly status: GeraeteStatus;
  readonly suchschluessel: string;
};

/**
 * ⛔ DIE ZAHL KOMMT AUS `AUSWAHL_MAX` UND WIRD NICHT DANEBENGESCHRIEBEN — Auflage aus
 * `_lib/auswahl.ts:33-37`: „A19 setzt die Zahl aus DIESER Konstante in den Satz ein und
 * schreibt keine zweite 20; zwei Zahlen fuer denselben Deckel laufen beim ersten Aendern
 * auseinander, und die Oberflaeche nennte dann eine Grenze, die nicht gilt."
 * Der Satz selbst steht woertlich in Spec:3482-3484.
 */
const DECKEL_SATZ = `Höchstens ${AUSWAHL_MAX} Geräte in einem Vorgang.`;

/**
 * Der Feldfehler zur Laengengrenze (⬜ A-L17, `_ui/EntleiherFeld.tsx`).
 *
 * ⚠️ ER STEHT HIER UND NICHT IN `_lib/meldungen.ts` — dieselbe Begruendung wie bei
 * `MELDUNG_AUSNAHME` (`_ui/GateFormular.tsx:57-65`): jene Datei fuehrt die Saetze zu den
 * dreizehn `grund`-Werten der zwei Ergebnistypen, und dies ist keiner davon. Die Union
 * `AusleihGrund` hat keinen Zweig „zu lang", und einen achten zu erfinden verbietet
 * Entscheidung E13 (`.superpowers/sdd/planteil3/briefs/KOPF.md:775-778`).
 */
const NAME_ZU_LANG = `Der Name ist zu lang. Höchstens ${ENTLEIHER_MAX} Zeichen.`;

/**
 * Die DREI Beschriftungen des Absendeknopfs. ⛔ 1:1 aus dem Bestand sind die ersten ZWEI
 * (`ConfirmLoanButton.tsx:9-12`, `:68`); `KNOPF_LAEUFT` weicht um ein Zeichen ab und ist
 * unten an seinem Ort als Abweichung benannt (Ellipse statt drei Punkten, Spec:3428).
 */
const KNOPF_EINS = "Gerät ausleihen";
const KNOPF_MEHRERE = "Geräte ausleihen";
const KNOPF_LAEUFT = "Wird gespeichert …";

/**
 * ⚠️ WARUM EIN OERTLICHER UMSCHLAG UM DIE ACTION UND KEIN DIREKTES
 * `useActionState(ausleiheAnlegen, null)` — zwei Gruende, beide schon einmal gemessen und
 * in `_ui/GateFormular.tsx:32-62` ausgeschrieben:
 *
 *   1. `?? null` IST DER ERFOLGSPFAD, NICHT DEFENSIVE ZIER. `ausleiheAnlegen` endet im
 *      Erfolg mit `redirect("/geraete?gebucht=<n>")` (`_actions/ausleihe.ts:186`); der
 *      Client-Aufruf lehnt dafuer NICHT ab, sondern loest mit `undefined` auf. React
 *      rendert danach noch einmal, und ein `zustand.ok` auf `undefined` risse den Baum ab.
 *   2. DAS `catch` FAENGT DREI LAGEN MIT EINEM SATZ: Verbindungsabbruch beim Absenden, den
 *      Wurf von `requireRadioHost` in der Riegelkette und jede echte Serverausnahme. Ohne
 *      das `catch` stiege der Wurf in den Absendeweg hoch, und die Person saehe eine
 *      technische Fehlerseite statt eines Satzes an ihrem Formular — mitsamt der getippten
 *      Auswahl und dem Namen.
 *
 * ⛔ DER SATZ WIRD NICHT NEU ERFUNDEN: `ausleihText({ grund: "unbekannt" })` liefert genau
 * den Satz, den auch der Server fuer diesen Ausgang schickt (`_lib/meldungen.ts`) — ein
 * zweiter Wortlaut fuer dieselbe Lage waere die Fehlerform, gegen die
 * `_lib/bauform.test.ts` („kein Rueckfalltext hinter gateMeldung") modulweit steht.
 */
async function amFormular(
  vorher: AusleihErgebnis | null,
  formular: FormData,
): Promise<AusleihErgebnis | null> {
  try {
    const ergebnis: AusleihErgebnis | undefined = await ausleiheAnlegen(vorher, formular);
    return ergebnis ?? null;
  } catch {
    return { ok: false, grund: "unbekannt", text: ausleihText({ grund: "unbekannt" }), betroffen: [] };
  }
}

export function AusleihVorgang({
  geraete,
  vorauswahl,
  namensVorbelegung,
}: {
  readonly geraete: readonly AuswahlGeraet[];
  /** Bereits SERVERSEITIG auf Existenz und Verfuegbarkeit geprueft (`page.tsx`, §4.3.3). */
  readonly vorauswahl: readonly string[];
  /**
   * ⬜ A-L2 — der vorbelegte Name, oder `null`. Die Entscheidung, OB vorbelegt wird, faellt
   * in `page.tsx`; hier ist er nur der Anfangswert eines frei ueberschreibbaren Feldes
   * (§3.5.4: „ein `defaultValue`, ueberschreibbar, kein `readOnly`").
   */
  readonly namensVorbelegung: string | null;
}) {
  const router = useRouter();
  /*
   * ⛔ `usePathname()` IST HIER ZULAESSIG, ANDERS ALS IM RAHMEN. Die
   * Bauform-Zulaessigkeitstafel Zeile 16 (`briefs/KOPF.md:357`) verbietet ihn in
   * `_ui/AusleihRahmen.tsx`, aus zwei Gruenden: er machte den SERVER-Rahmen zur
   * Client-Grenze, und er wird dort gegen einen festen Schluesselsatz VERGLICHEN — auf dem
   * zweiten Weg (`/m/radio/ausleihen`, `src/core/routing.ts:54-67`) traefe der Vergleich
   * nie zu (`_ui/AusleihRahmen.tsx:47-52`). Hier ist beides nicht der Fall: diese Datei ist
   * ohnehin eine Insel, und der Wert wird NICHT verglichen, sondern unveraendert als Basis
   * derselben Adresse zurueckgeschrieben. Genau deshalb ist er die richtige Wahl: ein fest
   * verdrahtetes `/ausleihen` waere auf dem zweiten Weg die falsche Adresse.
   */
  const pfad = usePathname();

  const [auswahl, setAuswahl] = useState<readonly string[]>(vorauswahl);
  const [name, setName] = useState(namensVorbelegung ?? "");
  const [suchtext, setSuchtext] = useState("");
  const [zustand, formAction, laeuft] = useActionState<AusleihErgebnis | null, FormData>(
    amFormular,
    null,
  );

  /*
   * ⛔ EINE SUCHE, EIN ORT: `filtereGeraete` ist dieselbe Funktion, die die Uebersicht
   * benutzt (`_lib/filter.ts:180`), und sie sucht im vorberechneten `suchschluessel`
   * (§4.5.2, Spec:3629-3632). Der Statusfilter steht auf `"ALL"`, weil diese Flaeche keinen
   * fuehrt — siehe Kopf. ⛔ HIER WIRD NICHT ZUSAETZLICH SORTIERT: `filtereGeraete` ordnet
   * nach Statuspriorität, also freie Geraete zuerst.
   */
  const treffer = useMemo(
    () => filtereGeraete(geraete, { suchtext, status: "ALL" }),
    [geraete, suchtext],
  );

  const auswahlWert = auswahlSchreiben([...auswahl]);
  const deckelErreicht = auswahl.length >= AUSWAHL_MAX;
  /*
   * ⬜ A-L17, die Feldhaelfte. Sie ist ERREICHBAR und nicht bloss defensiv: `maxLength`
   * begrenzt das TIPPEN, nicht den vorbelegten Wert aus `weg: "suite"` (§3.5.4). Ein
   * Anzeigename ueber der Grenze stuende sonst absendebereit im Feld.
   */
  const nameZuLang = name.length > ENTLEIHER_MAX;
  const nameLeer = name.trim().length === 0;

  /**
   * Auswahl an/ab — und ⛔ DIE INSEL SCHREIBT SIE NACH `?geraete=` ZURUECK (Spec:3426).
   *
   * ⛔ `replace`, NICHT `push`: jedes Antippen eines Geraets legte sonst einen Eintrag in
   * den Verlauf, und „zurueck" waere ein Rueckwaertslauf durch die eigene Auswahl statt der
   * Weg zur Uebersicht.
   * ⛔ DER PARAMETER VERSCHWINDET GANZ, wenn nichts gewaehlt ist — `auswahlSchreiben`
   * liefert dafuer die leere Zeichenkette (`_lib/auswahl.ts:105-112`), und ein nacktes
   * `?geraete=` in der Adresse waere ein Zustand, den `auswahlLesen` zwar vertraegt, aber
   * niemand schreiben sollte.
   * ⛔ `scroll: false`: die Liste steht, wo sie steht. Ein Sprung nach oben nach jedem
   * Antippen waere auf dem Telefon der Verlust der Stelle, an der man gerade ist.
   */
  function umschalten(id: string): void {
    const drin = auswahl.includes(id);
    /*
     * ⛔ DER DECKEL SAGT NICHT NUR NEIN, ER IST AUCH SICHTBAR (Spec:3482-3484): oberhalb
     * von `AUSWAHL_MAX` nimmt die Flaeche nichts mehr an, und `DECKEL_SATZ` steht dann
     * unter der Liste. ⛔ ABZUWAEHLEN GEHT WEITERHIN — ein Deckel, der auch das Entfernen
     * sperrt, sperrt den einzigen Weg wieder unter die Grenze.
     */
    if (!drin && deckelErreicht) return;

    const neu = drin ? auswahl.filter((x) => x !== id) : [...auswahl, id];
    setAuswahl(neu);
    const wert = auswahlSchreiben(neu);
    router.replace(wert === "" ? pfad : `${pfad}?${AUSWAHL_PARAMETER}=${wert}`, { scroll: false });
  }

  const knopftext = laeuft ? KNOPF_LAEUFT : auswahl.length > 1 ? KNOPF_MEHRERE : KNOPF_EINS;

  return (
    <form className={s.ausleihForm} action={formAction} data-rolle="radio-ausleihform">
      {/*
        ⛔ DIE ZWEI FELDNAMEN SIND DIE DER ACTION. `geraete` kommt aus `AUSWAHL_PARAMETER`
        (`_lib/auswahl.ts:61`), damit der Name nur einmal existiert; `entleiher` steht
        woertlich, weil `_actions/ausleihe.ts` ihn modulprivat fuehren MUSS — `EXPORT_FORM`
        (`_actions/guards.test.ts:122`) laesst unter `_actions/` kein `export const` zu, und
        die Auflage dazu steht dort ausgeschrieben.
        ⛔ DAS SICHTBARE NAMENSFELD TRAEGT KEINEN `name` (`_ui/EntleiherFeld.tsx`): was das
        innere Suchfeld eines antd-`AutoComplete` an ein `FormData` liefert, ist kein
        Vertrag. Vorbild: `feedback/_ui/Zuordnung.tsx:396-398`.
      */}
      <input type="hidden" name={AUSWAHL_PARAMETER} value={auswahlWert} data-rolle="radio-auswahl-wert" />
      <input type="hidden" name="entleiher" value={name} data-rolle="radio-entleiher-wert" />

      <section className={s.schritt}>
        <h2 className={s.schrittTitel}>1. Gerät(e) wählen</h2>

        {/*
          ⛔ `allowClear` STATT EINES EIGENEN 44er-KNOPFS (antd-Zuordnung in `KOPF.md`):
          antd bringt Tastaturbedienung und Bildschirmleser-Beschriftung des Loeschkreuzes
          mit, ein Nachbau nicht.
          ⛔ `onPressEnter` FAENGT DIE EINGABETASTE AB: dieses Feld steht in einem Formular,
          dessen Absenden eine Ausleihe BUCHT. Ohne den `preventDefault` buchte die
          Eingabetaste im Suchfeld den Vorgang.
          ⛔ DER SUCHTEXT STEHT NICHT IN DER URL (Spec:3633-3635) und nicht in
          `localStorage` — nur `?geraete=` ist URL-Zustand (§4.5.2).
        */}
        <Input
          className={s.suchfeld}
          type="search"
          inputMode="search"
          allowClear
          autoComplete="off"
          spellCheck={false}
          aria-label="Geräte suchen"
          placeholder="Rufname oder Standort…"
          value={suchtext}
          onChange={(e) => setSuchtext(e.target.value)}
          onPressEnter={(e) => e.preventDefault()}
          data-rolle="radio-auswahl-suche"
        />

        <div className={s.auswahlListe} role="group" aria-label="Geräte auswählen">
          {treffer.map((geraet) => {
            const gewaehlt = auswahl.includes(geraet.id);
            const frei = geraet.status === "AVAILABLE";
            /*
             * Die Vorlesereihenfolge, 1:1 aus `DeviceRow.tsx:36-41`: Rufname, Standort,
             * Statusetikett, Nebenzeile. Ohne sie liest eine Bildschirmleserin lose
             * Textfetzen.
             */
            const neben = [geraet.geraetetyp, geraet.standort].filter(Boolean).join(" · ");
            const beschriftung = [geraet.rufname, geraet.standort, statusEtikett(geraet.status), neben]
              .filter(Boolean)
              .join(", ");
            const inhalt = (
              <>
                <div className={s.zeileText}>
                  <div className={s.zeileRufname} data-rolle="radio-auswahl-rufname">
                    {geraet.rufname}
                  </div>
                  <div className={s.zeileNeben}>{neben}</div>
                </div>
                {gewaehlt ? <Ikone name="haken" groesse={20} /> : <StatusChip status={geraet.status} />}
              </>
            );

            /*
             * ⛔ EIN NICHT FREIES GERAET IST NICHT ANTIPPBAR (`DeviceRow.tsx:47`,
             * `:49-50`): kein Knopf, `aria-disabled="true"`, 60 % Deckkraft. ⛔ DIE
             * DECKKRAFT IST NICHT DER TRAEGER DER AUSSAGE — das fehlende Bedienelement und
             * `aria-disabled` sind es (Spec:3696-3697).
             * ⛔ UND „FREI" IST DER GEFALTETE WERT: ein Geraet ohne erfassten Zustand faellt
             * auf „frei" zurueck (⬜ A-L13, Betreiberentscheidung vom 2026-08-22,
             * `.superpowers/sdd/planteil3/progress.md:22-32`) — die Faltung steht in
             * `_lib/status.ts`, nicht hier.
             */
            if (!frei) {
              return (
                <div
                  key={geraet.id}
                  className={s.auswahlZeile}
                  aria-disabled="true"
                  aria-label={beschriftung}
                  data-rolle="radio-auswahlzeile"
                  data-frei="nein"
                  data-id={geraet.id}
                >
                  {inhalt}
                </div>
              );
            }

            return (
              <button
                key={geraet.id}
                type="button"
                className={s.auswahlZeile}
                aria-pressed={gewaehlt}
                aria-label={beschriftung}
                onClick={() => umschalten(geraet.id)}
                data-rolle="radio-auswahlzeile"
                data-frei="ja"
                data-id={geraet.id}
              >
                {inhalt}
              </button>
            );
          })}
        </div>

        {treffer.length === 0 && (
          /*
            ⛔ ZWEI LAGEN, ZWEI SAETZE, wie auf der Uebersicht (`_ui/GeraeteListe.tsx:165-179`):
            „Keine Treffer" gilt, wenn es Geraete gibt und die Suche keines findet; gibt es
            GAR KEINE, hat niemand gesucht, und der Satz waere eine Auskunft ueber einen
            Vorgang, den es nicht gab. Der Satz fuer den leeren Bestand ist derselbe wie
            dort (`KEINE_GERAETE_ERFASST`, `_lib/meldungen.ts`) — kein zweiter Wortlaut.
            ⚠️ `suchtext.trim() === ""` UND „es gibt gar keine Geraete" FALLEN HIER NUR
            DESHALB ZUSAMMEN, WEIL DIESE FLAECHE KEINEN STATUSFILTER FUEHRT (siehe Kopf,
            Abweichung gegenueber `DeviceFilterBar`): ohne Suchtext ist `treffer` genau
            `geraete`. ⛔ Wer einen Filter nachruest, prueft dann auf `geraete.length === 0`,
            sonst steht der Erfassungssatz ueber einer vollen, nur weggefilterten Liste.
            ⛔ `.leerTreffer` UND NICHT `.trefferzeile`: jene kleidet auf der Uebersicht die
            ZAEHLZEILE (`_ui/GeraeteListe.tsx:158`), diese den Leerzustand
            (`ausleihe.module.css`) — zwei Flaechen, dieselbe Aussage, dieselbe Gestalt.
          */
          <p className={s.leerTreffer} data-rolle="radio-auswahl-leer">
            {suchtext.trim() === "" ? KEINE_GERAETE_ERFASST : "Keine Treffer für die Suche."}
          </p>
        )}

        {deckelErreicht && (
          /*
            ⛔ `role="alert"` OHNE `aria-live`, und diese Wahl ist BEGRUENDET statt geerbt.
            Das Ruling (`.superpowers/sdd/planteil3/progress.md:603-634`) trennt nach EINEM
            Kriterium: wie der Meldungsort in den Baum kommt. Punkt 2 (`status`/`polite`)
            gilt fuer einen Zaehler, der DAUERHAFT im Baum steht und nur seinen Text
            wechselt (`_ui/GeraeteListe.tsx:158`), und fuer eine Bestaetigung auf einem
            FRISCHEN Dokument nach einer Weiterleitung. Dieser Satz ist keines von beidem:
            er wird beim Antippen des zwanzigsten Geraets EINGEHAENGT und beim Abwaehlen
            wieder entfernt — also Punkt 1, mit dessen gemessenem Anlass: eine hoefliche
            Region, die zusammen mit ihrem Inhalt in den Baum kommt, wird haeufig nicht
            angesagt.
            ⛔ UND ER IST DIE EINZIGE RUECKMELDUNG AUF EINEN TASTENDRUCK, DER SONST NICHTS
            TUT: `umschalten` bricht oberhalb des Deckels wortlos ab (`if (!drin &&
            deckelErreicht) return;`). Wird der Satz verschluckt, tippt eine Person ins
            Leere, ohne zu erfahren warum.
            ⛔ DAMIT TRAEGT JEDER MELDUNGSORT DIESER FLAECHE DENSELBEN TON — Verlustsatz
            (`(ausleihe)/ausleihen/page.tsx`), Deckel, Feldfehler am Namen, Fehlersatz der
            Action, Fehlersatz der Erneuerung. Einen Punkt-2-Fall gibt es hier gar nicht;
            ein zweiter Ton waere die Uneinheitlichkeit, gegen die die A11-Zeile steht.
            ⚠️ DER BETREIBER KANN DAS UMKEHREN — dann faellt genau ein Attribut und je eine
            Zeile in „nimmt hoechstens AUSWAHL_MAX Geraete an und sagt es".
          */
          <p className={s.deckel} role="alert" data-rolle="radio-deckel">
            {DECKEL_SATZ}
          </p>
        )}
      </section>

      <section className={s.schritt}>
        <h2 className={s.schrittTitel}>2. Empfänger angeben</h2>
        {/*
          ⛔ OHNE GEWAEHLTES GERAET IST DAS FELD GESPERRT, 1:1 aus `routes/loan.tsx:87`
          (`disabled={selectedDeviceIds.length === 0}`): ein Name ohne Geraet ist kein
          Vorgang, und die Vorschlaege waeren ein anonymer Namensabruf ohne Anlass.
        */}
        <EntleiherFeld wert={name} setzeWert={setName} gesperrt={auswahl.length === 0} />
        {nameZuLang && (
          /*
            ⛔ `role="alert"` OHNE `aria-live` — Ruling `progress.md:603-634`, Punkt 1, das
            fuer den Feldfehler am Namensfeld ausdruecklich „ohne Ermessen" gilt.
          */
          <p className={s.feldFehler} role="alert" data-rolle="radio-name-fehler">
            {NAME_ZU_LANG}
          </p>
        )}
      </section>

      {zustand !== null && !zustand.ok && (
        <>
          {/*
            ⛔ KEIN TOAST (Entscheidung E6, Spec:3754-3776): in `src/app` gibt es keinen
            Aufruf von `message.*` oder `App.useApp()`. Der Fehler steht AM ORT DER AKTION,
            aus dem Ergebnistyp.
            ⛔ `role="alert"` OHNE `aria-live` — dieser Ort entsteht ausschliesslich nach
            einem Antippen OHNE Seitenwechsel (Ruling `progress.md:163-177`, `:603-634`).
            ⛔ UND KEIN `Alert type="error"`: `colorError === colorPrimary`
            (`src/core/theme/theme.ts:32-33`), ein roter Kasten saehe aus wie die
            Primaeraktion (Falle 3).
            ⛔ `betroffen` WIRD NICHT GERENDERT: seine `status`-Werte sind die technischen
            Schluessel aus `KonfliktZustand` (`_lib/meldungen.ts:108-118`), und ein
            Schluessel gehoert nie auf den Bildschirm (Spec:3549-3550). Der Rufname steht
            bereits IM Satz (Regel 1, Spec:3547).
          */}
          <p className={s.meldung} role="alert" data-rolle="radio-ausleih-fehler">
            {zustand.text}
          </p>
          {/*
            ⛔ DIE INLINE-ERNEUERUNG ENTSCHEIDET SELBST, OB SIE ERSCHEINT (Entscheidung E12,
            Zusage §3.10 Nr. 8): die Bedingung `grund === "sitzung"` steht in
            `_ui/SitzungErneuern.tsx` und nicht hier, damit A20 dieselbe Insel benutzen kann,
            ohne die Bedingung ein zweites Mal zu schreiben.
          */}
          <SitzungErneuern grund={zustand.grund} />
        </>
      )}

      {/*
        ⛔ SOFORTIGE SPERRE UND BESCHRIFTUNGSWECHSEL BLEIBEN WOERTLICH ERHALTEN
        (`ConfirmLoanButton.tsx:42-66`, Beschriftung `:68` je nach Anzahl) — nur wird aus dem
        `useState` ein `useActionState`, dessen `laeuft` dasselbe leistet (Spec:3431-3433).
        ⚠️ „Wird gespeichert …" statt „Wird gespeichert..." ist die Schreibweise der Spec
        (Spec:3428, Schritt 6) und die Hausform fuer Auslassungspunkte; der Alt-Wortlaut
        (`ConfirmLoanButton.tsx:10`) traegt drei Punkte.
        ⛔ `disabled` DECKT DREI LAGEN: kein Geraet, kein Name, Name zu lang — die ersten
        zwei 1:1 aus `ConfirmLoanButton.tsx:46`, die dritte ist ⬜ A-L17.
        ⛔ KEIN `size` (Falle 4); `min-width` und `touch-action: manipulation` sind Nachbau
        im CSS-Modul (Entscheidung E8, Spec:3724-3725).
      */}
      <Button
        className={s.absenden}
        type="primary"
        htmlType="submit"
        loading={laeuft}
        disabled={auswahl.length === 0 || nameLeer || nameZuLang || laeuft}
        aria-busy={laeuft}
        data-rolle="radio-ausleihen"
      >
        {knopftext}
      </Button>
    </form>
  );
}
