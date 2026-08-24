"use client";

import { useActionState, useState } from "react";
import { Button, Input, Modal } from "antd";
import { rueckgabeBuchen } from "../_actions/ausleihe";
import { rueckgabeText, ZUSTANDSNOTIZ_MAX, type RueckgabeErgebnis } from "../_lib/meldungen";
import { SitzungErneuern } from "./SitzungErneuern";
import s from "./ausleihe.module.css";

/**
 * DER RUECKGABEDIALOG (Spec 1 §4.4, `:3554-3594`).
 *
 * ⛔ `"use client"`, und die Gruende sind aufzaehlbar: `useActionState` auf
 * `rueckgabeBuchen`, der Zustand des Notizfeldes, und `Input.TextArea` — ein
 * COMPOUND-ZUGRIFF, der in einer Server Component HTTP 500 ist (Falle 1, `CLAUDE.md:11-13`).
 * Die antd-Zuordnung schreibt fuer ihn ausdruecklich „nur Client" (`briefs/KOPF.md`).
 *
 * ⛔ antd `Modal` STATT DES RADIX-DIALOGS. Die Zuordnungstafel nennt den Grund, und der
 * Bestand beschreibt ihn selbst als Leistung seines Bausteins (`ReturnDialog.tsx:23`,
 * woertlich: „AC#7: Closes on Escape key and outside click (handled by shadcn/ui Dialog)"):
 * Escape, Klick daneben und die Fokusfalle bringt `Modal` mit. Ein Nachbau brauchte alle
 * drei einzeln.
 *
 * ⛔ DER DIALOG HAENGT IN EINEM PORTAL AN `document.body` — er ist KEIN Nachfahr von
 * `.rahmen` (`_ui/AusleihRahmen.tsx`). Jede Klasse, die er benutzt, darf deshalb nur
 * Variablen lesen, die auf `:root` stehen (Falle 2, `CLAUDE.md:14-15`);
 * `RueckgabeDialog.test.tsx` misst das an den Klassen, die tatsaechlich im Portal landen.
 *
 * ⛔ DIE ACTION WIRD DIREKT IMPORTIERT, nicht als Prop durchgereicht (Falle 9,
 * `CLAUDE.md:52-70`): eine gewoehnliche Funktion darf die RSC-Grenze nicht ueberqueren, und
 * Server Actions duerfen es nur als DIREKTER Import.
 *
 * ⛔ KEIN `size` AUF EINEM BEDIENELEMENT (Falle 4, `CLAUDE.md:18-22`): die Flaeche laeuft
 * ohne `FullShell` und erbt `controlHeight: TAP = 56` (`src/core/theme/theme.ts:50-51`).
 * Die Nachbaumasze 44 und 64 sind CSS-Klassen (Entscheidung E8). ⛔ KEIN
 * `@ant-design/icons` (Entscheidung E5, Falle 7).
 *
 * ⛔ KEINE MEHRFACH-RUECKGABE (§4.9.6, `briefs/A20.md:19-20`): eine Karte, ein Dialog, EINE
 * Ausleihe. Die Fläche verspricht sie nirgends, und der Bestand kennt sie nicht.
 *
 * ⚠️ WAS DIESE DATEI NICHT BELEGT: dass die Rueckgabe am Server WIRKT. Belegt ist, was der
 * Dialog mit dem ERGEBNIS macht; die Datenseite hat `_db/leihen.test.ts`, die Action
 * `_actions/ausleihe.test.ts`.
 */

/**
 * Was der Dialog von einer offenen Ausleihe braucht.
 *
 * ⛔ EIGENER SATZ, KEIN BEZUG AUF `OffeneAusleihe` (`_db/leihen.ts:105-110`) — dieselbe
 * Begruendung wie an `AuswahlGeraet` (`_ui/AusleihVorgang.tsx:66-74`): waechst das
 * Lesemodell um ein Feld, kommt es hier nicht von selbst an. Und `_db/leihen.ts` zoege ueber
 * seine Importe Drizzle und die Moduldatenbank in das Client-Bundle.
 * ⛔ KEIN `entleiher` UND KEIN `seitText`: der Dialog fragt „dieses Geraet zurueckgeben?" —
 * wer es hat und seit wann, steht auf der Karte, die eben angetippt wurde.
 */
export type DialogAusleihe = {
  readonly id: string;
  readonly rufname: string;
};

/**
 * Die Beschriftungen des Absendeknopfs — 1:1 aus `ReturnDialog.tsx:117`.
 *
 * ⚠️ „Wird zurückgegeben …" statt „Wird zurückgegeben..." ist die Hausform fuer
 * Auslassungspunkte und die Schreibweise der Spec (`:3561`); der Alt-Wortlaut traegt drei
 * Punkte. Dieselbe, benannte Abweichung wie bei `KNOPF_LAEUFT` in
 * `_ui/AusleihVorgang.tsx:121`.
 */
const KNOPF = "Zurückgeben";
const KNOPF_LAEUFT = "Wird zurückgegeben …";

/** Die zwei uebrigen Saetze des Dialogs, 1:1 aus `ReturnDialog.tsx:82-84`, `:92`. */
const HINWEIS = "Optional: Zustandsnotiz hinterlassen";
const PLATZHALTER = "z. B. Akku schwach, Kratzer am Gehäuse …";

/**
 * ⚠️ WARUM EIN OERTLICHER UMSCHLAG UM DIE ACTION UND KEIN DIREKTES
 * `useActionState(rueckgabeBuchen, null)` — zeichengleich zu `_ui/AusleihVorgang.tsx:123-153`
 * und `_ui/GateFormular.tsx:32-62`:
 *
 *   1. DAS `catch` FAENGT DREI LAGEN MIT EINEM SATZ: Verbindungsabbruch beim Absenden, den
 *      Wurf von `requireRadioHost` in der Riegelkette und jede echte Serverausnahme. Ohne
 *      das `catch` stiege der Wurf in den Absendeweg hoch, und die Person saehe eine
 *      technische Fehlerseite statt eines Satzes an ihrem Formular — mitsamt der getippten
 *      Notiz, um deren Erhalt es in dieser ganzen Aufgabe geht.
 *   2. DER ERFOLG WIRD HIER GEMELDET UND NICHT IN EINEM `useEffect` auf `zustand.ok`: der
 *      Zustand aus `useActionState` BLEIBT stehen, und ein Effekt darauf feuerte erneut,
 *      sobald derselbe Dialog fuer die naechste Ausleihe benutzt wird. Der Umschlag laeuft
 *      genau einmal je Absendung.
 *
 * ⛔ KEIN `?? null` HINTER DEM AUFRUF, anders als bei `ausleiheAnlegen`
 * (`_ui/AusleihVorgang.tsx:149`): dort ist es der Erfolgspfad, weil die Action mit
 * `redirect()` endet und der Client-Aufruf mit `undefined` aufloest. `rueckgabeBuchen`
 * leitet ausdruecklich NICHT um (`_actions/ausleihe.ts:222-229`) und gibt immer ein
 * Ergebnis zurueck — ein Rueckfall hier waere eine Behauptung ueber einen Ausgang, den es
 * nicht gibt.
 *
 * ⛔ DER SATZ IM `catch` WIRD NICHT NEU ERFUNDEN: `rueckgabeText({ grund: "unbekannt" })`
 * liefert genau den, den auch der Server fuer diesen Ausgang schickt (`_lib/meldungen.ts`).
 * Ein zweiter Wortlaut fuer dieselbe Lage waere die Fehlerform, gegen die
 * `_lib/bauform.test.ts:546-583` modulweit steht.
 */
export function RueckgabeDialog({
  ausleihe,
  offen,
  onSchliessen,
  onErledigt,
}: {
  readonly ausleihe: DialogAusleihe;
  readonly offen: boolean;
  readonly onSchliessen: () => void;
  /** Bekommt den Rufnamen aus dem RUECKGABEWERT des Servers, nicht den der Prop. */
  readonly onErledigt: (rufname: string) => void;
}) {
  const [notiz, setNotiz] = useState("");
  const [zuletzt, setZuletzt] = useState(ausleihe.id);
  /*
   * ⛔ DER TORWAECHTER UEBER DEM ERGEBNISBEREICH, und er ist noetig, weil `useActionState`
   * seinen Zustand NICHT zuruecksetzt — dieselbe Eigenschaft, wegen der der Erfolg im
   * Umschlag gemeldet wird und nicht in einem Effekt. Ohne ihn ueberlebte der Fehlersatz
   * einer Ausleihe den Wechsel auf die naechste: die Kopfzeile nennte 41/13, der Satz
   * darunter 41/12 — eine falsche Aussage ueber ein anderes Geraet. Bei
   * `grund === "sitzung"` bliebe zusaetzlich die Erneuerungs-Insel samt ihrem eigenen
   * `erledigt`-Zustand stehen.
   * ⚠️ DIE ALT-QUELLE HAT DAS PROBLEM NICHT, UND DESHALB FAELLT ES BEIM ZEILENWEISEN
   * VERGLEICH NICHT AUF: ihre Fehler sind TOASTS (`routes/return.tsx:48`), die von selbst
   * verschwinden und keinem Dialog gehoeren. Der Port erbt eine Lebensdauer, die es dort
   * nie gab.
   * ⛔ UND NICHT UEBER EIN `key` AM DIALOG: ein Neuaufbau je Auswahl leerte das Notizfeld
   * durch Konstruktion und machte die zwei Notiz-Zusagen leer-gruen — genau die Form, gegen
   * die dieser ganze Dialog gebaut ist. Fuer den zweiten Weg (dieselbe Ausleihe erneut
   * geoeffnet) taete er ohnehin nichts, weil der Schluessel derselbe bliebe.
   */
  const [zeigeErgebnis, setZeigeErgebnis] = useState(false);

  /*
   * ⛔ DIE NOTIZ GEHOERT ZU EINER AUSLEIHE (Feinheit 1, Spec:3576-3580; Alt-Quelle
   * `ReturnDialog.tsx:44-47`, Kommentar „Reset note when loan changes (H3 fix)"). Eine zu
   * 41/12 getippte Notiz an 41/13 zu haengen waere ein falscher Eintrag in der Datenbank,
   * den niemand mehr aufloest.
   * ⛔ UND GENAU DESHALB BLEIBT DIESER DIALOG UEBER DAS SCHLIESSEN HINWEG GEMOUNTET
   * (`_ui/RueckgabeListe.tsx`): waere er es nicht, ergaebe sich das leere Feld schon aus dem
   * Neuaufbau, und diese Zeile waere eine Zusage, die kein Test halten kann.
   *
   * ⚠️ ANGLEICHUNG WAEHREND DES RENDERNS, NICHT IN EINEM `useEffect` — und das ist erzwungen,
   * nicht gewaehlt: `react-hooks/set-state-in-effect` ist in diesem Repo ein LINT-FEHLER
   * („Calling setState synchronously within an effect can trigger cascading renders"),
   * gemessen an der ersten Fassung dieser Datei. Die Alt-Quelle benutzt den Effekt
   * (`ReturnDialog.tsx:45-47`), React nennt fuer genau diesen Fall aber die Form hier
   * („Adjusting state when a prop changes"): sie laeuft VOR dem ersten Anstrich des neuen
   * Wertes, der Effekt erst danach — mit dem Effekt waere die alte Notiz einen Bildaufbau
   * lang unter dem neuen Rufnamen zu sehen.
   */
  if (zuletzt !== ausleihe.id) {
    setZuletzt(ausleihe.id);
    setNotiz("");
    setZeigeErgebnis(false);
  }

  async function amFormular(
    vorher: RueckgabeErgebnis | null,
    formular: FormData,
  ): Promise<RueckgabeErgebnis | null> {
    /*
     * ⛔ DIE PRUEFUNG BEIM BESTAETIGEN — die zweite Haelfte von Feinheit 2 (Spec:3583-3585),
     * 1:1 aus `ReturnDialog.tsx:52-55` („M6: Defensive validation … return;"). ⛔ SIE IST
     * NICHT DASSELBE WIE DER DEAKTIVIERTE KNOPF: ein Formular laesst sich auch ohne seinen
     * Absendeknopf abschicken (die Eingabetaste, ein Skript, ein Test), und dann waere der
     * Knopfzustand eine Zusage, die niemand haelt.
     * ⛔ SIE KEHRT WORTLOS UM, WIE DER BESTAND — der Satz steht bereits am Feld
     * (`data-rolle="radio-notiz-fehler"`, unten), und ihn zusaetzlich in den Zustand zu
     * schreiben zeigte ihn zweimal. Zurueckgegeben wird deshalb der VORZUSTAND, unveraendert.
     * ⛔ GEMESSEN WIRD `notiz`, ALSO DER WERT DES GESTEUERTEN FELDES — genau der, den das
     * `FormData` traegt; und ungetrimmt, wie `_db/leihen.ts:653` misst.
     */
    if (notiz.length > ZUSTANDSNOTIZ_MAX) return vorher;

    setZeigeErgebnis(true);
    try {
      const ergebnis = await rueckgabeBuchen(vorher, formular);
      if (ergebnis.ok) onErledigt(ergebnis.rufname);
      return ergebnis;
    } catch {
      return { ok: false, grund: "unbekannt", text: rueckgabeText({ grund: "unbekannt" }) };
    }
  }

  const [zustand, formAction, laeuft] = useActionState<RueckgabeErgebnis | null, FormData>(
    amFormular,
    null,
  );

  /*
   * Feinheit 2 (Spec:3583-3585, `ReturnDialog.tsx:52-55`). ⛔ SIE IST BEWUSST DEFENSIV — der
   * Alt-Kommentar sagt es selbst: „Defensive: should never happen due to maxLength, but be
   * safe". Das Feld beginnt leer und `maxLength` haelt Tippen und Einfuegen an; anders als
   * beim Namensfeld aus A19 (A-L17) gibt es hier keinen vorbelegten Wert, der die Grenze
   * mitbringen koennte.
   * ⛔ UND SIE ERSETZT DEN SERVER NICHT: `bucheRueckgabe` prueft erneut
   * (`_db/leihen.ts:653-655`) — „eine Regel, die nur im Client steht, ist keine Regel".
   * ⛔ UNGETRIMMT GEMESSEN, wie `_db/leihen.ts:653` (`notiz.length`) misst. Zwei Messseiten
   * fuer dieselbe Grenze liefen sonst auseinander, und die zweite saehe man erst am Feld
   * (`.superpowers/sdd/planteil3/progress.md:584-588`). Denselben Massstab legt antds
   * Zaehler an: seine Vorgabestrategie ist `value => value.length`
   * (`@rc-component/input@1.3.1/es/hooks/useCount.js:30`).
   */
  const notizZuLang = notiz.length > ZUSTANDSNOTIZ_MAX;

  /*
   * ⛔ DER ZWEITE RUECKSETZ-ANLASS (`ReturnDialog.tsx:61-64` und `:70-72`): „Abbrechen",
   * Escape und der Klick daneben verwerfen die Notiz. ⛔ NUR DER FEHLERSCHLUSS TUT ES NICHT
   * — und den gibt es hier gar nicht, weil der Dialog bei `ok: false` offen BLEIBT.
   * `Modal` fuehrt alle drei Wege auf `onCancel` zusammen; im Bestand sind es zwei Handler.
   */
  function abbrechen(): void {
    setNotiz("");
    setZeigeErgebnis(false);
    onSchliessen();
  }

  return (
    <Modal
      open={offen}
      onCancel={abbrechen}
      title={`${ausleihe.rufname} zurückgeben`}
      footer={null}
      /*
       * ⛔ DIE ZWEI NAECHSTEN ATTRIBUTE SIND KEIN antd-BEIWERK, SONDERN DIE LETZTE
       * VERTEIDIGUNG VON FEINHEIT 1. Sie sperren waehrend des Absendens die zwei Wege, die
       * `Modal` auf `onCancel` fuehrt: die Escape-Taste (`keyboard`) und den Klick neben den
       * Dialog (`mask.closable`). `abbrechen()` raeumt `notiz` UND `zeigeErgebnis` (`:215-219`)
       * — ein danach eintreffendes `ok: false` landete hinter einem geschlossenen
       * Torwaechter.
       * ⛔ SELBST GEMESSEN, MIT BEIDEN SPERREN AUSGEHAENGT: Notiz getippt,
       * abgesendet, Escape im Flug, dann `ok: false` — `{ schliessen: 1, notiz: "",
       * fehlerSichtbar: false }`. Die Rueckgabe scheitert, die getippte Notiz ist weg, und es
       * steht NIRGENDS ein Satz. Mit den Sperren: `{ schliessen: 0, notiz: "Akku schwach",
       * fehlerSichtbar: true }`.
       * ⛔ BEIDE EINZELN BEWACHT, im Fall „laesst sich waehrend des Absendens weder mit
       * Escape noch neben dem Dialog schliessen" — wer nur eines entfernt, dreht ihn ebenso
       * rot (je 1 rot gemessen).
       * ⚠️ `mask={{ closable }}` UND NICHT `maskClosable`: antd 6 warnt zur Laufzeit
       * („`maskClosable` is deprecated. Please use `mask.closable` instead.").
       */
      mask={{ closable: !laeuft }}
      keyboard={!laeuft}
      data-rolle="radio-rueckgabedialog"
    >
      <form className={s.dialogForm} action={formAction} data-rolle="radio-rueckgabeform">
        {/*
          ⛔ DIE ZWEI FELDNAMEN SIND DIE DER ACTION (`_actions/ausleihe.ts:91-93`:
          `FELD_AUSLEIHE_ID = "ausleiheId"`, `FELD_ZUSTANDSNOTIZ = "zustandsnotiz"`, beide
          woertlich in Spec:3572). Sie stehen dort MODULPRIVAT, weil `EXPORT_FORM`
          (`_actions/guards.test.ts:122`) unter `_actions/` kein `export const` zulaesst; die
          Auflage, hier dieselben zu verwenden, steht ausgeschrieben
          (`_actions/ausleihe.ts:55-58`).
          ⛔ EIN FEHLENDES `name` AM NOTIZFELD IST DER STILLSTE FEHLER DIESER FLAECHE: die
          Rueckgabe gelaenge, nur ohne Notiz. `RueckgabeDialog.test.tsx` misst beide Attribute.
        */}
        <input type="hidden" name="ausleiheId" value={ausleihe.id} data-rolle="radio-ausleihe-id" />

        <p className={s.dialogHinweis}>{HINWEIS}</p>

        {/*
          ⛔ `Input.TextArea` MIT `showCount maxLength` — der Zaehler „0 / 500" kommt damit von
          antd (antd-Zuordnung, Spec:3560) und nicht aus eigenem Markup. Feinheit 3
          (Spec:3586-3587): er ist „die EINZIGE Stelle, an der die Flaeche die Grenze
          ueberhaupt nennt", und er bleibt.
          ⛔ DIE ZAHL KOMMT AUS `ZUSTANDSNOTIZ_MAX` (`_lib/meldungen.ts:88`) — die Auflage
          dort (`:82-86`) verlangt genau das: „die Grenze wird von HIER IMPORTIERT, nicht neu
          deklariert". ⬜ A-L11 ist damit abgelesen (500, aus
          `radio-inventar/packages/shared/src/loan.ts:6`).
          ⛔ KEIN `sanitizeForDisplay` AUF DEM WEG IN DIE DATENBANK (Spec:3589-3594): React
          escaped beim Rendern; eine Bereinigung vor dem Schreiben veraenderte die
          gespeicherte Zeichenkette dauerhaft.
        */}
        <Input.TextArea
          id="radio-zustandsnotiz"
          name="zustandsnotiz"
          className={s.dialogNotiz}
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          maxLength={ZUSTANDSNOTIZ_MAX}
          showCount
          rows={4}
          disabled={laeuft}
          placeholder={PLATZHALTER}
          aria-label="Zustandsnotiz (optional)"
        />

        {notizZuLang && (
          /*
            ⛔ `role="alert"` OHNE `aria-live` — Ruling
            `.superpowers/sdd/planteil3/progress.md:603-634`, Punkt 1, das fuer den Feldfehler
            am Notizfeld ausdruecklich „ohne Ermessen" gilt. Dieser Ort entsteht
            ausschliesslich nach einem Tastendruck OHNE Seitenwechsel; eine hoefliche Region,
            die zusammen mit ihrem Inhalt in den Baum kommt, wird haeufig nicht angesagt.
            ⛔ DER SATZ IST DER DES SERVERS (`rueckgabeText({ grund: "notiz-zu-lang" })`) und
            kein zweiter Wortlaut — der Server lehnt dieselbe Eingabe mit demselben Satz ab.
            ⚠️ ABWEICHUNG VOM BESTAND, BENANNT: `ReturnDialog.tsx:54` kehrt WORTLOS um. Ein
            Knopf, der nichts tut und nichts sagt, ist genau der Fall, gegen den das Ledger
            beim Deckel steht.
          */
          <p className={s.dialogFeldFehler} role="alert" data-rolle="radio-notiz-fehler">
            {rueckgabeText({ grund: "notiz-zu-lang" })}
          </p>
        )}

        {zeigeErgebnis && zustand !== null && !zustand.ok && (
          <>
            {/*
              ⛔ KEIN TOAST (Entscheidung E6, Spec:3754-3776): in `src/app` gibt es keinen
              Aufruf von `message.*` oder `App.useApp()`; der Alt-Kiosk benutzt `sonner`
              (`routes/return.tsx:48`), das hier nicht existiert. Der Fehler steht AM ORT DER
              AKTION, aus dem Ergebnistyp.
              ⛔ `role="alert"` OHNE `aria-live` — derselbe Ruling-Punkt 1 wie oben.
              ⛔ UND KEIN `Alert type="error"`: `colorError === colorPrimary`
              (`src/core/theme/theme.ts:32-33`), ein roter Kasten saehe aus wie die
              Primaeraktion (Falle 3).
              ⛔ DER DIALOG BLEIBT DABEI OFFEN, MIT DER NOTIZ (Feinheit 1, Spec:3576-3580) —
              es gibt hier keinen `onSchliessen`-Aufruf, und das ist die ganze Zusage.
            */}
            <p className={s.dialogFehler} role="alert" data-rolle="radio-rueckgabe-fehler">
              {zustand.text}
            </p>
            {/*
              ⛔ DIE INLINE-ERNEUERUNG ENTSCHEIDET SELBST, OB SIE ERSCHEINT (Entscheidung E12,
              Zusage §3.10 Nr. 8): die Bedingung `grund === "sitzung"` steht in
              `_ui/SitzungErneuern.tsx:97` und nicht hier — deshalb kann diese Aufgabe die
              Insel aus A19 MITBENUTZEN, statt eine zweite zu bauen (`briefs/A20.md:52-55`).
              ⛔ WAS HIER SCHIEFGEHEN KANN, IST DIE UEBERGABE: ein fest verdrahtetes
              `grund="sitzung"` liesse das Codefeld bei JEDER Absage erscheinen, typkorrekt
              und lint-sauber. `RueckgabeDialog.test.tsx` misst genau das.
              ⛔ DER VERLUST, GEGEN DEN SIE HIER STEHT, IST DIE GETIPPTE ZUSTANDSNOTIZ — sie
              faellt unter dieselbe Regel wie Feinheit 1.
            */}
            <SitzungErneuern grund={zustand.grund} />
          </>
        )}

        {/*
          ⛔ ZWEI KNOEPFE, WIE IM BESTAND (`ReturnDialog.tsx:103-119`) — und `footer={null}`
          am `Modal`, weil sein Vorgabefuss „OK"/„Abbrechen" heisst und seine Knoepfe nicht
          im Formular stehen. Ein `htmlType="submit"` ausserhalb des `<form>` loeste nichts
          aus.
          ⛔ `htmlType="button"` AM ABBRECHEN-KNOPF STEHT AUSDRUECKLICH DA, OBWOHL antd ES
          VORBELEGT. Der Baustein setzt selbst `htmlType = 'button'` als Vorgabewert
          (`antd@6.5.3/es/button/button.js:63`) und reicht ihn als `type` an das `<button>`
          durch (`:297`) — der Schaden, den ein nacktes `<button>` hier anrichtete (Vorgabetyp
          `submit`, „Abbrechen" buchte die Rueckgabe), kann mit DIESEM Baustein also nicht
          eintreten. ⚠️ ER STEHT TROTZDEM, UND DESHALB: ein Umbau auf ein nacktes `<button>`
          oder auf einen Baustein ohne diese Vorbelegung fuehrte den Formularschluss sonst
          STILL wieder ein. Das Attribut ist heute ein No-Op — selbst gemessen: entfernt,
          blieben alle 519 Faelle des Moduls gruen —, und genau deshalb bewacht es kein Fall.
          Ein Fall darueber pruefte antds Vorgabewert, nicht diese Datei.
          ⛔ `disabled` DECKT ZWEI LAGEN: der laufende Vorgang (1:1 `:114`, `isPending`) und
          die zu lange Notiz (Feinheit 2). ⛔ KEIN `size` (Falle 4); `min-width` und
          `touch-action: manipulation` sind Nachbau im CSS-Modul (Entscheidung E8).
        */}
        <div className={s.dialogFuss}>
          <Button
            className={s.dialogKnopf}
            htmlType="button"
            onClick={abbrechen}
            disabled={laeuft}
            data-rolle="radio-rueckgabe-abbrechen"
          >
            Abbrechen
          </Button>
          <Button
            className={s.dialogKnopf}
            type="primary"
            htmlType="submit"
            loading={laeuft}
            disabled={laeuft || notizZuLang}
            aria-busy={laeuft}
            data-rolle="radio-rueckgabe-senden"
          >
            {laeuft ? KNOPF_LAEUFT : KNOPF}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
