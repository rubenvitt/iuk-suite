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
  kopf,
  children,
}: {
  titel: string;
  /** "Danke." steht auch mobil auf t6 (32px, -0.02em) — Entwurf 3.3. */
  gross?: boolean;
  kopf?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`${s.seite} ${newsreader.variable}`}>
      {/* Fahne: 3px DRK-Rot, randlos am Oberrand. Reine Marke, kein Inhalt —
          deshalb `aria-hidden`. Eine der genau ZWEI Stellen mit #c8000f. */}
      <div className={s.fahne} aria-hidden="true" />
      <div className={s.blatt}>
        <header className={`${s.kopf} ${s.aufbau}`}>
          <p className={s.kicker}>
            {KICKER}
            <span className={s.wortzeichen}>DRK</span>
          </p>
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
 * gefuellt (in der Danke-Seite ist er ein Sekundaerknopf, dort ist Danke die
 * Hauptsache).
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
 * Der Weitergabe-Abschnitt der Danke-Seite (Entwurf 3.2 B): Haarlinie, 32px
 * Abstand, Kicker, Satz, Sekundaerknopf. Er steht unbedingt da, nicht nur wenn
 * ein Cookie gefunden wurde — auf einem geteilten Handy ist die naechste Person
 * der Regelfall, nicht die Ausnahme.
 */
export function Weitergabe({ slugSecret, surveyId }: { slugSecret: string; surveyId: number }) {
  return (
    <section className={s.weitergabe}>
      <p className={s.sektionKicker}>Handy wandert weiter?</p>
      <p className={s.text}>
        Deine Antwort ist gespeichert und lässt sich nicht mehr ändern. Für die nächste Person kannst
        du einen leeren Bogen öffnen.
      </p>
      <LeererBogen slugSecret={slugSecret} surveyId={surveyId} umriss />
    </section>
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
function LeererBogen({
  slugSecret,
  surveyId,
  umriss = false,
}: {
  slugSecret: string;
  surveyId: number;
  umriss?: boolean;
}) {
  return (
    <form action={releaseDeviceAction.bind(null, slugSecret, surveyId)}>
      <button type="submit" className={umriss ? `${s.knopf} ${s.knopfUmriss}` : s.knopf}>
        Leeren Bogen öffnen
      </button>
    </form>
  );
}
