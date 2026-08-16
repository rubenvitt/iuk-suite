import type { Status } from "../_db/schema";
import {
  darfFreigabenSehen,
  darfPersonenVerwalten,
  darfRoutinenVerwalten,
  darfVerteilen,
  type Akteur,
} from "./zugang";

/*
 * DIE BEDIENUNGSANLEITUNG DES MODULS — EIN KAPITEL JE SICHT, ALS DATEN.
 *
 * WARUM DIE ANLEITUNG IM MODUL LIEGT UND NICHT IN `docs/`: `docs/` liest, wer das Modul BAUT.
 * Diese Anleitung ist fuer die Person gedacht, die vor der Flaeche sitzt und nicht weiterkommt —
 * sie muss dort erreichbar sein, wo die Frage entsteht, also auf der Seite selbst
 * (`SeitenKopf`s `hilfe`-Verweis) und in der Modulnavigation. Ein Wiki-Eintrag, den man erst
 * suchen muss, wird nicht gelesen.
 *
 * KEIN "use client" (Falle 6): `hilfe/page.tsx` und `hilfe/[sicht]/page.tsx` sind Server
 * Components und lesen `HILFE_SICHTEN` als WERT. Aus einem Client-Modul kaeme eine
 * Client-Referenz statt des Objekts — HTTP 500 fuer die ganze Seite, und Vitest saehe es
 * strukturell nicht.
 *
 * ══ DREI ROLLEN, EIN DURCHGEHENDER FALL — DIE ERZAEHLFORM DIESER ANLEITUNG (Auftrag des
 *    Betreibers, 2026-08-16).
 *
 *    ROLLEN STATT DATENBANKWERTE: die Anleitung spricht von `Koordinatorin`, `Auftraggeber` und
 *    `Auftragnehmer` (`ROLLEN` unten). Das Modul selbst kennt an dieser Stelle drei verschiedene
 *    Vokabulare — die Datenbank sagt `auftrag`/`bufdi`, die Auth-Gruppe traegt die Koordination,
 *    und die Oberflaeche schreibt „BuFDi" —, und eine Anleitung, die zwischen diesen dreien hin
 *    und her springt, zwingt jeder Leserin eine Uebersetzungsarbeit auf, die das Modul selbst ihr
 *    abnimmt. `ROLLEN[].imModul` haelt die Bruecke an EINER Stelle fest, statt sie in jedem
 *    zweiten Satz mitzuschleppen.
 *
 *    JEDES KAPITEL BEGINNT MIT EINER SZENE, NICHT MIT EINER DEFINITION (`szene`). Eine Anleitung
 *    wird nicht am Schreibtisch gelesen, sondern im Stehen, mit einer offenen Frage — und die
 *    Frage ist nie „was ist die Verteilung", sondern „vor mir liegen zehn Auftraege, was jetzt".
 *    Wer sich in der ersten Zeile wiedererkennt, liest die zweite.
 *
 *    EIN FALL LAEUFT DURCH ALLE KAPITEL (`FADEN`): derselbe Beamer im Schulungsraum, vom
 *    Einstellen bis ins Archiv. Ein Beispiel, das mitwandert, kostet nichts und ersetzt drei
 *    abstrakte Saetze — und es benutzt DIE NAMEN AUS DEM SEED (Malte, Rike, Alina), damit wer im
 *    Testsystem uebt, dieselben Zeilen vor sich hat wie im Text.
 *
 * DIE SICHTBARKEIT KOMMT AUS DENSELBEN PRAEDIKATEN WIE DIE NAVIGATION (`_lib/nav.ts`, Spec §7):
 * `darfVerteilen`, `darfFreigabenSehen`, `darfRoutinenVerwalten`, `darfPersonenVerwalten` —
 * NICHT aus einer zweiten, hier nachgebauten Rollenabfrage. Der Grund ist derselbe wie dort und
 * wiegt fuer eine Anleitung sogar schwerer: ein Kapitel „So verteilst du Aufgaben" vor einer
 * Person, die auf `/verteilen` 404 bekommt, ist schlimmer als kein Kapitel — es beschreibt einen
 * Weg, den es fuer sie nicht gibt. `hilfe.test.ts` ruft dafuer die ECHTEN Seiten-Default-Exporte,
 * genau wie `nav.test.ts`.
 *
 * DIE DREI EINSTIEGE SIND DREI SICHTEN, KEINE EINE. `/` zeigt je nach Person „Meine Woche",
 * „Verteilung" oder „Meine Auftraege" — drei verschiedene Flaechen unter derselben Adresse
 * (`page.tsx`s `aufgabenInhalt`). Eine gemeinsame Anleitung dafuer muesste jeden zweiten Satz
 * einschraenken („falls du BuFDi bist …"), und genau das ist der Text, den niemand liest.
 * `einstiegsSicht` bildet die Verzweigung von `aufgabenInhalt` nach — in DERSELBEN Reihenfolge
 * (die Gruppe schlaegt die Zeile), und `hilfe.test.ts` haelt beide gegeneinander, indem es
 * `aufgabenInhalt` wirklich rendert und die `<h1>` mit dem Titel hier vergleicht.
 */

/** Der Schluessel einer Sicht — zugleich das letzte Pfadstueck ihres Kapitels (`/hilfe/<key>`). */
export const SICHT_SCHLUESSEL = [
  "meine-woche",
  "verteilung",
  "meine-auftraege",
  "einstellen",
  "verteilen",
  "freigaben",
  "routinen",
  "personen",
  "zeitplan",
  "aufgabe",
  "archiv",
] as const;

export type SichtSchluessel = (typeof SICHT_SCHLUESSEL)[number];

/* ─── DIE DREI ROLLEN ─────────────────────────────────────────────────────────────────────────── */

export interface RollenBild {
  /** Der Name, unter dem die Anleitung diese Rolle durchgehend fuehrt. */
  name: string;
  /** Was diese Rolle im Ablauf tut — ein Satz, aktiv, ohne Nebensatz. */
  satz: string;
  /**
   * WIE DIE ROLLE IM MODUL HEISST UND WORAN SIE HAENGT. Die Bruecke zwischen der Sprache der
   * Anleitung und der Sprache der Oberflaeche — an EINER Stelle, damit sie nicht in jedem zweiten
   * Satz mitlaeuft.
   */
  imModul: string;
  /** Der Einstieg dieser Rolle: die Sicht, die sie unter `/` bekommt. */
  einstieg: SichtSchluessel;
}

export const ROLLEN: readonly RollenBild[] = [
  {
    name: "Auftraggeber",
    satz: "Stellt Aufgaben für andere ein und prüft am Ende, ob sie erledigt sind.",
    imModul: "Rolle „auftrag“ in der Personenverwaltung. Startseite: „Meine Aufträge“.",
    einstieg: "meine-auftraege",
  },
  {
    name: "Koordinatorin",
    satz: "Verteilt, was hereinkommt, behält die Auslastung im Blick und springt bei Freigaben ein.",
    imModul:
      "Hängt an der Gruppe in Pocket ID, nicht an der Personenzeile. Startseite: „Verteilung“.",
    einstieg: "verteilung",
  },
  {
    name: "Auftragnehmer",
    satz: "Plant die zugewiesene Arbeit in die eigene Woche, erledigt sie und meldet sie fertig.",
    imModul: "Rolle „bufdi“ — die Oberfläche schreibt „BuFDi“. Startseite: „Meine Woche“.",
    einstieg: "meine-woche",
  },
];

/**
 * DER DURCHGEHENDE FALL. Er steht auf `/hilfe` als vier Schritte und taucht in den Szenen der
 * Kapitel wieder auf — dieselbe Aufgabe, dieselben Namen (die des Seeds).
 */
export const FADEN: readonly { rolle: string; tut: string }[] = [
  {
    rolle: "Malte, Auftraggeber",
    tut: "stellt „Beamer im Schulungsraum prüfen“ ein: Frist Donnerstag, 45 Minuten, Foto als Nachweis.",
  },
  {
    rolle: "Rike, Koordinatorin",
    tut: "sieht den Auftrag im Posteingang, schaut auf die Auslastung und gibt ihn Alina — mit dem Vorschlag „Do, 09:00“.",
  },
  {
    rolle: "Alina, Auftragnehmerin",
    tut: "nimmt den Vorschlag an, arbeitet den Donnerstagvormittag ab und meldet fertig, mit Foto.",
  },
  {
    rolle: "Malte prüft",
    tut: "gibt frei — die Aufgabe ist abgeschlossen und steht ab jetzt im Archiv.",
  },
];

/* ─── DAS KAPITEL ─────────────────────────────────────────────────────────────────────────────── */

/**
 * WOHIN DAS KAPITEL VERWEIST — die Sicht selbst, nicht ein weiteres Kapitel.
 *
 * DREI AUSPRAEGUNGEN, WEIL ES DREI ARTEN VON ZIEL GIBT und ein `string | null` die dritte
 * verschwiege: eine feste Adresse (`/verteilen`), die eigene Person in der Adresse
 * (`/plan/<personId>` — die Anleitung kann nur die Adresse DER LESENDEN Person anbieten, eine
 * fremde waere geraten), und gar keine Adresse (`/a/<id>` gibt es nur zu einer bestimmten
 * Aufgabe). Der dritte Fall traegt deshalb einen SATZ statt eines Verweises: „so kommst du hin"
 * ist die Auskunft, die eine Adresse hier nicht geben kann.
 */
export type Ziel =
  | { art: "fest"; href: string }
  | { art: "eigenerPlan" }
  | { art: "kein"; hinweis: string };

/**
 * EIN KASTEN DER LAYOUTSKIZZE (`_ui/hilfe/Skizze.tsx`).
 *
 * DIE NUMMER STEHT AM KASTEN UND DIE ERKLAERUNG DANEBEN — beide aus DIESEM Objekt, nie aus zwei
 * Listen: eine getrennt gepflegte Legende laeuft beim ersten Einschub in der Mitte auseinander,
 * und der Fehler ist still (die Skizze zeigt dann auf den falschen Kasten, ohne dass irgendein
 * Tor es sieht). `hilfe.test.ts` prueft zusaetzlich, dass die Nummern je Skizze lueckenlos bei 1
 * beginnen.
 */
export interface SkizzenBlock {
  /** Was auf der echten Flaeche in diesem Bereich steht — moeglichst deren eigener Wortlaut. */
  titel: string;
  /** Die Erklaerung daneben. Ein Satz, der sagt, WOFUER der Bereich da ist. */
  erklaerung: string;
  /**
   * Die Zeichnung des Kastens. `kopf` (Brotkrume + Titel + Kontextzeile), `karte` (die
   * Fuehrungskarte, mit Knopf), `spalten` (Tages-/Personenspalten), `liste` (Zeilenliste),
   * `formular` (Feldblock), `band` (eine einzelne Leiste), `fuss` (leise Verweise).
   */
  form: "kopf" | "karte" | "spalten" | "liste" | "formular" | "band" | "fuss";
  /** Nur fuer `form: "spalten"` — die Spaltenkoepfe (Mo–Fr, Personennamen …). */
  spalten?: readonly string[];
}

/** Die Mechanikbilder (`_ui/hilfe/Bilder.tsx`) — je eines je Frage, die eine Skizze nicht beantwortet. */
export const BILD_NAMEN = [
  "rollen",
  "lebenszyklus",
  "tagesbudget",
  "wochenachse",
  "verteilweg",
  "freigabe",
  "nachweisweg",
] as const;

export type BildName = (typeof BILD_NAMEN)[number];

/** Ein Schritt der Handlungsanweisung. Die Nummer entsteht aus der Reihenfolge, nie von Hand. */
export interface Schritt {
  titel: string;
  text: string;
}

export interface HilfeSicht {
  schluessel: SichtSchluessel;
  /** Der Titel der SICHT, wortgleich mit ihrer `<h1>` — daran erkennt man sie wieder. */
  titel: string;
  /** Fuer wen diese Sicht gebaut ist, in den Namen aus `ROLLEN`. */
  fuer: string;
  /** Die eine Frage, die diese Sicht beantwortet — eine Zeile, aktiv. */
  wofuer: string;
  /**
   * DIE LAGE, IN DER MAN DIESE SEITE AUFMACHT — zwei, drei Saetze, Gegenwart, „du". Sie steht vor
   * allem anderen im Kapitel (s. Kopfkommentar: wer sich in der ersten Zeile wiedererkennt, liest
   * die zweite).
   */
  szene: string;
  ziel: Ziel;
  /** Die Layoutskizze: welche Bereiche die Sicht hat und wofuer jeder da ist. */
  skizze: readonly SkizzenBlock[];
  /** Die Mechanikbilder dieses Kapitels, in Lesereihenfolge. */
  bilder: readonly BildName[];
  schritte: readonly Schritt[];
  /**
   * „Was hier nicht geht — und warum." Der wichtigste Abschnitt jeder Anleitung: die meisten
   * Rueckfragen im Betrieb sind keine Bedienfragen, sondern Fragen nach einer Absicht („warum
   * kann ich das nicht?"). Ohne den Grund bleibt die Antwort eine Behauptung.
   */
  grenzen: readonly string[];
  /** Kapitel, die als naechstes helfen. */
  verweise: readonly SichtSchluessel[];
  /**
   * WER DAS KAPITEL IN SEINER UEBERSICHT SIEHT — aus den Praedikaten von `_lib/zugang.ts`,
   * nie aus einer eigenen Rollenabfrage (s. Kopfkommentar).
   */
  sichtbar: (akteur: Akteur, heute: string) => boolean;
}

/**
 * DIE VERZWEIGUNG VON `page.tsx`s `aufgabenInhalt`, NACHGEBILDET FUER DIE ANLEITUNG — und zwar in
 * DERSELBEN REIHENFOLGE: erst die Gruppe (`istKoordination`), dann die Zeilenrolle. Ein `switch`
 * allein ueber `rolle` koennte den Koordinationseinstieg nie erreichen, weil jede koordinierende
 * Person in der Modultabelle zusaetzlich `auftrag` oder `bufdi` traegt (`_db/schema.ts`s `ROLLEN`).
 *
 * DASS ES EINE ZWEITE STELLE IST, WIRD NICHT VERSCHWIEGEN, SONDERN GEPRUEFT: `aufgabenInhalt`
 * liefert JSX, kein Kennzeichen — es gibt nichts, was diese Funktion aufrufen koennte, ohne die
 * Seite zu rendern. `hilfe.test.ts` rendert sie deshalb wirklich und vergleicht die `<h1>` mit
 * `HILFE_SICHTEN[einstiegsSicht(akteur)].titel`. Laeuft die Verzweigung je auseinander, faellt
 * der Test — nicht die Anleitung im Betrieb.
 */
export function einstiegsSicht(akteur: Akteur): SichtSchluessel {
  if (akteur.istKoordination) return "verteilung";
  return akteur.person.rolle === "bufdi" ? "meine-woche" : "meine-auftraege";
}

/** Immer sichtbar — die Sicht traegt kein Rollen-Gate (`/neu`, `/archiv`, `/a/<id>`, `/plan/<id>`). */
const fuerAlle = () => true;

export const HILFE_SICHTEN: Record<SichtSchluessel, HilfeSicht> = {
  // ─── Die drei Einstiege unter `/` ─────────────────────────────────────────────────────────────
  "meine-woche": {
    schluessel: "meine-woche",
    titel: "Meine Woche",
    fuer: "Auftragnehmer",
    wofuer: "Was ist jetzt dran — und passt das überhaupt noch in den Tag?",
    szene:
      "Dienstag, kurz nach acht. Du machst das Modul auf und willst eine Antwort, keine Übersicht: " +
      "womit fange ich an? Genau darauf ist diese Seite gebaut. Ganz oben steht die eine Sache, die " +
      "als Nächstes zählt, darunter deine Woche — und was heute noch nicht drankommt, steht bewusst " +
      "weiter unten.",
    ziel: { art: "fest", href: "/" },
    skizze: [
      {
        form: "kopf",
        titel: "Meine Woche · KW · ‹ Diese Woche ›",
        erklaerung:
          "Titel, darunter die Kontextzeile mit den Zahlen der gezeigten Woche — verplante Stunden " +
          "und wie viele Aufgaben eingeplant sind. Rechts blätterst du eine Woche vor oder zurück.",
      },
      {
        form: "karte",
        titel: "Führungskarte — die eine Sache, die jetzt dran ist",
        erklaerung:
          "Sie ist immer da. Drängt gerade nichts, sagt sie dir stattdessen, was am nächsten " +
          "Arbeitstag liegt. Der rote Knopf darauf ist der einzige der Seite, und er gehört immer " +
          "zu dem, was über ihm steht.",
      },
      {
        form: "spalten",
        titel: "Diese Woche",
        spalten: ["Mo", "Di", "Mi", "Do", "Fr"],
        erklaerung:
          "Deine fünf Arbeitstage mit Aufgaben und Routinen, in der Reihenfolge, die du selbst " +
          "festlegst. Unter jedem Tag steht sein Budget: verplant von Soll. Auf dem Telefon zeigt " +
          "die Achse einen Tag, und die Leiste darüber wechselt ihn.",
      },
      {
        form: "band",
        titel: "„N Aufgaben liegen außerhalb dieser Woche“",
        erklaerung:
          "Alles, was in keine der fünf Spalten passt: ohne Termin oder in einer anderen Woche. " +
          "Ohne diese Zeile wäre es unsichtbar — und deine Woche sähe leerer aus, als sie ist.",
      },
      {
        form: "liste",
        titel: "Zonen: Zurückgewiesen · Wartet auf Einplanung · …",
        erklaerung:
          "Was die Karte nicht nennt, steht hier — nach Dringlichkeit sortiert, jede Zone mit ihrer " +
          "Zahl. Ist eine Zone leer, fällt sie ganz weg, statt leer herumzustehen.",
      },
      {
        form: "fuss",
        titel: "Routinen verwalten · Zeitplan von …",
        erklaerung:
          "Die leisen Nebenwege: deine Routinen, und die Wochenpläne der anderen zum Mitlesen — " +
          "für Absprachen, ohne dass die Koordinatorin dazwischenstehen muss.",
      },
    ],
    bilder: ["rollen", "wochenachse", "tagesbudget"],
    schritte: [
      {
        titel: "Oben anfangen",
        text:
          "Die Führungskarte nennt genau einen Anlass und die Aktion dazu. Steht dort eine " +
          "Ruhe-Zeile, ist gerade nichts überfällig — dann ist der nächste Arbeitstag dein Thema, " +
          "und die Karte sagt dir, was dort wartet.",
      },
      {
        titel: "Neues einplanen",
        text:
          "Frisch zugewiesene Aufgaben warten in der Zone „Wartet auf Einplanung“. Hat die " +
          "Koordinatorin einen Termin vorgeschlagen, steht er direkt auf dem Knopf: „Annehmen: Do, " +
          "13.08., 09:00“. Passt er nicht, klappt „Anders einplanen“ in derselben Zeile Tag und " +
          "Uhrzeit auf — du musst die Seite dafür nicht verlassen.",
      },
      {
        titel: "Den Tag ordnen",
        text:
          "Innerhalb eines Tages schiebst du Einträge mit den Pfeilknöpfen oder per Zug an die " +
          "richtige Stelle; ziehst du eine Aufgabe in eine andere Spalte, ist sie auf diesen Tag " +
          "umgeplant. Ohne Maus geht dasselbe: Tab bis zum Eintrag, Enter, Pfeiltasten, Enter.",
      },
      {
        titel: "Arbeiten und fertig melden",
        text:
          "„Starten“ setzt die Aufgabe auf „in Arbeit“ — daran sehen Koordinatorin und Auftraggeber, " +
          "dass sie läuft. Beim Fertigmelden fragt das Modul den Nachweis ab, falls einer gefordert " +
          "ist. Danach geht die Aufgabe zur Freigabe; hast du sie dir selbst gestellt, ist sie " +
          "sofort abgeschlossen.",
      },
      {
        titel: "Vor- und zurückblättern",
        text:
          "‹ und › zeigen andere Wochen. Kontextzeile, Achse und die Zeile „außerhalb dieser Woche“ " +
          "sprechen dabei immer über die Woche, die du gerade siehst. Liegt sie ganz in der " +
          "Vergangenheit, steht „Abgeschlossene Woche“ darüber — damit du am Sonntagabend keine " +
          "volle grüne Woche für die kommende hältst.",
      },
    ],
    grenzen: [
      "Fremde Wochenpläne liest du, aber du änderst sie nicht — auch nicht in Vertretung.",
      "Die Koordinatorin schlägt einen Termin vor, sie setzt ihn nicht: über deinen Tag entscheidest du.",
      "Eine Aufgabe, die du dir selbst gestellt hast, hat keine Freigabestufe — sie geht von „in Arbeit“ direkt auf abgeschlossen.",
      "Nach deinem letzten Diensttag bleibt alles lesbar, aber keine Aktion mehr bedienbar. Der letzte Tag zählt noch ganz dazu.",
    ],
    verweise: ["zeitplan", "routinen", "aufgabe", "einstellen"],
    sichtbar: (akteur) => einstiegsSicht(akteur) === "meine-woche",
  },

  verteilung: {
    schluessel: "verteilung",
    titel: "Verteilung",
    fuer: "Koordinatorin",
    wofuer: "Was brennt gerade — und wer hat noch Luft?",
    szene:
      "Über Nacht sind drei Aufträge hereingekommen, einer davon mit Frist heute. Du hast eine " +
      "halbe Minute, bevor das Telefon klingelt. Diese Seite ist auf diese halbe Minute hin " +
      "gebaut: sie zeigt die Lage, nicht den Bestand — und sagt dir mit einer Karte, was zuerst " +
      "dran ist.",
    ziel: { art: "fest", href: "/" },
    skizze: [
      {
        form: "kopf",
        titel: "Verteilung · Aufgabe einstellen",
        erklaerung:
          "Die Kontextzeile nennt die Zahlen des Tages — auch die Nullen, und die stehen " +
          "ausgeschrieben da. Rechts geht es zum Einstellformular.",
      },
      {
        form: "karte",
        titel: "Führungskarte — der dringendste Anlass",
        erklaerung:
          "Eine Aufgabe ohne aktiven Träger, ein überfälliger Posteingang, eine wartende Freigabe: " +
          "die Karte nennt den obersten Rang und bringt die passende Aktion gleich mit.",
      },
      {
        form: "spalten",
        titel: "Auslastung diese Woche",
        spalten: ["Alina", "Bo", "Cem"],
        erklaerung:
          "Je Person der Wochenwert, ein Balken, die fünf Tagesstreifen und die Warnung „Mo " +
          "überbucht“. Das ist die Zahl, die du vor der Zuweisung brauchst — im Zuweisen-Feld steht " +
          "sie zwar noch einmal, aber da hast du dich schon entschieden.",
      },
      {
        form: "liste",
        titel: "Zonen: Zu verteilen · Freigabe offen · …",
        erklaerung:
          "Die übrigen Anlässe nach Rang, je mit Zahl und einem Deckel („alle N zeigen“) auf die " +
          "große Liste. Die beiden Überfällig-Zonen tragen den Zeilenweg „Anders zuweisen“.",
      },
      {
        form: "fuss",
        titel: "Personenverwaltung · Archiv",
        erklaerung: "Die zwei Wege, die keine Tagesarbeit sind.",
      },
    ],
    bilder: ["rollen", "verteilweg", "tagesbudget"],
    schritte: [
      {
        titel: "Mit der Karte anfangen",
        text:
          "Sie nennt den obersten Rang, und die Reihenfolge ist nicht willkürlich: eine Aufgabe " +
          "ohne aktiven Träger steht über einem überfälligen Posteingang, dieser über einer " +
          "wartenden Freigabe. Was dort steht, ist deine nächste Handlung.",
      },
      {
        titel: "Auslastung lesen, dann zuweisen",
        text:
          "Der Wochenwert sagt, wie voll jemand insgesamt ist; die fünf Tagesstreifen sagen, ob ein " +
          "einzelner Tag trotzdem überläuft. Beides zusammen verhindert den häufigsten Fehlgriff: " +
          "jemand steht bei 6 von 39 Wochenstunden und ist montags doppelt verplant.",
      },
      {
        titel: "Zuweisen",
        text:
          "Der Zeilenweg klappt die Namen samt Wochenauslastung auf, und der Klick auf den Namen " +
          "ist schon das Absenden. Über die Führungskarte kannst du zusätzlich einen Termin " +
          "vorschlagen — ein Angebot, keine Ansage: die Person nimmt es an oder plant anders.",
      },
      {
        titel: "Umhängen statt nachfragen",
        text:
          "„Anders zuweisen“ gibt es, solange niemand die Aufgabe begonnen hat. Die bisherige " +
          "Planung wird dabei geleert — sonst bliebe ein Termin in einem Wochenplan stehen, der " +
          "nicht mehr gilt. Der Satz dazu steht im Feld, bevor du absendest.",
      },
      {
        titel: "Freigeben oder zurückweisen",
        text:
          "Du siehst jede offene Freigabe: deine eigenen und die, bei denen du für den " +
          "eingetragenen Prüfer einspringst. Zurückweisen verlangt eine Begründung — sie ist das " +
          "Einzige, woran die andere Seite erkennt, was zu tun ist, und sie bleibt im Verlauf stehen.",
      },
    ],
    grenzen: [
      "Du arbeitest nicht mit: du stehst in keiner Verteilliste, und deine eigene Aufgabe gibst du nie frei — sonst fiele das Vier-Augen-Prinzip für genau den Fall aus, für den es da ist.",
      "Du änderst keinen fremden Wochenplan. Du schlägst einen Termin vor; gesetzt wird er von der Person selbst.",
      "Eine Aufgabe, die schon „in Arbeit“ ist, lässt sich nicht umhängen — erst muss sie zurückgesetzt werden.",
      "Wer koordiniert, entscheidet die Gruppe in Pocket ID, nicht die Personenzeile. Ein Entzug wirkt mit bis zu einer Stunde Verzug.",
    ],
    verweise: ["verteilen", "freigaben", "personen", "aufgabe"],
    sichtbar: (akteur) => einstiegsSicht(akteur) === "verteilung",
  },

  "meine-auftraege": {
    schluessel: "meine-auftraege",
    titel: "Meine Aufträge",
    fuer: "Auftraggeber",
    wofuer: "Was ist aus dem geworden, was ich eingestellt habe?",
    szene:
      "Du hast letzte Woche vier Dinge eingestellt und weißt nicht mehr, was daraus geworden ist. " +
      "Diese Seite beantwortet das in einer Liste — und stellt oben das voran, was auf dich " +
      "wartet, statt es dich suchen zu lassen.",
    ziel: { art: "fest", href: "/" },
    skizze: [
      {
        form: "kopf",
        titel: "Meine Aufträge · Aufgabe einstellen",
        erklaerung: "Die Kontextzeile zählt deine Aufträge und nennt, was davon auf dich wartet.",
      },
      {
        form: "karte",
        titel: "Führungskarte — wartet auf dich",
        erklaerung:
          "Eine fertig gemeldete Aufgabe, die du freigeben sollst; ein überfälliger Auftrag; einer, " +
          "den noch niemand angefasst hat. Steht nichts an, sagt die Karte auch das ausdrücklich.",
      },
      {
        form: "liste",
        titel: "Eigene Aufträge (N)",
        erklaerung:
          "Alle deine Aufträge, vollständig und ungekürzt: Zustand, Priorität, Frist, Dauer und wer " +
          "sie bekommen hat — oder „Noch nicht verteilt“, solange sie im Posteingang liegen.",
      },
      {
        form: "fuss",
        titel: "Archiv",
        erklaerung: "Der Weg zu allem, was schon abgeschlossen ist.",
      },
    ],
    bilder: ["rollen", "lebenszyklus", "freigabe"],
    schritte: [
      {
        titel: "Auftrag einstellen",
        text:
          "Oben rechts, „Aufgabe einstellen“. Für jemand anderen eingestellt, geht der Auftrag in " +
          "den Posteingang der Koordinatorin — die Person wählst du nicht selbst aus, und das ist " +
          "Absicht: wer die Auslastung aller kennt, verteilt besser.",
      },
      {
        titel: "Zustand ablesen",
        text:
          "Die Zeile sagt ohne Klick, wo dein Auftrag steht: eingegangen, verteilt, in Arbeit, " +
          "Freigabe offen, zurückgewiesen, abgeschlossen. Der Titel führt in die Aufgabe, mit " +
          "Nachweis und vollständigem Verlauf.",
      },
      {
        titel: "Freigeben",
        text:
          "Weil du eingestellt hast, bist du auch der Prüfer. Fertig gemeldete Aufgaben findest du " +
          "unter „Freigaben“ — mit dem Nachweis direkt daneben, denn wer freigibt, muss sehen, was " +
          "er freigibt.",
      },
      {
        titel: "Zurückziehen",
        text:
          "Solange der Auftrag noch im Posteingang liegt, kannst du ihn zurückziehen; er " +
          "verschwindet dann samt Verlauf. Danach nicht mehr — ab da hat er eine Geschichte, und " +
          "die gehört zur Leistungsdokumentation.",
      },
    ],
    grenzen: [
      "Du verteilst nicht: den Empfänger bestimmt die Koordinatorin. Der Weg dorthin existiert in dieser Sicht nicht, und /verteilen antwortet dir mit 404.",
      "Fremde Aufträge siehst du nicht — nur deine eigenen und die, in denen du Prüfer bist.",
      "Ist eine Aufgabe erst verteilt, ist Zurückziehen vorbei; umhängen kann sie aber die Koordinatorin.",
    ],
    verweise: ["einstellen", "freigaben", "aufgabe", "archiv"],
    sichtbar: (akteur) => einstiegsSicht(akteur) === "meine-auftraege",
  },

  // ─── Die adressierbaren Sichten ───────────────────────────────────────────────────────────────
  einstellen: {
    schluessel: "einstellen",
    titel: "Aufgabe einstellen",
    fuer: "alle drei Rollen",
    wofuer: "Aus „das müsste mal jemand machen“ wird ein Auftrag mit Frist.",
    szene:
      "Dir fällt auf, dass den Beamer im Schulungsraum seit Wochen niemand geprüft hat. Zwei " +
      "Minuten später ist daraus ein Auftrag: mit Frist, mit geschätzter Dauer, und mit einem " +
      "Foto als Nachweis. Wohin er geht, entscheidet ein einziges Feld weiter unten.",
    ziel: { art: "fest", href: "/neu" },
    skizze: [
      {
        form: "kopf",
        titel: "Aufgabe einstellen",
        erklaerung:
          "Die Kontextzeile nennt die Pflichtfelder: Titel, Erklärung, Priorität, Frist und " +
          "Dauerschätzung.",
      },
      {
        form: "formular",
        titel: "Titel · Erklärung · Priorität · Frist · Dauer",
        erklaerung:
          "Die Erklärung ist Pflicht, weil sonst die Rückfrage kommt, die sie ersetzen soll. Und " +
          "die Dauerschätzung ist keine Formalie: sie füllt das Tagesbudget und entscheidet mit, " +
          "ob ein Tag als überbucht gilt.",
      },
      {
        form: "band",
        titel: "Nachweispflicht: Text oder Bild",
        erklaerung:
          "Ist sie gesetzt, lässt sich die Aufgabe erst fertig melden, wenn ein Nachweis der " +
          "gewählten Art vorliegt.",
      },
      {
        form: "band",
        titel: "Für mich selbst / für jemand anderen",
        erklaerung:
          "Diese Wahl erscheint nur, wenn du für andere einstellen darfst. Sie entscheidet über " +
          "alles Weitere: den Anfangszustand, den Weg über den Posteingang — und ob es am Ende " +
          "eine Freigabe gibt.",
      },
    ],
    bilder: ["lebenszyklus"],
    schritte: [
      {
        titel: "Titel und Erklärung",
        text:
          "Der Titel steht später in jeder Liste und in jeder Tagesspalte — kurz und eindeutig, " +
          "damit man ihn dort wiedererkennt. Die Erklärung beantwortet die Frage, die sonst als " +
          "Rückfrage zurückkommt.",
      },
      {
        titel: "Priorität und Frist",
        text:
          "Die Priorität ordnet die Reihenfolge innerhalb eines Tages vor. Die Frist entscheidet " +
          "darüber, ab wann eine Aufgabe als überfällig gilt — und damit, ob sie auf einer " +
          "Führungskarte landet. Eine Uhrzeit dazu ist möglich, aber keine Pflicht.",
      },
      {
        titel: "Dauer schätzen",
        text:
          "In Minuten, und lieber ehrlich als sportlich: mit dieser Zahl rechnet das Budget, nicht " +
          "mit der tatsächlichen Arbeitszeit. Zu knapp geschätzt wirkt die Woche freier, als sie " +
          "ist — und der nächste Auftrag kommt trotzdem.",
      },
      {
        titel: "Für wen?",
        text:
          "Für dich selbst: die Aufgabe gehört sofort dir, du planst sie ein, und es gibt keine " +
          "Freigabestufe. Für jemand anderen: sie geht in den Posteingang der Koordinatorin, und du " +
          "bist automatisch die Person, die am Ende prüft.",
      },
    ],
    grenzen: [
      "Wer für andere einstellt, wählt die Person nicht aus — das tut die Koordinatorin beim Verteilen.",
      "Auftragnehmer stellen nur für sich selbst ein; die Wahl erscheint ihnen gar nicht erst.",
      "Wer ausgeschieden ist, kann sich auch selbst nichts mehr einstellen.",
      "Fehler kommen am Feld an, nicht auf einer Fehlerseite — deine Eingaben bleiben dabei stehen.",
    ],
    verweise: ["verteilen", "aufgabe", "meine-auftraege"],
    sichtbar: fuerAlle,
  },

  verteilen: {
    schluessel: "verteilen",
    titel: "Verteilen",
    fuer: "Koordinatorin",
    wofuer: "Den Posteingang am Stück abarbeiten.",
    szene:
      "Zehn Aufgaben liegen im Posteingang, und du willst sie loswerden — nicht zehnmal denselben " +
      "Dialog öffnen. Diese Seite ist die lange Fassung der Zone auf deiner Startseite: dieselben " +
      "Daten, aber vollständig und mit zwei Ansichten zur Wahl.",
    ziel: { art: "fest", href: "/verteilen" },
    skizze: [
      {
        form: "kopf",
        titel: "Aufgaben › Verteilen",
        erklaerung: "Die Kontextzeile sagt, wie viele Aufgaben zu verteilen sind — oder dass alles verteilt ist.",
      },
      {
        form: "band",
        titel: "Ansicht: Liste · Brett",
        erklaerung:
          "Zwei Formen derselben Daten. Deine Wahl steht in der Adresse und übersteht das " +
          "Neuladen — und lässt sich verschicken.",
      },
      {
        form: "liste",
        titel: "Posteingang (N)",
        erklaerung:
          "Je Zeile: Titel, Zustand, Priorität, Frist, Dauer und von wem der Auftrag kommt. Rechts " +
          "der Zuweisen-Weg, der die Namen samt Auslastung aufklappt.",
      },
      {
        form: "spalten",
        titel: "Brett (?ansicht=brett)",
        spalten: ["Posteingang", "Alina", "Bo"],
        erklaerung:
          "Dieselben Aufgaben als Karten: links der Posteingang, daneben je Person eine Spalte. Auf " +
          "dem Telefon stapeln sich die Spalten untereinander, statt sich in die Breite zu quetschen.",
      },
    ],
    bilder: ["verteilweg"],
    schritte: [
      {
        titel: "Von oben nach unten",
        text:
          "Der Posteingang steht schon nach Dringlichkeit: Überfälliges zuerst, dann nach Priorität " +
          "und Frist. Du musst also nicht sortieren, sondern nur anfangen.",
      },
      {
        titel: "Zuweisen ohne Umweg",
        text:
          "Der Zeilenweg klappt die Namen mit ihrer Wochenauslastung auf; ein Klick auf den Namen " +
          "weist zu. Kein Dialog, kein zweites Absenden — bei zehn Aufgaben spart das dreißig " +
          "Handgriffe.",
      },
      {
        titel: "Brett, wenn du umschichtest",
        text:
          "Das Brett zeigt nebeneinander, wer schon wie viel bekommen hat. Eine Karte wandert per " +
          "Zug oder über ihren Knopf in eine Personenspalte — das ist derselbe Vorgang, nur anders " +
          "angefasst.",
      },
      {
        titel: "Termin vorschlagen",
        text:
          "Über die Aufgabe selbst oder die Führungskarte kannst du Tag und Uhrzeit vorschlagen. " +
          "Die andere Seite sieht daraus einen Knopf „Annehmen: …“ — verbindlich ist der Vorschlag " +
          "nicht, und das ist der Punkt.",
      },
    ],
    grenzen: [
      "Verteilziel ist nur, wer heute aktiv ist. Ausgeschiedene stehen in keiner Liste — und du selbst auch nicht.",
      "Verteilen setzt keinen Termin. Der Wochenplan gehört der Person, die die Arbeit macht.",
      "Ein Auftraggeber ohne Koordinationsrolle bekommt hier 404 — in seiner Oberfläche führt deshalb auch kein Weg hierher.",
    ],
    verweise: ["verteilung", "aufgabe", "personen"],
    sichtbar: darfVerteilen,
  },

  freigaben: {
    schluessel: "freigaben",
    titel: "Freigaben",
    fuer: "Auftraggeber und Koordinatorin",
    wofuer: "Fertig gemeldete Arbeit prüfen: freigeben oder mit Begründung zurück.",
    szene:
      "Alina hat fertig gemeldet und ein Foto angehängt. Jetzt liegt es bei dir — und zwar " +
      "wirklich bei dir: ohne deine Freigabe ist die Aufgabe nicht erledigt. Der Nachweis steht " +
      "gleich daneben, damit du nicht erst suchen musst, was du da abnickst.",
    ziel: { art: "fest", href: "/freigaben" },
    skizze: [
      {
        form: "kopf",
        titel: "Aufgaben › Freigaben",
        erklaerung: "Die Kontextzeile zählt, wie viele Aufgaben auf Freigabe warten.",
      },
      {
        form: "liste",
        titel: "Meine Freigaben",
        erklaerung:
          "Aufgaben, bei denen du der eingetragene Prüfer bist — mit dem Nachweis direkt darunter, " +
          "Text wie Bild.",
      },
      {
        form: "liste",
        titel: "In Vertretung",
        erklaerung:
          "Nur für die Koordinatorin: Freigaben, deren Prüfer jemand anderes ist. Der Verlauf hält " +
          "danach fest „Freigegeben von X in Vertretung für Y“.",
      },
      {
        form: "band",
        titel: "Freigeben · Zurückweisen",
        erklaerung:
          "Freigeben ist ein Klick. Zurückweisen öffnet ein Feld und verlangt eine Begründung — " +
          "ohne sie geht es nicht weiter.",
      },
    ],
    bilder: ["freigabe", "nachweisweg"],
    schritte: [
      {
        titel: "Nachweis ansehen",
        text:
          "Er steht in der Zeile, nicht hinter einem Klick. Ein Bild wird allerdings erst " +
          "ausgeliefert, wenn die Virenprüfung es freigegeben hat — bis dahin ist es hinterlegt, " +
          "aber nicht sichtbar.",
      },
      {
        titel: "Freigeben",
        text:
          "Die Aufgabe geht auf abgeschlossen und wandert ins Archiv. Der Verlauf hält fest, wer " +
          "freigegeben hat — und ob in Vertretung.",
      },
      {
        titel: "Zurückweisen",
        text:
          "Die Begründung ist Pflicht, weil sie die eigentliche Arbeit ist: sie ist das Einzige, " +
          "woran die andere Seite erkennt, was fehlt. Die Aufgabe erscheint dort in der Zone " +
          "„Zurückgewiesen“ und kann von da aus wieder aufgenommen werden.",
      },
    ],
    grenzen: [
      "Selbstgestellte Aufgaben haben keine Freigabestufe und erscheinen hier nie.",
      "Niemand gibt die eigene Arbeit frei — auch die Koordinatorin nicht, wenn die Aufgabe ihr zugewiesen ist.",
      "Nach dem Ausscheiden bleibt die eigene Prüfgeschichte lesbar, aber die Freigabeaktion wird nicht mehr angeboten.",
      "Auftragnehmer ohne Koordinationsrolle bekommen hier 404.",
    ],
    verweise: ["aufgabe", "verteilung", "meine-auftraege"],
    sichtbar: darfFreigabenSehen,
  },

  routinen: {
    schluessel: "routinen",
    titel: "Routinen",
    fuer: "Auftragnehmer",
    wofuer: "Wiederkehrende Arbeit sichtbar machen, die sonst still das Budget frisst.",
    szene:
      "Jeden Montag räumst du eine Stunde das Lager auf. Das stellt dir niemand als Aufgabe ein — " +
      "aber die Stunde ist weg, und dein Montag soll das wissen. Genau dafür sind Routinen da: " +
      "einmal hinterlegt, zählen sie ab sofort in jeder Woche mit.",
    ziel: { art: "fest", href: "/routinen" },
    skizze: [
      {
        form: "kopf",
        titel: "Aufgaben › Routinen",
        erklaerung: "Die Kontextzeile zählt deine Routinen und sagt, wie viele davon gerade ruhen.",
      },
      {
        form: "formular",
        titel: "Neue Routine anlegen",
        erklaerung:
          "Titel, Wochentage, optionale Uhrzeit und Dauer in Minuten. Dieselbe Maske ändert später " +
          "eine bestehende Routine.",
      },
      {
        form: "liste",
        titel: "Deine Routinen",
        erklaerung:
          "Je Zeile die Wochentage, die Dauer und der Schalter „ruhen lassen“ — für Zeiten, in " +
          "denen eine Routine nicht anfällt, ohne dass du sie verlierst.",
      },
    ],
    bilder: ["tagesbudget", "wochenachse"],
    schritte: [
      {
        titel: "Anlegen",
        text:
          "Wochentage ankreuzen, Dauer schätzen, fertig. Ab sofort steht die Routine in jeder Woche " +
          "an diesen Tagen — in deiner Achse und in der Auslastung, die die Koordinatorin sieht.",
      },
      {
        titel: "Ruhen lassen statt löschen",
        text:
          "Fällt eine Routine eine Weile weg, stell sie auf ruhend: sie zählt dann nicht mehr ins " +
          "Budget, bleibt aber erhalten und ist mit einem Klick wieder da.",
      },
      {
        titel: "Ehrlich schätzen",
        text:
          "Routinen essen Budget, bevor die erste Aufgabe eingeplant ist. Zu niedrig angesetzt, " +
          "wirkt dein Tag freier, als er ist — und genau so viel Arbeit bekommst du dann auch.",
      },
    ],
    grenzen: [
      "Routinen gehören dir: fremde kannst du weder anlegen noch ändern.",
      "Eine Routine ist keine Aufgabe — kein Zustand, kein Nachweis, keine Freigabe, und in der Achse nicht verschiebbar.",
      "Auftraggeber und Koordinatorin haben keine Routinen; die Seite antwortet ihnen mit 404.",
    ],
    verweise: ["meine-woche", "zeitplan"],
    sichtbar: darfRoutinenVerwalten,
  },

  personen: {
    schluessel: "personen",
    titel: "Personenverwaltung",
    fuer: "Koordinatorin",
    wofuer: "Wer macht mit, in welcher Rolle, ab wann — und mit wie viel Zeit am Tag?",
    szene:
      "Ein neuer Jahrgang fängt an, zwei Leute hören auf. Zehn Minuten Arbeit — wenn man weiß, " +
      "welches Feld was auslöst. Drei davon sind es, die zählen: die Kennung, die Rolle und das " +
      "Tagessoll.",
    ziel: { art: "fest", href: "/personen" },
    skizze: [
      {
        form: "kopf",
        titel: "Aufgaben › Personenverwaltung",
        erklaerung: "Die Kontextzeile nennt die Zahl der Personen und wie viele davon heute aktiv sind.",
      },
      {
        form: "formular",
        titel: "Neue Person anlegen",
        erklaerung:
          "Name, Initialen, Kennung aus Pocket ID, Rolle, Tagessoll in Minuten sowie aktiv von und " +
          "bis. Hängt das Verzeichnis dran, füllt die Suche die Felder für dich.",
      },
      {
        form: "liste",
        titel: "Personen",
        erklaerung:
          "Je Zeile Rolle, Zeitraum, Tagessoll und ob die Person heute aktiv ist — dazu „Beenden“ " +
          "mit Rückfrage.",
      },
    ],
    bilder: ["rollen"],
    schritte: [
      {
        titel: "Zuerst die Kennung",
        text:
          "Die Kennung aus Pocket ID verbindet die Anmeldung mit dieser Zeile. Ohne sie sieht die " +
          "Person zwar das Modul, findet sich aber nicht darin wieder — sie landet auf der " +
          "Hinweisseite „noch nicht eingetragen“. Genau dort steht ihre Kennung; sie kann sie dir " +
          "einfach durchgeben.",
      },
      {
        titel: "Rolle wählen",
        text:
          "„bufdi“ arbeitet Aufgaben ab und führt einen Wochenplan; „auftrag“ stellt für andere ein " +
          "und prüft. Die Koordinationsrolle vergibst du nicht hier, sondern über die Gruppe in " +
          "Pocket ID — sonst gäbe es zwei Register für dieselbe Frage, und die laufen auseinander.",
      },
      {
        titel: "Tagessoll setzen",
        text:
          "Die Minuten pro Arbeitstag sind die Bezugsgröße jedes Budgetbalkens. Steht hier eine " +
          "falsche Zahl, ist jede Auslastungsangabe falsch — für die Person und für dich.",
      },
      {
        titel: "Beenden statt löschen",
        text:
          "Ein „aktiv bis“ zählt den letzten Tag noch mit, damit niemand an seinem letzten " +
          "Diensttag nichts mehr abgeben kann. Danach bleibt alles lesbar, aber nichts mehr " +
          "bedienbar, und offene Aufgaben tauchen bei dir als „ohne aktiven Träger“ auf.",
      },
    ],
    grenzen: [
      "Es gibt keine Löschaktion: an Personen hängen Verlauf und Nachweise, und eine gelöschte Zeile risse die Dokumentation auf.",
      "Die Koordinationsrolle kommt aus der Pocket-ID-Gruppe, nicht aus dieser Tabelle — ein Entzug wirkt mit bis zu einer Stunde Verzug.",
      "Ein „aktiv bis“ in der Vergangenheit sperrt dich nicht aus der Koordination aus, wohl aber aus jeder Rolle, die an der Personenzeile hängt.",
    ],
    verweise: ["verteilung", "verteilen"],
    sichtbar: darfPersonenVerwalten,
  },

  zeitplan: {
    schluessel: "zeitplan",
    titel: "Zeitplan",
    fuer: "alle drei Rollen — ändern nur die Person selbst",
    wofuer: "Eine ganze Woche am Stück: was liegt wann, in welcher Reihenfolge, und passt es?",
    szene:
      "Drei neue Aufgaben, keine hat einen Termin. Hier legst du fest, wann du was machst — und " +
      "siehst in derselben Ansicht, ob der Tag das noch hergibt. Fremde Wochen kannst du " +
      "aufschlagen und mitlesen; ändern kann sie nur, wem sie gehört.",
    ziel: { art: "eigenerPlan" },
    skizze: [
      {
        form: "kopf",
        titel: "Mein Zeitplan / Zeitplan von …",
        erklaerung:
          "Die Kontextzeile nennt die verplanten Stunden der Woche gegen das Soll. Darunter der " +
          "Wochenwähler.",
      },
      {
        form: "liste",
        titel: "Einzuplanen",
        erklaerung:
          "Nur im eigenen Plan: alles, was dir zugewiesen ist und noch keinen Termin hat, je mit " +
          "einem Formular für Tag, Uhrzeit und Reihenfolge.",
      },
      {
        form: "spalten",
        titel: "Die Woche",
        spalten: ["Mo", "Di", "Mi", "Do", "Fr"],
        erklaerung:
          "Aufgaben und Routinen je Tag, mit Budgetzeile darunter. Im eigenen Plan trägt jeder " +
          "Eintrag Rangknöpfe und lässt sich ziehen; im fremden Plan ist die Woche reine Lektüre.",
      },
    ],
    bilder: ["wochenachse", "tagesbudget"],
    schritte: [
      {
        titel: "Einplanen",
        text:
          "Im Block „Einzuplanen“ Tag und optional Uhrzeit setzen. Danach steht die Aufgabe in der " +
          "Tagesspalte und zählt in dessen Budget mit.",
      },
      {
        titel: "Reihenfolge ändern",
        text:
          "Die Pfeilknöpfe verschieben einen Eintrag innerhalb des Tages, ein Zug in eine andere " +
          "Spalte plant ihn um. Mit der Tastatur: Tab bis zum Eintrag, Enter, Pfeiltasten, Enter " +
          "zum Ablegen.",
      },
      {
        titel: "Überbuchung ernst nehmen",
        text:
          "Steht unter einem Tag „überbucht“, ist mehr verplant als dein Tagessoll — Routinen " +
          "eingerechnet. Das Modul hindert dich nicht daran; es sagt dir nur früh genug, dass der " +
          "Tag nicht aufgeht.",
      },
      {
        titel: "Fremde Wochen lesen",
        text:
          "Über die Fußzeile deiner Startseite kommst du in die Pläne der anderen. Das ist für " +
          "Absprachen und Vertretungen gedacht — ohne dass jemand dazwischenstehen muss.",
      },
    ],
    grenzen: [
      "Ändern darf nur die Person selbst — auch die Koordinatorin sieht den Plan, greift aber nicht hinein.",
      "Routinen sind nicht ziehbar: sie hängen an ihren Wochentagen, nicht an einem verschobenen Termin.",
      "Ein Zug plant um, er startet nichts: der Zustand der Aufgabe bleibt, wie er war.",
      "Nach dem Ausscheiden bleibt der Plan lesbar, aber unveränderlich.",
    ],
    verweise: ["meine-woche", "routinen", "aufgabe"],
    sichtbar: fuerAlle,
  },

  aufgabe: {
    schluessel: "aufgabe",
    titel: "Die einzelne Aufgabe",
    fuer: "alle drei Rollen",
    wofuer: "Alles zu einer Aufgabe an einem Ort — samt ihrer ganzen Geschichte.",
    szene:
      "Irgendwo in einer Liste steht ein Titel, der dich angeht. Ein Klick, und hier steht alles: " +
      "der Auftrag, der Zustand, der Nachweis, jede Aktion, die dir gerade offensteht — und " +
      "darunter, wer wann was getan hat. Diese Seite ist der Ort, an dem Rückfragen enden.",
    ziel: {
      art: "kein",
      hinweis:
        "Über den Titel einer Aufgabe — in jeder Liste, jeder Zone, jeder Tagesspalte und auf der " +
        "Führungskarte.",
    },
    skizze: [
      {
        form: "kopf",
        titel: "Aufgaben › <Titel>",
        erklaerung: "Die Kontextzeile nennt Auftraggeber und Frist.",
      },
      {
        form: "band",
        titel: "Zustand · Priorität · Frist · Nachweispflicht",
        erklaerung:
          "Die Chipzeile beantwortet ohne Klick, wo die Aufgabe steht. Farbe ist dabei nie der " +
          "einzige Träger der Bedeutung — das Wort steht immer daneben.",
      },
      {
        form: "formular",
        titel: "Erklärung und Metablock",
        erklaerung:
          "Auftraggeber, zugewiesene Person, Frist, Dauerschätzung und Prüfer. Bei einer " +
          "selbstgestellten Aufgabe steht dort ausdrücklich „— (Selbstaufgabe)“: sie hat keinen " +
          "Prüfer.",
      },
      {
        form: "liste",
        titel: "Nachweis",
        erklaerung:
          "Text- und Bildnachweise, sichtbar nur für Koordinatorin, Auftraggeber, die zugewiesene " +
          "Person und den eingetragenen Prüfer. Leistungsnachweise sind kein Aushang.",
      },
      {
        form: "band",
        titel: "Aktion",
        erklaerung:
          "Genau die Aktionen, die du mit dieser Aufgabe in diesem Zustand ausführen darfst — " +
          "höchstens eine davon ist die rote Hauptaktion. Steht dort nichts, ist für dich gerade " +
          "nichts zu tun.",
      },
      {
        form: "liste",
        titel: "Verlauf",
        erklaerung:
          "Jeder Schritt mit Zeitpunkt, Person und Notiz — einschließlich Zurückweisungsgründen " +
          "und Vertretungsfreigaben. Das ist die Leistungsdokumentation.",
      },
    ],
    bilder: ["lebenszyklus", "nachweisweg"],
    schritte: [
      {
        titel: "Zustand lesen",
        text:
          "Die Chipzeile oben sagt, wo die Aufgabe steht. Das Lebenszyklus-Bild in diesem Kapitel " +
          "sagt, was von dort aus möglich ist — und wer es tun darf.",
      },
      {
        titel: "Handeln",
        text:
          "Unter „Aktion“ steht nur, was erlaubt ist. Was dir dort fehlt, fehlt aus genau einem von " +
          "zwei Gründen: der Zustand passt nicht, oder die Rolle.",
      },
      {
        titel: "Nachweis anlegen",
        text:
          "Beim Fertigmelden: Text schreiben oder Bild hochladen. Bilder gehen vor der Auslieferung " +
          "durch die Virenprüfung; bis die durch ist, sind sie hinterlegt, aber nicht sichtbar.",
      },
      {
        titel: "Verlauf als Beleg",
        text:
          "Wer wann was getan hat, steht unten — auch, wenn die Koordinatorin in Vertretung " +
          "freigegeben hat. Für Beurteilungen und Rückfragen ist das die belastbare Quelle.",
      },
    ],
    grenzen: [
      "Zurückziehen geht nur, solange die Aufgabe noch im Posteingang liegt — danach hat sie eine Geschichte, die nicht verschwinden soll.",
      "Nachweise sieht nicht jeder, sondern nur die vier Rollen zu dieser Aufgabe.",
      "Der Verlauf lässt sich nicht bearbeiten. Eine falsche Angabe wird durch einen neuen Schritt korrigiert, nicht durch Überschreiben.",
    ],
    verweise: ["freigaben", "zeitplan", "archiv"],
    sichtbar: fuerAlle,
  },

  archiv: {
    schluessel: "archiv",
    titel: "Archiv",
    fuer: "alle drei Rollen",
    wofuer: "Nachschlagen, was erledigt ist — gefiltert auf das, was du sehen darfst.",
    szene:
      "„Der Beamer wurde doch schon mal geprüft — wann war das, und was stand im Nachweis?“ Für " +
      "solche Fragen gibt es das Archiv: alles Abgeschlossene, vollständig, auch Jahre später.",
    ziel: { art: "fest", href: "/archiv" },
    skizze: [
      {
        form: "kopf",
        titel: "Aufgaben › Archiv",
        erklaerung: "Die Kontextzeile zählt die abgeschlossenen Aufgaben, die für dich sichtbar sind.",
      },
      {
        form: "band",
        titel: "Filter: Priorität",
        erklaerung: "Filtert serverseitig; die Wahl steht in der Adresse und lässt sich verlinken.",
      },
      {
        form: "liste",
        titel: "Abgeschlossene Aufgaben",
        erklaerung: "Dieselbe Zeilenform wie überall sonst. Der Titel führt zu Nachweis und Verlauf.",
      },
    ],
    bilder: [],
    schritte: [
      {
        titel: "Über den Filter suchen",
        text:
          "Priorität wählen — die Liste bleibt vollständig, sie wird nur enger. Die Auswahl steht " +
          "in der Adresse, du kannst sie also weitergeben.",
      },
      {
        titel: "In die Aufgabe gehen",
        text: "Nachweis und Verlauf sind dort vollständig erhalten, auch Jahre später.",
      },
    ],
    grenzen: [
      "Das Archiv zeigt nur Abgeschlossenes — Zurückgewiesenes steht bei der Person, die es bearbeitet, nicht hier.",
      "Was du nicht sehen darfst, erscheint auch hier nicht: Auftragnehmer sehen alle Aufgaben, ein Auftraggeber nur seine eigenen.",
      "Eine abgeschlossene Aufgabe lässt sich nicht wieder öffnen — der richtige Weg ist eine neue Aufgabe.",
    ],
    verweise: ["aufgabe"],
    sichtbar: fuerAlle,
  },
};

/**
 * DIE KAPITEL FUER DIESE PERSON, IN LESEREIHENFOLGE (`SICHT_SCHLUESSEL`) — gefiltert ueber die
 * Praedikate der jeweiligen Sicht, also ueber `_lib/zugang.ts` (s. Kopfkommentar).
 */
export function hilfeSichten(akteur: Akteur, heute: string): HilfeSicht[] {
  return SICHT_SCHLUESSEL.map((k) => HILFE_SICHTEN[k]).filter((s) => s.sichtbar(akteur, heute));
}

/** Der Schluessel als Sicht, oder `null` — die Pruefung fuer `/hilfe/<sicht>` (`notFound()` dort). */
export function sichtFuerSchluessel(wert: string | undefined): HilfeSicht | null {
  if (wert === undefined) return null;
  return (SICHT_SCHLUESSEL as readonly string[]).includes(wert)
    ? HILFE_SICHTEN[wert as SichtSchluessel]
    : null;
}

/**
 * DIE ADRESSE, AUF DIE EIN KAPITEL VERWEIST — oder `null`, wenn es keine gibt.
 *
 * `eigenerPlan` LOEST AUF DIE LESENDE PERSON AUF und nie auf eine andere: eine Anleitung, die auf
 * einen fremden Zeitplan zeigt, zeigt auf eine Seite, auf der die lesende Person nichts tun kann
 * (`darfPlanAendern` misst die eigene Id) — richtig waere sie, nuetzlich nicht.
 */
export function zielHref(sicht: HilfeSicht, akteur: Akteur): string | null {
  switch (sicht.ziel.art) {
    case "fest":
      return sicht.ziel.href;
    case "eigenerPlan":
      return `/plan/${akteur.person.id}`;
    case "kein":
      return null;
  }
}

/*
 * ─── DAS LEBENSZYKLUS-BILD ALS DATEN ──────────────────────────────────────────────────────────
 *
 * DIE KANTEN STEHEN HIER, DAMIT SIE PRUEFBAR SIND. Eine Zustandsgrafik in einer Anleitung ist die
 * Angabe, die am leisesten falsch wird: `_lib/lebenszyklus.ts`s `TABELLE` aendert sich, das Bild
 * nicht, und niemand merkt es — ein Bild wird nicht rot, es wird nur unwahr (dieselbe Bauart wie
 * die Ueberschrift „Die Woche der drei", s. `_ui/EinstiegKoordination.tsx`).
 *
 * DESHALB GILT: jede Kante mit einem echten Ausgangs- UND Zielzustand MUSS eine Zeile in `TABELLE`
 * haben, und jede Zeile von `TABELLE` MUSS hier vorkommen — `hilfe.test.ts` vergleicht beide
 * Mengen in BEIDE Richtungen gegen das aus `lebenszyklus.ts` exportierte `UEBERGAENGE`.
 *
 * ZWEI KANTEN HABEN BEWUSST KEINEN TABELLENEINTRAG, und beide sind als solche markiert:
 * `einstellen` (kein Uebergang — es gibt keinen Ausgangszustand, s. `anfangsZustand`) und
 * `zurueckziehen` (kein Zielzustand — es LOESCHT die Aufgabe). Sie tragen `schluessel: null`;
 * der Test nimmt genau diese aus dem Mengenvergleich heraus und prueft dafuer, dass es nicht mehr
 * werden.
 */
export interface ZyklusKante {
  von: Status | "start";
  nach: Status | "geloescht";
  /** Die Beschriftung der Kante — der Wortlaut der Oberflaeche, nicht der Aktionsschluessel. */
  aktion: string;
  /** Wer sie ausloest, in der Sprache der Anleitung. */
  wer: string;
  /** Der Aktionsschluessel aus `_lib/lebenszyklus.ts` — `null` bei den zwei Sonderfaellen. */
  schluessel: string | null;
}

export const ZYKLUS_KANTEN: readonly ZyklusKante[] = [
  {
    von: "start",
    nach: "eingegangen",
    aktion: "einstellen (für andere)",
    wer: "Auftraggeber · Koordinatorin",
    schluessel: null,
  },
  {
    von: "start",
    nach: "verteilt",
    aktion: "einstellen (für sich selbst)",
    wer: "jede Rolle",
    schluessel: null,
  },
  {
    von: "eingegangen",
    nach: "verteilt",
    aktion: "verteilen",
    wer: "Koordinatorin",
    schluessel: "verteilen",
  },
  {
    von: "eingegangen",
    nach: "geloescht",
    aktion: "zurückziehen (löscht die Aufgabe)",
    wer: "Auftraggeber · Koordinatorin",
    schluessel: null,
  },
  {
    von: "verteilt",
    nach: "verteilt",
    aktion: "einplanen",
    wer: "Auftragnehmer",
    schluessel: "einplanen",
  },
  {
    von: "verteilt",
    nach: "verteilt",
    aktion: "anders zuweisen (leert die Planung)",
    wer: "Koordinatorin",
    schluessel: "umverteilen",
  },
  {
    von: "verteilt",
    nach: "in_arbeit",
    aktion: "starten",
    wer: "Auftragnehmer",
    schluessel: "starten",
  },
  {
    von: "in_arbeit",
    nach: "in_arbeit",
    aktion: "umplanen",
    wer: "Auftragnehmer",
    schluessel: "einplanen",
  },
  {
    von: "in_arbeit",
    nach: "verteilt",
    aktion: "zurücksetzen",
    wer: "Auftragnehmer",
    schluessel: "zuruecksetzen",
  },
  {
    von: "in_arbeit",
    nach: "freigabe_offen",
    aktion: "fertig melden (Fremdaufgabe)",
    wer: "Auftragnehmer",
    schluessel: "fertig",
  },
  {
    von: "in_arbeit",
    nach: "abgeschlossen",
    aktion: "fertig melden (Selbstaufgabe)",
    wer: "Auftragnehmer",
    schluessel: "fertig",
  },
  {
    von: "freigabe_offen",
    nach: "abgeschlossen",
    aktion: "freigeben",
    wer: "Auftraggeber · Koordinatorin",
    schluessel: "freigeben",
  },
  {
    von: "freigabe_offen",
    nach: "zurueckgewiesen",
    aktion: "zurückweisen (mit Begründung)",
    wer: "Auftraggeber · Koordinatorin",
    schluessel: "zurueckweisen",
  },
  {
    von: "zurueckgewiesen",
    nach: "in_arbeit",
    aktion: "wieder aufnehmen",
    wer: "Auftragnehmer",
    schluessel: "wiederaufnehmen",
  },
];

/** Der angezeigte Name eines Zustands — die Datenbankwerte selbst sind keine Oberflaechensprache. */
export const ZUSTAND_TEXT: Record<Status | "start" | "geloescht", string> = {
  start: "neu",
  eingegangen: "eingegangen",
  verteilt: "verteilt",
  in_arbeit: "in Arbeit",
  freigabe_offen: "Freigabe offen",
  abgeschlossen: "abgeschlossen",
  zurueckgewiesen: "zurückgewiesen",
  geloescht: "gelöscht",
};
