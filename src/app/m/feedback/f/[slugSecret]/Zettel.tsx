"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
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
 * kaputt, ohne dass Typecheck oder Build es merken. Mit JavaScript uebernimmt
 * `onSubmit` per `preventDefault` (siehe `absenden`), damit eine unerwartete
 * Ausnahme im Formular landet statt auf einer technischen Fehlerseite.
 *
 * DER AUFBAU (§3.2): Legende, acht Notenzeilen, ABSCHLUSS-BLOCK, Freitexte,
 * zweiter Absende-Knopf, Navigator. Der Abschluss steht VOR den Freitexten —
 * daran haengt die Zusage, dass Pflichtnoten niemals verloren gehen: wer nach
 * der achten Note weggeht, hat abgesendet, statt in einem Assistenten zu stehen,
 * dessen erste Seiten beim Schliessen des Tabs verfallen.
 */
export interface ZettelProps {
  questions: Question[];
  /** Stufenzahl der Skala: 6 (`schulnote`) oder 5 (importierte `stars`). */
  scale: number;
  action: (fd: FormData) => Promise<SubmitResult | void>;
  /** Schluessel des Entwurfsspeichers — siehe `entwurfSchluessel`. */
  tokenHash: string;
  /**
   * Der Wortlaut des Anonymitaetssiegels (§3.9). Er kommt aus `page.tsx` und
   * nicht von hier: das Siegel ist eine Zusage ueber SERVER-Verhalten (der
   * Zeitstempel wird auf den Abend gerundet, die Leseordnung ist gemischt) und
   * gehoert damit neben den Code, der sie wahr macht. Wandert eine der beiden
   * Zusagen, faellt der Text im selben Modul auf.
   */
  siegel: string;
}

/** Sektions-Kicker aus §3.2 Punkt 4 — die Fragereihenfolge bleibt unangetastet. */
const SEKTIONEN = ["01 DER ABEND", "02 ABLAUF & VORBEREITUNG", "03 DU UND DER ABEND"] as const;

/** Grenzen der drei Sektionen: q1–q3 · q4–q6 · q7–q8 (Rest in die letzte). */
const SEKTIONSGRENZEN = [3, 6] as const;

/**
 * Verzug der Aufbau-Choreografie in ms (§3.5): Kopf 0 (in `page.tsx`), Legende
 * 60, Sektion 1–3 120/180/240, Freitexte 300, Abschluss 360 — nach 0,7s steht
 * alles.
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

/* ---------- Abschluss-Block (§3.2 Punkt 5 und 7, §3.6) ---------- */

/** Wortlaute des Abschlusses, wortgenau aus dem Entwurf. */
const ABSCHLUSS_TITEL = "Das war der Pflichtteil.";
const UEBERSICHT_HINWEIS = "Tippe eine Zahl an, um sie zu ändern.";
const ABSENDEN = "Rückmeldung absenden";
const KURZZUSAGE = "Anonym — kein Name, kein Gerät, keine Uhrzeit.";
const NAVIGATOR_KNOPF = "→ nächste offene";

/**
 * Die Meldung fuer eine UNERWARTETE Ausnahme der Action (kaputtes
 * `questions`-JSON einer importierten Umfrage, Schreibfehler der Datenbank).
 * Sie steht im Formular, nicht auf einer technischen Fehlerseite — dort waeren
 * acht Noten und sechs Zeilen verloren, genau das Ergebnis, das der Umbau
 * beseitigt. Das Wort "Fehler" kommt nicht vor: es beschreibt hier niemanden,
 * der etwas falsch gemacht hat.
 */
const MELDUNG_AUSNAHME =
  "Das Absenden hat gerade nicht geklappt. Deine Eingaben stehen noch — bitte tippe " +
  "noch einmal auf „Rückmeldung absenden“.";

/**
 * Zahlwoerter fuer den Satz unter dem ersten Knopf. Der Entwurf schreibt "Die
 * sechs freien Zeilen …" — die Zahl kommt aber aus den TATSAECHLICHEN Fragen
 * (importierte Alt-Umfragen haben andere Zuschnitte), denn eine Zusage, die
 * nicht zum Bogen passt, ist schlimmer als keine. Dieselbe Abweichung wie bei
 * der Vertragszeile in `page.tsx`.
 */
const ZAHLWORT = ["null", "eine", "zwei", "drei", "vier", "fünf", "sechs"] as const;

function freiwilligSatz(zeilen: number): string {
  if (zeilen === 1) {
    return "Die freie Zeile darunter ist freiwillig — du kannst auch direkt absenden.";
  }
  const zahl = ZAHLWORT[zeilen] ?? String(zeilen);
  return `Die ${zahl} freien Zeilen darunter sind freiwillig — du kannst auch direkt absenden.`;
}

/** "Noch 3 Noten offen" — der Zustand als Text, nicht als Farbe (§3.6). */
function offenText(anzahl: number): string {
  return anzahl === 1 ? "Noch 1 Note offen" : `Noch ${anzahl} Noten offen`;
}

/**
 * Die gesetzten Noten, gelesen aus dem DOM statt aus dem Zustand.
 *
 * Das DOM ist hier die WAHRHEIT und nicht die Kopie: `new FormData(form)` liest
 * genau diese Radios, CSS faerbt die Chips ueber `input:checked + .chip`, und der
 * Zustand `noten` fuellt sich nur ueber `onChange`. Jede Auswahl OHNE
 * change-Ereignis — Formular-Wiederherstellung des Browsers, Antippen vor der
 * Hydration — steht also im DOM und fehlt im Zustand. Ein Absende-Riegel, der nur
 * den Zustand liest, sperrt dann eine vollstaendig ausgefuellte Abgabe.
 *
 * `null` heisst "kein Formular greifbar" (vor dem Mounten) — nicht "nichts
 * gesetzt". Die Unterscheidung ist wichtig: sonst waere ein fehlender Ref
 * gleichbedeutend mit acht offenen Noten.
 */
function notenAusDom(form: HTMLFormElement | null): Record<string, number> | null {
  if (!form) return null;
  const gesetzt: Record<string, number> = {};
  for (const feld of Array.from(
    form.querySelectorAll<HTMLInputElement>('input[type="radio"]:checked'),
  )) {
    gesetzt[feld.name] = Number(feld.value);
  }
  return gesetzt;
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
  const { questions, scale, action, tokenHash, siegel } = props;
  const [noten, setNoten] = useState<Record<string, number>>({});
  /**
   * Erst nach der Hydration wahr. Solange sie falsch ist, sieht der Zettel genau
   * so aus wie ausgeliefert: zwei `submit`-Knoepfe mit dem regulaeren Label und
   * ein Formular OHNE `noValidate` — das ist der Weg ohne JavaScript. Es gibt
   * KEINEN Austausch der Oberflaeche (§3.11), nur diese drei Attribute wechseln.
   */
  const [mitJs, setMitJs] = useState(false);
  const [ansage, setAnsage] = useState("");
  const [lesezeichen, setLesezeichen] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  /**
   * Zaehlt die Fehlversuche. Er ist kein Zierrat, sondern der Anlass, die Meldung
   * ERNEUT in den Blick zu holen: beim zweiten Fehlversuch ist der Text derselbe,
   * ein Effekt an `meldung` allein liefe also nur, wenn React das Zwischenrendern
   * mit `null` wirklich festschreibt — eine Zusage, die React nirgends macht. Der
   * Zaehler waechst monoton, damit haengt das Verhalten an nichts Zufaelligem.
   */
  const [fehlversuche, setFehlversuche] = useState(0);
  const [abschlussSichtbar, setAbschlussSichtbar] = useState(false);
  const formular = useRef<HTMLFormElement>(null);
  const abschluss = useRef<HTMLDivElement>(null);
  const meldungsZeile = useRef<HTMLParagraphElement>(null);

  const notenfragen = questions.filter((q) => isRatingType(q.type));
  const freitextfragen = questions.filter((q) => q.type === "text");
  const sektionen = [
    notenfragen.slice(0, SEKTIONSGRENZEN[0]),
    notenfragen.slice(SEKTIONSGRENZEN[0], SEKTIONSGRENZEN[1]),
    notenfragen.slice(SEKTIONSGRENZEN[1]),
  ];
  const offene = notenfragen.filter((q) => noten[q.id] === undefined);
  const gewaehlteAnzahl = notenfragen.length - offene.length;
  /* Ohne JavaScript ist der Knopf IMMER der regulaere Absende-Knopf. */
  const bereit = !mitJs || offene.length === 0;

  useEffect(() => {
    // Genau ein Nachrender nach der Hydration — dasselbe Muster wie die
    // Entwurfs-Wiederherstellung: waere der Wert schon beim ersten Rendern wahr,
    // waere das serverseitige HTML ein anderes und React verwuerfe den Baum.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMitJs(true);
    /*
     * Und im gleichen Atemzug: was beim Mounten SCHON im DOM steht, in den
     * Zustand saeen. Die Radios sind unkontrolliert (kein `checked`-Prop), der
     * Zustand fuellt sich also nur ueber `onChange` — eine Auswahl OHNE
     * change-Ereignis kennt er nicht. Zwei Wege setzen genau so: die
     * Formular-Wiederherstellung des Browsers beim Neuladen/Zuruecknavigieren
     * und das Antippen VOR der Hydration (der Weg, den §3.11 zusagt; belegt:
     * `checked` ueberlebt `hydrateRoot`). Ohne diese Zeilen saehe der Nutzer
     * acht farbige Chips und dazu "Noch 8 Noten offen" — und der Zustand heilte
     * nicht von selbst, denn ein zweiter Tipp auf die schon gesetzte Note feuert
     * kein change-Ereignis.
     */
    const gesetzt = notenAusDom(formular.current);
    if (gesetzt && Object.keys(gesetzt).length > 0) setNoten((alt) => ({ ...alt, ...gesetzt }));
  }, []);

  /*
   * Die Meldung liegt im Abschluss-Block, also OBERHALB der Freitexte. Wer mit
   * dem ZWEITEN Knopf absendet, steht 400-500px darunter: ohne diese Zeilen
   * passiert nach dem Tippen sichtbar nichts, und ein Knopf, der nichts tut,
   * wird noch einmal getippt. Beide Knoepfe sind absichtlich austauschbar — dann
   * muss auch die Rueckmeldung von beiden aus ankommen.
   */
  useEffect(() => {
    if (fehlversuche === 0) return;
    const ziel = meldungsZeile.current;
    if (!ziel) return;
    const ruhig = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    ziel.scrollIntoView?.({ behavior: ruhig ? "auto" : "smooth", block: "center" });
    // Der Fokus wandert mit: sonst tippt eine Person, die per Tastatur bedient,
    // weiter unten weiter und die Meldung bleibt eine Notiz an einem anderen Ort.
    ziel.focus?.();
  }, [fehlversuche]);

  /*
   * Der Navigator verschwindet, sobald der Abschluss-Block im Bild ist (§3.2
   * Punkt 8) — dort steht alles, was er anbietet, in Gross. Der Beobachter ist
   * optional: fehlt er (aeltere Umgebungen, Tests), bleibt die Leiste stehen.
   */
  useEffect(() => {
    const ziel = abschluss.current;
    if (!ziel || typeof IntersectionObserver !== "function") return;
    const beobachter = new IntersectionObserver((eintraege) => {
      setAbschlussSichtbar(eintraege.some((e) => e.isIntersecting));
    });
    beobachter.observe(ziel);
    return () => beobachter.disconnect();
  }, []);

  /**
   * Der Sprung zur Frage: scrollen, Lesezeichen setzen, Fokus auf das ERSTE Feld
   * der Zielzeile. Der Puls laeuft ueber ein Attribut plus erzwungenen Reflow und
   * nicht ueber einen Timer im Zustand — so pulst dieselbe Zeile auch beim
   * zweiten Sprung wieder, ohne Nachrender und ohne aufraeumbaren Zeitgeber.
   */
  function springen(frageId: string): void {
    const feld = formular.current?.querySelector<HTMLInputElement>(`input[name="${frageId}"]`);
    const zeile = feld?.closest("fieldset");
    if (zeile) {
      zeile.removeAttribute("data-puls");
      void zeile.offsetWidth;
      zeile.setAttribute("data-puls", "");
      const ruhig = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
      zeile.scrollIntoView?.({ behavior: ruhig ? "auto" : "smooth", block: "center" });
    }
    setLesezeichen(frageId);
    feld?.focus();
  }

  /**
   * Gleicht den Zustand an das DOM an und gibt die WIRKLICH offenen Fragen
   * zurueck. Jeder Weg, der den Absende-Riegel befragt, geht hier durch: der
   * Zustand allein wuerde eine Auswahl ohne change-Ereignis uebersehen, und er
   * heilt auch nicht von selbst (ein zweiter Tipp auf dieselbe Note feuert kein
   * change-Ereignis). Ist kein Formular greifbar, bleibt es beim Zustand.
   */
  function abgleichen(): Question[] {
    const gesetzt = notenAusDom(formular.current);
    if (!gesetzt) return offene;
    setNoten((alt) => ({ ...alt, ...gesetzt }));
    return notenfragen.filter((q) => gesetzt[q.id] === undefined);
  }

  /**
   * Der Sprung zur ersten Luecke: einmal hoeflich sagen, was noch fehlt, und
   * hinspringen. Kein Rot, kein Alert, nie das Wort "Fehler".
   */
  function lueckeZeigen(luecken: Question[]): void {
    const erste = luecken[0];
    if (!erste) return;
    setAnsage(`${offenText(luecken.length)} — Frage ${notenfragen.indexOf(erste) + 1}.`);
    springen(erste.id);
  }

  /**
   * Ein Tipp auf den unvollstaendigen Knopf ist NAVIGATION, keine Ruege.
   *
   * Zuerst wird abgeglichen: sagt das DOM, dass gar nichts fehlt, war der Zustand
   * veraltet und der Knopf trug faelschlich den Lueckentext. Dann wird GESENDET,
   * nicht gesprungen — ein Tipp, nicht zwei. `requestSubmit` laeuft in `absenden`
   * wieder hier vorbei, diesmal mit gleichem Stand, also ohne Schleife.
   *
   * Die Pruefung auf `requestSubmit` ist kein Zierrat: in aelteren Umgebungen
   * (vor Safari 16) fehlt die Methode. Der Abgleich oben ist dann schon
   * geschrieben, der Knopf traegt beim naechsten Rendern wieder das regulaere
   * Label und sendet beim zweiten Tipp — zwei Tipps statt einem, aber kein
   * Ausnahmefehler und kein toter Knopf.
   */
  function zurLuecke(): void {
    const luecken = abgleichen();
    if (luecken.length === 0) {
      const form = formular.current;
      if (typeof form?.requestSubmit === "function") form.requestSubmit();
      return;
    }
    lueckeZeigen(luecken);
  }

  /*
   * `<form action={…}>` bekommt die Server Action DIREKT — nur so rendert React
   * das `action`-Attribut, und nur damit funktioniert die Abgabe OHNE
   * JavaScript (§3.11). Mit JavaScript uebernimmt dieser Handler: er verhindert
   * die Voreinstellung, und React ruft die Action daraufhin NICHT auf (geprueft
   * in react-dom 19.2: der Action-Listener steigt bei `defaultPrevented` aus).
   * Wir rufen sie selbst — und das ist der Punkt: nur der AUFRUFER kann eine
   * unerwartete Ausnahme abfangen. Task 9 hat das `try/catch` aus gutem Grund
   * aus dem RUMPF der Action entfernt (es haette den Erfolgs-`redirect`
   * verschluckt); hier lehnt der Aufruf beim Redirect nicht ab, Next transportiert
   * ihn in der Antwort.
   */
  async function absenden(ereignis: FormEvent<HTMLFormElement>): Promise<void> {
    ereignis.preventDefault();
    // Die Nutzlast wird VOR allem anderen gelesen: nach einem `await` ist
    // `currentTarget` null.
    const daten = new FormData(ereignis.currentTarget);
    // Vor jedem Weg: fehlt eine Note, wird nicht gesendet, sondern gesprungen.
    // Das deckt auch die Enter-Taste ab — `noValidate` hat `required` still gelegt.
    // Gefragt wird das DOM, denn genau das steckt auch in `daten` — ein Riegel,
    // der etwas anderes liest als das, was abgeschickt wuerde, sperrt irgendwann
    // eine vollstaendige Abgabe.
    const luecken = abgleichen();
    if (luecken.length > 0) {
      lueckeZeigen(luecken);
      return;
    }
    setMeldung(null);
    try {
      const ergebnis = await action(daten);
      // Der Entwurf faellt NUR bei einer angenommenen Abgabe. Bei `{ ok: false }`
      // (geschlossen, Ratelimit — Anzeige in Task 14) bleibt er stehen, sonst
      // waeren die Freitexte beim Neuladen weg.
      if (!ergebnis || ergebnis.ok) entwurfVerwerfen(tokenHash);
    } catch {
      setMeldung(MELDUNG_AUSNAHME);
      setFehlversuche((n) => n + 1);
    }
  }

  return (
    <form
      ref={formular}
      action={action as unknown as (fd: FormData) => Promise<void>}
      className={s.form}
      noValidate={mitJs}
      onSubmit={absenden}
    >
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
                lesezeichen={lesezeichen === q.id && noten[q.id] === undefined}
                onWahl={(stufe) => setNoten((alt) => ({ ...alt, [q.id]: stufe }))}
              />
            ))}
          </section>
        ),
      )}
      {/*
        DER ANGELPUNKT: der Abschluss steht VOR den Freitexten. Wer nach der
        achten Note gehen will, ist fertig; wer schreiben will, scrollt weiter.
        Der Preis ist benannt (freiwilliger Text kann ungeschrieben bleiben), der
        Gewinn ist die Zusage: Pflichtnoten koennen niemals verloren gehen.
      */}
      <div
        ref={abschluss}
        className={`${s.abschluss} ${s.aufbau}`}
        style={verzug(360)}
        data-abschluss=""
      >
        <h2 className={s.abschlussTitel}>{ABSCHLUSS_TITEL}</h2>
        <Uebersicht fragen={notenfragen} noten={noten} onSprung={springen} />
        <p className={s.uebersichtHinweis}>{UEBERSICHT_HINWEIS}</p>
        <p className={s.siegel} data-siegel="">
          {siegel}
        </p>
        {meldung === null ? null : (
          /* `tabIndex={-1}`: nicht in der Tabreihenfolge, aber programmatisch
             fokussierbar — nur so kann der Effekt oben den Blick hierher holen,
             wenn mit dem zweiten Knopf weiter unten abgesendet wurde. */
          <p
            ref={meldungsZeile}
            className={s.meldung}
            data-meldung=""
            role="alert"
            tabIndex={-1}
          >
            {meldung}
          </p>
        )}
        <Absendeknopf bereit={bereit} offen={offene.length} onLuecke={zurLuecke} />
        {freitextfragen.length === 0 ? null : (
          <p className={s.knopfHinweis}>{freiwilligSatz(freitextfragen.length)}</p>
        )}
        {/* GENAU EINE Meldezeile fuer beide Knoepfe — zwei Live-Bereiche
            wuerden jede Ansage doppelt sprechen (§3.10). */}
        <p className={s.srOnly} aria-live="polite" data-ansage="">
          {ansage}
        </p>
      </div>
      {freitextfragen.length === 0 ? null : (
        <>
          <Freitexte fragen={freitextfragen} tokenHash={tokenHash} />
          <p className={s.kurzzusage}>{KURZZUSAGE}</p>
          <Absendeknopf bereit={bereit} offen={offene.length} onLuecke={zurLuecke} />
        </>
      )}
      {gewaehlteAnzahl === 0 || abschlussSichtbar ? null : (
        <Navigator
          fragen={notenfragen}
          noten={noten}
          scale={scale}
          offen={offene[0]?.id}
          onSprung={springen}
        />
      )}
    </form>
  );
}

/**
 * Beide Absende-Knoepfe sind derselbe Knopf, zweimal: identisch beschriftet,
 * `type="submit"` desselben Formulars — damit nie unklar ist, welcher sendet.
 * Fehlt eine Note, wird derselbe Knopf zum Navigations-Knopf (`type="button"`)
 * und traegt den Zustand als TEXT. Ein Umriss statt der Fuellung, kein Rot.
 */
function Absendeknopf({
  bereit,
  offen,
  onLuecke,
}: {
  bereit: boolean;
  offen: number;
  onLuecke: () => void;
}) {
  if (bereit) {
    return (
      <button type="submit" className={s.knopf} data-absenden="">
        {ABSENDEN}
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`${s.knopf} ${s.knopfUmriss}`}
      data-absenden=""
      data-offen=""
      onClick={onLuecke}
    >
      {offenText(offen)}
    </button>
  );
}

/**
 * Die Notenuebersicht im Abschluss-Block: acht Kacheln 34x34 in Fragereihenfolge.
 * Beantwortet traegt die Kachel die ZIFFER in der Notenfarbe auf einer Toenung
 * derselben Farbe; offen eine gestrichelte Kontur mit der Fragenummer. Anders als
 * eine 15px-Farbmarke ist die Ziffer hier lesbar — die Marke waere reine
 * Farbkodierung (§3.10), deshalb traegt der Navigator gar keine Farbe.
 */
function Uebersicht({
  fragen,
  noten,
  onSprung,
}: {
  fragen: Question[];
  noten: Record<string, number>;
  onSprung: (frageId: string) => void;
}) {
  return (
    <div className={s.uebersicht}>
      {fragen.map((frage, i) => {
        const stufe = noten[frage.id];
        const nummer = i + 1;
        return (
          <button
            key={frage.id}
            type="button"
            className={s.kachel}
            data-kachel={frage.id}
            data-offen={stufe === undefined ? "" : undefined}
            style={stufe === undefined ? undefined : notenVariablen(stufe, ratingScale(frage.type))}
            aria-label={
              stufe === undefined
                ? `Frage ${nummer}: noch keine Note — zur Frage`
                : `Frage ${nummer}: Note ${stufe} – ${wort(stufe)} — ändern`
            }
            onClick={() => onSprung(frage.id)}
          >
            {stufe === undefined ? nummer : stufe}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Der Navigator (§3.2 Punkt 8): Fortschritt, Ankersatz, Sprung zur naechsten
 * Luecke. KEINE Ampelfarbe (die Striche kennen nur Tinte und Linie) und KEIN
 * Absende-Knopf — gesendet wird an den zwei Stellen im Textfluss, sonst gaebe es
 * drei Knoepfe mit derselben Aufgabe.
 */
function Navigator({
  fragen,
  noten,
  scale,
  offen,
  onSprung,
}: {
  fragen: Question[];
  noten: Record<string, number>;
  scale: number;
  offen: string | undefined;
  onSprung: (frageId: string) => void;
}) {
  return (
    <div className={s.navigator} data-navigator="">
      <div className={s.striche} aria-hidden="true">
        {fragen.map((frage) => (
          <span
            key={frage.id}
            className={s.strich}
            data-strich=""
            data-voll={noten[frage.id] === undefined ? undefined : ""}
          />
        ))}
      </div>
      {/* Traeger 3 der Richtung, sobald die Legende aus dem Bild gescrollt ist. */}
      <p className={s.navLegende}>
        1 = {wort(1)} · {scale} = {wort(scale)}
      </p>
      {offen === undefined ? null : (
        <button type="button" className={s.navKnopf} onClick={() => onSprung(offen)}>
          {NAVIGATOR_KNOPF}
        </button>
      )}
    </div>
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
  lesezeichen,
  onWahl,
}: {
  frage: Question;
  nummer: number;
  gewaehlt: number | undefined;
  /** Ziel des letzten Sprungs: 2px-Balken an der linken Kante, keine Ruege. */
  lesezeichen: boolean;
  onWahl: (stufe: number) => void;
}) {
  // `switch` auf den Fragetyp statt Improvisieren: `stars` (importierte
  // Alt-Umfragen) hat fuenf Stufen, `schulnote` sechs.
  const stufenzahl = ratingScale(frage.type);
  const stufen = Array.from({ length: stufenzahl }, (_, i) => i + 1);
  return (
    <fieldset className={s.zeile} data-lesezeichen={lesezeichen ? "" : undefined}>
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
