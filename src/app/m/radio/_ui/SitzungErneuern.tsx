"use client";

import { useState } from "react";
import { Button, Input } from "antd";
import { erneuereSitzung } from "../_actions/sitzung";
import type { AusleihGrund, RueckgabeGrund } from "../_lib/meldungen";
import s from "./ausleihe.module.css";

/**
 * DIE INLINE-ERNEUERUNG DER SITZUNG (Entscheidung E12,
 * `.superpowers/sdd/planteil3/briefs/KOPF.md:675-728`).
 *
 * ⛔ SIE IST DIE FLAECHE ZU ZUSAGE §3.10 Nr. 8 (Spec:3235-3236) und zu §3.4.4
 * (Spec:2563-2570), woertlich: „die Flaeche bietet INLINE ein Codefeld an, das die Sitzung
 * erneuert, OHNE DIE EINGETRAGENEN WERTE ZU VERLIEREN."
 *
 * ⛔ KEIN MODAL, KEIN REDIRECT, KEIN NEUAUFBAU DER SEITE. Der ganze Zweck ist, dass Auswahl
 * und Name stehen bleiben; jede dieser drei Formen verwuerfe genau sie. `erneuereSitzung`
 * setzt das Cookie deshalb OHNE `redirect()` (`_actions/sitzung.ts:126-133`) — die eine
 * Stelle des Moduls, an der eine Sitzung ohne Weiterleitung entsteht.
 *
 * ⛔ SIE ERSCHEINT NUR BEI `grund === "sitzung"`, NIE BEI `"gesperrt"` (Zusage §3.10 Nr. 8).
 * Bei einem gesperrten Code scheitert dieselbe Eingabe genauso, und „ein Feld, das nicht
 * helfen kann, ist schlimmer als eine klare Absage" (Spec:2563-2570). Der Satz zu
 * `gesperrt` sagt stattdessen, was zu tun ist („Wende dich an die Leitung.",
 * `_lib/meldungen.ts`).
 *
 * ⛔ DIE BEDINGUNG STEHT HIER UND NICHT BEIM AUFRUFER, und das ist der Grund, aus dem A20
 * dieselbe Insel benutzen kann statt eine zweite zu bauen (Brief A20,
 * `.superpowers/sdd/planteil3/briefs/A20.md:52-55`): zwei Aufrufer mit je eigener
 * Bedingung waeren zwei Orte, an denen die Zusage brechen kann, und der zweite fiele
 * niemandem auf.
 *
 * ⛔ KEIN EIGENES `<form>` UND KEIN ABSENDEKNOPF. Diese Insel wird INNERHALB des
 * Ausleihformulars gerendert (A19) und im Rueckgabedialog (A20); ein verschachteltes
 * `<form>` ist ungueltiges HTML, und ein `htmlType="submit"` loeste das AEUSSERE Formular
 * aus. ⛔ Ein Automatismus „erneuern und gleich buchen" waere ausserdem ein ZWEITER
 * Schreibweg, den kein Test dieses Planteils bewacht — der Mensch drueckt selbst erneut
 * (`briefs/A19.md:66-67`).
 *
 * ⛔ DIE ACTION WIRD DIREKT IMPORTIERT, nicht als Prop durchgereicht (Falle 9,
 * `CLAUDE.md:52-70`): eine gewoehnliche Funktion darf die RSC-Grenze nicht ueberqueren, und
 * Server Actions duerfen es nur als DIREKTER Import.
 *
 * ⛔ KEIN `size` AUF EINEM BEDIENELEMENT (Falle 4, `CLAUDE.md:18-22`): die Flaeche laeuft
 * ohne `FullShell` und erbt `controlHeight: TAP = 56` (`src/core/theme/theme.ts:50-51`);
 * `size="large"` waere 72. Das Tap-Masz des Knopfs kommt aus dem CSS-Modul (Entscheidung
 * E8). ⛔ KEIN `@ant-design/icons` (Entscheidung E5, Falle 7).
 *
 * ⚠️ WAS DIESE DATEI NICHT BELEGT: dass die Erneuerung am Server WIRKT — die vier Dateien
 * des Zugangswegs tragen bis heute NULL Verhaltensdeckung (⬜ A-L9,
 * `.superpowers/sdd/planteil3/progress.md:45-55`). Belegt ist, was die Insel mit dem
 * Ergebnis macht.
 */

/**
 * ⚠️ DER SATZ STEHT HIER UND NICHT IN `_lib/gateTexte.ts` — zeichengleiche Begruendung wie
 * `MELDUNG_AUSNAHME` in `_ui/GateFormular.tsx:57-65`: jene Datei fuehrt die VIER Saetze aus
 * Spec §3.3.4 (`:2382-2385`), und dieser ist keiner davon. Er beschreibt eine Lage, die der
 * Server nie MELDET, weil er sie nicht erreicht: einen Verbindungsabbruch, den werfenden
 * Host-Riegel (`_actions/sitzung.ts:72-80`) oder ein fehlendes
 * `RADIO_AUSLEIH_SITZUNG_SECRET` (⬜ A-L7, eine Boot-Pruefung gibt es heute nicht).
 * ⛔ ER NENNT KEINE URSACHE: der Host-Wurf ist kein Betriebsfall, sondern ein manipulierter
 * Aufruf (Spec:2360-2362), und darf nicht unterscheidbar antworten.
 */
const MELDUNG_AUSNAHME =
  "Der Zugang konnte nicht erneuert werden. Bitte noch einmal tippen — bleibt es dabei, " +
  "wende dich an die Leitung.";

/**
 * Der Satz nach der gelungenen Erneuerung.
 *
 * ⛔ ER NENNT DEN KNOPF DES AUFRUFERS NICHT. Diese Insel steht in ZWEI Formularen — im
 * Ausleihvorgang heisst der Knopf „Geräte ausleihen", im Rueckgabedialog „Zurückgeben"
 * (A20). Ein Satz, der einen davon nennt, waere im anderen falsch.
 * ⛔ ER SAGT AUSDRUECKLICH, DASS DIE EINGABEN STEHEN — dieselbe Zusage, die der Satz zu
 * `grund: "sitzung"` traegt (`_lib/meldungen.ts`, „deine Eingaben bleiben stehen"). Sie ist
 * der ganze Grund fuer diese Insel; wer sie hier verschweigt, laesst die Person raten.
 */
const ERLEDIGT_SATZ = "Der Zugang ist erneuert. Bitte noch einmal bestätigen — deine Eingaben stehen noch.";

export function SitzungErneuern({ grund }: { grund: AusleihGrund | RueckgabeGrund }) {
  const [code, setCode] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [erledigt, setErledigt] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  /*
   * ⛔ DIE EINE BEDINGUNG, AN DER ZUSAGE §3.10 Nr. 8 HAENGT. Sie steht NACH den Hooks, weil
   * ein frueher Ausstieg davor die Hook-Reihenfolge zwischen zwei Rendervorgaengen aendern
   * wuerde.
   * ⛔ GLEICHHEIT AUF `"sitzung"`, KEINE UNGLEICHHEIT AUF `"gesperrt"`: die zwei
   * `grund`-Unions tragen heute dreizehn Werte (`_lib/meldungen.ts:174-182`, `:196-203`),
   * und bei zwoelf davon hat ein Codefeld nichts zu suchen. Eine Ungleichheitspruefung
   * zeigte es bei elf zusaetzlichen Gruenden.
   */
  if (grund !== "sitzung") return null;

  async function absenden(): Promise<void> {
    setLaeuft(true);
    try {
      const ergebnis = await erneuereSitzung(code);
      if (ergebnis.ok) {
        setFehler(null);
        setErledigt(true);
      } else {
        setFehler(ergebnis.text);
      }
    } catch {
      setFehler(MELDUNG_AUSNAHME);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className={s.erneuern} data-rolle="radio-sitzung-erneuern">
      {erledigt ? (
        /*
          ⛔ `role="status" aria-live="polite"` UND NICHT `alert` — Ruling der Fix-Runde 1 zu
          A18 (`.superpowers/sdd/planteil3/progress.md:603-634`), Punkt 2: eine
          BESTAETIGUNG, nicht ein Fehler-Meldungsort. Der Fehlerort unten traegt `alert`.
        */
        <p className={s.erneuernErledigt} role="status" aria-live="polite" data-rolle="radio-sitzung-erneuert">
          {ERLEDIGT_SATZ}
        </p>
      ) : (
        <>
          <label className={s.erneuernLabel} htmlFor="radio-erneuern-code">
            Zugangs-Code erneut eingeben
          </label>
          <div className={s.erneuernZeile}>
            {/*
              ⛔ KEIN `maxLength` UND KEIN `pattern` — zeichengleich zum Gate
              (`_ui/GateFormular.tsx:104-114`): `radio` hat 28 Zeichen Crockford-Base32 in
              sieben Vierergruppen (Spec:2082-2087), und `normalisiereCode` (`_lib/code.ts`)
              raeumt Trenner, Kleinschreibung und die vier Verwechslungszeichen selbst auf.
              Ein `pattern` im Browser wiese genau die Schreibweisen ab, die der Server
              bewusst annimmt.
              ⛔ `onPressEnter` FAENGT DIE EINGABETASTE AB: dieses Feld steht IN einem
              fremden Formular, und ohne den `preventDefault` loeste die Eingabetaste dessen
              Absenden aus — also genau den Vorgang, der eben am Riegel gescheitert ist.
            */}
            <Input
              id="radio-erneuern-code"
              className={s.feld}
              value={code}
              autoComplete="off"
              spellCheck={false}
              placeholder="Code vom Aufsteller"
              aria-label="Zugangs-Code"
              data-rolle="radio-erneuern-code"
              onChange={(e) => setCode(e.target.value)}
              onPressEnter={(e) => {
                e.preventDefault();
                void absenden();
              }}
            />
            <Button
              className={s.erneuernKnopf}
              htmlType="button"
              loading={laeuft}
              disabled={code.trim().length === 0 || laeuft}
              onClick={() => void absenden()}
              data-rolle="radio-erneuern-senden"
            >
              Zugang erneuern
            </Button>
          </div>
          {fehler !== null && (
            /*
              ⛔ `role="alert"` OHNE `aria-live` — Ruling `progress.md:163-177` und
              `:404-435`, Punkt 1: dieser Ort entsteht AUSSCHLIESSLICH nach einem Antippen
              OHNE Seitenwechsel. Eine hoefliche Region, die zusammen mit ihrem Inhalt in den
              Baum kommt, wird haeufig nicht angesagt; `alert` impliziert `assertive`, und
              ein `polite` daneben kehrte die Wahl still um.
            */
            <p className={s.feldFehler} role="alert" data-rolle="radio-erneuern-fehler">
              {fehler}
            </p>
          )}
        </>
      )}
    </div>
  );
}
