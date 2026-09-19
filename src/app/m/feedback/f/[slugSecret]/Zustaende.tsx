import type { ReactNode } from "react";
import { Newsreader } from "next/font/google";
import { releaseDeviceAction } from "../../actions";
import s from "./zettel.module.css";

/**
 * DIE GEMEINSAME HUELLE UND DIE ZUSTAENDE B–F (Entwurf 3.2 B–F).
 *
 * Vorher war jeder Nicht-Formular-Zustand ein nacktes `<p>` — und das ist die
 * ERSTE Seite, die jemand nach dem QR-Scan sieht. Eine Zeile Fliesstext ohne
 * Hierarchie liest sich wie ein Fehler des Veranstalters.
 *
 * Warum eine eigene Datei und nicht in `page.tsx`: den Kopf brauchen ZWEI
 * Routensegmente (`page.tsx` und `thanks/page.tsx`). Zweimal dasselbe Markup
 * waere der Anfang der Drift — dann tragen zwei Dateien denselben Kopf und nur
 * eine wird gepflegt. Ein zweiter benannter Export aus `page.tsx` ist keine
 * Alternative: Next prueft die Exporte einer Seitendatei, und ein unerwarteter
 * Name bricht `pnpm build`.
 *
 * Alles hier ist Server Component: der Knopf "Leeren Bogen oeffnen" ist ein
 * natives `<form action={…}>` und muss OHNE JavaScript funktionieren (3.11).
 */

/**
 * Der EINE zusaetzliche Webfont dieser Route (Entwurf 3.3/3.11), nur fuer H1,
 * "Danke." und die t4-Serifsaetze. Er steht bei der Huelle, weil die Huelle die
 * Variable auf ihren Wurzel-`div` legt — und damit in jedem Zustand, nicht nur
 * im Formular. Faellt er aus, greift die im Entwurf benannte Ruecklinie: Geist
 * Sans 600 (`--serif` in `zettel.module.css`) — der Entwurf verliert Ton, nicht
 * Funktion.
 */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  preload: true,
});

const KICKER = "Rückmeldung zum Dienstabend";

/**
 * Fahne, Blatt, Kopfrhythmus — geteilt von allen Zustaenden (3.2, letzter Satz).
 *
 * `kopf` nimmt die Zeilen UNTER der Ueberschrift auf (Metazeile, Vertragszeile):
 * die haengen am Zustand, der Rhythmus daran nicht.
 */
export function Huelle({
  titel,
  gross = false,
  fuellt = false,
  vorTitel,
  kopf,
  children,
}: {
  titel: string;
  /** "Danke." steht auch mobil auf t6 (32px, -0.02em) — Entwurf 3.3. */
  gross?: boolean;
  /**
   * Das Blatt reicht bis zur Unterkante, statt nach dem Text aufzuhoeren.
   *
   * NUR fuer kurze Zustaende gedacht und heute allein von der Danke-Seite
   * gesetzt: dort steht ein Absatz auf einem Schirm, und die Tonwertkante
   * zwischen Blatt und Papier lag mitten im Bild — hell kaum zu sehen, dunkel
   * (`--blatt` #1b1e22 auf `--papier` #101214) deutlich. Ab 600px ist das Blatt
   * eine KARTE mit Rand und Schatten; dort nimmt die Regel sich selbst
   * zurueck, sonst waere die Karte fensterhoch.
   */
  fuellt?: boolean;
  /**
   * Ein Zeichen UEBER der Ueberschrift, innerhalb des Kopfes.
   *
   * Eigener Steckplatz und nicht einfach als erstes `children`: dort landete es
   * UNTER der Ueberschrift, und ein Haken zwischen "Danke." und dem Satz
   * darunter liest sich als Aufzaehlungszeichen, nicht als Geste. Die Reihenfolge
   * Zeichen -> Ueberschrift -> Satz ist der Punkt.
   */
  vorTitel?: ReactNode;
  kopf?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`${s.seite} ${newsreader.variable}`}>
      {/* Fahne: 3px Suite-Rot, randlos am Oberrand. Reine Marke, kein Inhalt —
          deshalb `aria-hidden`. Eine der genau ZWEI Stellen mit #c8000f. */}
      <div className={s.fahne} aria-hidden="true" />
      <div className={fuellt ? `${s.blatt} ${s.fuellt}` : s.blatt}>
        <header className={`${s.kopf} ${s.aufbau}`}>
          <p className={s.kicker}>
            {KICKER}
            <span className={s.wortzeichen}>IDA</span>
          </p>
          {vorTitel}
          <h1 className={gross ? `${s.titel} ${s.gross}` : s.titel}>{titel}</h1>
          {kopf}
        </header>
        {children}
      </div>
    </div>
  );
}

/** Der Textkoerper eines Zustands — ein Block, damit der Aufbau mitspielt. */
function Block({ children }: { children: ReactNode }) {
  return <div className={`${s.zustand} ${s.aufbau}`}>{children}</div>;
}

/**
 * DAS ZEICHEN DER DANKE-SEITE — ein Haken im Ring, in derselben Tinte wie der
 * Text.
 *
 * INLINE-SVG UND KEIN ZEICHENPAKET, und das ist hier keine Vorliebe: auf dieser
 * Route gibt es kein antd (das Route-JS-Budget liegt unter 15 KB gz), und ein
 * Import aus `@ant-design/icons` ergaebe in einer Server Component ohnehin HTTP
 * 500 — schon beim Import, nicht beim Rendern (Falle 7 in CLAUDE.md). Markup
 * kostet dagegen kein Byte JavaScript und rendert auch ohne.
 *
 * ⚠️ KEIN ROT UND KEIN GRUEN. Rot hat auf dieser Route ein Budget von GENAU
 * zwei Stellen (Fahne, Wortzeichen) — `Zettel.test.tsx` zaehlt sie —, und Gruen
 * waere die Gegenfarbe der Notenskala: ein gruener Haken neben einem Bogen, auf
 * dem Farbe „Note" bedeutet, behauptete eine Bewertung. Das Zeichen bleibt
 * deshalb im Hairline-Vokabular des Blattes: Ring in `--linie-stark` auf
 * `--tint`, Haken in `--graphit`.
 *
 * ⚠️ UND ES IST KEIN STEMPEL. Der Entwurf hat den Stempel ausdruecklich
 * verworfen ("Stempel widerspricht der eigenen Strenge", Jury-Zeile 9) — ein
 * schraeg gesetztes Siegel ist genau die Editorial-Schablone, die dieselbe Jury
 * an drei Stellen gestrichen hat.
 *
 * `aria-hidden`, weil die Aussage schon zweimal dasteht: in der Ueberschrift
 * ("Danke.") und im Satz darunter. Eine Vorleseanwendung soll sie nicht ein
 * drittes Mal hoeren.
 */
export function DankeZeichen() {
  return (
    <svg
      className={s.dankeZeichen}
      viewBox="0 0 52 52"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <circle className={s.dankeRing} cx="26" cy="26" r="25" />
      <path className={s.dankeHaken} d="M16.5 27 L23 33.5 L36 19" />
    </svg>
  );
}

/**
 * DAS RUHIGE PANEL DER FEHLERPFADE (Entwurf 3.8): Text in `--tinte` auf
 * `--tint`, 2px linke Kante in `--graphit`, `role="alert"`. Kein Rot — und das
 * ist hier keine Geschmacksfrage: `colorError` der Suite IST `#c8000f`, also
 * identisch mit der Primaerfarbe, und auf dieser Route hat Rot ein Budget von
 * genau zwei Stellen (Fahne, Wortzeichen).
 *
 * Es traegt dieselbe Klasse wie die Meldung im Zettel (`.meldung`), weil der
 * Entwurf beide Faelle mit derselben Beschreibung belegt. Zwei Klassen mit
 * identischer Absicht waeren der Anfang der Drift: die eine wird nachjustiert,
 * die andere bleibt stehen.
 */
export function Fehlerpanel({ text }: { text: string }) {
  return (
    <p className={s.meldung} data-fehler="" role="alert">
      {text}
    </p>
  );
}

/**
 * ZUSTAND C — "Zurzeit laeuft keine Umfrage."
 *
 * Kein Rot, kein Warndreieck: hier ist nichts schiefgegangen. Der QR-Code auf
 * dem Aushang bleibt gueltig, und genau das muss dastehen — sonst wirft ihn
 * jemand weg.
 *
 * Der Entwurf schreibt "Fuer die Bereitschaft Musterstadt …". Das "die" gehoert
 * zu SEINEM Beispielnamen, nicht zum Satz: interpoliert ergaebe es "Fuer die
 * Ortsverein Nord". Der Gruppenname reist deshalb ohne Artikel.
 */
export function ZustandC({ gruppe, url }: { gruppe: string; url: string }) {
  return (
    <Huelle titel="Zurzeit läuft keine Umfrage.">
      <Block>
        <p className={s.text}>
          {`Für ${gruppe} ist gerade kein Dienstabend freigegeben. Der QR-Code bleibt gültig — ` +
            "probier es am Ende des nächsten Abends noch einmal."}
        </p>
        {/* "Neu laden" als `<a href>` auf dieselbe URL: ein `<button>` bräuchte
            JavaScript, und wer gerade nichts sieht, hat es vielleicht nicht. */}
        <a className={`${s.knopf} ${s.knopfUmriss} ${s.knopfLink}`} href={url}>
          Neu laden
        </a>
      </Block>
    </Huelle>
  );
}

/**
 * ZUSTAND D — "Die Umfrage zu diesem Abend ist beendet."
 *
 * Thema und Datum stehen sichtbar: der Nutzer soll erkennen "richtiger Zettel,
 * zu spaet" — ohne sie waere nicht unterscheidbar, ob er beim falschen Abend
 * gelandet ist. `geschlossenAm` ist bereits formatiert (die Zeitzonenrechnung
 * gehoert zum Lifecycle in `page.tsx`) und darf fehlen: bei importierten
 * Altbestaenden gibt es keinen belegten Zeitpunkt, und dann wird keiner
 * behauptet.
 */
export function ZustandD({
  thema,
  datum,
  geschlossenAm,
  stufen,
  zusatz = null,
}: {
  thema: string | null;
  datum: string;
  geschlossenAm: string | null;
  stufen: number;
  /**
   * Der ehrliche Zusatz aus 3.8, wenn D nicht beim Aufrufen der Seite entsteht,
   * sondern beim ABSENDEN: "Deine Rueckmeldung konnte nicht mehr gespeichert
   * werden." Ohne diesen Satz waere D hier eine halbe Auskunft — die Person hat
   * acht Noten getippt und liest nur, dass die Umfrage beendet ist, ohne zu
   * erfahren, was aus ihrer Abgabe wurde.
   */
  zusatz?: string | null;
}) {
  return (
    <Huelle
      titel="Die Umfrage zu diesem Abend ist beendet."
      kopf={
        <p className={s.meta}>
          {thema ? `${thema} · ` : ""}
          <span className={s.datum}>{datum}</span>
        </p>
      }
    >
      <Block>
        <p className={s.text}>
          {geschlossenAm ? `Sie wurde ${geschlossenAm} geschlossen. ` : ""}
          Danke, falls du schon abgestimmt hast.
        </p>
        {zusatz === null ? null : <Fehlerpanel text={zusatz} />}
        {/* Der Legendenstreifen, vollstaendig entsaettigt: die Farbe hat den
            Raum verlassen. Ohne Notenwoerter — es gibt nichts mehr zu waehlen. */}
        <div className={s.stummeLegende}>
          <div className={s.streifen} data-stufen={stufen} data-stumm="" aria-hidden="true">
            {Array.from({ length: stufen }, (_, i) => (
              <span key={i} className={s.segment} />
            ))}
          </div>
        </div>
      </Block>
    </Huelle>
  );
}

/**
 * ZUSTAND E — "Von diesem Geraet ist schon eine Rueckmeldung abgegeben."
 *
 * Ersetzt die stumme Weiterleitung nach `/thanks`. Handys werden in einer Gruppe
 * herumgegeben; die 24-Stunden-Cookie-Sperre machte die zweite Abgabe unmoeglich
 * und sagte kein Wort dazu. Der Knopf ist hier die Hauptaktion und deshalb
 * gefuellt. Es ist zugleich der EINZIGE Weg zum leeren Bogen: die Danke-Seite
 * bietet ihn nicht mehr an (sie sagt nur noch danke), und wer das Handy
 * weiterreicht, landet mit dem naechsten Aufruf genau hier.
 */
export function ZustandE({ slugSecret, surveyId }: { slugSecret: string; surveyId: number }) {
  return (
    <Huelle titel="Von diesem Gerät ist schon eine Rückmeldung abgegeben.">
      <Block>
        <p className={s.text}>
          Wenn du das Handy weitergibst, kann die nächste Person einen leeren Bogen öffnen.
        </p>
        <LeererBogen slugSecret={slugSecret} surveyId={surveyId} />
      </Block>
    </Huelle>
  );
}

/**
 * ZUSTAND F — "Dieser Link stimmt nicht."
 *
 * Statt eines nackten 404. Der Zustand bekommt KEINE Daten: er darf nicht
 * verraten, ob es die Gruppe gibt, sonst ist er ein Orakel fuer geratene Slugs.
 * Deshalb ist die Ablehnung fuer "Slug unbekannt", "Secret falsch" und "Token
 * kaputt" Zeichen fuer Zeichen dieselbe.
 */
export function ZustandF() {
  return (
    <Huelle titel="Dieser Link stimmt nicht.">
      <Block>
        <p className={s.text}>
          Vielleicht ist er unvollständig kopiert. Scanne den QR-Code am besten noch einmal.
        </p>
      </Block>
    </Huelle>
  );
}

/**
 * Der Knopf, der das Geraet freigibt.
 *
 * Die Action wird GEBUNDEN und unveraendert als `action` uebergeben — nur so
 * bleibt der Knopf ohne JavaScript bedienbar (3.11). Ein Client-Wrapper waere
 * keine serialisierbare Server Action mehr; React DOM gibt einer gewoehnlichen
 * Funktion `action="javascript:throw …"`, und dieser Bruch ist fuer Typecheck
 * und Build unsichtbar.
 */
function LeererBogen({ slugSecret, surveyId }: { slugSecret: string; surveyId: number }) {
  return (
    <form action={releaseDeviceAction.bind(null, slugSecret, surveyId)}>
      <button type="submit" className={s.knopf}>
        Leeren Bogen öffnen
      </button>
    </form>
  );
}
