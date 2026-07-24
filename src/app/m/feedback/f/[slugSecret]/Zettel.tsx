"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import { NOTEN_DUNKEL, NOTEN_HELL, NOTEN_WORT } from "../../_lib/noten";
import { MAX_TEXT_LENGTH, isRatingType, ratingScale, type Question } from "../../_lib/questions";
import type { SubmitResult } from "../../actions";
import s from "./zettel.module.css";

/**
 * Der Zettel — die Zeugnis-Matrix (Entwurf §3.2 Punkt 3–4, §3.6, §3.10).
 *
 * WAS HIER ERSETZT WIRD: acht Reihen mit sechs grauen Sternen. Sechs Sterne
 * lesen sich universell als Bestnote; gemeint war die deutsche Schulnote, also
 * "ungenuegend". Wer nicht liest, bewertet das Gegenteil — und hinterher ist
 * nicht mehr unterscheidbar, welche Antworten invertiert gemeint waren. Die
 * Datenschicht war immer richtig (`type: "schulnote"`), nur die Darstellung
 * hat gelogen.
 *
 * DIE RICHTUNG TRAEGT VIER UNABHAENGIGE KANAELE, keiner davon Farbe allein:
 *   1. der Legendenstreifen, GENAU EINMAL, im selben 6-Spalten-Raster wie die
 *      Chips darunter,
 *   2. der achromatische Tonwertkeil, der nach rechts dunkelt (CSS),
 *   3. die Ankerwoerter unter der ersten Zeile ("1 sehr gut" / "6 ungenuegend"),
 *   4. die Ziffer selbst — die Schulnote ist Allgemeinwissen.
 * Farbe entsteht ERST durch Auswahl, hoechstens einmal pro Zeile: maximal acht
 * farbige Chips statt 48 Flaechen (sonst waere die Seite ein Flickenteppich).
 *
 * DIE NOTENFARBEN KOMMEN AUS `_lib/noten.ts` und werden dem Chip als
 * Inline-Variablen gereicht. Warum nicht direkt ins CSS: dann gaebe es zwei
 * Paletten (hier und im Admin-Bereich), die beim naechsten Nachjustieren
 * auseinanderlaufen — und die Kontrast-/Monotonie-Zusicherung haengt an genau
 * einer Definition.
 *
 * `<form action={action}>` bekommt die Server Action DIREKT, nicht ueber einen
 * Client-Wrapper: ein Wrapper waere keine serialisierbare Action mehr und die
 * Abgabe OHNE JavaScript — die Kernzusage des Entwurfs (§3.11) — waere still
 * kaputt, ohne dass Typecheck oder Build es merken. Der Preis in dieser Stufe:
 * ein `{ ok: false }` der Action bleibt unsichtbar. Die Inline-Meldung dafuer
 * (und die zwei Absende-Knoepfe, Notenuebersicht, Navigator) baut Task 13.
 */
export interface ZettelProps {
  questions: Question[];
  /** Stufenzahl der Skala: 6 (`schulnote`) oder 5 (importierte `stars`). */
  scale: number;
  action: (fd: FormData) => Promise<SubmitResult | void>;
  /** Schluessel des Entwurfsspeichers — siehe `entwurfSchluessel`. */
  tokenHash: string;
}

/** Sektions-Kicker aus §3.2 Punkt 4 — die Fragereihenfolge bleibt unangetastet. */
const SEKTIONEN = ["01 DER ABEND", "02 ABLAUF & VORBEREITUNG", "03 DU UND DER ABEND"] as const;

/** Grenzen der drei Sektionen: q1–q3 · q4–q6 · q7–q8 (Rest in die letzte). */
const SEKTIONSGRENZEN = [3, 6] as const;

/**
 * Verzug der Aufbau-Choreografie in ms (§3.5): Kopf 0 (in `page.tsx`), Legende
 * 60, Sektion 1–3 120/180/240, Freitexte 300 — der Abschluss-Block mit 360 folgt
 * in Task 13.
 */
function verzug(ms: number): CSSProperties {
  return { animationDelay: `${ms}ms` };
}

/**
 * Die Farben einer Stufe als Inline-Variablen. `--note-hell`/`--note-dunkel`
 * liegen BEIDE am Element, weil der Dunkelmodus an `[data-theme]` haengt und
 * nicht an `prefers-color-scheme` — CSS waehlt dann aus, ohne dass der Server
 * den Modus kennen muss.
 */
function notenVariablen(stufe: number, scale: number): CSSProperties {
  const i = rampenIndex(stufe, scale);
  return {
    "--note-hell": mischung(NOTEN_HELL, i),
    "--note-dunkel": mischung(NOTEN_DUNKEL, i),
  } as CSSProperties;
}

/**
 * Bei fuenf Stufen wird die Sechser-Rampe abgetastet: 1, 2, 3½, 5, 6 (§3.6).
 * Halbe Indizes werden gemischt, damit die Luminanz auch hier streng monoton
 * faellt — DAS ist der Kanal, der Graustufen und Rot-Gruen-Blindheit uebersteht.
 */
function rampenIndex(stufe: number, scale: number): number {
  if (scale !== 5) return stufe - 1;
  return [0, 1, 2.5, 4, 5][stufe - 1];
}

function mischung(palette: readonly string[], index: number): string {
  const unten = Math.floor(index);
  if (unten === index) return palette[unten];
  return `color-mix(in srgb, ${palette[unten]} 50%, ${palette[unten + 1]})`;
}

/** Notenwort einer Stufe. Bei fuenf Stufen endet die Skala bei "mangelhaft". */
function wort(stufe: number): string {
  return NOTEN_WORT[stufe - 1];
}

/* ---------- Freitexte (§3.2 Punkt 6, §3.7) ---------- */

/** Wortlaute der Freitextsektion, wortgenau aus dem Entwurf. */
const FREITEXT_KICKER = "04 IN EIGENEN WORTEN";
const FREITEXT_EINLEITUNG =
  "Alles hier ist freiwillig. Ein Halbsatz hilft uns mehr als ein voller Absatz.";
const FREITEXT_HINWEIS = "Schreib nichts, woran man dich erkennt.";

/**
 * Ab dieser Laenge zeigt eine Zeile ihre Restzahl. Vorher ist der Zaehler NICHT
 * vorhanden: eine dauerhafte Zahl unter sechs freiwilligen Zeilen liest sich als
 * Soll, und die Zusage der Sektion ist "ein Halbsatz genuegt".
 */
const ZAEHLER_AB = 420;

/** Verfall des Entwurfs (§3.7): eine halbe Stunde nach dem letzten Tippen. */
export const ENTWURF_VERFALL_MS = 30 * 60 * 1000;

/**
 * Der Speicherplatz des Entwurfs, abgeleitet aus dem Token-Hash: zwei Abende am
 * selben Geraet duerfen sich nicht in dieselbe Zeile schreiben.
 */
export function entwurfSchluessel(tokenHash: string): string {
  return `iuk-feedback-entwurf:${tokenHash}`;
}

/** Form des Eintrags im `sessionStorage`. `at` ist der letzte Tastendruck. */
interface Entwurf {
  at: number;
  texte: Record<string, string>;
}

/**
 * `sessionStorage`, NICHT `localStorage`: der Entwurf ist ein anonymer Freitext
 * und darf den Browserneustart nicht ueberleben. Jeder Zugriff liegt in
 * `try/catch` — im privaten Modus einiger Browser wirft schon das Lesen, und ein
 * gescheiterter Entwurfsspeicher darf niemals das Absenden verhindern.
 */
function entwurfLesen(tokenHash: string): Record<string, string> | null {
  try {
    const roh = sessionStorage.getItem(entwurfSchluessel(tokenHash));
    if (roh === null) return null;
    const entwurf = JSON.parse(roh) as Partial<Entwurf> | null;
    const frisch =
      typeof entwurf?.at === "number" && Date.now() - entwurf.at <= ENTWURF_VERFALL_MS;
    if (!frisch || typeof entwurf?.texte !== "object" || entwurf.texte === null) {
      entwurfVerwerfen(tokenHash);
      return null;
    }
    // Nur Zeichenketten zurueck: ein manipulierter Eintrag soll kein Objekt in
    // den Wert eines Feldes legen koennen.
    const texte: Record<string, string> = {};
    for (const [id, wert] of Object.entries(entwurf.texte)) {
      if (typeof wert === "string") texte[id] = wert;
    }
    return texte;
  } catch {
    return null;
  }
}

function entwurfSchreiben(tokenHash: string, texte: Record<string, string>): void {
  const entwurf: Entwurf = { at: Date.now(), texte };
  try {
    sessionStorage.setItem(entwurfSchluessel(tokenHash), JSON.stringify(entwurf));
  } catch {
    // Kein Platz, kein Speicher, privater Modus: der Entwurf ist Komfort.
  }
}

/** Loescht den Entwurf. Zweiter Aufrufer wird "Leeren Bogen oeffnen" (Task 14). */
export function entwurfVerwerfen(tokenHash: string): void {
  try {
    sessionStorage.removeItem(entwurfSchluessel(tokenHash));
  } catch {
    // s. o.
  }
}

/**
 * Autoresize aus `scrollHeight` (§3.7). Eine leere Zeile bekommt KEINE
 * Inline-Hoehe: dort gilt `min-height: 40px` aus dem CSS, und die Zeile darf
 * beim Fokus die 8px Innenhoehe gewinnen, ohne gegen einen festen Pixelwert zu
 * laufen. Genau deshalb messen auch `onFocus`/`onBlur` neu — dort aendert sich
 * das Innenmass.
 */
function hoeheAnpassen(el: HTMLTextAreaElement): void {
  if (el.value === "") {
    el.style.height = "";
    return;
  }
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function Zettel(props: ZettelProps) {
  const { questions, scale, action, tokenHash } = props;
  const [noten, setNoten] = useState<Record<string, number>>({});

  const notenfragen = questions.filter((q) => isRatingType(q.type));
  const freitextfragen = questions.filter((q) => q.type === "text");
  const sektionen = [
    notenfragen.slice(0, SEKTIONSGRENZEN[0]),
    notenfragen.slice(SEKTIONSGRENZEN[0], SEKTIONSGRENZEN[1]),
    notenfragen.slice(SEKTIONSGRENZEN[1]),
  ];

  /*
   * Die Action gibt ein Ergebnis zurueck (`SubmitResult`), `<form action>`
   * typisiert nur `void`. Zur Laufzeit verwirft React den Rueckgabewert
   * geraeuschlos — die Umgehung ist deshalb eine Typ-Umschreibung und KEIN
   * Wrapper: eine Pfeilfunktion um die Action herum verliert deren
   * Serialisierungs-Kennung, und damit waere die Abgabe ohne JavaScript still
   * kaputt. Task 13 holt das Ergebnis ueber den Weg ab, der es auch anzeigt.
   */
  const formAction = action as unknown as (fd: FormData) => Promise<void>;

  /*
   * Der Entwurf faellt beim ABSENDEN, nicht erst beim Ergebnis: der
   * Rueckgabewert der Action ist hier noch nicht erreichbar (Task 13 holt ihn
   * ueber den Client-Aufrufer, und ein Wrapper um `action` waere keine
   * serialisierbare Action mehr). Der Preis ist klein und benannt: bei einem
   * `{ ok: false }` bleiben die Eingaben im DOM stehen und der naechste
   * Tastendruck schreibt den Entwurf neu. `onSubmit` aendert am gelieferten HTML
   * nichts — der Weg ohne JavaScript bleibt unberuehrt.
   */
  return (
    <form action={formAction} className={s.form} onSubmit={() => entwurfVerwerfen(tokenHash)}>
      <Legende scale={scale} />
      {sektionen.map((fragen, si) =>
        fragen.length === 0 ? null : (
          <section
            key={SEKTIONEN[si]}
            className={`${s.sektion} ${s.aufbau}`}
            style={verzug(120 + si * 60)}
          >
            <p className={s.sektionKicker}>{SEKTIONEN[si]}</p>
            {fragen.map((q) => (
              <Notenzeile
                key={q.id}
                frage={q}
                nummer={notenfragen.indexOf(q) + 1}
                gewaehlt={noten[q.id]}
                onWahl={(stufe) => setNoten((alt) => ({ ...alt, [q.id]: stufe }))}
              />
            ))}
          </section>
        ),
      )}
      {freitextfragen.length === 0 ? null : (
        <Freitexte fragen={freitextfragen} tokenHash={tokenHash} />
      )}
      <button type="submit" className={s.knopf}>
        Rückmeldung absenden
      </button>
    </form>
  );
}

/**
 * Die Freitextsektion: sechs LINIERTE ZEILEN statt sechs gleich aussehender
 * leerer Kaesten (§3.7). Der Gewinn ist Flaeche (~300px statt ~540px), und er
 * wird NICHT damit bezahlt, dass eine Frage verschwindet: jede Zeile traegt ihre
 * vollstaendige Originalfrage als Label, keine liegt hinter einem Aufklapper,
 * keine bekommt ein erfundenes Kurzlabel — ein Kurzlabel wie "Mehr davon"
 * ersetzt die Frage nicht, es streicht sie.
 *
 * Die Freiwilligkeit steht GENAU EINMAL, im Einleitungssatz. Sechs Mal
 * "(optional)" an sechs Labels erzeugt genau den Druck, den das Wort abbauen
 * soll.
 */
function Freitexte({ fragen, tokenHash }: { fragen: Question[]; tokenHash: string }) {
  const [texte, setTexte] = useState<Record<string, string>>({});
  const sektion = useRef<HTMLElement>(null);

  /*
   * Wiederherstellung im EFFEKT, nicht beim ersten Rendern — der Server kennt
   * den `sessionStorage` nicht: ein Lesen waehrend des Renderns liefert auf dem
   * Server leere und im Browser gefuellte Felder, ein Hydration-Konflikt, den
   * React mit einem verworfenen Baum bezahlt. `Zettel.test.tsx` haelt fest, dass
   * beim ersten Rendern kein Speicherzugriff stattfindet.
   */
  useEffect(() => {
    const entwurf = entwurfLesen(tokenHash);
    // Genau EIN Nachrender, absichtlich. `set-state-in-effect` warnt vor
    // Kaskaden — hier gibt es keine: der Effekt laeuft einmal je `tokenHash`,
    // und das Nachrendern IST das Muster, das den Hydration-Konflikt vermeidet.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (entwurf) setTexte(entwurf);
  }, [tokenHash]);

  /* Eine Messung nach jeder Aenderung deckt beides ab: Tippen und Wiederherstellung. */
  useEffect(() => {
    const felder = sektion.current?.querySelectorAll("textarea") ?? [];
    for (const el of felder) hoeheAnpassen(el);
  }, [texte]);

  function eingabe(id: string, wert: string): void {
    const neu = { ...texte, [id]: wert };
    setTexte(neu);
    entwurfSchreiben(tokenHash, neu);
  }

  return (
    <section
      ref={sektion}
      className={`${s.sektion} ${s.aufbau}`}
      style={verzug(300)}
      data-freitexte=""
    >
      <p className={s.sektionKicker}>{FREITEXT_KICKER}</p>
      <p className={s.einleitung}>{FREITEXT_EINLEITUNG}</p>
      <p className={s.hinweis}>{FREITEXT_HINWEIS}</p>
      <div className={s.textzeilen}>
        {fragen.map((frage) => (
          <Freitextzeile
            key={frage.id}
            frage={frage}
            wert={texte[frage.id] ?? ""}
            onEingabe={eingabe}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Eine Zeile: Label mit der ganzen Frage, darunter ein Feld ohne Rahmen, ohne
 * Fuellung, ohne Radius — nur eine Grundlinie.
 *
 * `textarea` und nicht `input`: Enter macht einen Absatz und nicht die Abgabe.
 * KEIN Erledigt-Haekchen an gefuellten Zeilen (bei freiwilligen Feldern waere es
 * eine stille Beschaemung der leeren) — sichtbar wird der Inhalt allein durch die
 * kraeftigere Grundlinie (`data-gefuellt`).
 */
function Freitextzeile({
  frage,
  wert,
  onEingabe,
}: {
  frage: Question;
  wert: string;
  onEingabe: (id: string, wert: string) => void;
}) {
  /*
   * Der Zaehler erscheint erst kurz vor der Grenze und bleibt in `--gedaempft`:
   * kein Rot, kein Amber, kein Icon. Eine Warnfarbe ausserhalb der Notenskala
   * wuerde die Bedeutung der Skala verwaessern — und ein voller Freitext ist
   * kein Fehler, `maxLength` laesst ihn gar nicht erst entstehen.
   */
  const rest = MAX_TEXT_LENGTH - wert.length;
  const zaehler =
    wert.length < ZAEHLER_AB ? null : rest <= 0 ? "Zeile ist voll" : `noch ${rest} Zeichen`;

  return (
    <div className={s.textzeile} data-textzeile={frage.id}>
      <label className={s.textLabel} htmlFor={`${frage.id}-feld`}>
        {frage.text}
      </label>
      <textarea
        id={`${frage.id}-feld`}
        name={frage.id}
        className={s.textfeld}
        rows={1}
        maxLength={MAX_TEXT_LENGTH}
        value={wert}
        data-gefuellt={wert === "" ? undefined : ""}
        autoComplete="off"
        autoCapitalize="sentences"
        spellCheck={true}
        enterKeyHint="enter"
        onChange={(e) => onEingabe(frage.id, e.currentTarget.value)}
        onFocus={(e) => hoeheAnpassen(e.currentTarget)}
        onBlur={(e) => hoeheAnpassen(e.currentTarget)}
      />
      {zaehler === null ? null : (
        <span className={s.zaehler} data-zaehler="">
          {zaehler}
        </span>
      )}
    </div>
  );
}

/**
 * Der Legendenstreifen. GENAU EINMAL auf der Seite und im identischen
 * 6-Spalten-Raster wie die Chips darunter — achtmal wiederholt waere er ein
 * Balkendiagramm ohne Daten.
 */
function Legende({ scale }: { scale: number }) {
  const stufen = Array.from({ length: scale }, (_, i) => i + 1);
  return (
    <div className={`${s.legende} ${s.aufbau}`} style={verzug(60)} data-legende="">
      <div className={s.streifen} data-stufen={scale} aria-hidden="true">
        {stufen.map((stufe) => (
          <span
            key={stufe}
            className={s.segment}
            data-segment=""
            style={notenVariablen(stufe, scale)}
          />
        ))}
      </div>
      <div className={s.woerter} data-stufen={scale}>
        {stufen.map((stufe) => (
          <span key={stufe} className={s.wort}>
            {wort(stufe)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Eine Zeile der Matrix. `fieldset` + versteckte `legend` machen daraus eine
 * ECHTE Radiogruppe: ein Tabstop pro Frage (acht statt 48), Pfeiltasten waehlen
 * nativ, und der Screenreader liest "… Note 2 – gut, 2 von 6".
 *
 * Die Frage steht ZWEIMAL im Markup und wird trotzdem genau einmal angekuendigt:
 * die `legend` ist nur visuell versteckt (per `clip-path`, NICHT `display:none`
 * — das wuerde sie aus dem Barrierefreiheitsbaum loeschen und die Gruppe
 * namenlos machen), der sichtbare Fragetext traegt `aria-hidden`.
 */
function Notenzeile({
  frage,
  nummer,
  gewaehlt,
  onWahl,
}: {
  frage: Question;
  nummer: number;
  gewaehlt: number | undefined;
  onWahl: (stufe: number) => void;
}) {
  // `switch` auf den Fragetyp statt Improvisieren: `stars` (importierte
  // Alt-Umfragen) hat fuenf Stufen, `schulnote` sechs.
  const stufenzahl = ratingScale(frage.type);
  const stufen = Array.from({ length: stufenzahl }, (_, i) => i + 1);
  return (
    <fieldset className={s.zeile}>
      <legend className={s.srOnly}>{frage.text}</legend>
      <div className={s.reihe}>
        <div className={s.links} aria-hidden="true">
          <span className={s.nr}>{String(nummer).padStart(2, "0")}</span>
          <p className={s.frage}>{frage.text}</p>
        </div>
        <div className={s.rechts}>
          <div className={s.chips} data-stufen={stufenzahl}>
            {stufen.map((stufe) => (
              <Fragment key={stufe}>
                {/*
                  `required` an JEDER Option ist das Netz ohne JavaScript: der
                  Browser springt feldweise zur ersten Luecke, ohne Serverweg
                  und ohne Datenverlust. Mit JavaScript uebernimmt in Task 13
                  der gestaltete Lueckenspringer.
                */}
                <input
                  type="radio"
                  id={`${frage.id}-${stufe}`}
                  name={frage.id}
                  value={stufe}
                  required
                  className={s.srOnly}
                  onChange={() => onWahl(stufe)}
                />
                <label
                  htmlFor={`${frage.id}-${stufe}`}
                  aria-label={`Note ${stufe} – ${wort(stufe)}`}
                  className={s.chip}
                  style={notenVariablen(stufe, stufenzahl)}
                >
                  {stufe}
                </label>
              </Fragment>
            ))}
          </div>
          {nummer === 1 ? (
            <div className={s.anker} data-anker="" aria-hidden="true">
              <span>1 {wort(1)}</span>
              <span>
                {stufenzahl} {wort(stufenzahl)}
              </span>
            </div>
          ) : null}
          {gewaehlt === undefined ? null : (
            <span className={s.fussnote} data-fussnote="">
              {gewaehlt} · {wort(gewaehlt)}
            </span>
          )}
        </div>
      </div>
    </fieldset>
  );
}
