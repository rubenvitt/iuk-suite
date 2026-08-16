import type { ReactNode } from "react";
import { Button } from "antd";
import {
  einplanenAnnehmenAction,
  startenAction,
  wiederaufnehmenAction,
  zuruecksetzenAction,
} from "../actions";
import type { AuslastungZeile } from "../_db/queries";
import type { AufgabeRow, PersonRow, VerlaufRow } from "../_db/schema";
import type { AktionsOptionen } from "../_lib/aktionsOptionen";
import {
  ANLASS_TEXT,
  FUEHRUNG_EREIGNIS,
  KARTEN_TEXT,
  NACHWEIS_ART_TEXT,
  fmtDauer,
  type AnlassArt,
  type SatzDaten,
} from "../_lib/anzeige";
import { fmtTagKurz, isoTag, tageZwischen } from "../_lib/datum";
import type { Anlass, Lage } from "../_lib/lage";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { PrioritaetChip, StatusChip } from "./Chip";
import { EinplanenInline } from "./EinplanenInline";
import { FreigabeAktionen } from "./FreigabeZone";
import { Frist, fristLage } from "./Frist";
import { FertigMeldenKnopf } from "./KartenAktion";
import { UmverteilenKnopf, VerteilenKnopf } from "./VerteilenDialog";
import { ZurueckziehenKnopf } from "./ZurueckziehenKnopf";
import s from "./aufgaben.module.css";

/*
 * DIE FUEHRUNGSKARTE (Oberflaechen-Spec 2026-08-16 §3.4, §4.2, §6.7) — die eine Sache, die diese
 * Person jetzt tun soll, samt der Aktion, die sie tut.
 *
 * ══ DIE NAHT (§6.7) — VIER DER ELF FALLEN TREFFEN HIER ZUSAMMEN, UND KEIN TOR AUSSER PLAYWRIGHT
 *    SIEHT EINEN FEHLGRIFF: `typecheck`, `lint`, `build` und Vitest bleiben alle gruen, nur ein
 *    echter Abruf zeigt den HTTP 500. Deshalb steht die Entscheidung hier ausgeschrieben, und
 *    `Fuehrungskarte.test.tsx` scannt den Quelltext dieser Datei darauf.
 *
 *  - KEIN "use client" (Falle 6 in der Gegenrichtung): diese Datei ist eine SERVER COMPONENT. Sie
 *    rendert `<Frist>`, Chips, `<h2>` und die feldlosen `<form action>`, und ihre Daten kommen aus
 *    `lage()`, das server-only ist (§4.1).
 *  - JEDE AKTION MIT EINEM FUNKTIONS-PROP STEHT IN EINER EIGENEN, DIREKT IMPORTIERTEN CLIENT-INSEL
 *    (Falle 9): `ZurueckziehenKnopf` (`Popconfirm` braucht `onConfirm`), `VerteilenKnopf`
 *    (`Modal` braucht `onCancel`), `FreigabeAktionen` (Zurueckweisen-Modal) und `FertigMeldenKnopf`
 *    (`useActionState`). Aus einer Server Component heraus waere jede dieser Funktionen
 *    „Functions cannot be passed directly to Client Components".
 *  - KEINE `columns[].render`-FUNKTION entsteht hier (Falle 9) — die Karte hat keine Tabelle.
 *  - KEIN COMPOUND-ZUGRIFF AUF antd (Falle 1): `<h2>` ist natives HTML mit `SCHRIFT.unterTitel`,
 *    kein `Typography.Title`. `Button` allein ist sicher.
 *  - KEIN ICON UEBER DEN NACKTEN SPEZIFIZIERER (Falle 7): Zeichen kommen ausschliesslich aus
 *    `./ikonen` — hier ueber `<Frist>`, das die einzige Stelle mit einem Zeichen ist.
 *
 * ══ EIGENES MARKUP, KEIN antd-`Card` UND KEIN `Alert` (§9/S5). `.fuehrung { padding: 24px }` und
 *    `.ant-card-body` sind beide (0,1,0); antds Stylesheet laedt spaeter und gewaenne durch
 *    Dokumentreihenfolge (Falle 5) — still, und kein Gate saehe es. Ohne antd-Komponente gibt es
 *    keinen Gegenspieler. Ein `Alert type="error"` waere zusaetzlich Suite-Rot auf einer
 *    Datenflaeche (Falle 3).
 *
 * ══ REGEL P (§3.4): DER PRIMAERKNOPF GEHOERT IMMER ZU DEM, WAS UEBER IHM STEHT. Die Karte nennt
 *    genau EINEN Anlass, und die Primaeraktion ist die Zustandsaktion DIESES Anlasses — nie die
 *    eines anderen. Gibt es fuer diese Person mit dieser Aufgabe in diesem Zustand keine
 *    Zustandsaktion, gibt es KEINEN Primaerknopf; die Abwesenheit IST die Auskunft. „Genau ein
 *    Primaerknopf pro Seite" ist damit als HOECHSTENS EINER gelesen — ein roter Knopf ohne
 *    Zustandswechsel waere eine Behauptung.
 *
 * ══ SCHRITT 6 (§11.4) HAT `umverteilenAction` EINGEHAENGT: „Anders zuweisen (der Zeitplan wird
 *    dabei geleert)" traegt jetzt `koordOhneTraeger` (Rang 1) und `koordUeberfaelligVerteilt`
 *    (Rang 5a). Die Bedingung steht an EINER Stelle (`umverteilenKnopf()` unten) und liest
 *    `optionen.umverteilen` — also `uebergang()` —, nie einen handgeschriebenen Zustandsvergleich.
 *    `koordUeberfaelligInArbeit` (Rang 5b) bleibt OHNE Primaerknopf, und genau das ist der Zweck
 *    der Aufspaltung von Rang 5: `_lib/lebenszyklus.ts` kennt `umverteilen` ausschliesslich aus
 *    `verteilt`, ein Knopf daneben waere einer, den der Server danach ablehnt.
 *
 * ══ DER SELEKTOR LIEFERT DATEN, DIESE DATEI STELLT DAR (§4.1). Jeder Satz kommt aus
 *    `_lib/anzeige.ts` (`ANLASS_TEXT`, `KARTEN_TEXT`, `FRIST_TEXT`) — fuenf davon tragen das Wort
 *    „ueberfaellig", das der Quelltext-Scan aus §6.6 im ganzen Modul nur dort und in `Frist.tsx`
 *    zulaesst. Diese Datei formuliert deshalb KEINEN eigenen Satz ueber Dringlichkeit.
 */

/**
 * WELCHER NAME IM SATZ STEHT — je Anlass genau einer, und die Wahl ist nie beliebig: „Zugewiesen
 * an X" meint den Traeger, „Von X" den Auftraggeber, „Zurueckgewiesen von X" den, der es getan hat
 * (aus dem Verlauf, nicht aus `prueferId`, das seither gewechselt haben kann).
 */
type Namensquelle = "traeger" | "ersteller" | "ereignisAkteur";

const NAMENSQUELLE: Partial<Record<AnlassArt, Namensquelle>> = {
  koordOhneTraeger: "traeger",
  koordPosteingangUeberfaellig: "ersteller",
  koordPosteingang: "ersteller",
  koordFreigabeOffen: "traeger",
  koordUeberfaelligVerteilt: "traeger",
  koordUeberfaelligInArbeit: "traeger",
  koordZurueckgewiesen: "traeger",
  bufdiZurueckgewiesen: "ereignisAkteur",
  bufdiWartetAufEinplanung: "ersteller",
  auftragFreigabe: "traeger",
  auftragUeberfaellig: "traeger",
};

/** Die drei Anlaesse, deren Karte die Erklaerung der Aufgabe zeigt (§4.2). */
const MIT_BESCHREIBUNG: ReadonlySet<AnlassArt> = new Set<AnlassArt>([
  "koordPosteingang",
  "koordPosteingangUeberfaellig",
  "auftragUnverteilt",
]);

/** Die zwei Anlaesse, deren Karte die Nachweispflicht nennt (§4.2, Koordination Rang 2/3). */
const MIT_NACHWEISPFLICHT: ReadonlySet<AnlassArt> = new Set<AnlassArt>([
  "koordPosteingang",
  "koordPosteingangUeberfaellig",
]);

export interface FuehrungskarteProps {
  lage: Lage;
  heute: string;
  /** `person.id -> name`, aus bereits geladenen Personen (`namenMap`) — nie eine Abfrage je Zeile. */
  namen: Record<string, string>;
  eigenePersonId: string;
  /**
   * `aktionsOptionen` DER FUEHRENDEN ZEILE, und nur wenn es GENAU EINE gibt. Bei n > 1 nennt die
   * Karte die Zahl und greift keine Aufgabe heraus (§4.3) — eine Zustandsaktion muesste dann auf
   * eine von vielen wirken, und der Knopf loege ueber seinen Gegenstand.
   */
  optionen: AktionsOptionen | null;
  /** `darfPlanAendern(akteur, akteur.person.id, heute)` — traegt die drei Plan-Aktionen (§4.2). */
  darfPlanAendern: boolean;
  /** `darfFreigabenSehen(akteur, heute)` — sonst waere „Freigaben ansehen" ein Knopf auf 404. */
  darfFreigabenSehen: boolean;
  /** `darfRoutinenVerwalten(akteur, heute)` — sonst wirft `/routinen` `notFound()`. */
  darfRoutinenVerwalten: boolean;
  /** Die Ziele des Verteil-Modals; `null` fuer jede Rolle, die nicht verteilen darf. */
  verteilen: { bufdis: PersonRow[]; auslastung: AuslastungZeile[]; tage: string[] } | null;
  /** `naechsterArbeitstag(heute)` — Wochenendsatz und „Auf morgen schieben". */
  naechsterArbeitstag: string;
  /** Die Verlaufszeile aus `FUEHRUNG_EREIGNIS`, sofern der fuehrende Anlass eine braucht. */
  ereignis: VerlaufRow | null;
  /** BuFDi-Ruhefall: was am naechsten Arbeitstag liegt (§4.2, Ruhe-Zeile). */
  morgen: AufgabeRow | null;
  /**
   * WIE VIELE DER OFFENEN FREIGABEN IN VERTRETUNG SIND (§3.5) — der Klammerzusatz ist eine
   * PRAEZISIERUNG derselben Zahl, keine zweite, und er kommt aus `freigabeDaten(db, akteur,
   * heute).vertretung`, nicht aus einer hier nachgebauten Bedingung. Fuer jede Rolle ohne
   * Vertretungssicht ist er 0.
   */
  vertretungAnzahl: number;
}

export function Fuehrungskarte(props: FuehrungskarteProps) {
  const { lage } = props;
  const anlass = lage.fuehrung;
  const erste = anlass.zeilen[0] ?? null;
  const beschriftung = ANLASS_TEXT[anlass.art];
  const daten = satzDaten(anlass, props);
  const kopfsatz = satzFuer(anlass, daten);
  const { primaer, sekundaer } = aktionen(props, anlass, erste);

  return (
    <section data-rolle="fuehrung" className={s.fuehrung}>
      {beschriftung.kicker !== null ? (
        <p className={s.fuehrungKicker} style={{ margin: 0 }}>
          {beschriftung.kicker(daten.name === "" ? null : daten.name)}
        </p>
      ) : null}

      {/*
       * DIE UEBERSCHRIFT IST DER TITEL, WENN ES GENAU EINE AUFGABE GIBT — sonst der Satz mit der
       * ZAHL (§4.3): „eine Karte, die aus zehn eines herausgreift, verdeckt neun. Die Zahl
       * verdeckt nichts." Natives `<h2>` mit `SCHRIFT.unterTitel`, nie `Typography.Title`
       * (Falle 1).
       */}
      <h2 style={{ ...SCHRIFT.unterTitel, margin: `${SPACE.xs}px 0 0` }}>
        {anlass.einzeln && erste !== null ? erste.titel : kopfsatz}
      </h2>

      {anlass.einzeln && erste !== null ? (
        <Einzelkoerper anlass={anlass} erste={erste} satz={kopfsatz} props={props} />
      ) : null}

      {anlass.art === "bufdiRuhe" ? (
        <p style={{ ...SCHRIFT.text, margin: `${SPACE.sm}px 0 0` }}>{ruheZusatz(props.morgen)}</p>
      ) : null}

      {primaer !== null || sekundaer.length > 0 ? (
        <div className={s.knopfzeile} style={{ marginBlockStart: SPACE.lg }}>
          {primaer}
          {sekundaer}
        </div>
      ) : null}

      {lage.alsNaechstes !== null ? (
        <AlsNaechstes anlass={lage.alsNaechstes} props={props} />
      ) : null}
    </section>
  );
}

/**
 * DER KOERPER BEI n = 1 — Erklaerung bzw. Begruendung, dann die Metazeile mit Chips und `<Frist>`.
 *
 * DIE BEGRUENDUNG EINER ZURUECKWEISUNG STEHT WOERTLICH DA (§4.2): sie ist der ganze Wert einer
 * Zurueckweisung. Eine Karte, die nur „Zurückgewiesen" sagt, zwingt zum Oeffnen von `/a/<id>`,
 * um zu erfahren, warum man dort ist.
 */
function Einzelkoerper({
  anlass,
  erste,
  satz,
  props,
}: {
  anlass: Anlass;
  erste: AufgabeRow;
  satz: string;
  props: FuehrungskarteProps;
}) {
  const begruendung = FUEHRUNG_EREIGNIS[anlass.art] === "zurueckgewiesen" ? props.ereignis?.notiz : null;

  return (
    <>
      {MIT_BESCHREIBUNG.has(anlass.art) ? (
        <p style={{ ...SCHRIFT.text, margin: `${SPACE.sm}px 0 0` }}>{erste.beschreibung}</p>
      ) : null}
      {/* Der Leerstring heisst „kein Satz", nicht „leerer Satz" (s. `KARTEN_TEXT`). */}
      {satz !== "" ? <p style={{ ...SCHRIFT.text, margin: `${SPACE.sm}px 0 0` }}>{satz}</p> : null}
      {begruendung ? (
        <p style={{ ...SCHRIFT.text, margin: `${SPACE.sm}px 0 0` }}>„{begruendung}“</p>
      ) : null}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: SPACE.sm,
          marginBlockStart: SPACE.md,
        }}
      >
        <StatusChip status={erste.status} />
        <PrioritaetChip prioritaet={erste.prioritaet} />
        <Frist aufgabe={erste} heute={props.heute} />
        <span>{fmtDauer(erste.dauerMinuten)}</span>
        {MIT_NACHWEISPFLICHT.has(anlass.art) ? (
          <span>
            {erste.nachweisPflicht
              ? `Nachweis: ${NACHWEIS_ART_TEXT[erste.nachweisArt]}`
              : "ohne Nachweis"}
          </span>
        ) : null}
      </div>
    </>
  );
}

/**
 * DIE ZEILE „ALS NAECHSTES" — EIN SATZ, KEIN KNOPF (§4.2). Der zweite Handlungsort ist genau der
 * Defekt, an dem der unterlegene Entwurf gescheitert ist: die Karte erklaerte Aufgabe X und ihr
 * Knopf startete Aufgabe Y. Die Ableitung ist fuer alle drei Rollen dieselbe — `anlaesse[1]`,
 * sonst der Negativsatz der Rolle, im Ruhefall entfaellt die Zeile ganz (das entscheidet
 * `_lib/lage.ts`, nicht diese Datei).
 */
function AlsNaechstes({ anlass, props }: { anlass: Anlass; props: FuehrungskarteProps }) {
  const daten = satzDaten(anlass, props);
  const satz = KARTEN_TEXT[anlass.art].naechstes?.(daten) ?? ANLASS_TEXT[anlass.art].satz ?? "";
  if (satz === "") return null;
  return (
    <div
      style={{
        /*
         * `--auf-stahl`, NICHT `--auf-linie`: diese Haarlinie steht als einzige des Moduls auf
         * `--auf-fuehrung`, und `--auf-linie` (`#d9dde1`) ist HELLER als die Toenung (`#e0e4e7`) —
         * die Trennung waere unsichtbar bis invertiert. Dieselbe Ueberlegung wie bei der Kante der
         * Karte selbst (s. den Kommentar bei `.fuehrung`).
         */
        borderBlockStart: "1px solid var(--auf-stahl)",
        marginBlockStart: SPACE.lg,
        paddingBlockStart: SPACE.md,
      }}
    >
      <p className={s.fuehrungKicker} style={{ margin: 0 }}>
        Als Nächstes
      </p>
      <p style={{ ...SCHRIFT.text, margin: `${SPACE.xs}px 0 0` }}>{satz}</p>
    </div>
  );
}

/**
 * DER SATZ EINES ANLASSES — `einzeln` bei hoechstens EINER Zeile, `mehrere` darueber, sonst der
 * feste Satz aus `ANLASS_TEXT`.
 *
 * „HOECHSTENS EINE" UND NICHT „GENAU EINE": `bufdiKeinArbeitstag` traegt NULL Zeilen und trotzdem
 * einen Satz („Wochenende. Nächster Arbeitstag: …", §4.2 Rang 4) — er ist kein Bestand, sondern
 * eine Aussage ueber den Tag. Mit `anlass.einzeln` allein bliebe die Karte dort stumm, und zwar
 * still: `mehrere` ist fuer diesen Anlass `null`, `satz` ebenfalls.
 */
function satzFuer(anlass: Anlass, daten: SatzDaten): string {
  const text = KARTEN_TEXT[anlass.art];
  const gebaut =
    anlass.zeilen.length <= 1 ? text.einzeln?.(daten) : text.mehrere?.(daten);
  return gebaut ?? ANLASS_TEXT[anlass.art].satz ?? "";
}

/** Der Zusatz der BuFDi-Ruhekarte (§4.2, Ruhe-Zeile) — was morgen liegt, oder dass nichts liegt. */
function ruheZusatz(morgen: AufgabeRow | null): string {
  if (morgen === null) return "Diese Woche ist alles eingeplant.";
  return `Morgen: ${morgen.titel} · ${fmtDauer(morgen.dauerMinuten)}.`;
}

/**
 * DIE FELDLISTE FUER `KARTEN_TEXT` — an EINER Stelle gefuellt, damit kein Satz sich seine Zahl
 * selbst sucht. Jeder Wert ist serialisierbar und stammt aus der FUEHRENDEN Zeile; welcher Name
 * und welcher Tag gemeint sind, entscheidet der Anlass (s. `NAMENSQUELLE`).
 */
function satzDaten(anlass: Anlass, props: FuehrungskarteProps): SatzDaten {
  const erste = anlass.zeilen[0] ?? null;
  const heute = props.heute;
  return {
    anzahl: anlass.zeilen.length,
    titel: erste?.titel ?? "",
    dauerMinuten: erste?.dauerMinuten ?? 0,
    status: erste?.status ?? "eingegangen",
    // `tageZwischen` ist nie negativ zu lesen: die ueberfaelligen Saetze stehen nur an Sprossen,
    // deren Praedikat `faelligAm < heute` bereits erzwungen hat.
    tageSeitFrist: erste !== null && erste.faelligAm < heute ? tageZwischen(erste.faelligAm, heute) : 0,
    tageLiegezeit: erste === null ? 0 : Math.max(0, tageZwischen(isoTag(erste.erstelltAm), heute)),
    name: nameFuer(anlass.art, erste, props),
    tag: tagFuer(anlass.art, erste, props),
    fristText: erste === null ? "" : fristLage(erste, heute).text,
    vertretung: Math.min(props.vertretungAnzahl, anlass.zeilen.length),
  };
}

function nameFuer(art: AnlassArt, erste: AufgabeRow | null, props: FuehrungskarteProps): string {
  const quelle = NAMENSQUELLE[art];
  if (quelle === undefined) return "";
  if (quelle === "ereignisAkteur") {
    // DER, DER ZURUECKGEWIESEN HAT — aus dem Verlauf. Der Rueckfall auf `prueferId` ist benannt und
    // nicht still: eine Aufgabe ohne Verlaufszeile gibt es im Betrieb nicht, aber eine Karte, die
    // bei einer fehlenden Zeile den Kicker halbiert („ZURÜCKGEWIESEN VON "), waere schlimmer als
    // eine, die den heute eingetragenen Pruefer nennt.
    const akteur = props.ereignis?.akteurId ?? erste?.prueferId ?? null;
    return akteur === null ? "" : (props.namen[akteur] ?? "");
  }
  if (erste === null) return "";
  const id = quelle === "traeger" ? erste.zugewiesenAn : erste.erstellerId;
  return id === null ? "" : (props.namen[id] ?? "");
}

function tagFuer(art: AnlassArt, erste: AufgabeRow | null, props: FuehrungskarteProps): string {
  if (art === "bufdiKeinArbeitstag") return fmtTagKurz(props.naechsterArbeitstag);
  if (art === "bufdiZurueckgewiesen" || art === "bufdiInArbeit") {
    return props.ereignis === null ? "" : fmtTagKurz(isoTag(props.ereignis.ts));
  }
  if (art === "bufdiWartetAufEinplanung") {
    if (erste === null) return "";
    // BEI n > 1 NENNT DER SATZ DIE FRUEHESTE FRIST, bei n = 1 den Zeitvorschlag — beides ist „der
    // Tag, den dieser Satz meint", und beide kommen aus derselben, nach `faelligAm` sortierten
    // Liste (`_lib/lage.ts`s totale Ordnung).
    if (erste.vorschlagDatum === null) return "";
    return `${fmtTagKurz(erste.vorschlagDatum)}${erste.vorschlagUhrzeit ? `, ${erste.vorschlagUhrzeit}` : ""}`;
  }
  return erste === null ? "" : fmtTagKurz(erste.faelligAm);
}

/**
 * DIE AKTIONEN JE BELEGUNG (§4.2, Spalten „Primaeraktion" und „Sekundaer").
 *
 * HOECHSTENS EIN PRIMAERKNOPF, UND ER IST IMMER DIE ZUSTANDSAKTION DES GENANNTEN ANLASSES
 * (Regel P). Bei n > 1 gibt es nur dort einen, wo eine FLAECHE existiert, die n verarbeitet
 * (`/verteilen`, `/freigaben`, `/plan/<eigene>`) — eine Zustandsaktion wirkte sonst auf eine von
 * vielen, und die Karte hat gerade gesagt, dass keine bevorzugt ist (§4.3).
 */
/**
 * „ANDERS ZUWEISEN (DER ZEITPLAN WIRD DABEI GELEERT)" — DIE PRIMAERAKTION DER RAENGE 1 UND 5a
 * (§4.2, §7 Nr. 3). Eine Stelle fuer beide, weil die Bedingung an beiden dieselbe ist.
 *
 * DREI BEDINGUNGEN, UND JEDE HAT IHREN EIGENEN GRUND:
 *
 *  - `einzeln`: NUR BEI n = 1. §4.2 fuehrt den Knopf in der Zeile von Rang 5a ohne Angabe zu `n`;
 *    das ist die eine Stelle, an der die Spec sich selbst gegenuebersteht, und sie loest sich nur
 *    in eine Richtung. §4.3 sagt fuer n > 1: „keine Aufgabe ist bevorzugt", und der Kopfkommentar
 *    von `aktionen()` schreibt aus, dass es bei n > 1 nur dort einen Primaerknopf gibt, wo eine
 *    FLAECHE existiert, die n verarbeitet. Fuer Rang 5a gibt es keine: §3.5 gibt beiden
 *    „Überfällig"-Zonen ausdruecklich KEIN Deckelziel, und §3.1 verbietet, fuer „ueberfaellig"
 *    eine Route zu erfinden. Ein Modal auf die erste von neun ueberfaelligen Aufgaben waere genau
 *    der Griff ins Beliebige, den §4.3 verbietet — die Zone darunter fuehrt jede Zeile einzeln.
 *  - `optionen.umverteilen`: die Zustandsaktion, aus `uebergang()` (s. die zwei Aufrufstellen).
 *  - `props.verteilen !== null`: ohne Zielliste kann der Modal keine Person anbieten. Das ist
 *    DASSELBE Praedikat, das die Karte fuer „Verteilen" schon benutzt (`darfVerteilen` beim
 *    Aufrufer) — kein zweites.
 *
 * `primaer` STEHT AUSDRUECKLICH DA, obwohl `true` die Vorgabe ist: derselbe Knopf steht als
 * ZEILENAKTION in den zwei „Überfällig"-Zonen mit `primaer={false}`, und die Sichtbarkeit dieses
 * Unterschieds an BEIDEN Aufrufstellen ist billiger als ein zweiter Primaerknopf in
 * `data-testid="aufgaben-flaeche"`, den ausser Playwright kein Tor sieht.
 */
function umverteilenKnopf(
  props: FuehrungskarteProps,
  erste: AufgabeRow | null,
  einzeln: boolean,
): ReactNode {
  if (!einzeln || erste === null) return null;
  if (props.optionen?.umverteilen !== true) return null;
  if (props.verteilen === null) return null;
  return (
    <UmverteilenKnopf
      aufgabe={erste}
      bufdis={props.verteilen.bufdis}
      auslastung={props.verteilen.auslastung}
      tage={props.verteilen.tage}
      primaer
    />
  );
}

function aktionen(
  props: FuehrungskarteProps,
  anlass: Anlass,
  erste: AufgabeRow | null,
): { primaer: ReactNode; sekundaer: ReactNode[] } {
  const eigen = props.eigenePersonId;
  const einzeln = anlass.einzeln && erste !== null;
  const optionen = props.optionen;
  const ansehen = (a: AufgabeRow, text = "Aufgabe ansehen"): ReactNode => (
    <Button key="ansehen" href={`/a/${a.id}`}>
      {text}
    </Button>
  );
  const zeitplan = (a: AufgabeRow): ReactNode =>
    a.zugewiesenAn === null ? null : (
      <Button key="zeitplan" href={`/plan/${a.zugewiesenAn}`}>
        Zeitplan von {props.namen[a.zugewiesenAn] ?? "—"}
      </Button>
    );

  switch (anlass.art) {
    // ── Koordination ────────────────────────────────────────────────────────────────────────────
    case "koordOhneTraeger":
      // „ANDERS ZUWEISEN (DER ZEITPLAN WIRD DABEI GELEERT)" (§4.2, Rang 1) — DIE BEDINGUNG IST
      // `optionen.umverteilen`, NICHT EIN HANDGESCHRIEBENES `status === "verteilt"`: das Feld IST
      // `uebergang(a, "umverteilen", akteur, heute).erlaubt` und traegt damit den Zustand UND
      // `darfVerteilen` in EINEM Ausdruck (§11.3 verbietet einen zweiten Aufrufer mit anderer
      // Quelle). Steht die Aufgabe in `in_arbeit` oder `freigabe_offen`, ist das Feld falsch, und
      // die Karte bleibt OHNE Primaerknopf — die ehrliche Auskunft aus §9/S1.
      return {
        primaer: umverteilenKnopf(props, erste, einzeln),
        sekundaer: [
          einzeln ? ansehen(erste) : null,
          <Button key="personen" href="/personen">
            Personenverwaltung
          </Button>,
        ].filter(Boolean) as ReactNode[],
      };

    case "koordPosteingang":
    case "koordPosteingangUeberfaellig":
      return {
        // DER MODAL WIRD AUS DER KARTE GEOEFFNET, ER STEHT NICHT IN IHR (§10 Prueffrage 5): ein
        // Modal ist eine eigene Ebene mit eigener `useActionState`-Fehleranzeige, und deshalb ist
        // das Pflichtfeld dort erlaubt, obwohl die Karte selbst kein Eingabefeld traegt.
        primaer:
          einzeln && props.verteilen !== null ? (
            <VerteilenKnopf
              aufgabe={erste}
              bufdis={props.verteilen.bufdis}
              auslastung={props.verteilen.auslastung}
              tage={props.verteilen.tage}
            />
          ) : props.verteilen !== null ? (
            <Button type="primary" href="/verteilen">
              Verteilen
            </Button>
          ) : null,
        sekundaer: [
          <Button key="alle" href="/verteilen">
            Alle im Posteingang
          </Button>,
        ],
      };

    case "koordFreigabeOffen":
    case "auftragFreigabe":
      return {
        // `FreigabeAktionen` IST DIE EINE FASSUNG von „Freigeben"/„Zurueckweisen" (samt
        // Pflichtbegruendung im Modal) — dieselbe Client-Insel wie auf `/freigaben` und in der
        // Aktionszone von `/a/<id>`. Ihr „Freigeben" traegt `type="primary"` und ist damit der
        // eine Primaerknopf dieser Flaeche.
        primaer: einzeln ? (
          <FreigabeAktionen aufgabe={erste} />
        ) : props.darfFreigabenSehen ? (
          <Button type="primary" href="/freigaben">
            Freigaben ansehen
          </Button>
        ) : null,
        sekundaer: einzeln ? [ansehen(erste, "Nachweis und Verlauf ansehen")] : [],
      };

    case "koordUeberfaelligVerteilt":
      // DIESELBE AKTION UND DIESELBE BEDINGUNG WIE BEI `koordOhneTraeger` OBEN (§4.2, Rang 5a:
      // „Anders zuweisen", Modal aus der Karte). Der Unterschied zu Rang 5b (`koordUeberfaellig-
      // InArbeit`, direkt darunter) ist genau dieser Knopf, und die Aufspaltung existiert nur
      // seinetwegen: `umverteilen` gibt es ausschliesslich aus `verteilt`.
      return {
        primaer: umverteilenKnopf(props, erste, einzeln),
        sekundaer: einzeln ? ([ansehen(erste), zeitplan(erste)].filter(Boolean) as ReactNode[]) : [],
      };

    case "koordUeberfaelligInArbeit":
      // KEIN PRIMAERKNOPF, UND DAS IST DIE EHRLICHE AUSKUNFT (§4.2, Rang 5b; §9/S1): fuer eine in
      // Arbeit befindliche Aufgabe hat die Koordination heute keine Zustandsaktion — `umverteilen`
      // gibt es nur aus `verteilt`, `zuruecksetzen` nur fuer die zugewiesene Person. Ob
      // `zuruecksetzen` der Koordination offenstehen soll, ist eine FACHFRAGE an Modulspec §5 und
      // wird hier nicht nebenbei entschieden.
      return {
        primaer: null,
        sekundaer: einzeln ? ([ansehen(erste), zeitplan(erste)].filter(Boolean) as ReactNode[]) : [],
      };

    case "koordZurueckgewiesen":
      return {
        primaer: null,
        sekundaer: einzeln ? ([ansehen(erste), zeitplan(erste)].filter(Boolean) as ReactNode[]) : [],
      };

    case "koordRuhe":
      return {
        primaer: (
          <Button type="primary" href="/neu">
            Aufgabe einstellen
          </Button>
        ),
        sekundaer: [
          <Button key="archiv" href="/archiv">
            Archiv
          </Button>,
        ],
      };

    // ── BuFDi ───────────────────────────────────────────────────────────────────────────────────
    case "bufdiUeberfaellig":
      return {
        primaer: einzeln ? zustandsaktion(erste, optionen) : null,
        sekundaer: [
          einzeln && props.darfPlanAendern ? (
            <PlanKnopf key="heute" aufgabeId={erste.id} tag={props.heute} beschriftung="Auf heute legen" />
          ) : null,
          einzeln ? ansehen(erste) : null,
        ].filter(Boolean) as ReactNode[],
      };

    case "bufdiZurueckgewiesen":
      return {
        primaer: einzeln ? zustandsaktion(erste, optionen) : null,
        sekundaer: einzeln ? [ansehen(erste)] : [],
      };

    case "bufdiInArbeit":
      return {
        primaer: einzeln ? zustandsaktion(erste, optionen) : null,
        sekundaer: [
          einzeln && props.darfPlanAendern ? (
            <PlanKnopf
              key="morgen"
              aufgabeId={erste.id}
              tag={props.naechsterArbeitstag}
              beschriftung="Auf morgen schieben"
            />
          ) : null,
          einzeln && optionen?.zuruecksetzen ? (
            <EinfacheAktion
              key="zuruecksetzen"
              aufgabeId={erste.id}
              aktion={zuruecksetzenAction}
              beschriftung="Bearbeitung zurücksetzen"
            />
          ) : null,
        ].filter(Boolean) as ReactNode[],
      };

    case "bufdiKeinArbeitstag":
      // KEIN PRIMAERKNOPF (§4.2, Rang 4): die Raenge 4 bis 6 sprechen alle ueber „heute", und heute
      // gibt es keinen Arbeitstag. Die Raenge 1 bis 3 behalten ihre Zustandsaktion auch am Sonntag
      // — sie zu verstecken waere eine Behauptung ueber die Arbeitszeit dieser Person, die das
      // Modul nicht kennt.
      return {
        primaer: null,
        sekundaer: [
          <Button key="woche" href={`/plan/${eigen}`}>
            Woche planen
          </Button>,
        ],
      };

    case "bufdiHeuteOffen":
      return {
        primaer: einzeln ? zustandsaktion(erste, optionen) : null,
        /*
         * „ANDERS EINPLANEN" IST HIER EIN FELD GEWORDEN, KEIN VERWEIS MEHR (Oberflaechen-Runde
         * 2026-08-16, dritte Haelfte) — dieselbe Aenderung wie in `EinstiegBufdi.tsx`s
         * `posteingangAktionen`, mit derselben Insel und derselben Action.
         *
         * DAS PRAEDIKAT KOMMT NEU DAZU, UND ZWAR NOTWENDIG: als Verweis brauchte der Knopf keines
         * — die Zielseite `/plan/<person>` fuehrt ihren Riegel selbst und antwortet sonst mit 404.
         * Ein Feld, das `einplanenAction` ruft, muss dagegen an DERSELBEN Bedingung haengen, die
         * `uebergang()` prueft; `props.darfPlanAendern` ist genau die (`_lib/zugang.ts`), und die
         * Karte fuehrt sie fuer `PlanKnopf` bereits mit. Ohne diese Zeile boete die Oberflaeche
         * etwas an, das die Action ablehnt — genau der Fall, den §11.3 ausschliesst.
         */
        sekundaer:
          einzeln && props.darfPlanAendern
            ? [<EinplanenInline key="anders" aufgabe={erste} />]
            : [],
      };

    case "bufdiWartetAufEinplanung": {
      // DER VORSCHLAG STEHT IM KNOPFTEXT (§4.2, Rang 6) — „Annehmen: Do, 20.08., 09:00". Ohne ihn
      // stuende nirgends auf der Karte, WAS angenommen wird.
      const mitVorschlag = einzeln && erste.vorschlagDatum !== null && props.darfPlanAendern;
      return {
        primaer: mitVorschlag ? (
          <PlanKnopf
            aufgabeId={erste.id}
            tag={erste.vorschlagDatum!}
            uhrzeit={erste.vorschlagUhrzeit}
            beschriftung={`Annehmen: ${fmtTagKurz(erste.vorschlagDatum!)}${erste.vorschlagUhrzeit ? `, ${erste.vorschlagUhrzeit}` : ""}`}
            primaer
          />
        ) : (
          <Button type="primary" href={`/plan/${eigen}`}>
            Einplanen
          </Button>
        ),
        /*
         * ZWEI FASSUNGEN, UND DIE FALLUNTERSCHEIDUNG IST DIE GANZE BEGRUENDUNG: bei n = 1 nennt die
         * Karte EINE Aufgabe, und ein Feld kann genau die umplanen — das ist der Fall, den diese
         * Runde vom Verweis auf die Insel umstellt. Bei n > 1 nennt die Karte eine ZAHL; ein
         * Datumsfeld muesste dann fuer „welche?" eine Antwort erfinden, die die Karte bewusst nicht
         * gibt (§4.3). Dort bleibt der Verweis auf `/plan/<person>`, wo alle Zeilen stehen.
         *
         * `props.darfPlanAendern` gatet nur die INSEL, nicht den Verweis — Navigation braucht kein
         * Praedikat, eine Action schon (s. `bufdiHeuteOffen` oben).
         */
        sekundaer: [
          einzeln && props.darfPlanAendern ? (
            <EinplanenInline key="anders" aufgabe={erste} />
          ) : (
            <Button key="anders" href={`/plan/${eigen}`}>
              Anders einplanen
            </Button>
          ),
        ],
      };
    }

    case "bufdiRuhe":
      return {
        primaer: (
          <Button type="primary" href={`/plan/${eigen}`}>
            Woche planen
          </Button>
        ),
        // DASSELBE PRAEDIKAT WIE `/routinen` SELBST (`darfRoutinenVerwalten`, `zugang.ts:346-348`):
        // ohne es waere der Verweis ein Knopf auf eine 404-Seite (`routinen/page.tsx:107`).
        sekundaer: props.darfRoutinenVerwalten
          ? [
              <Button key="routinen" href="/routinen">
                Routinen verwalten
              </Button>,
            ]
          : [],
      };

    // ── Auftraggeber ────────────────────────────────────────────────────────────────────────────
    case "auftragUeberfaellig":
      // KEIN PRIMAERKNOPF, UND DAS IST DIE KERNZUSAGE DER MODULSPEC §8.3 IN BILDFORM: der
      // Auftraggeber darf mit einem ueberfaelligen Auftrag bei einer BuFDi nichts tun — die
      // Uebergangstabelle kennt fuer ihn dort keine Aktion. Er erfaehrt, dass sein Auftrag liegt,
      // sieht den Verlauf einen Klick entfernt und findet KEINEN Hebel, ihn selbst zu verteilen.
      return {
        primaer: null,
        sekundaer: einzeln ? ([ansehen(erste), zeitplan(erste)].filter(Boolean) as ReactNode[]) : [],
      };

    case "auftragUnverteilt":
      return {
        primaer: null,
        sekundaer: [
          einzeln ? ansehen(erste) : null,
          // ZURUECKZIEHEN BLEIBT SEKUNDAER, MIT `Popconfirm` (§4.2, §7 Nr. 2): ein destruktiver
          // Knopf als Primaeraktion einer Fuehrungskarte laedt zum Wegdruecken einer Aufgabe ein,
          // die nur auf Verteilung wartet. Die Bedingung ist der `zurueckziehen`-Zweig aus
          // `uebergang()`, nicht die schwaechere Rollenbeziehung „meine Auftraege, eingegangen".
          einzeln && optionen?.zurueckziehen ? (
            <ZurueckziehenKnopf key="zurueckziehen" aufgabeId={erste.id} />
          ) : null,
        ].filter(Boolean) as ReactNode[],
      };

    case "auftragRuhe":
      return {
        primaer: (
          <Button type="primary" href="/neu">
            Aufgabe einstellen
          </Button>
        ),
        sekundaer: [
          <Button key="archiv" href="/archiv">
            Archiv
          </Button>,
        ],
      };

    // Die drei Negativsaetze bilden NIE die Karte (§3.5) — sie sind ausschliesslich der Satz der
    // Zeile „ALS NAECHSTES". Der Fall steht trotzdem hier, damit der `switch` erschoepfend bleibt
    // und ein kuenftiger Anlass nicht still ohne Aktionen durchfaellt.
    case "koordNegativ":
    case "bufdiNegativ":
    case "auftragNegativ":
      return { primaer: null, sekundaer: [] };
  }
}

/**
 * DIE ZUSTANDSAKTION EINER EINZELNEN AUFGABE — AUS `aktionsOptionen`, NIE AUS EINER HIER
 * NACHGEBAUTEN BEDINGUNG (§10 Prueffrage 2). `aktionsOptionen` ruft `uebergang()` je Aktion; ein
 * Knopf, den die Action ablehnen wuerde, kann damit gar nicht entstehen.
 *
 * DIE REIHENFOLGE IST DIE VORRANGLISTE AUS §7 Nr. 2, und `nachweisHochladen` STEHT VOR `fertig`:
 * `uebergang()` erlaubt `in_arbeit`×`fertig` unabhaengig von der Nachweispflicht
 * (`lebenszyklus.ts:145-158`), die Ablehnung entsteht erst in `fertigMeldenAction` als Feldfehler
 * (`actions.ts:647-668`). Ohne die Umsortierung waere fuer eine nachweispflichtige Aufgabe „Fertig
 * melden" der Primaerknopf, waehrend der tatsaechlich noetige erste Schritt gar nicht dasteht.
 *
 * `freigabe_offen` FAELLT DURCH — fuer eine bereits fertig gemeldete Aufgabe hat die ausfuehrende
 * Person keine Zustandsaktion mehr, und die Abwesenheit ist die Auskunft (Regel P).
 */
function zustandsaktion(a: AufgabeRow, optionen: AktionsOptionen | null): ReactNode {
  if (optionen === null) return null;
  if (optionen.nachweisHochladen) {
    // DAS FORMULAR MIT EINGABEFELD STEHT NIE IN DER KARTE (§10 Prueffrage 5): der Nachweis braucht
    // ein Feld, dessen Fehler AN dem Feld ankommen muss. Der Knopf fuehrt deshalb auf `/a/<id>`.
    return (
      <Button type="primary" href={`/a/${a.id}`}>
        Nachweis hinterlegen und fertig melden
      </Button>
    );
  }
  if (optionen.fertig) return <FertigMeldenKnopf aufgabeId={a.id} />;
  if (optionen.starten) {
    return <EinfacheAktion aufgabeId={a.id} aktion={startenAction} beschriftung="Bearbeitung starten" primaer />;
  }
  if (optionen.wiederaufnehmen) {
    return (
      <EinfacheAktion
        aufgabeId={a.id}
        aktion={wiederaufnehmenAction}
        beschriftung="Bearbeitung wieder aufnehmen"
        primaer
      />
    );
  }
  return null;
}

/**
 * EIN ZUSTANDSWECHSEL OHNE EIGENES FORMULARFELD — natives `<form action={…}>` mit genau einem
 * versteckten Feld, DIREKT aus dieser Server Component. Server Actions duerfen als einzige ueber
 * die RSC-Grenze, aber nur DIREKT IMPORTIERT, nie als Prop durchgereicht (§6.7); `aktion` ist
 * deshalb ein Parameter dieser LOKALEN Hilfsfunktion, kein Prop einer Client-Komponente.
 */
function EinfacheAktion({
  aufgabeId,
  aktion,
  beschriftung,
  primaer = false,
}: {
  aufgabeId: string;
  aktion: (formData: FormData) => Promise<void>;
  beschriftung: string;
  primaer?: boolean;
}) {
  return (
    <form action={aktion}>
      <input type="hidden" name="aufgabeId" value={aufgabeId} />
      <Button type={primaer ? "primary" : undefined} htmlType="submit">
        {beschriftung}
      </Button>
    </form>
  );
}

/**
 * „ANNEHMEN", „AUF HEUTE LEGEN" UND „AUF MORGEN SCHIEBEN" — DIESELBE FORM, DREI BELEGUNGEN
 * (§4.2). Alle drei rufen `einplanenAnnehmenAction`, die duenne Bruecke zu `einplanenAction`
 * (`actions.ts`): ein zustandsloses `<form action>` verlangt `(formData) => Promise<void>`, und
 * `einplanenAction` traegt die `useActionState`-Signatur. Die Bruecke WIRFT bei Feldfehlern, statt
 * sie zu verwerfen — laut ist besser als still.
 *
 * `dauerMinuten` WIRD NICHT MITGESENDET: leer heisst „unveraendert" (`einplanenAction`). Das ist
 * genau die Zusage aus §4.2 („Dauer unveraendert") und keine zweite Fassung davon.
 *
 * ALLE DREI HAENGEN AN `darfPlanAendern` (§4.2, §10 Prueffrage 2) — AUSGESCHRIEBEN AM AUFRUFER,
 * weil `aktionsOptionen` sie NICHT deckt: es prueft sieben Uebergaenge plus `nachweisHochladen`,
 * `einplanen` ist nicht dabei. Ohne den Aufruf bekaeme eine AUSGESCHIEDENE BuFDi — die ihren
 * Einstieg weiterhin erreicht — diese Knoepfe angeboten und liefe in einen Wurf.
 */
function PlanKnopf({
  aufgabeId,
  tag,
  uhrzeit = null,
  beschriftung,
  primaer = false,
}: {
  aufgabeId: string;
  tag: string;
  uhrzeit?: string | null;
  beschriftung: string;
  primaer?: boolean;
}) {
  return (
    <form action={einplanenAnnehmenAction}>
      <input type="hidden" name="aufgabeId" value={aufgabeId} />
      <input type="hidden" name="planDatum" value={tag} />
      <input type="hidden" name="planUhrzeit" value={uhrzeit ?? ""} />
      <Button type={primaer ? "primary" : undefined} htmlType="submit">
        {beschriftung}
      </Button>
    </form>
  );
}
