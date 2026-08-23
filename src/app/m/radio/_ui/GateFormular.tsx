"use client";

import { useActionState } from "react";
import { Button, Input } from "antd";
import { einloesenAmGate, type GateZustand } from "../_actions/gate";
import s from "./ausleihe.module.css";

/**
 * DIE CLIENT-INSEL DES GATES (Spec §3.6.3, Zeilen 2926-2931: „Das Codefeld braucht ohnehin
 * eine `"use client"`-Insel, weil `useActionState` dort lebt").
 *
 * ⚠️ DER NAME IST EINE PLANENTSCHEIDUNG, KEINE SPEC-ZITIERUNG — Entscheidung E10
 * (`.superpowers/sdd/planteil3/briefs/KOPF.md:638-645`): die Spec fuehrt fuer diese Insel
 * keinen Namen, Kapitel 4s Dateiliste kennt sie nicht, weil das Gate nicht zu Kapitel 4
 * gehoert.
 *
 * ⛔ DIE ACTION WIRD DIREKT IMPORTIERT, NICHT ALS PROP DURCHGEREICHT (Falle 9,
 * `CLAUDE.md:52-70`): eine gewoehnliche Funktion darf die RSC-Grenze nicht ueberqueren,
 * und Server Actions duerfen es nur als DIREKTER Import. Ein `action`-Prop aus `page.tsx`
 * waere typkorrekt, und `pnpm build` saehe es nicht.
 *
 * ⛔ KEIN `size` AUF EINEM BEDIENELEMENT (Falle 4, `CLAUDE.md:18-22`). Das Gate laeuft ohne
 * `FullShell` und erbt damit `controlHeight: TAP = 56` vom Wurzelprovider
 * (`src/core/theme/theme.ts:51`); `size="large"` waere 72. ⛔ KEIN `Form.Item`, kein
 * `Input.TextArea` — Compound-Zugriffe (Falle 1, `CLAUDE.md:11-13`). Ein nacktes `<form>`
 * mit `action={…}` ist ohnehin die Bauform, die `useActionState` verlangt.
 *
 * ⛔ KEIN `@ant-design/icons` — in KEINER Datei dieses Moduls (Entscheidung E5,
 * Falle 7 `CLAUDE.md:31-44`). Der Absendeknopf traegt eine Beschriftung, kein Zeichen.
 */

/**
 * ⚠️ WARUM EIN OERTLICHER UMSCHLAG UM DIE ACTION UND KEIN DIREKTES
 * `useActionState(einloesenAmGate, {})` — zwei gemessene Gruende aus dem Bestand, beide in
 * `src/app/m/lagerbuch/_ui/Gate.tsx` ausgeschrieben:
 *
 *   1. `?? {}` IST DER ERFOLGSPFAD, NICHT DEFENSIVE ZIER. `einloesenAmGate` endet im
 *      Erfolg mit `redirect(returnTo ?? "/")` (`_actions/gate.ts:154`); der Client-Aufruf
 *      lehnt dafuer NICHT ab, sondern loest mit `undefined` auf. React rendert danach noch
 *      einmal, und ein `zustand.fehler` auf `undefined` wirft „Cannot read properties of
 *      undefined" und reisst den Baum ab (gemessen unter react-dom 19.2,
 *      `lagerbuch/_ui/Gate.tsx:103-110`).
 *   2. DAS `catch` FAENGT DREI LAGEN MIT EINEM SATZ: Verbindungsabbruch beim Absenden, den
 *      Wurf von `requireRadioHost` (`_actions/gate.ts:62`) und jede echte Serverausnahme —
 *      etwa ein fehlendes `RADIO_AUSLEIH_SITZUNG_SECRET`, das `createAusleihSitzung` in
 *      JEDEM Trefferpfad wirft (⬜ A-L7: eine Boot-Pruefung gibt es heute nicht,
 *      `_lib/ausleihSitzung.ts` schreibt das aus). Ohne das `catch` steigt der Wurf in den
 *      Absendeweg hoch und die Person saehe eine technische Fehlerseite statt eines Satzes
 *      an ihrem Formular.
 *
 * ⛔ DER SATZ NENNT KEINE URSACHE, und das ist Absicht: der Host-Wurf ist kein
 * Betriebsfall, sondern ein manipulierter Aufruf (Spec:2364-2366) und darf nicht
 * unterscheidbar antworten. Eine Netzdiagnose waere auf dem einzigen oeffentlichen
 * Einstieg zudem die falsche Auskunft — dieselbe Erwaegung wie in
 * `src/app/m/lagerbuch/_ui/Gate.tsx:70-77`.
 *
 * ⚠️ ER STEHT HIER UND NICHT IN `_lib/gateTexte.ts`: jene Datei fuehrt die VIER Saetze aus
 * Spec §3.3.4 (`:2382-2385`), und dieser ist keiner davon — er beschreibt eine Lage, die
 * der Server nie meldet, weil er sie nicht erreicht. In `_actions/gate.ts` kann er auch
 * nicht liegen: eine `"use server"`-Datei darf ausschliesslich asynchrone Funktionen
 * exportieren.
 */
const MELDUNG_AUSNAHME =
  "Der Code konnte nicht geprüft werden. Bitte noch einmal auf Weiter tippen — " +
  "bleibt es dabei, wende dich an die Leitung.";

async function amGate(vorher: GateZustand, formData: FormData): Promise<GateZustand> {
  try {
    const ergebnis: GateZustand | undefined = await einloesenAmGate(vorher, formData);
    return ergebnis ?? {};
  } catch {
    return { fehler: MELDUNG_AUSNAHME };
  }
}

export function GateFormular({
  fehlerText,
  returnTo,
}: {
  /**
   * Der FERTIGE Satz aus `gateMeldung(grund, sperrSekunden)`, serverseitig gebaut
   * (`page.tsx`), oder `null`. ⛔ NIE der rohe `?grund=`-Wert: der ist Nutzereingabe, und
   * die Sekundenzahl fuer `zuviele` holt sich die SEITE aus derselben Schranke mit
   * denselben Absender-Kopfzeilen — eine Zahl aus der URL waere beim ersten Neuladen
   * gelogen (Spec:2391-2394).
   */
  fehlerText: string | null;
  /** Bereits serverseitig durch `sanitizeReturnTo` gegangen (`page.tsx`). */
  returnTo: string;
}) {
  const [zustand, formAction, laeuft] = useActionState<GateZustand, FormData>(amGate, {});

  /*
   * ⛔ GENAU EIN MELDUNGSORT. Der Satz aus `?grund=` und der Rueckgabewert der Action
   * erscheinen an DERSELBEN Stelle; das Ergebnis der Action ist das frischere und gewinnt.
   * Zwei Orte waeren zwei Zustaende, die einander widersprechen koennen — ausgeschrieben
   * im Bestand, `src/app/m/lagerbuch/_ui/Gate.tsx:22-25`.
   */
  const meldung = zustand.fehler ?? fehlerText;

  return (
    <form className={s.formular} action={formAction}>
      <input type="hidden" name="returnTo" value={returnTo} />
      {/*
        `autoComplete="off"` und `spellCheck={false}`: der Code kommt vom Aufsteller oder
        vom Ausdruck, nicht aus dem Gedaechtnis des Browsers.

        ⛔ KEIN `maxLength` UND KEIN `pattern`. `lagerbuch` traegt beides
        (`lagerbuch/_ui/Gate.tsx:170-175`, gesetzt `:181-182`) und begruendet es mit dem gemeinsamen Rate-Limit-Eimer bei
        SECHS Ziffern; `radio` hat 28 Zeichen Crockford-Base32 in sieben Vierergruppen
        (Spec:2082-2087), und `normalisiereCode` (`_lib/code.ts`) raeumt Trenner,
        Kleinschreibung und die vier Verwechslungszeichen selbst auf. Ein `pattern` im
        Browser wuerde genau die Schreibweisen abweisen, die der Server bewusst annimmt.
      */}
      <Input
        className={s.feld}
        name="code"
        autoComplete="off"
        spellCheck={false}
        placeholder="Code vom Aufsteller"
        aria-label="Zugangs-Code"
        data-rolle="gate-code"
      />
      {/*
        ⛔ `role="alert"` UND NICHT `role="status" aria-live="polite"`. Das ist eine
        ausgesprochene Abweichung vom Brief (`.superpowers/sdd/planteil3/briefs/A11.md:180`),
        entschieden in der Fix-Runde 1 zu A11 (REVIEW-A11, Fund W3), weil der Bestand
        dieselbe Frage GEMESSEN entschieden hat und den Anlass ausschreibt
        (`src/app/m/lagerbuch/_ui/Gate.tsx:187-188`): „seit dem Netzfall erscheint dieser
        Ort auch NACHTRAEGLICH — nach einem Antippen, ohne Seitenwechsel"; zementiert als
        Testfall in `src/app/m/lagerbuch/_ui/Gate.test.tsx:129-135`.

        ⛔ UND GENAU DIESER FALL LEBT HIER: `MELDUNG_AUSNAHME` (`:63-65`) und jedes
        `zustand.fehler` aus der Action entstehen AUSSCHLIESSLICH nach einem Antippen ohne
        Seitenwechsel. Eine hoefliche Region, die im selben Augenblick wie ihr Inhalt in den
        Baum kommt, wird von Bildschirmlesern haeufig nicht angesagt; `alert` uebersteht das
        spaete Einhaengen.

        ⛔ KEIN `aria-live` DANEBEN: `alert` impliziert `assertive`, ein zusaetzliches
        `polite` gewaenne bei den meisten Hilfsmitteln und kehrte die Wahl still um.

        ⚠️ DER ZWEITE AUSWEG AUS W3 IST VERWORFEN, nicht uebersehen: die Region unbedingt
        einzuhaengen und nur ihren Text zu wechseln, hiesse einen leeren Kasten sichtbar
        stehen zu lassen — `.meldung` traegt Polsterung und Kante
        (`ausleihe.module.css:78-79`).
      */}
      {meldung && (
        <p className={s.meldung} role="alert" data-rolle="gate-meldung">
          {meldung}
        </p>
      )}
      <Button
        className={s.knopf}
        type="primary"
        htmlType="submit"
        loading={laeuft}
        data-rolle="gate-weiter"
      >
        Weiter
      </Button>
    </form>
  );
}
