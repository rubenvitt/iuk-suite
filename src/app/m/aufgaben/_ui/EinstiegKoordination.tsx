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
import { fmtTagKurz } from "../_lib/datum";
import { aktionsOptionen } from "../_lib/aktionsOptionen";
import { kartenGrunddaten } from "../_lib/kartendaten";
import type { Anlass, Lage } from "../_lib/lage";
import { darfVerteilen, type Akteur } from "../_lib/zugang";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { AnlassZone } from "./AnlassZone";
import { Fuehrungskarte } from "./Fuehrungskarte";
import { SeitenKopf } from "./SeitenKopf";
import { UmverteilenKnopf } from "./VerteilenDialog";
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
 * DIE FLAECHE DER ROLLE IST NICHT DER POSTEINGANG, SONDERN „DIE WOCHE DER DREI" (§5.2). Der Grund
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

        {/* ── 3 · DIE FLAECHE DER ROLLE: „Die Woche der drei" — immer da, auch leer (R2) ── */}
        <WocheDerDrei db={db} auslastung={auslastung} tage={tage} />

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
          />
        ))}

        {/* ── 5 · FUSS ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
          <Link href="/personen">Personenverwaltung</Link>
          <Link href="/archiv">Archiv</Link>
        </div>
      </div>
    </>
  );
}

/**
 * „ANDERS ZUWEISEN" ALS ZEILENAKTION DER BEIDEN „Überfällig"-ZONEN (§3.2, §7 Nr. 3).
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
 * `primaer={false}` IST DER GANZE PUNKT DES SCHALTERS: dieselbe Aktion steht bei n = 1 in der
 * Fuehrungskarte als Primaerknopf. Stuenden beide auf `type="primary"`, traege
 * `data-testid="aufgaben-flaeche"` bei einer fuehrenden Karte PLUS einer Ueberfaellig-Zone zwei
 * `.ant-btn-primary` — und das saehe kein Tor ausser dem Zaehlriegel in Playwright.
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
        <UmverteilenKnopf
          key={a.id}
          aufgabe={a}
          bufdis={ziele.bufdis}
          auslastung={ziele.auslastung}
          tage={ziele.tage}
          primaer={false}
        />,
      ]),
  );
}

/** Die drei Zonen, deren Zeilen ueberhaupt in `verteilt` stehen koennen (§4.2, Raenge 1, 5a, 5b). */
const ZONEN_MIT_UMVERTEILEN: ReadonlySet<AnlassArt> = new Set<AnlassArt>([
  "koordOhneTraeger",
  "koordUeberfaelligVerteilt",
  "koordUeberfaelligInArbeit",
]);

/**
 * „DIE WOCHE DER DREI" (§5.2) — EINE ZEILE JE PERSON MIT DEM WOCHENWERT, auch auf 360px
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
function WocheDerDrei({
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
      <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>Die Woche der drei</h2>
      {auslastung.length === 0 ? (
        <p>
          Es ist noch keine BuFDi eingetragen. <Link href="/personen">Personenverwaltung</Link>
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
  const ueberbucht = tage
    .map((tag) => ({ tag, budget: tagesBudget(aufgabenDerPerson, routinenDerPerson, person, tag) }))
    .filter((t) => t.budget.ueberbucht);
  const ausserhalb = aufgabenDerPerson.filter((a) => ohnePlatzInDerAchse(a, tage));

  return (
    <section
      aria-labelledby={`lage-${person.id}`}
      data-person={person.id}
      className={s.tagSpalte}
    >
      <h3 id={`lage-${person.id}`} className={s.tagKopf} style={{ margin: 0 }}>
        {person.name}
      </h3>
      <p className={s.budget} style={{ margin: `${SPACE.xs}px 0 0` }}>
        {fmtStunden(zeile.verplantMinuten)} / {fmtStunden(zeile.sollMinuten)} Std.
      </p>
      <p style={{ ...SCHRIFT.neben, margin: `${SPACE.xs}px 0 0` }}>
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
            {fmtTagKurz(tag)} überbucht: {fmtStunden(budget.verplantMinuten)} /{" "}
            {fmtStunden(budget.sollMinuten)} Std.
          </p>
        ))
      )}
      {ausserhalb.length > 0 ? (
        <p style={{ ...SCHRIFT.neben, margin: `${SPACE.xs}px 0 0` }}>
          {ausserhalb.length} außerhalb dieser Woche
        </p>
      ) : null}
      <p style={{ margin: `${SPACE.sm}px 0 0` }}>
        <Link href={`/plan/${person.id}`}>Zeitplan ansehen</Link>
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
