import type { DB } from "../_db/client";
import type { AufgabeRow, Prioritaet } from "../_db/schema";
import {
  aktivePersonen,
  alleAufgaben,
  aufgabenFuerPerson,
  aufgabenVonErsteller,
  freigabeDaten,
  routinenFuer,
} from "../_db/queries";
import {
  KONTEXT_TEXT,
  aufgabenInWoche,
  heuteOffen,
  istUeberfaellig,
  ohneAktivenTraeger,
  ohnePlatzInDerAchse,
  tagesBudget,
  wartetAufEinplanung,
  type AnlassArt,
} from "./anzeige";
import { kalenderwoche, wochentagVon } from "./datum";
import { darfVerteilen, type Akteur } from "./zugang";

/*
 * DER ZUSTANDS-SELEKTOR DES MODULS (Oberflaechen-Spec 2026-08-16 §4) — Vorbild
 * `feedback/_lib/cockpit.ts`.
 *
 * EINE STELLE ENTSCHEIDET, WAS DIE SEITE ZEIGT, NICHT DIE JSX. Bis hierhin verzweigten die drei
 * Einstiege selbst ueber den Bestand; damit gab es keine Stelle, an der man erschoepfend pruefen
 * konnte, was die Seite in welcher Lage zeigt (Befund 3 der Spec). Diese Datei zerlegt den Bestand
 * je Rolle in genau einen fuehrenden Anlass und eine geordnete Restmenge — die JSX verzweigt danach
 * nicht mehr, sie stellt dar.
 *
 * VIER BAUREGELN GELTEN WOERTLICH (§4.1):
 *
 *  1. NICHTS WIRD GESCHRIEBEN. „Ueberfaellig" wird gerechnet (`istUeberfaellig`), nie persistiert.
 *  2. KEIN `new Date()`. `heute` und `tage` kommen als Argument; `_lib/datum.ts` bleibt die einzige
 *     Stelle, die einen Kalendertag aus der Uhr liest.
 *  3. DER FUEHRENDE ANLASS IST EIN AUSDRUCK OHNE AUFFANGZWEIG: `anlaesse[0] ?? RUHE`. Ein zweiter
 *     Rueckgabeweg existiert nicht, also ist die Totalitaet strukturell und nicht erhofft.
 *  4. DIE LEITER ORDNET UEBERSCHNEIDUNGSFREI — ABER SIE ORDNET NICHT ALLES EIN. Jede Aufgabe faellt
 *     in HOECHSTENS EINE Sprosse: die erste, die passt. „Genau eine" waere falsch (§4.1, §12.1/U-1),
 *     und der zugehoerige Test in `lage.test.ts` muesste rot sein. Drei Gegenbeispiele: eine
 *     BuFDi-Aufgabe mit `freigabe_offen` trifft keine der sechs Sprossen; eine `verteilt`-Aufgabe
 *     mit `planDatum` = Mittwoch ist weder `heuteOffen` noch `wartetAufEinplanung`; jede
 *     `abgeschlossene` faellt ohnehin durch. Die Oberflaeche faellt dabei in KEIN Loch — die
 *     Restmenge steht auf der Flaeche der Rolle (Tagesspalte, Achsen-Fusszeile, „Die Woche der
 *     drei", „Eigene Auftraege", `/archiv`), und §4.1 zaehlt sie geschlossen auf.
 *
 * DER SELEKTOR LIEFERT DATEN, KEINE SAETZE (§4.1, fuenfte Bauregel). `Anlass` traegt `art`, Zeilen
 * und Zahlen — nie einen formatierten Text. Die Beschriftung liegt in `_lib/anzeige.ts`
 * (`ANLASS_TEXT`, `FRIST_TEXT`). Zwei Gruende, beide belegbar: die Zonenueberschriften stuenden
 * sonst in drei Einstiegen dreimal, und der Quelltext-Scan aus §6.6 muss EIN Ziel haben — staende
 * die Ueberfaellig-Prosa hier, haette er zwei Ausnahmen statt einer. DAS GILT AUCH FUER DIE
 * KONTEXTZEILE: `lage()` gibt sie zwar zurueck (§4.1 fuehrt sie in der Rueckgabe), gebaut wird sie
 * aber von `KONTEXT_TEXT` in `_lib/anzeige.ts` — diese Datei liefert nur die Zahlen. Anders stuende
 * „überfällig" in einer dritten Datei, und der Riegel waere am ersten Tag rot.
 *
 * `lage.ts` IST SERVER-ONLY, UND DAS IST KEINE STILFRAGE (§4.1, §12.4). Sie importiert
 * `_lib/zugang.ts` und damit `@/core/auth` (next-auth); ein Import dieser Datei in eine
 * Client-Insel zoege denselben serverseitigen Code ins Bundle, den der Kopfkommentar von
 * `_lib/aktionsOptionen.ts` schon einmal ausschreibt. `lage()` laeuft in `page.tsx` (Server
 * Component), und die Fuehrungskarte bekommt ausschliesslich das REINE, SERIALISIERBARE Ergebnis —
 * nie den Selektor selbst und nie eine Funktion daraus (Falle 9).
 */

/** Dieselbe Verzweigung wie `page.tsx`: die Gruppe schlaegt die Zeile. */
export type Ansicht = "koordination" | "bufdi" | "auftrag";

export interface Anlass {
  art: AnlassArt;
  /** Nach der totalen Ordnung unten sortiert. Leer nur bei Ruhe, Negativ und `bufdiKeinArbeitstag`. */
  zeilen: AufgabeRow[];
  /**
   * GENAU EINE ZEILE. Das ist die Angabe, an der die Karte ihre Form waehlt (§4.2): bei n = 1 nennt
   * sie die AUFGABE und keine Zone wiederholt sie, bei n > 1 nennt sie die ZAHL und keine Aufgabe
   * ist bevorzugt. Sie steht hier und nicht als `zeilen.length === 1` an der Aufrufstelle, weil
   * genau diese Unterscheidung Regel R3 traegt und in `lage.test.ts` geprueft wird.
   */
  einzeln: boolean;
}

/**
 * DER VORBEHALT DER ACHSE (Regel V, §3.4) — nur fuer die BuFDi-Ansicht, sonst `null`.
 *
 * Er ist nicht Kosmetik, sondern der BELEG fuer die Partitionszusage aus §4.1: `ohnePlatz` ist die
 * Stelle, an der die Restmenge der BuFDi-Leiter sichtbar wird. Wer die Fusszeile schmaler fasst,
 * muss die R3-Ausnahme fuer Rang 3 mit zuruecknehmen — sonst entsteht genau das Loch, das §4.1 zu
 * schliessen hat.
 */
export interface AchsenVorbehalt {
  /** `tage[4] < heute` — die gezeigte Woche liegt ganz in der Vergangenheit (der Wochenendfall). */
  abgeschlosseneWoche: boolean;
  /** Was in keiner der fuenf Tagesspalten stehen kann (`ohnePlatzInDerAchse`). */
  ohnePlatz: AufgabeRow[];
}

export interface Lage {
  ansicht: Ansicht;
  /**
   * DIE LEITER, GEFILTERT UND SORTIERT — die Liste, auf die sich Regel R3 („Position", nicht
   * „Rang", §3.4) und die Ableitung von `alsNaechstes` beziehen. Sie steht im Ergebnis, weil §11.1
   * beide Zusagen genau ueber sie bestellt: „Zonen sind alle Anlaesse ab Position 2 …" und
   * „`alsNaechstes === anlaesse[1] ?? <Negativ>`". Ohne die Liste liesse sich das nur nachstellen,
   * nicht pruefen.
   */
  anlaesse: Anlass[];
  /** `anlaesse[0] ?? RUHE` — es gibt keinen dritten Fall und keinen zweiten Rueckgabeweg (R1). */
  fuehrung: Anlass;
  /** `anlaesse[1]`, sonst der Negativsatz der Rolle, im Ruhefall `null` (§4.2). */
  alsNaechstes: Anlass | null;
  /** Ebene 4, nach Regel R3 — nie leer, eine leere Zone ist strukturell ausgeschlossen. */
  zonen: Anlass[];
  achsenVorbehalt: AchsenVorbehalt | null;
  /** Die Kontextzeile des `SeitenKopf`, Format je Rolle nach §3.5. */
  kontext: string;
}

/**
 * DIE TOTALE ORDNUNG (§4.1): `faelligAm` aufsteigend → `prioritaet` → `erstelltAm` → `id`. Zwei
 * Aufgaben koennen danach nicht gleichrangig sein; ein „unentschieden" existiert nicht, und die
 * Karte muss nie raten. Ein `.get()`-Stil-Zufall wie in `feedback`s `activeSurveyForGroup` ist
 * damit strukturell ausgeschlossen.
 *
 * WAS DIESE ORDNUNG NICHT BEHAUPTET: dass zwei Aufgaben mit derselben Frist unterschiedlich
 * dringend seien. Sie ist eine REPRODUZIERBARKEITSORDNUNG, keine Dringlichkeitsaussage — deshalb
 * zeigt die Karte bei n > 1 die ZAHL und nicht „die eine".
 */
const PRIO_RANG: Record<Prioritaet, number> = { hoch: 0, mittel: 1, niedrig: 2 };

function nachOrdnung(a: AufgabeRow, b: AufgabeRow): number {
  if (a.faelligAm !== b.faelligAm) return a.faelligAm < b.faelligAm ? -1 : 1;
  if (PRIO_RANG[a.prioritaet] !== PRIO_RANG[b.prioritaet]) {
    return PRIO_RANG[a.prioritaet] - PRIO_RANG[b.prioritaet];
  }
  const zeit = a.erstelltAm.getTime() - b.erstelltAm.getTime();
  if (zeit !== 0) return zeit;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Eine Sprosse der Leiter: die ERSTE, die passt, nimmt die Zeile. */
interface Sprosse {
  art: AnlassArt;
  trifft: (a: AufgabeRow) => boolean;
}

/**
 * DIE LEITER ALS EIN EINZIGER DURCHLAUF (§4.1, Bauregel 4). `find` liefert die erste passende
 * Sprosse — damit ist „hoechstens eine" nicht eine Zusage der Praedikate, sondern eine Eigenschaft
 * dieser Schleife. Zeilen ohne Treffer fallen bewusst durch (die Restmenge).
 */
function leiter(zeilen: readonly AufgabeRow[], sprossen: readonly Sprosse[]): Anlass[] {
  const nachArt = new Map<AnlassArt, AufgabeRow[]>();
  for (const a of zeilen) {
    const treffer = sprossen.find((s) => s.trifft(a));
    if (treffer === undefined) continue;
    const bisher = nachArt.get(treffer.art);
    if (bisher === undefined) nachArt.set(treffer.art, [a]);
    else bisher.push(a);
  }
  return sprossen
    .filter((s) => nachArt.has(s.art))
    .map((s) => anlass(s.art, [...nachArt.get(s.art)!].sort(nachOrdnung)));
}

function anlass(art: AnlassArt, zeilen: AufgabeRow[]): Anlass {
  return { art, zeilen, einzeln: zeilen.length === 1 };
}

/** Ein Anlass ohne Bestand — Ruhe, Negativsatz und `bufdiKeinArbeitstag` (§3.5, §4.1). */
function ohneBestand(art: AnlassArt): Anlass {
  return { art, zeilen: [], einzeln: false };
}

/**
 * WELCHE ANLAESSE BEREITS DIE FLAECHE DER ROLLE SIND (§3.4, R3-Ausnahmetabelle) — keine
 * Auslegungsfrage, eine Liste. Der Massstab: ausgenommen ist ein Anlass genau dann, wenn JEDE
 * seiner Zeilen auf der Flaeche der Rolle mit Titel, Zustand und Frist vollstaendig dasteht.
 *
 *  - BUFDI: Rang 3 und 5 stehen vollstaendig in der Wochenachse, Rang 4 ist ueberhaupt kein
 *    Bestand. Die Aussage ueber Rang 3 HAENGT AN REGEL V: eine `in_arbeit`-Aufgabe ohne Platz in
 *    der Achse faengt die Achsen-Fusszeile ueber `ohnePlatzInDerAchse`.
 *  - KOORDINATION: KEINE Ausnahme — „Die Woche der drei" zeigt Zahlen je Person, keine
 *    Aufgabenzeilen. Es gibt dort nichts, was eine Zone wiederholen koennte.
 *  - AUFTRAG: ALLE — „Eigene Auftraege" zeigt jede eigene Zeile ungedeckelt. Ebene 4 des Aufbaus
 *    existiert fuer diese Rolle nicht.
 */
const R3_AUSNAHMEN: Record<Ansicht, ReadonlySet<AnlassArt>> = {
  koordination: new Set<AnlassArt>(),
  bufdi: new Set<AnlassArt>(["bufdiInArbeit", "bufdiKeinArbeitstag", "bufdiHeuteOffen"]),
  auftrag: new Set<AnlassArt>(["auftragFreigabe", "auftragUeberfaellig", "auftragUnverteilt"]),
};

const RUHE: Record<Ansicht, AnlassArt> = {
  koordination: "koordRuhe",
  bufdi: "bufdiRuhe",
  auftrag: "auftragRuhe",
};

const NEGATIV: Record<Ansicht, AnlassArt> = {
  koordination: "koordNegativ",
  bufdi: "bufdiNegativ",
  auftrag: "auftragNegativ",
};

export function lage(db: DB, akteur: Akteur, heute: string, tage: readonly string[]): Lage {
  // DIESELBE VERZWEIGUNG WIE `page.tsx:38-51`, damit die Leiter nicht von der gerenderten
  // Komponente abweichen kann. Der theoretisch moegliche Fall „`bufdi` UND Koordinationsgruppe"
  // faellt auf `koordination` — benannt, weil er sonst beim naechsten Lesen als Fehler gemeldet
  // wird.
  const ansicht: Ansicht = akteur.istKoordination ? "koordination" : akteur.person.rolle;

  const { anlaesse, achsenVorbehalt, kontext } =
    ansicht === "koordination"
      ? koordination(db, akteur, heute)
      : ansicht === "bufdi"
        ? bufdi(db, akteur, heute, tage)
        : auftrag(db, akteur, heute);

  const ausnahmen = R3_AUSNAHMEN[ansicht];
  return {
    ansicht,
    anlaesse,
    // REGEL R1, als Ausdruck ohne Auffangzweig.
    fuehrung: anlaesse[0] ?? ohneBestand(RUHE[ansicht]),
    // REGEL AUS §4.2: `anlaesse[1]`, sonst der Negativsatz — im Ruhefall entfaellt die Zeile ganz,
    // weil ein Satz dort die Wiederholung des Kartenkoerpers waere.
    alsNaechstes:
      anlaesse.length === 0 ? null : (anlaesse[1] ?? ohneBestand(NEGATIV[ansicht])),
    // REGEL R3: alle Anlaesse ab POSITION 2, plus Position 1 genau dann, wenn er mehr als eine
    // Aufgabe traegt — ohne die, die bereits die Flaeche der Rolle sind, und ohne die ohne Bestand.
    // Eine leere Zone ist damit strukturell ausgeschlossen, nicht verboten.
    zonen: anlaesse.filter(
      (an, i) => an.zeilen.length > 0 && !ausnahmen.has(an.art) && (i > 0 || !an.einzeln),
    ),
    achsenVorbehalt,
    kontext,
  };
}

interface Teillage {
  anlaesse: Anlass[];
  achsenVorbehalt: AchsenVorbehalt | null;
  kontext: string;
}

// ═══ Koordination ═════════════════════════════════════════════════════════════════════════════

function koordination(db: DB, akteur: Akteur, heute: string): Teillage {
  // `alleAufgaben(db)` LIEST UNGEFILTERT — genau das traegt Rang 1 (§9/S1): ein Ladepfad ueber
  // `bufdis()` waere blind fuer die Zeilen, die `ohneAktivenTraeger` finden soll, weil eine
  // ausgeschiedene Person dort gar nicht mehr vorkommt.
  const alle = alleAufgaben(db);
  const aktiveIds = new Set(aktivePersonen(db, heute).map((p) => p.id));
  const { meine, vertretung } = freigabeDaten(db, akteur, heute);
  const freigabeIds = new Set([...meine, ...vertretung].map((z) => z.aufgabe.id));
  // AUSGESCHRIEBEN, OBWOHL HEUTE IMMER WAHR (`darfVerteilen` ist `istKoordination`, `zugang.ts:298`):
  // §10 Prueffrage 2 verlangt, dass jede Sprosse ueber DASSELBE Praedikat definiert ist, das die
  // Action durchsetzt. Aendert sich das Praedikat, verschwindet die Sprosse mit ihm statt einen
  // Knopf anzubieten, den der Server danach ablehnt.
  const darfVert = darfVerteilen(akteur, heute);

  const anlaesse = leiter(alle, [
    { art: "koordOhneTraeger", trifft: (a) => ohneAktivenTraeger(a, aktiveIds) },
    {
      art: "koordPosteingangUeberfaellig",
      trifft: (a) => darfVert && a.status === "eingegangen" && istUeberfaellig(a, heute),
    },
    { art: "koordPosteingang", trifft: (a) => darfVert && a.status === "eingegangen" },
    // NICHT „status === freigabe_offen": `freigabeDaten` filtert serverseitig ueber `darfFreigeben`
    // samt beider Vier-Augen-Ausschluesse (Modulspec §7). Die Karte kann die Menge damit nicht
    // erweitern, und ein Knopf, den `freigebenAction` ablehnen wuerde, kann gar nicht entstehen.
    { art: "koordFreigabeOffen", trifft: (a) => freigabeIds.has(a.id) },
    // DIE AUFSPALTUNG VON RANG 5 IST DIE KORREKTUR EINES ECHTEN FEHLERS (§9/S6): `umverteilen`
    // existiert in `_lib/lebenszyklus.ts` AUSSCHLIESSLICH aus `verteilt`. Ein gemeinsamer Rang
    // haette „Anders zuweisen" auch neben einer `in_arbeit`-Aufgabe gezeigt — ein Knopf, den der
    // Server danach ablehnt.
    {
      art: "koordUeberfaelligVerteilt",
      trifft: (a) => istUeberfaellig(a, heute) && a.zugewiesenAn !== null && a.status === "verteilt",
    },
    {
      art: "koordUeberfaelligInArbeit",
      trifft: (a) =>
        istUeberfaellig(a, heute) &&
        a.zugewiesenAn !== null &&
        (a.status === "in_arbeit" || a.status === "freigabe_offen"),
    },
    { art: "koordZurueckgewiesen", trifft: (a) => a.status === "zurueckgewiesen" },
  ]);

  const zuVerteilen = alle.filter((a) => a.status === "eingegangen").length;
  const freigabeAnzahl = meine.length + vertretung.length;
  const ueberfaellig = alle.filter((a) => istUeberfaellig(a, heute)).length;
  const zurueckgewiesen = alle.filter((a) => a.status === "zurueckgewiesen").length;
  // DER KLAMMERZUSATZ TRITT GENAU DANN HINZU, WENN ALLE gezaehlten Freigaben in Vertretung sind
  // (§3.5) — er ist eine PRAEZISIERUNG derselben Zahl, keine zweite. Bei gemischter Lage bliebe
  // offen, worauf er sich bezieht.
  const nurVertretung = freigabeAnzahl > 0 && meine.length === 0;

  return {
    anlaesse,
    achsenVorbehalt: null,
    kontext: KONTEXT_TEXT.koordination({
      zuVerteilen,
      freigabe: freigabeAnzahl,
      nurVertretung,
      ueberfaellig,
      zurueckgewiesen,
    }),
  };
}

// ═══ BuFDi ════════════════════════════════════════════════════════════════════════════════════

function bufdi(db: DB, akteur: Akteur, heute: string, tage: readonly string[]): Teillage {
  const meine = aufgabenFuerPerson(db, akteur.person.id);
  const istArbeitstag = wochentagVon(heute) !== null;

  // DIE RAENGE 1 BIS 3 BEHALTEN IHRE ZUSTANDSAKTION AUCH AM SONNTAG (§4.2). Eine legitime
  // Zustandsaktion zu verstecken, weil Sonntag ist, waere eine Behauptung ueber die Arbeitszeit
  // dieser Person, die das Modul nicht kennt — Abwesenheiten sind Streichposten der Modulspec §13.
  const oben: Sprosse[] = [
    { art: "bufdiUeberfaellig", trifft: (a) => istUeberfaellig(a, heute) },
    { art: "bufdiZurueckgewiesen", trifft: (a) => a.status === "zurueckgewiesen" },
    { art: "bufdiInArbeit", trifft: (a) => a.status === "in_arbeit" },
  ];
  // WAS DAS WOCHENENDE AENDERT, IST DIE AUSSAGE UEBER DEN PLAN: die Raenge 5 und 6 sprechen beide
  // ueber „heute", und heute gibt es keinen Arbeitstag. `kein_arbeitstag` verdraengt genau diese
  // zwei und keinen darueber (§11.1).
  const unten: Sprosse[] = [
    { art: "bufdiHeuteOffen", trifft: (a) => heuteOffen(a, heute) && a.status === "verteilt" },
    { art: "bufdiWartetAufEinplanung", trifft: (a) => wartetAufEinplanung(a) },
  ];

  const anlaesse = istArbeitstag
    ? leiter(meine, [...oben, ...unten])
    : [...leiter(meine, oben), ohneBestand("bufdiKeinArbeitstag")];

  const routinenDerPerson = routinenFuer(db, akteur.person.id);
  const budgets = tage.map((tag) => tagesBudget(meine, routinenDerPerson, akteur.person, tag));
  const verplant = budgets.reduce((summe, b) => summe + b.verplantMinuten, 0);
  const soll = budgets.reduce((summe, b) => summe + b.sollMinuten, 0);
  // `aufgabenInWoche` STATT EINER VIERTEN INLINE-FASSUNG derselben Mitgliedschaft: genau diese
  // Zeile stand schon einmal freihaendig in `_ui/EinstiegBufdi.tsx` und wurde deshalb nach
  // `_lib/anzeige.ts` gehoben (s. Kopfkommentar dort). Eine Kontextzeile, die weniger Aufgaben
  // zaehlt als die Tagesspalten darunter zeigen, waere sichtbar inkonsistent — und die zwei
  // Fassungen liefen auseinander, ohne dass ein Test es saehe.
  const eingeplant = aufgabenInWoche(meine, tage);
  const imPosteingang = meine.filter((a) => wartetAufEinplanung(a)).length;
  const ueberfaellig = meine.filter((a) => istUeberfaellig(a, heute)).length;
  // DIE WOCHE IST GANZ VERGANGEN — der Wochenendfall aus §5.4. `montagDerWoche` ordnet den Sonntag
  // der Woche DAVOR zu; ohne diesen Zusatz zeigte `/` am Sonntagabend eine volle, gruene Woche und
  // sagte nicht, dass sie abgelaufen ist.
  const abgeschlosseneWoche = tage.length > 0 && tage[tage.length - 1]! < heute;

  return {
    anlaesse,
    achsenVorbehalt: {
      abgeschlosseneWoche,
      ohnePlatz: meine.filter((a) => ohnePlatzInDerAchse(a, tage)).sort(nachOrdnung),
    },
    kontext: KONTEXT_TEXT.bufdi({
      kw: kalenderwoche(tage[0] ?? heute),
      abgeschlosseneWoche,
      eingeplant,
      verplantMinuten: verplant,
      sollMinuten: soll,
      imPosteingang,
      ueberfaellig,
    }),
  };
}

// ═══ Auftraggeber ═════════════════════════════════════════════════════════════════════════════

function auftrag(db: DB, akteur: Akteur, heute: string): Teillage {
  const meineAuftraege = aufgabenVonErsteller(db, akteur.person.id);
  // RANG 1 NENNT SEIN PRAEDIKAT WOERTLICH (§4.2, §12.2/F-5): „die Zeilen aus
  // `freigabeDaten(db, akteur, heute).meine`", NICHT „ich bin Pruefer". Die Rollenbeziehung ist
  // SCHWAECHER als `darfFreigeben` (`zugang.ts:384-389` verlangt zusaetzlich `!istSelbst`,
  // `person.id !== zugewiesenAn` und `istAktiv`) — ein AUSGESCHIEDENER Auftraggeber erreicht
  // seinen Einstieg weiterhin (`page.tsx:50-51` prueft `istAktiv` nicht) und bekaeme mit der
  // schwaecheren Formulierung „Freigeben" angeboten, das `uebergang()` danach ablehnt.
  const { meine: meineFreigabe } = freigabeDaten(db, akteur, heute);
  const freigabeIds = new Set(meineFreigabe.map((z) => z.aufgabe.id));
  const zeilen = [
    ...meineFreigabe.map((z) => z.aufgabe),
    ...meineAuftraege.filter((a) => !freigabeIds.has(a.id)),
  ];

  const anlaesse = leiter(zeilen, [
    { art: "auftragFreigabe", trifft: (a) => freigabeIds.has(a.id) },
    { art: "auftragUeberfaellig", trifft: (a) => istUeberfaellig(a, heute) },
    { art: "auftragUnverteilt", trifft: (a) => a.status === "eingegangen" },
  ]);

  const gesamt = meineAuftraege.length;
  const offen = meineAuftraege.filter((a) => a.status !== "abgeschlossen").length;
  const unverteilt = meineAuftraege.filter((a) => a.status === "eingegangen").length;
  const freigabeAnzahl = meineFreigabe.length;

  return {
    anlaesse,
    achsenVorbehalt: null,
    kontext: KONTEXT_TEXT.auftrag({ gesamt, offen, unverteilt, freigabe: freigabeAnzahl }),
  };
}
