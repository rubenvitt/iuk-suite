import Link from "next/link";
import type { ReactNode } from "react";
import {
  aufgabenFuerPerson,
  freigabeDaten,
  routinenFuer,
  verteilDaten,
  type AuslastungZeile,
} from "../_db/queries";
import type { AufgabeRow, PersonRow } from "../_db/schema";
import type { DB } from "../_db/client";
import {
  aufgabenInWoche,
  fmtStunden,
  ohnePlatzInDerAchse,
  tagesBudget,
  type AnlassArt,
} from "../_lib/anzeige";
import { fmtTagKurz, fmtWochentagKurz } from "../_lib/datum";
import { aktionsOptionen } from "../_lib/aktionsOptionen";
import { kartenGrunddaten } from "../_lib/kartendaten";
import type { Anlass, Lage } from "../_lib/lage";
import { darfVerteilen, type Akteur } from "../_lib/zugang";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { AnlassZone } from "./AnlassZone";
import { Balken } from "./Balken";
import { Fuehrungskarte } from "./Fuehrungskarte";
import { SeitenKopf } from "./SeitenKopf";
import { ZuweisenInline } from "./ZuweisenInline";
import s from "./aufgaben.module.css";

/*
 * „VERTEILUNG" — DER KOORDINATIONS-EINSTIEG, NEU GEBAUT NACH DER OBERFLAECHEN-SPEC (2026-08-16
 * §3.4, §5.2). Server Component (kein "use client").
 *
 * WAS HIER VERSCHWUNDEN IST — UND WOHIN ES GEHT (§3.2):
 *
 *  - die vier KPI-Kacheln         -> die Kontextzeile (die Zahlen, inkl. der Nullen als WORT)
 *  - `VerteilenTabelle` als Zone  -> die Karte bei n = 1 (Modal aus der Karte) · die Zone
 *                                    „Zu verteilen (N)" mit Deckel bei n > 1 · `/verteilen`
 *  - `FreigabeZone` als Zone      -> Karte bei n = 1 · Zone „Freigabe offen (N)" · `/freigaben`
 *  - „Überfällige Aufgaben"       -> zwei getrennte Zonen (5a/5b), weil BEIDE gleichzeitig stehen
 *                                    koennen und zwei Zonen mit derselben Ueberschrift ein
 *                                    Anzeigefehler waeren, den kein Riegel faende (§3.5)
 *
 * DIE DOPPELUNG WAR REAL, DIE STREICHRICHTUNG WAR ES NICHT (§3.1): `/verteilen` und `/freigaben`
 * rendern DIESELBE Komponente aus DERSELBEN Ladefunktion wie dieser Einstieg — es waren nie zwei
 * Fassungen, sondern EINE an zwei Orten. Was entfaellt, ist die Kopie im Einstieg, nicht die Route.
 * Beide tragen ausserdem 404-Gegenproben, die es ohne sie nicht mehr gaebe.
 *
 * DIE FLAECHE DER ROLLE IST NICHT DER POSTEINGANG, SONDERN „AUSLASTUNG DIESE WOCHE" (§5.2). Der Grund
 * ist genau einer: die Auslastungszahlen existieren heute nur INNERHALB des Verteilen-Dialogs —
 * also erst, nachdem man sich entschieden hat, ihn zu oeffnen. Vor dieser Entscheidung steht die
 * Zahl nirgends. Es entsteht dabei KEINE zweite Rechnung: `wochenAuslastungFuerBufdis` summiert
 * `tagesBudget` ueber die fuenf Tage, Routinen eingeschlossen — belegte Zeit, die eine Auslastung
 * ohne sie unterschluege.
 */
export function EinstiegKoordination({
  db,
  akteur,
  heute,
  lage,
}: {
  db: DB;
  akteur: Akteur;
  heute: string;
  /** Der Zustands-Selektor, EINMAL in `page.tsx` gerufen (§4.1). */
  lage: Lage;
}) {
  // `verteilDaten` IST DIE EINE LADEFUNKTION FUER DEN POSTEINGANG — `verteilen/page.tsx` ruft SIE,
  // nicht eine zweite Fassung desselben Ladeblocks. Ohne sie waere ein Austausch von `bufdis()`
  // gegen `aktivePersonen()` genau HIER von keinem Test gesehen worden.
  const { bufdis: bufdisListe, auslastung, tage } = verteilDaten(db, heute);
  // NUR DIE VERTRETUNGSHAELFTE WIRD HIER GEBRAUCHT: die ZAHLEN der Kontextzeile rechnet
  // `lage()` (§3.5), die Zeilen selbst stehen als Zone. Was bleibt, ist die Frage „welche dieser
  // Freigaben pruefe ich in Vertretung" — sie traegt den Klammerzusatz und den Zeilenzusatz.
  const { vertretung: vertretungFreigabe } = freigabeDaten(db, akteur, heute);
  const grund = kartenGrunddaten(db, akteur, heute, lage);

  const darfVert = darfVerteilen(akteur, heute);
  // EINMAL GEBILDET, NICHT JE ZEILE: `koordZusatz` fragt fuer jede Zeile der Freigabe-Zone, ob sie
  // in Vertretung geprueft wird — die Menge dafuer steht fest, sobald `freigabeDaten` gelesen ist.
  const vertretungIds = vertretungFreigabe.map((z) => z.aufgabe.id);

  return (
    <>
      <SeitenKopf
        brotkrume={[{ label: "Aufgaben" }]}
        titel="Verteilung"
        kontext={lage.kontext}
        aktionen={
          // TEXTKNOPF IM SEITENKOPF, ALSO AUSSERHALB DES WRAPPERS (§3.3, §5.2) — der Zaehlriegel
          // misst `aufgaben-flaeche`, und „Aufgabe einstellen" ist kein Zustandswechsel an dem,
          // was die Karte nennt (Regel P).
          <Link href="/neu">Aufgabe einstellen</Link>
        }
      />

      <div data-testid="aufgaben-flaeche">
        <Fuehrungskarte
          lage={lage}
          heute={heute}
          eigenePersonId={akteur.person.id}
          // DIE ZIELLISTE KOMMT AUS `bufdis()`, NICHT AUS `aktivePersonen()` — eine ausgeschiedene
          // Person ist KEIN Verteilziel, und dieser Riegel bleibt woertlich (§11.3).
          verteilen={darfVert ? { bufdis: bufdisListe, auslastung, tage } : null}
          vertretungAnzahl={vertretungFreigabe.length}
          morgen={null}
          {...grund}
        />

        {/* ── 3 · DIE FLAECHE DER ROLLE: „Auslastung diese Woche" — immer da, auch leer (R2) ── */}
        <AuslastungDieseWoche db={db} auslastung={auslastung} tage={tage} />

        {/* ── 4 · DIE UEBRIGEN ANLAESSE ALS ZONEN, IN RANGFOLGE (Regel R3) ── */}
        {lage.zonen.map((zone) => (
          <AnlassZone
            key={zone.art}
            anlass={zone}
            heute={heute}
            eigenePersonId={akteur.person.id}
            zusaetze={Object.fromEntries(
              zone.zeilen.map(
                (a) => [a.id, koordZusatz(zone.art, a, grund.namen, vertretungIds)] as const,
              ),
            )}
            // DER ZEILENWEG FUER `umverteilenAction` (§3.2, §11.4 Schritt 6) — DER GRUND, AUS DEM
            // DIE ZWEI „Überfällig"-ZONEN UEBERHAUPT ZONEN SIND: §3.2 nennt sie woertlich „der
            // einzige Ort, an dem `umverteilenAction` einen Zeilenweg bekommt". Die Karte nennt bei
            // n = 1 genau eine Aufgabe; alles darueber hinaus braucht eine Zeile mit eigenem Knopf,
            // sonst waere „anders zuweisen" ab der zweiten ueberfaelligen Aufgabe nur noch ueber
            // `/a/<id>` erreichbar, das man erst kennen muss.
            aktionen={umverteilAktionen(zone, akteur, heute, darfVert, {
              bufdis: bufdisListe,
              auslastung,
              tage,
            })}
            // DAS DECKELZIEL VON `koordFreigabeOffen` HAENGT AN `darfFreigabenSehen` (§3.5): ein
            // Auftraggeber ohne Koordination bekommt auf `/freigaben` 404 — ein Deckel dorthin
            // waere ein Knopf auf eine 404-Seite.
            deckelErlaubt={zone.art !== "koordFreigabeOffen" || grund.darfFreigabenSehen}
            form={ZONEN_KNAPP.has(zone.art) ? "knapp" : "raster"}
          />
        ))}

        {/*
         * ── 5 · FUSS ── ZWEI NEBENWEGE, IN TINTE STATT IN ROT (Oberflaechen-Runde 2026-08-16,
         * Befund 3): sie sind Navigation, kein Signal. Als rote Links waren sie zwei von zehn
         * Rotstellen auf einer Flaeche, auf der Rot fachliche Bedeutung tragen soll.
         */}
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
          <Link href="/personen" className={s.leiseLink}>
            Personenverwaltung
          </Link>
          <Link href="/archiv" className={s.leiseLink}>
            Archiv
          </Link>
        </div>
      </div>
    </>
  );
}

/**
 * „ANDERS ZUWEISEN" ALS ZEILENAKTION DER BEIDEN „Überfällig"-ZONEN (§3.2, §7 Nr. 3).
 *
 * ══ SEIT DER OBERFLAECHEN-RUNDE 2026-08-16 INLINE STATT ALS MODAL (`_ui/ZuweisenInline.tsx`).
 *    Das Urteil lautete „so wirkt es eher wie eine alte Formularanwendung"; fuer eine Zuweisung
 *    besteht die Entscheidung aus GENAU EINER Angabe, und Knopf → Modal → Formular → Absenden sind
 *    vier Schritte fuer einen. Der Zeilenweg klappt jetzt eine Namensliste MIT der Wochenauslastung
 *    auf, und der Klick auf den Namen IST das Absenden.
 *
 *    FACHLICH AENDERT SICH NICHTS: dieselbe `umverteilenAction`, derselbe Formularschluessel
 *    `zielId`, dieselbe Bedingung `aktionsOptionen(...).umverteilen`, dieselbe Zielliste aus
 *    `bufdis()`. Und die Bestaetigung bleibt — der Satz ueber den geleerten Zeitplan steht als
 *    erste Zeile im aufgeklappten Feld, also weiterhin zwischen Absicht und Absenden.
 *
 *    DER MODALWEG BLEIBT, WO ER MEHR KANN: die Fuehrungskarte und `/a/<id>` benutzen weiter
 *    `UmverteilenKnopf` — dort ist es die Primaeraktion EINER benannten Aufgabe und traegt
 *    zusaetzlich den optionalen Zeitvorschlag.
 *
 * DIE BEDINGUNG JE ZEILE IST `uebergang(a, "umverteilen", akteur, heute).erlaubt` UND NICHTS
 * SONST — ueber `aktionsOptionen`, dieselbe Funktion, die `/a/<id>` benutzt. Ein hier
 * geschriebenes `a.status === "verteilt" && darfVert` waere die zweite Fassung derselben
 * Bedingung an einem dritten Ort (§11.3), und sie driftete beim naechsten Tabellenwechsel weg,
 * ohne dass ein Tor es saehe.
 *
 * DIE FILTERUNG AUF DIE ZWEI ZONEN IST TROTZDEM RICHTIG UND KEINE ZWEITE BEDINGUNG: `umverteilen`
 * waere auch fuer eine nicht ueberfaellige `verteilt`-Aufgabe erlaubt, aber eine solche steht in
 * keiner dieser Zonen (Rang 5a/5b tragen nur ueberfaellige Zeilen, Rang 1 die ohne aktiven
 * Traeger). Die Aufzaehlung sagt also, WELCHE ZONEN einen Zeilenweg bekommen, nicht, WER darf.
 *
 * DER ZAEHLRIEGEL BLEIBT UNBERUEHRT, UND ZWAR JETZT STRUKTURELL: `ZuweisenInline` rendert gar
 * keinen antd-`Button`, also kann in `data-testid="aufgaben-flaeche"` neben der Fuehrungskarte kein
 * zweiter `.ant-btn-primary` entstehen. Vorher hing das an einem `primaer={false}` an der
 * Aufrufstelle — einem Schalter, den man vergessen kann und dessen Vergessen ausser dem
 * Playwright-Zaehlriegel kein Tor gesehen haette.
 */
function umverteilAktionen(
  zone: Anlass,
  akteur: Akteur,
  heute: string,
  darfVert: boolean,
  ziele: { bufdis: PersonRow[]; auslastung: AuslastungZeile[]; tage: string[] },
): Record<string, ReactNode> {
  if (!darfVert || !ZONEN_MIT_UMVERTEILEN.has(zone.art)) return {};
  return Object.fromEntries(
    zone.zeilen
      .filter((a) => aktionsOptionen(a, akteur, heute).umverteilen)
      .map((a) => [
        a.id,
        <ZuweisenInline key={a.id} aufgabe={a} bufdis={ziele.bufdis} auslastung={ziele.auslastung} />,
      ]),
  );
}

/**
 * WELCHE ZONE WELCHE FORM BEKOMMT (Nachtrag „mehr Diversitaet im UI/UX", 2026-08-16).
 *
 * DER BEFUND WAR NICHT NUR DAS FEHLENDE RASTER: auf dieser Flaeche war JEDE Zone eine
 * linksbuendige Liste, nur mit anderer Ueberschrift. Fuenf gestapelte Listen sind derselbe monotone
 * Eindruck wie fuenf verrutschte Knoepfe — die Form sagte nichts darueber, WOFUER die Zone da ist.
 *
 * DER MASSSTAB IST DIE FRAGE, DIE MAN AN DIE ZONE STELLT, NICHT DIE ABWECHSLUNG:
 *
 *  - RASTER, wo man VERGLEICHT. Die zwei „Überfällig"-Zonen sind genau das: vier Zeilen
 *    nebeneinandergehalten, mit der Frage „welche zuerst, und wer traegt sie". Dafuer braucht es
 *    ausgerichtete Spalten UND eine Aktionsspalte — sie sind die einzigen Zonen mit einem
 *    Zeilenweg. „Freigabe offen" bleibt ebenfalls Raster: die Zone ist der Vorlauf zu `/freigaben`,
 *    und die Vertretungsangabe je Zeile ist eine Vergleichsangabe.
 *
 *  - KNAPP, wo man nur wissen will, DASS es sie gibt. `koordZurueckgewiesen` traegt keinen
 *    Zeilenweg (die Koordination hat fuer eine zurueckgewiesene Aufgabe keine Zustandsaktion,
 *    §4.2 Rang 6) und keine Vergleichsfrage. Eine reservierte 150px-Aktionsspur fuer eine Zeile,
 *    die keine Aktion traegt, ist eine Spalte, die etwas verspricht, was nicht kommt.
 *
 * DIE ANGABEN BLEIBEN DIESELBEN, IN DERSELBEN REIHENFOLGE (§10 Prueffrage 7) — es aendert sich die
 * SETZUNG, nicht die Informationsarchitektur.
 *
 * DIE MENGE STEHT HIER UND NICHT IN `ANLASS_TEXT`: die Wahl haengt am Zweck DIESER Flaeche, nicht
 * am Anlass. Derselbe `koordZurueckgewiesen` ist auf `/archiv` sehr wohl eine Vergleichsfrage.
 */
const ZONEN_KNAPP: ReadonlySet<AnlassArt> = new Set<AnlassArt>(["koordZurueckgewiesen"]);

/** Die drei Zonen, deren Zeilen ueberhaupt in `verteilt` stehen koennen (§4.2, Raenge 1, 5a, 5b). */
const ZONEN_MIT_UMVERTEILEN: ReadonlySet<AnlassArt> = new Set<AnlassArt>([
  "koordOhneTraeger",
  "koordUeberfaelligVerteilt",
  "koordUeberfaelligInArbeit",
]);

/**
 * „AUSLASTUNG DIESE WOCHE" (§5.2) — EINE ZEILE JE PERSON MIT DEM WOCHENWERT, auch auf 360px
 * vollstaendig. Das kostet KEINE Medienabfrage: `.lageGitter` benutzt dieselbe
 * `auto-fit`-Formel wie `.wochenGitter` und liefert bei 360px eine Spalte. Wer unterwegs zuweisen
 * soll, braucht die Wochenlast; eine Ansicht, die auf dem Telefon nur einen Tag zeigt, waere bei
 * „gleichrangigem Telefon und Rechner" ein Rollenausfall, kein Komfortverlust.
 *
 * `<section aria-labelledby>` UND `data-person` JE PERSON (§1.3): sobald diese Zone je Person mehr
 * als eine Zahl zeigt — und sie zeigt vier —, ist das die Adressierung, die `data-rolle` allein
 * nicht leisten kann. Kostet nichts und macht die Zone fuer Screenreader bedienbar.
 *
 * ES ENTSTEHT KEINE ZWEITE RECHNUNG: die Wochensumme kommt aus `wochenAuslastungFuerBufdis`
 * (ueber `verteilDaten`), der ueberbuchte Tag aus demselben `tagesBudget`, das auch die
 * Tagesspalten der BuFDi-Achse fuellt.
 */
function AuslastungDieseWoche({
  db,
  auslastung,
  tage,
}: {
  db: DB;
  auslastung: AuslastungZeile[];
  tage: readonly string[];
}) {
  return (
    <section style={{ marginBlockStart: SPACE.xl, marginBlockEnd: SPACE.xl }}>
      {/*
       * „AUSLASTUNG DIESE WOCHE", NICHT MEHR „DIE WOCHE DER DREI" (Nachtrag 2026-08-16).
       *
       * DIE ALTE UEBERSCHRIFT WAR AN EINE STAMMDATENZAHL GEBUNDEN und beim vierten BuFDi schlicht
       * falsch — die Spec hatte das selbst als bewusste Grenze notiert (§8). Eine Ueberschrift, die
       * von einem Datenbestand abhaengt, ist keine: sie wird nicht rot, sie wird nur unwahr, und
       * zwar an dem Tag, an dem jemand eine Person anlegt. Kein Tor der Suite kann das sehen.
       *
       * DER NEUE NAME SAGT AUSSERDEM, WAS DIE ZONE ZEIGT: eine Menge im Verhaeltnis zu einer
       * Kapazitaet, ueber einen Zeitraum. Das passt zur Balkendarstellung darunter — die bildhaften
       * Namen dieses Repos („Die Lagekarte", „Der Abendzettel") sind Namen von ENTWUERFEN, nicht
       * Ueberschriften auf der Flaeche.
       */}
      <h2 className={s.zonenKopf} style={{ ...SCHRIFT.kicker, margin: `0 0 ${SPACE.sm}px` }}>
        Auslastung diese Woche
      </h2>
      {auslastung.length === 0 ? (
        <p>
          Es ist noch keine BuFDi eingetragen.{" "}
          <Link href="/personen" className={s.leiseLink}>
            Personenverwaltung
          </Link>
        </p>
      ) : (
        <div className={s.lageGitter}>
          {auslastung.map((zeile) => (
            <PersonenLage key={zeile.person.id} db={db} zeile={zeile} tage={tage} />
          ))}
        </div>
      )}
    </section>
  );
}

function PersonenLage({
  db,
  zeile,
  tage,
}: {
  db: DB;
  zeile: AuslastungZeile;
  tage: readonly string[];
}) {
  const person = zeile.person;
  const aufgabenDerPerson = aufgabenFuerPerson(db, person.id);
  const routinenDerPerson = routinenFuer(db, person.id);
  // EINMAL GERECHNET, ZWEIMAL GEBRAUCHT — die Tagesstreifen und die Ueberbuchungszeile lesen
  // dieselben Budgets. Zwei Aufrufe von `tagesBudget` je Tag waeren zwei Fassungen derselben Zahl.
  const tagesBudgets = tage.map((tag) => ({
    tag,
    budget: tagesBudget(aufgabenDerPerson, routinenDerPerson, person, tag),
  }));
  const ueberbucht = tagesBudgets.filter((t) => t.budget.ueberbucht);
  const ausserhalb = aufgabenDerPerson.filter((a) => ohnePlatzInDerAchse(a, tage));

  return (
    <section
      aria-labelledby={`lage-${person.id}`}
      data-person={person.id}
      /*
       * `.lageKarte`, NICHT `.tagSpalte` (Oberflaechen-Runde 2026-08-16): die Kachel brauchte eine
       * eigene Fuellung (`--auf-karte`), weil sie auf dem Seitengrund bis auf ihre Linie unsichtbar
       * war — und `.tagSpalte` gehoert dem Wochenplan, den diese Aenderung nicht treffen soll.
       */
      className={s.lageKarte}
    >
      <h3 id={`lage-${person.id}`} className={s.tagKopf} style={{ margin: 0 }}>
        {person.name}
      </h3>
      {/*
       * DER WOCHENWERT IST DIE ZAHL, DERENTWEGEN DIE KACHEL EXISTIERT (§5.2) — er stand in 12px
       * Stahl unter einem 14px-Namen und war damit die unauffaelligste Angabe der Kachel.
       * `.lageWert` hebt Groesse, Gewicht und Farbe; Mono und Tabellenziffern kommen weiter aus
       * `.budget`, damit die Zahlen der drei Kacheln untereinander stehen.
       */}
      <p className={`${s.budget} ${s.lageWert}`} style={{ margin: `${SPACE.xs}px 0 0` }}>
        {fmtStunden(zeile.verplantMinuten)} / {fmtStunden(zeile.sollMinuten)} Std.
      </p>
      {/*
       * DER WOCHENBALKEN — die Zahl daneben bleibt stehen, der Balken ergaenzt sie. Beides, weil
       * eine Laenge das VERHAELTNIS schneller zeigt und die Zahl den WERT genauer nennt; wer den
       * Balken nicht sieht (Screenreader, Ausdruck in Graustufen), verliert nichts.
       */}
      <div style={{ marginBlockStart: SPACE.sm }}>
        <Balken verplant={zeile.verplantMinuten} soll={zeile.sollMinuten} />
      </div>
      {/*
       * DIE FUENF TAGE ALS STREIFEN — hier wird sichtbar, was bisher nur dastand: eine Person kann
       * auf 6 von 39 Wochenstunden stehen und am Montag trotzdem doppelt verplant sein. Die
       * Wochensumme kann das strukturell nicht zeigen.
       */}
      <div className={s.lastWoche} style={{ marginBlockStart: SPACE.xs }}>
        {tagesBudgets.map(({ tag, budget }) => (
          <Balken
            key={tag}
            verplant={budget.verplantMinuten}
            soll={budget.sollMinuten}
            ohneMarke
          />
        ))}
      </div>
      {/*
       * DIE FUENF KUERZEL — nachgetragen, weil die Streifen ohne sie nicht lesbar waren (im
       * Bildschirmabzug gesehen, nicht vermutet): fuenf graue Balken ohne Beschriftung sind fuer
       * jeden, der die Zone nicht gebaut hat, Zierrat. Erst „Mo Di Mi Do Fr" darunter macht aus der
       * Grafik eine Aussage ueber die WOCHE — dass Alina montags und mittwochs arbeitet und
       * dienstags nicht, steht in keiner der Textzeilen.
       *
       * DASSELBE GITTER WIE DIE STREIFEN (`.lastWoche`), damit Kuerzel und Streifen dieselben fuenf
       * Spuren teilen. Eine zweite Aufteilung (fuenf `flex: 1`-Spannen) saehe bei gleichen Breiten
       * gleich aus und liefe beim ersten abweichenden Abstand auseinander.
       */}
      <div
        className={`${s.lastWoche} ${s.lastTage}`}
        style={{ ...SCHRIFT.neben, marginBlockStart: SPACE.xs }}
      >
        {tagesBudgets.map(({ tag }) => (
          <span key={tag}>{fmtWochentagKurz(tag)}</span>
        ))}
      </div>
      <p style={{ ...SCHRIFT.neben, margin: `${SPACE.sm}px 0 0` }}>
        {aufgabenInWoche(aufgabenDerPerson, tage)} Aufgaben
      </p>
      {/*
       * AUSLASTUNG IST NEUTRAL/GRAPHIT, NIE STATUSFARBE (Modulspec §9.3) — `.budgetUeberbucht`
       * traegt Kante PLUS Wort, keinen roten Balken. Die Bedeutung kommt nie aus der Kante allein.
       */}
      {ueberbucht.length === 0 ? (
        <p style={{ ...SCHRIFT.neben, margin: `${SPACE.xs}px 0 0` }}>kein Tag überbucht</p>
      ) : (
        ueberbucht.map(({ tag, budget }) => (
          <p
            key={tag}
            className={`${s.budget} ${s.budgetUeberbucht}`}
            style={{ margin: `${SPACE.xs}px 0 0` }}
          >
            {/*
             * `.budgetHinweis` UM DEN TEXTTEIL — SAMT DEM LEERZEICHEN DAHINTER (e2e-Fund des
             * 768/820px-Sweeps, nachgemessen: `scrollWidth` 274 in einer 213px breiten Zelle).
             * `.budget` traegt `white-space: nowrap`, damit „9,17 / 7,8 Std." nie mitten in der
             * Zahl bricht; in einer Tagesspalte der BuFDi-Achse reicht die Zeile dafuer, in einer
             * `.lageGitter`-Zelle NICHT MEHR — dort steht zusaetzlich der Tag und das Wort davor.
             *
             * DAS FUEHRENDE/NACHFOLGENDE LEERZEICHEN GEHOERT IN DIE SPANNE, nicht davor: die
             * Umbruchgelegenheit LIEGT an dem Leerzeichen, und ob sie gilt, entscheidet das
             * `white-space` des Elements, das es ENTHAELT (dieselbe Ueberlegung, die
             * `Wochenplan.tsx`s `BudgetZeile` und der Kommentar an `.budgetHinweis` schon fuehren).
             * Bliebe es beim `<p>`, verboete `nowrap` dort die Gelegenheit weiterhin, und die
             * Klasse waere eine wirkungslose Attrappe.
             *
             * KEINE NEUE CSS-REGEL: `.budgetHinweis` existiert seit Aufgabe 21 fuer genau diesen
             * Defekt. Die Zahlen bleiben zusammen, nur der Text davor darf umbrechen.
             */}
            <span className={s.budgetHinweis}>{`${fmtTagKurz(tag)} überbucht: `}</span>
            {fmtStunden(budget.verplantMinuten)} / {fmtStunden(budget.sollMinuten)} Std.
          </p>
        ))
      )}
      {ausserhalb.length > 0 ? (
        <p style={{ ...SCHRIFT.neben, margin: `${SPACE.xs}px 0 0` }}>
          {ausserhalb.length} außerhalb dieser Woche
        </p>
      ) : null}
      <p style={{ margin: `${SPACE.sm}px 0 0` }}>
        <Link href={`/plan/${person.id}`} className={s.leiseLink}>
          Zeitplan ansehen
        </Link>
      </p>
    </section>
  );
}

/**
 * DER ROLLENZUSATZ EINER KOORDINATIONSZEILE (§3.6, §10 Prueffrage 7) — GENAU EINE Angabe je Zeile,
 * als STRING in dieser Server Component gebildet (nie eine Funktion, Falle 9). Welche Angabe das
 * ist, haengt am Anlass: der Posteingang nennt den Auftraggeber, alles Zugewiesene den Traeger,
 * und die Freigabe zusaetzlich, ob sie in Vertretung gepruft wird — das ist die eine Auskunft, die
 * `/freigaben` sonst als einziger Ort traegt.
 */
function koordZusatz(
  art: AnlassArt,
  a: AufgabeRow,
  namen: Record<string, string>,
  vertretungIds: readonly string[],
): string | null {
  if (art === "koordPosteingang" || art === "koordPosteingangUeberfaellig") {
    return `Von ${namen[a.erstellerId] ?? "—"}`;
  }
  if (a.zugewiesenAn === null) return null;
  const name = namen[a.zugewiesenAn] ?? "—";
  if (art === "koordFreigabeOffen" && vertretungIds.includes(a.id)) {
    return `${name} · in Vertretung für ${namen[a.prueferId ?? ""] ?? "—"}`;
  }
  return name;
}
