import type { CSSProperties } from "react";
import { SPACE } from "@/core/theme/tokens";
import { NOTEN_WORT, ampelStufe, formatiereNote } from "../_lib/noten";
import { T, ZIFFERN } from "./typo";

/**
 * DIE NOTENBAUTEILE DES MODULS (Entwurf §4.11, §4.12, §4.14).
 *
 * Sie liegen hier zusammen, damit sie nicht siebenmal frei erfunden werden:
 * Pille (jeder Mittelwert), Spur (nur wo eine echte Verteilung existiert),
 * Legende (einmal pro Karte), Funke (der Trend auf 132×28) und Plakette (die
 * Gesamtnote der Auswertung — §3.2, nicht §4.11).
 *
 * DREI ZUSAGEN, DIE HIER EINGEBAUT SIND — nicht dokumentiert, sondern erzwungen:
 *
 * 1. EINE NOTE HAENGT NIE ALLEIN AN FARBE. Jede Anzeige traegt Ziffer UND Wort
 *    (und die Spur zusaetzlich Position und Hoehe). Farbe ist die letzte,
 *    verzichtbare Schicht — sie faellt in Graustufen, im Ausdruck und bei
 *    Deuteranopie weg, die Aussage nicht.
 * 2. EINE TOENUNG TRAEGT KEINEN TEXT. Die Notenfarbe auf ihrer eigenen Toenung
 *    erreicht nur ~2:1; deshalb sind alle textfuehrenden Flaechen hier
 *    vollgesaettigt (`--note-N` mit `--note-ink`), und `--note-tint-*` kommt in
 *    dieser Datei nicht vor. Die Toenungen gehoeren den textfreien
 *    Diagrammbaendern.
 * 3. ES GIBT EINE SCHWELLENDEFINITION. Gerundet wird ausschliesslich in
 *    `ampelStufe` (`_lib/noten.ts`); hier steht kein zweites `Math.round`.
 *    Angezeigt wird immer der EXAKTE Wert mit einer Dezimale („2,4"), gefaerbt
 *    die gerundete Stufe — so ist der Farbsprung von 2,4 auf 2,5 erklaerbar.
 *
 * DIE SKALA IST INVERTIERT: 1 = sehr gut, 6 = ungenuegend. Jedes `aria-label`
 * sagt das ausdruecklich, weil „2,4 von 6" ohne diesen Satz wie eine schlechte
 * Bewertung klingt.
 *
 * ALLE BAUTEILE SIND SERVER-SICHER: reine `div`/`span`, keine Funktions-Props,
 * kein antd. Bewusst NICHT antds `Tag` — dessen `color` kennt die Palette nicht
 * (jede Verwendung waere ein vollstaendiges Style-Override), und ein Tag liest
 * sich als Etikett, nicht als Messwert. Die Variablen kommen aus
 * `feedback.css`; `--ant-*` funktioniert in eigenem Markup nicht (§4.10).
 */

const NOTEN = [1, 2, 3, 4, 5, 6] as const;

/** Kein Wert → „—" und KEINE Pille (§4.11). Eine leere Flaeche waere eine Aussage. */
function KeineNote() {
  return <span style={T.body}>—</span>;
}

/** Typwaechter, damit unten kein `as number` noetig wird. */
const vorhanden = (note: number | null | undefined): note is number =>
  note !== null && note !== undefined && !Number.isNaN(note);

/**
 * Der eine Satz, den jede vollgesaettigte Notenflaeche spricht. Er steht genau
 * hier, damit Pille und Plakette nicht zwei Formulierungen derselben Auskunft
 * entwickeln.
 */
const notenBeschriftung = (wert: string, wort: string) =>
  `Durchschnitt ${wert} von 6 — ${wort}. 1 ist die beste Note, 6 die schlechteste.`;

// ---------------------------------------------------------------------------
// Bauteil 1 — Notenpille
// ---------------------------------------------------------------------------

export type NotenpilleProps = {
  /** Der exakte Mittelwert. `null` (auch `NaN`) ergibt „—". */
  note: number | null;
  /**
   * Die Skala der Umfrage. `5` = Altbestand (`stars`) und wird NEUTRAL
   * dargestellt (§4.12).
   */
  scale?: number;
};

/**
 * Der Mittelwert als Messwert: Ziffer in der Pille, Wort daneben, Farbe als
 * dritter Kanal.
 */
export function Notenpille({ note, scale = 6 }: NotenpilleProps) {
  if (!vorhanden(note)) return <KeineNote />;
  const wert = formatiereNote(note);
  if (scale === 5) return <AltbestandPille wert={wert} />;

  const stufe = ampelStufe(note);
  const wort = NOTEN_WORT[stufe - 1];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: SPACE.sm }}>
      <span
        role="img"
        aria-label={notenBeschriftung(wert, wort)}
        style={{
          ...T.body,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 40,
          height: 24,
          padding: `0 ${SPACE.sm}px`,
          borderRadius: 6,
          background: `var(--note-${stufe})`,
          color: "var(--note-ink)",
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        {wert}
      </span>
      {/* Das Wort steht AUSSERHALB der Pille: 12px auf der Kartenflaeche
          erreichen dort 5,5:1, in der Pille muesste es sich die Hoehe mit der
          Ziffer teilen. */}
      <span style={T.meta}>{wort}</span>
    </span>
  );
}

/**
 * `stars` (Skala 1–5, importierte Alt-Umfragen) bleibt neutral: eine 5er-Note
 * auf die 6er-Rampe abzutasten wuerde in derselben Tabellenspalte zwei
 * verschiedene Bedeutungen in dieselbe Farbe legen. Altumfragen sind lesbar,
 * nicht vergleichbar — und genau das sagt der Zusatz.
 *
 * Kein `aria-label`: der sichtbare Text traegt hier schon alles, was er sagen
 * kann. Ein erfundener Satz waere nur eine zweite Wahrheit.
 */
function AltbestandPille({ wert }: { wert: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: SPACE.sm }}>
      <span
        style={{
          ...T.body,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          height: 24,
          padding: `0 ${SPACE.sm}px`,
          borderRadius: 6,
          background: "var(--fb-fill)",
          color: "var(--fb-ink)",
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        Ø {wert} von 5
      </span>
      <span style={T.meta}>Altbestand-Skala</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Bauteil 2 — Notenspur
// ---------------------------------------------------------------------------

const SPUR_MASSE = {
  /** Live-Karte und Zwischenstand. */
  kompakt: { zellhoehe: 24, abstand: 2 },
  /** Auswertung: acht Spuren uebereinander zeigen die Streuung. */
  gross: { zellhoehe: 44, abstand: 4 },
} as const;

export type SpurGroesse = keyof typeof SPUR_MASSE;

export type NotenspurProps = {
  /**
   * Anzahl je Note, Index 0 = Note 1. NUR fuer echte Verteilungen — ein
   * Mittelwert hat hier nichts zu suchen, dafuer gibt es die Pille. Genau das
   * ist der Zweck dieser Signatur: acht Verteilungen uebereinander zeigen, ob
   * der Abend gleichmaessig gut war oder eine Frage die Gruppe gespalten hat —
   * was ein Balken mit dem Mittelwert 3,0 aus 6×1 und 6×5 verschweigt.
   */
  verteilung: readonly number[];
  groesse?: SpurGroesse;
};

/** Sechs Zellen im achromatischen Tonwertkeil, in jeder eine bodenstaendige Saeule. */
export function Notenspur({ verteilung, groesse = "kompakt" }: NotenspurProps) {
  const { zellhoehe, abstand } = SPUR_MASSE[groesse];
  const gesamt = summe(verteilung);
  const raster: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: abstand,
  };
  // 12/600 fuer die Notenziffern: Groesse und Gewicht des Kickers, aber ohne
  // Versalien und Sperrung — eine gesperrte Einzelziffer sitzt nicht mittig.
  const ziffer: CSSProperties = { ...T.meta, fontWeight: 600, textAlign: "center" };

  return (
    // EIN vollstaendiges `aria-label` am Container, nicht sechs an den Zellen:
    // sonst buchstabiert der Screenreader ein Raster, statt eine Verteilung zu
    // nennen. Damit haengt keine Information an Farbe oder Hoehe.
    <div role="img" aria-label={spurBeschriftung(verteilung, gesamt)}>
      <div style={{ ...raster, borderRadius: 2, overflow: "hidden" }}>
        {NOTEN.map((n) => (
          <div
            key={n}
            style={{
              height: zellhoehe,
              background: `var(--fb-keil-${n})`,
              display: "flex",
              alignItems: "flex-end",
            }}
          >
            {anzahlVon(verteilung, n) > 0 ? (
              <span
                style={{
                  display: "block",
                  width: "100%",
                  height: saeulenhoehe(anzahlVon(verteilung, n), gesamt, zellhoehe),
                  background: `var(--note-${n})`,
                }}
              />
            ) : null}
          </div>
        ))}
      </div>
      {groesse === "gross" ? (
        <>
          {/* Die Notenziffer sitzt UNTER ihrer Zelle, nicht in ihr: in der Zelle
              stuende sie auf einer vollgesaettigten Saeule, und dort erreicht
              gedaempfte Schrift keinen tragfaehigen Kontrast. So bleibt die
              Spalte zugeordnet und der Text lesbar. */}
          <div style={{ ...raster, marginTop: SPACE.xs }}>
            {NOTEN.map((n) => (
              <span key={n} style={ziffer}>
                {n}
              </span>
            ))}
          </div>
          <div style={{ ...raster, marginTop: SPACE.xs }}>
            {NOTEN.map((n) => (
              <span key={n} style={{ ...T.meta, textAlign: "center" }}>
                {/* `0` als „·": eine Null liest sich wie ein Messwert, der Punkt
                    wie eine leere Stelle. */}
                {anzahlVon(verteilung, n) > 0 ? anzahlVon(verteilung, n) : "·"}
              </span>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

const summe = (werte: readonly number[]) => werte.reduce((s, w) => s + w, 0);

const anzahlVon = (verteilung: readonly number[], note: number) => verteilung[note - 1] ?? 0;

/**
 * Hoehe = Anteil an ALLEN Rueckmeldungen, nicht am groessten Balken: nur so
 * haben acht Spuren uebereinander denselben Maszstab. Waere jede Zeile auf ihr
 * eigenes Maximum normiert, saehe eine gespaltene Frage aus wie eine
 * einmuetige.
 *
 * Mindestens 2px, sobald ueberhaupt jemand diese Note gegeben hat — sonst ist
 * „1 von 14" unsichtbar, und eine unsichtbare Antwort ist eine verschwiegene.
 * Nicht gerundet: die einzige Rundungsregel des Moduls ist `ampelStufe`.
 */
function saeulenhoehe(anzahl: number, gesamt: number, zellhoehe: number): number {
  if (anzahl <= 0 || gesamt <= 0) return 0;
  return Math.max(2, (anzahl / gesamt) * zellhoehe);
}

const MAL = [
  "einmal",
  "zweimal",
  "dreimal",
  "viermal",
  "fünfmal",
  "sechsmal",
  "siebenmal",
  "achtmal",
  "neunmal",
  "zehnmal",
] as const;

const malWort = (anzahl: number) => MAL[anzahl - 1] ?? `${anzahl}-mal`;

/**
 * „Notenverteilung: einmal Note 1, viermal Note 2, dreimal Note 3, keine Note 4
 * bis 6. Durchschnitt 2,3, gut."
 *
 * Leere Noten werden zusammengefasst, weil „keine Note 4, keine Note 5, keine
 * Note 6" dreimal dasselbe sagt und die Aufmerksamkeit dort verbraucht, wo
 * nichts steht.
 */
function spurBeschriftung(verteilung: readonly number[], gesamt: number): string {
  const teile: string[] = [];
  let leerVon: number | null = null;
  const leerAbschliessen = (bis: number) => {
    if (leerVon === null) return;
    teile.push(leerVon === bis ? `keine Note ${bis}` : `keine Note ${leerVon} bis ${bis}`);
    leerVon = null;
  };

  for (const n of NOTEN) {
    const anzahl = anzahlVon(verteilung, n);
    if (anzahl <= 0) {
      if (leerVon === null) leerVon = n;
      continue;
    }
    leerAbschliessen(n - 1);
    teile.push(`${malWort(anzahl)} Note ${n}`);
  }
  leerAbschliessen(6);

  const kopf = `Notenverteilung: ${teile.join(", ")}.`;
  // Ohne Rueckmeldung gibt es keinen Durchschnitt — und keinen Satz darueber.
  if (gesamt <= 0) return kopf;
  const mittel = NOTEN.reduce((s, n) => s + n * anzahlVon(verteilung, n), 0) / gesamt;
  return `${kopf} Durchschnitt ${formatiereNote(mittel)}, ${NOTEN_WORT[ampelStufe(mittel) - 1]}.`;
}

// ---------------------------------------------------------------------------
// Bauteil 3 — Notenlegende
// ---------------------------------------------------------------------------

export type NotenlegendeProps = {
  /** Muss zur Spur darunter passen — dasselbe Raster, derselbe Abstand. */
  groesse?: SpurGroesse;
};

/**
 * Sechs Segmente ueber der ersten Spurzeile, PRO KARTE GENAU EINMAL. In
 * Tabellen und auf Einstiegskarten gibt es keine Legende und keine Spur — dort
 * steht die Pille MIT Wort, plus der Spaltenkopf „Ø Note (1 = beste)". Sonst
 * stuende eine Legende in jeder Tabellenzeile.
 *
 * `borderRadius: 3` kommt aus §4.11 (Bauteil 3) und ist der einzige Radius im
 * Modul neben 2 / 6 / 8, den §4.8 nicht auffuehrt — der Bauteilabschnitt ist
 * hier der genauere.
 */
export function Notenlegende({ groesse = "kompakt" }: NotenlegendeProps = {}) {
  const { abstand } = SPUR_MASSE[groesse];
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: abstand,
        }}
      >
        {NOTEN.map((n) => (
          <span
            key={n}
            style={{ height: 10, borderRadius: 3, background: `var(--note-${n})` }}
          />
        ))}
      </div>
      {/* Das Raster dieser Zeile steht in `feedback.css`, NICHT hier: unter
          767.98px schaltet eine Klasse auf die zwei Ankerwoerter um, und ein
          inline gesetztes `display: grid` koennte sie nicht schlagen. */}
      <div
        className="fb-legende-woerter"
        style={{ ...T.kicker, gap: abstand, marginTop: SPACE.sm }}
      >
        {NOTEN.map((n) => (
          <span key={n}>{NOTEN_WORT[n - 1]}</span>
        ))}
      </div>
      <div className="fb-legende-anker" style={{ ...T.kicker, marginTop: SPACE.sm }}>
        <span>1 {NOTEN_WORT[0]}</span>
        <span>6 {NOTEN_WORT[5]}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bauteil 4 — Notenfunke
// ---------------------------------------------------------------------------

export type NotenfunkeProps = {
  /**
   * Die Noten der letzten Abende MIT Rueckmeldungen, AELTESTE ZUERST. Die
   * Richtung steht in der Signatur und nicht in einem Kommentar am Aufrufer:
   * ein rueckwaerts gezeichneter Trend behauptet das Gegenteil.
   */
  noten: readonly number[];
  /** 132 laut §2.5. Am Handy laeuft der Funke volle Breite (§2.5, Schmalvariante). */
  breite?: number;
  /** 28 laut §2.5; 56 in der Schmalvariante. */
  hoehe?: number;
  /** Skaliert das SVG auf die Elternbreite — das `viewBox` bleibt `breite`. */
  volleBreite?: boolean;
};

/** Rand im SVG, damit der 3px-Punkt des letzten Wertes nicht angeschnitten wird. */
const FUNKE_RAND = 4;

/**
 * DER NOTENFUNKE (§4.11, Bauteil 4) — Server-SVG, KEIN recharts: 132×28 traegt
 * keine Achse, keinen Tooltip und keine Legende, also braucht es auch keine
 * Diagrammbibliothek. Er steht in der Kopfzeile des Verlaufs und ist am Handy
 * der einzige Trend, den man ohne Scrollen erfasst (§2.5).
 *
 * DREI ZUSAGEN:
 *
 * 1. Y IST INVERTIERT — Note 1 OBEN. Ein Funke, in dem eine 6 hoeher steht als
 *    eine 1, ist ein Sachfehler und keine Geschmacksfrage.
 * 2. DAS DOMAIN IST FEST 1–6, nicht datenabhaengig. Ein auf die Daten gespanntes
 *    Domain macht aus dem Unterschied 2,0 → 2,1 einen Absturz: die Steigung
 *    wuerde luegen.
 * 3. UNTER ZWEI PUNKTEN GIBT ES KEINEN FUNKEN, sondern „—". Eine Linie durch
 *    einen Punkt ist keine Entwicklung.
 *
 * Die Farbe traegt nur der LETZTE Punkt (der aktuelle Stand); die Linie bleibt
 * `--fb-ink`, damit sechs Farbwechsel auf 132px nicht als Muster gelesen werden.
 */
export function Notenfunke({
  noten,
  breite = 132,
  hoehe = 28,
  volleBreite = false,
}: NotenfunkeProps) {
  if (noten.length < 2) return <KeineNote />;

  const innen = hoehe - 2 * FUNKE_RAND;
  // Geklemmt, NICHT gerundet: `ampelStufe` bleibt die einzige Rundungsregel des
  // Moduls (§4.11). Geklemmt wird, damit ein Wert aus fehlerhaften Daten die
  // Linie nicht aus dem Bild schiebt.
  const y = (note: number) => FUNKE_RAND + ((Math.min(6, Math.max(1, note)) - 1) / 5) * innen;
  const x = (i: number) => FUNKE_RAND + (i / (noten.length - 1)) * (breite - 2 * FUNKE_RAND);

  const punkte = noten.map((note, i) => `${x(i).toFixed(1)},${y(note).toFixed(1)}`).join(" ");
  const letzte = noten[noten.length - 1];

  return (
    <svg
      data-testid="notenfunke"
      role="img"
      aria-label={funkenBeschriftung(noten)}
      viewBox={`0 0 ${breite} ${hoehe}`}
      width={volleBreite ? "100%" : breite}
      height={hoehe}
      style={{ display: "block", overflow: "visible" }}
    >
      <polyline
        points={punkte}
        fill="none"
        stroke="var(--fb-ink)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <circle
        cx={x(noten.length - 1)}
        cy={y(letzte)}
        r={3}
        fill={`var(--note-${ampelStufe(letzte)})`}
      />
    </svg>
  );
}

/**
 * Der Funke ist ein Bild — ohne diesen Satz ist er fuer eine Vorleseschicht
 * nicht vorhanden. Er nennt beide Enden mit Ziffer UND Wort und sagt die
 * Richtung der Skala ausdruecklich; ein Pfeil ↑/↓ waere zweideutig, weil „hoch"
 * hier „schlechter" heisst (§4.11).
 */
function funkenBeschriftung(noten: readonly number[]): string {
  const erste = noten[0];
  const letzte = noten[noten.length - 1];
  return (
    `Notenverlauf der letzten ${noten.length} Abende: von ` +
    `${formatiereNote(erste)} ${NOTEN_WORT[ampelStufe(erste) - 1]} auf ` +
    `${formatiereNote(letzte)} ${NOTEN_WORT[ampelStufe(letzte) - 1]}. ` +
    `1 ist die beste Note, 6 die schlechteste.`
  );
}

// ---------------------------------------------------------------------------
// Die Fussnote zur Alt-Skala
// ---------------------------------------------------------------------------

/**
 * DIE FUSSNOTE AUS §4.12 — genau einmal formuliert. Sie steht an jeder Zeile,
 * deren Bogen eine `stars`-Frage traegt (Verlauf, Trend, Vergleich,
 * Auswertung): dort ist der Ø aus WENIGER Fragen gebildet als der Bogen hat,
 * und ohne diesen Satz bliebe unerklaerlich, warum ein Abend mit
 * Rueckmeldungen keine oder eine „zu gute" Note zeigt.
 *
 * Kein Warnton, keine Kante, kein Icon: es ist eine Herkunftsangabe, keine
 * Warnung — und Rot faellt im Modul `feedback` ohnehin aus (§4.9).
 */
export function Altbestandsfussnote() {
  return (
    <span style={T.meta}>
      enthält Altbestands-Fragen (Skala 1–5) — nicht in den Durchschnitt gerechnet
    </span>
  );
}

// ---------------------------------------------------------------------------
// Notenplakette (§3.2 — die Bauteilnummern von §4.11 enden bei 4/Funke)
// ---------------------------------------------------------------------------

export type NotenplaketteProps = {
  /** Die Gesamtnote (`avgSchulnote`, §4.12) — `null` ergibt „—". */
  note: number | null;
  /** Aus wie vielen Bewertungsfragen der Mittelwert kommt. */
  fragen?: number;
};

/**
 * Die Gesamtnote der Auswertung, 88×64 (§3.2). Die einzige Stelle im Modul mit
 * 40/700 — die Typo-Leiter (§4.7) kennt diese Groesse nicht, weil sie genau
 * einmal vorkommt. Sie nimmt deshalb `ZIFFERN` und NICHT `T.zahl`: die 30/600
 * dieser Rolle gehoeren laut §4.7 allein dem laufenden Ruecklaufzaehler.
 */
export function Notenplakette({ note, fragen }: NotenplaketteProps) {
  if (!vorhanden(note)) return <KeineNote />;
  const wert = formatiereNote(note);
  const stufe = ampelStufe(note);
  const wort = NOTEN_WORT[stufe - 1];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: SPACE.md }}>
      <div
        role="img"
        aria-label={notenBeschriftung(wert, wort)}
        style={{
          ...ZIFFERN,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 88,
          height: 64,
          borderRadius: 8,
          background: `var(--note-${stufe})`,
          color: "var(--note-ink)",
          fontSize: 40,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {wert}
      </div>
      <div>
        <div style={T.body}>{wort}</div>
        {fragen === undefined ? null : <div style={T.meta}>Ø aus {fragen} Fragen</div>}
      </div>
    </div>
  );
}
