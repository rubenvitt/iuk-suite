import Link from "next/link";
import type { ReactNode } from "react";
import type { DB } from "../_db/client";
import { aufgabenFuerPerson, type AuslastungZeile } from "../_db/queries";
import type { AufgabeRow, PersonRow } from "../_db/schema";
import { fmtDauer, fmtStunden, nochOffen, vorschlagOffen } from "../_lib/anzeige";
import { aktionsOptionen } from "../_lib/aktionsOptionen";
import type { Akteur } from "../_lib/zugang";
import { Balken } from "./Balken";
import { PrioritaetChip, StatusChip } from "./Chip";
import { Frist } from "./Frist";
import { Ikone } from "./ikonen";
import { ZuweisenInline } from "./ZuweisenInline";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import s from "./aufgaben.module.css";

/*
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * DAS BRETT — DIE ZWEITE SICHT AUF `/verteilen` (Nachtrag „mehr Diversitaet im UI/UX", vierte
 * Oberflaechen-Runde 2026-08-16). SPALTEN SIND PERSONEN, KARTEN SIND AUFGABEN.
 *
 * ══ WARUM ES DIESE SICHT GIBT, IN EINEM SATZ: die Liste beantwortet „welche Aufgabe zuerst",
 *    das Brett beantwortet „wer traegt schon wie viel" — und das ist die Frage, die beim VERTEILEN
 *    gestellt wird. Die Liste kann sie strukturell nicht beantworten: sie ordnet nach Frist, nicht
 *    nach Person, und die Auslastung steht in ihr ueberhaupt nicht (sie klappt erst im Zielfeld
 *    auf, also NACH der Entscheidung, zu wem man schaut).
 *
 * ══ ES IST DIESELBE DATENQUELLE UND DIESELBE FACHLOGIK, NICHT EINE ZWEITE FASSUNG:
 *      · dieselbe Ladefunktion `verteilDaten(db, heute)` (der Aufrufer reicht ihr Ergebnis durch),
 *      · dieselbe Zielliste aus `bufdis()` — NIE `aktivePersonen()` (§11.3). Diese Datei baut sie
 *        nicht nach; sie bekommt sie als Prop. DAS IST HIER BESONDERS SCHARF: bei einem Brett mit
 *        PERSONENSPALTEN waere eine falsche Quelle nicht nur eine falsche Zielliste, sondern eine
 *        sichtbare Spalte fuer eine Person, die gar kein Ziel sein darf — die Koordination stuende
 *        in ihrer eigenen Spalte. `verteilen/page.test.tsx` bindet das ausdruecklich.
 *      · dieselben Server Actions ueber DIESELBE Insel (`_ui/ZuweisenInline.tsx`, `verteilen` bzw.
 *        `umverteilen`), also auch derselbe optionale Zeitvorschlag mit denselben Formularschluesseln.
 *      · dieselben Marken in DERSELBEN REIHENFOLGE wie die Zeile (§10 Prueffrage 7): Titel ·
 *        Zustand · Prioritaet · Frist · Dauer · Rollenzusatz. Nur die GEOMETRIE unterscheidet sich
 *        (Karte statt Rasterzeile) — genau das ist der Sinn zweier Sichten auf dieselben Daten.
 *
 * ══ DER ZEITVORSCHLAG BLEIBT EIN VORSCHLAG. `verteilenAction` setzt `vorschlagDatum`/
 *    `vorschlagUhrzeit`, NIE `planDatum` — die Koordination schlaegt vor, die BuFDi plant
 *    (`EinstiegBufdi.tsx`s „Annehmen"). Ein Brett darf diese Grenze nicht verwischen, und es tut es
 *    hier strukturell nicht: eine Karte, die in eine Personenspalte wandert, hat damit einen
 *    TRAEGER bekommen, keinen TAG. Die Spalten sind Personen, nicht Tage — waeren sie Tage, waere
 *    die Grenze schon durch die Bauform verwischt (genau der Grund, warum das Ziehen ueber
 *    Personengrenzen in Spec §8 verworfen ist).
 *
 * ══ KEIN ZIEHEN, UND ZWAR ALS ENTSCHEIDUNG, NICHT ALS LUECKE. Spec §8 fuehrt „Ziehen ueber
 *    Personengrenzen" ausdruecklich unter „Was bewusst NICHT gebaut wird", mit drei Gruenden, die
 *    alle drei weiterhin gelten: Falle 11 macht die e2e-Deckung teuer (schrittweise Maus statt
 *    `dragTo()`, in DIESEM Modul gemessen), die Geste gilt erst ab 768px und waere damit kein
 *    gleichrangiger Weg auf dem Telefon, und sie ist fuer eine Hilfstechnik kein Bedienweg. Das
 *    Brett ist deshalb VOLLSTAENDIG ohne Zeigergeste bedienbar: ein Ausloeser je Karte, dahinter
 *    eine Liste von Namensknoepfen — Tab, Enter, fertig, und auf 360px ein 44px-Ziel.
 *
 * ══ KEIN `"use client"` (Falle 6, Falle 7): diese Datei ist eine Server Component. Sie liest die
 *    Datenbank (`aufgabenFuerPerson`, wie `EinstiegKoordination.tsx`s `PersonenLage` es tut),
 *    rendert Markup und reicht der Insel AUSSCHLIESSLICH serialisierbare Daten. Es geht keine
 *    Funktion ueber die RSC-Grenze (Falle 9) — kein `render`, kein `onRow`, kein `format`; der
 *    Rollenzusatz ist ein fertig formatierter STRING, nie ein Callback. Zeichen kommen aus
 *    `./ikonen` (Falle 7), es gibt keinen Compound-Zugriff auf antd (Falle 1) und keine
 *    antd-Komponente ueberhaupt: `Card` waere RSC-sicher, `Card.Meta` nicht — und `.brettKarte`
 *    hat dafuer keinen Gegenspieler im Stylesheet (Falle 5).
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

export function VerteilBoard({
  db,
  akteur,
  heute,
  posteingang,
  erstellerNamen,
  bufdis,
  auslastung,
}: {
  db: DB;
  /** Schon durch `darfVerteilen` gegangen (der Riegel steht im Default-Export der Seite). */
  akteur: Akteur;
  /** ISO-Tagesstring — fuer `<Frist>` und `aktionsOptionen`. Nie `new Date()` hier. */
  heute: string;
  posteingang: AufgabeRow[];
  erstellerNamen: Record<string, string>;
  /** Aus `bufdis()` — eine ausgeschiedene Person ist kein Verteilziel und bekommt keine Spalte. */
  bufdis: PersonRow[];
  auslastung: AuslastungZeile[];
}) {
  return (
    <div className={s.brettGitter} data-rolle="brett">
      {/*
       * DER STAPEL STEHT ZUERST, AUF JEDER BREITE. Auf dem Rechner ist er die linke Spalte, unter
       * 768px die oberste — in beiden Faellen die erste, weil dort gehandelt wird. Waere er
       * rechts oder unten, muesste man auf dem Telefon an drei Personenspalten vorbeiscrollen, um
       * die Aufgabe zu finden, derentwegen man die Seite geoeffnet hat.
       */}
      <section
        className={`${s.brettSpalte} ${s.brettSpalteStapel}`}
        aria-labelledby="brett-posteingang"
        data-brett-spalte="posteingang"
      >
        <h3 id="brett-posteingang" className={s.tagKopf} style={{ margin: 0 }}>
          Posteingang
        </h3>
        <p className={s.budget} style={{ margin: `${SPACE.xs}px 0 0` }}>
          {posteingang.length} zu verteilen
        </p>
        {posteingang.length === 0 ? (
          /*
           * DER LEERZUSTAND IST WORTGLEICH MIT DEM DER LISTE (Spec §9.8) — zwei Sichten auf
           * dieselben Daten duerfen fuer denselben Datenbestand nicht zwei verschiedene Saetze
           * sagen. `AufgabenListe`s `leerText`-Pflichtprop traegt ihn dort, hier steht er direkt;
           * `verteilen/page.test.tsx` prueft ihn in BEIDEN Sichten.
           */
          <p style={{ ...SCHRIFT.neben, margin: `${SPACE.sm}px 0 0` }}>
            Posteingang leer — alles verteilt
          </p>
        ) : (
          <ul className={s.brettKarten}>
            {posteingang.map((a) => (
              <BrettKarte
                key={a.id}
                aufgabe={a}
                heute={heute}
                zusatz={`Von ${erstellerNamen[a.erstellerId] ?? "—"}`}
                aktion={
                  /*
                   * DIE AKTION STEHT AN JEDER KARTE, WEIL DER RIEGEL SCHON GEFALLEN IST: der
                   * Default-Export der Seite hat `darfVerteilen(akteur, heute)` ueber `notFound()`
                   * durchgesetzt — wer hier ankommt, IST eine aktive Koordinationsperson. Dieselbe
                   * Ueberlegung, die schon die Zeilensicht fuehrt.
                   */
                  <ZuweisenInline
                    aufgabe={a}
                    bufdis={bufdis}
                    auslastung={auslastung}
                    art="verteilen"
                  />
                }
              />
            ))}
          </ul>
        )}
      </section>
      {auslastung.map((zeile) => (
        <PersonenSpalte
          key={zeile.person.id}
          db={db}
          akteur={akteur}
          heute={heute}
          zeile={zeile}
          bufdis={bufdis}
          auslastung={auslastung}
        />
      ))}
    </div>
  );
}

/**
 * EINE PERSONENSPALTE — KOPF, AUSLASTUNGSBALKEN, KARTEN.
 *
 * ══ DER SPALTENKOPF IST DER NATUERLICHE ORT DES AUSLASTUNGSBALKENS (Auftrag woertlich), und der
 *    Balken ist ein VORHANDENES Bauteil (`_ui/Balken.tsx`, zweiter Nutzniesser seit dem
 *    Wochenplan). Es entsteht KEINE dritte Rechnung: `zeile` kommt aus
 *    `wochenAuslastungFuerBufdis` ueber `verteilDaten`, genau wie auf `/` und im Zielfeld der
 *    Insel. Dieselbe Zahl an drei Orten, EINE Quelle.
 *
 * ══ DIE ZWEI ANGABEN DES KOPFES NENNEN IHREN ZEITRAUM GETRENNT, UND DAS IST KEIN SCHMUCK: die
 *    Stunden sind die der WOCHE, die Karten sind die OFFENEN (unabhaengig von der Woche). Ohne die
 *    Worte „diese Woche" und „offen" behauptete der Kopf zweimal dasselbe mit zwei verschiedenen
 *    Zahlen, und wer nachzaehlt, faende einen Fehler, der keiner ist. Genau diese Verwechslung
 *    wollte die Zone „Auslastung diese Woche" auf `/` mit ihrer Ueberschrift vermeiden — hier ist
 *    die Ueberschrift ein Personenname, also muss die Angabe selbst es sagen.
 *
 * ══ „DIESE WOCHE" STEHT IN EINER EIGENEN ZEILE, UND ZWAR AUS EINEM IM BILDSCHIRMABZUG GEMESSENEN
 *    GRUND, NICHT AUS GESCHMACK. Der Zusatz stand zuerst als `.budgetHinweis`-Spanne HINTER dem
 *    Zahlenpaar (dasselbe Muster wie die Ueberbuchungszeile auf `/`). Bei 1280px ergibt das eine
 *    231px breite Spalte, und „14,67 / 39 Std. diese Woche" passt darin NICHT in eine Zeile —
 *    Bendix' Kopf wurde zweizeilig, Alinas und Carlas blieben einzeilig, und damit standen die
 *    drei AUSLASTUNGSBALKEN auf drei verschiedenen Hoehen. Ein Balken, dessen Sinn der Vergleich
 *    ueber die Spalten hinweg ist, darf nicht je Spalte woanders anfangen.
 *
 *    DER KOPF IST DESHALB IMMER GLEICH HOCH: Name (eine Zeile), Zahlenpaar (`.budget`, `nowrap`,
 *    passt in jeder gemessenen Breite), Zeitraum (eine Zeile), Balken. Kein Tor haette das
 *    gefunden — jsdom rechnet keine Zeilenboxen, und der Ueberlauf-Sweep misst waagerechtes
 *    Scrollen, nicht Ausrichtung. Nur der Abzug zeigt es.
 */
function PersonenSpalte({
  db,
  akteur,
  heute,
  zeile,
  bufdis,
  auslastung,
}: {
  db: DB;
  akteur: Akteur;
  heute: string;
  zeile: AuslastungZeile;
  bufdis: PersonRow[];
  auslastung: AuslastungZeile[];
}) {
  const person = zeile.person;
  /*
   * DIE KARTEN DER SPALTE SIND DIE NOCH OFFENEN AUFGABEN DIESER PERSON. `nochOffen` ist eine reine
   * Funktion in `_lib/anzeige.ts` und dort begruendet; sie steht NICHT hier, damit die Frage „was
   * heisst offen" eine Antwort hat statt drei.
   *
   * `aufgabenFuerPerson` STATT EINES NEUEN FELDES IN `verteilDaten`: dieselbe Bauart wie
   * `EinstiegKoordination.tsx`s `PersonenLage`, die `db` ebenfalls entgegennimmt und je Person
   * liest. Ein zusaetzliches Feld in `VerteilDaten` haette die Kosten auch dem Einstieg auferlegt,
   * der es nicht braucht — und `verteilDaten` ist die Ladefunktion BEIDER Flaechen.
   */
  const offene = aufgabenFuerPerson(db, person.id).filter(nochOffen);

  return (
    <section className={s.brettSpalte} aria-labelledby={`brett-${person.id}`} data-person={person.id}>
      <h3 id={`brett-${person.id}`} className={s.tagKopf} style={{ margin: 0 }}>
        {person.name}
      </h3>
      <p className={`${s.budget} ${s.lageWert}`} style={{ margin: `${SPACE.xs}px 0 0` }}>
        {fmtStunden(zeile.verplantMinuten)} / {fmtStunden(zeile.sollMinuten)} Std.
      </p>
      <p style={{ ...SCHRIFT.neben, color: "var(--auf-stahl)", margin: 0 }}>diese Woche</p>
      <div style={{ marginBlockStart: SPACE.sm }}>
        <Balken verplant={zeile.verplantMinuten} soll={zeile.sollMinuten} />
      </div>
      {/*
       * AUSLASTUNG IST NEUTRAL, NIE STATUSFARBE (Modulspec §9.3) — eine Ueberbuchung bekommt Kante
       * PLUS Wort (`.budgetUeberbucht`), nie einen roten Balken. Dieselbe Setzung wie in jeder
       * anderen Auslastungsanzeige des Moduls; der Balken selbst faerbt sich ueber
       * `.lastFuellungUeber`, und das WORT steht hier daneben.
       */}
      <p
        className={zeile.ueberbucht ? `${s.budget} ${s.budgetUeberbucht}` : undefined}
        style={{ ...SCHRIFT.neben, margin: `${SPACE.sm}px 0 0` }}
      >
        {offene.length} offen{zeile.ueberbucht ? <span className={s.budgetHinweis}>{" — überbucht"}</span> : null}
      </p>
      {offene.length === 0 ? (
        <p style={{ ...SCHRIFT.neben, margin: `${SPACE.sm}px 0 0` }}>Nichts offen.</p>
      ) : (
        <ul className={s.brettKarten}>
          {offene.map((a) => (
            <BrettKarte
              key={a.id}
              aufgabe={a}
              heute={heute}
              zusatz={null}
              aktion={
                /*
                 * EINE KARTE WANDERT AUCH ZWISCHEN PERSONENSPALTEN — ueber dieselbe Insel mit
                 * `art="umverteilen"`, also mit derselben Bestaetigung („Der bisher eingeplante Tag
                 * dieser Aufgabe wird dabei geleert.") zwischen Absicht und Absenden.
                 *
                 * DIE BEDINGUNG IST `aktionsOptionen(a, akteur, heute).umverteilen` UND NICHTS
                 * SONST — dieselbe Funktion, die `/a/<id>` und die zwei „Überfällig"-Zonen der
                 * Koordinationsflaeche benutzen. Ein hier geschriebenes `a.status === "verteilt"`
                 * waere die zweite Fassung derselben Bedingung an einem VIERTEN Ort (§11.3) und
                 * driftete beim naechsten Tabellenwechsel weg, ohne dass ein Tor es saehe. Wo die
                 * Uebergangstabelle nein sagt (`in_arbeit`, `freigabe_offen`, `zurueckgewiesen`),
                 * steht kein Ausloeser — und ein Klick, den es nicht gibt, kann auch nicht
                 * serverseitig abgelehnt werden.
                 */
                aktionsOptionen(a, akteur, heute).umverteilen ? (
                  <ZuweisenInline
                    aufgabe={a}
                    bufdis={bufdis}
                    auslastung={auslastung}
                    art="umverteilen"
                  />
                ) : undefined
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * EINE KARTE — DIESELBEN ANGABEN IN DERSELBEN REIHENFOLGE WIE `_ui/AufgabenZeile.tsx` (§10
 * Prueffrage 7), nur in einer anderen Geometrie.
 *
 *   Titel (Link auf /a/<id>) · [Zustand] · [Prioritaet] · <Frist> · Dauer · <Rollenzusatz>
 *
 * DIE REIHENFOLGE IST DIE ZUSAGE, NICHT DIE BAUFORM: waeren es andere Felder oder eine andere
 * Folge, waeren es zwei Sichten auf VERSCHIEDENE Daten — und die Umschaltung waere eine
 * Behauptung. `VerteilBoard.test.tsx` misst sie am Text der Karte, wie `AufgabenZeile.test.tsx` sie
 * an der Zeile misst.
 *
 * WARUM DIE ZEILE NICHT WIEDERVERWENDET WIRD: `AufgabenZeile` ist ein `<li>` mit DREI Zellen und
 * `grid-template-columns: subgrid` — sie funktioniert nur INNERHALB von `.zeilenListe`, deren
 * Spuren sie erbt. In eine 231px breite Spalte gehoert kein dreispuriges Raster (die fuenfspurige
 * Fassung platzte schon bei 490px `min-content`, die Rechnung steht an `.zeilenListe`). Die Karte
 * ist deshalb eine eigene, senkrechte Folge — dieselbe Entscheidung, die `Wochenplan.tsx`s
 * `EintragZeile` fuer die Tagesspalte getroffen hat.
 *
 * KEIN `style`-PROP AM `<li>`: die Kartenform steht vollstaendig in `.brettKarte`, damit die eine
 * Medienabfrage sie erreichen kann. Ein Inline-`style` schluege jede Stylesheet-Regel.
 */
function BrettKarte({
  aufgabe,
  heute,
  zusatz,
  aktion,
}: {
  aufgabe: AufgabeRow;
  heute: string;
  /** GENAU EINE vorformatierte Angabe (§3.6) — ein STRING, nie eine Funktion (Falle 9). */
  zusatz: string | null;
  aktion?: ReactNode;
}) {
  return (
    <li className={s.brettKarte}>
      <Link href={`/a/${aufgabe.id}`} className={s.zeilenTitel}>
        {aufgabe.titel}
      </Link>
      <span className={s.brettKarteMarken}>
        <StatusChip status={aufgabe.status} />
        <PrioritaetChip prioritaet={aufgabe.prioritaet} />
        <Frist aufgabe={aufgabe} heute={heute} />
        <span>{fmtDauer(aufgabe.dauerMinuten)}</span>
        {zusatz !== null ? <span data-rollen-zusatz>{zusatz}</span> : null}
        {/*
         * `vorschlagOffen` KOMMT AUS `_lib/anzeige.ts` UND WIRD NICHT NEU GERECHNET — wortgleich
         * mit `AufgabenZeile.tsx`. Die Marke steht NACH dem Rollenzusatz und ist keiner: sie ist
         * abgeleitet, nicht uebergeben, und zaehlt deshalb nicht gegen „genau eine Angabe".
         */}
        {vorschlagOffen(aufgabe) ? (
          <span>
            <Ikone name="uhr" /> Zeitvorschlag offen
          </span>
        ) : null}
      </span>
      {aktion !== undefined ? <div className={s.brettKarteAktion}>{aktion}</div> : null}
    </li>
  );
}
