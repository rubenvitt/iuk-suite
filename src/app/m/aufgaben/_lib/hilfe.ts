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
  /** Fuer wen diese Sicht gebaut ist. Steht als Marke ueber dem Kapitel. */
  fuer: string;
  /** Die eine Frage, die diese Sicht beantwortet (§ der Oberflaechen-Spec: „was ist jetzt dran?"). */
  wofuer: string;
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
    fuer: "BuFDi",
    wofuer:
      "Was ist jetzt dran, was liegt diese Woche an, und ist ein Tag schon zu voll? Der Einstieg " +
      "beantwortet die Frage „was tue ich als Nächstes“ — nicht „was gibt es alles“.",
    ziel: { art: "fest", href: "/" },
    skizze: [
      {
        form: "kopf",
        titel: "Meine Woche · KW · ‹ Diese Woche ›",
        erklaerung:
          "Titel, darunter die Kontextzeile mit den Zahlen der gezeigten Woche (verplante Stunden, " +
          "Zahl der eingeplanten Aufgaben). Rechts blätterst du eine Woche vor oder zurück.",
      },
      {
        form: "karte",
        titel: "Führungskarte — die eine Sache, die jetzt dran ist",
        erklaerung:
          "Immer vorhanden, auch wenn nichts drängt (dann steht dort die Ruhe-Zeile mit dem nächsten " +
          "Arbeitstag). Sie trägt den einzigen roten Knopf der Seite, und der gehört immer zu dem, was " +
          "über ihm steht.",
      },
      {
        form: "spalten",
        titel: "Diese Woche",
        spalten: ["Mo", "Di", "Mi", "Do", "Fr"],
        erklaerung:
          "Deine fünf Arbeitstage mit Aufgaben und Routinen in der Reihenfolge, in der du sie abarbeiten " +
          "willst. Unter jedem Tag steht sein Budget (verplant / Soll). Auf dem Telefon zeigt die Achse " +
          "einen Tag; die Leiste darüber wechselt ihn.",
      },
      {
        form: "band",
        titel: "„N Aufgaben liegen außerhalb dieser Woche“",
        erklaerung:
          "Alles, was in keiner der fünf Spalten stehen kann — ohne Termin oder in einer anderen Woche. " +
          "Ohne diese Zeile wäre es unsichtbar, und die Woche sähe leerer aus, als sie ist.",
      },
      {
        form: "liste",
        titel: "Zonen: Zurückgewiesen · Wartet auf Einplanung · …",
        erklaerung:
          "Was die Karte nicht nennt, steht darunter als Zone — in Rangfolge, jede mit ihrer Zahl. " +
          "Eine Zone ohne Inhalt entfällt ganz, statt leer dazustehen.",
      },
      {
        form: "fuss",
        titel: "Routinen verwalten · Zeitplan von …",
        erklaerung:
          "Nebenwege in Tinte statt in Rot: deine Routinen und die Zeitpläne der anderen BuFDis " +
          "(lesend — für Absprachen ohne Umweg über die Koordination).",
      },
    ],
    bilder: ["wochenachse", "tagesbudget"],
    schritte: [
      {
        titel: "Oben anfangen",
        text:
          "Die Führungskarte nennt genau einen Anlass und die Aktion dazu. Ist sie eine Ruhe-Zeile, " +
          "ist gerade nichts überfällig — dann sagt sie dir, was am nächsten Arbeitstag liegt.",
      },
      {
        titel: "Neue Aufgaben einplanen",
        text:
          "Eine verteilte Aufgabe ohne Termin steht in der Zone „Wartet auf Einplanung“. Hat die " +
          "Koordination einen Zeitvorschlag mitgeschickt, steht er auf dem Knopf — „Annehmen: Do, " +
          "13.08., 09:00“. Passt er nicht, klappt „Anders einplanen“ direkt in der Zeile Tag und " +
          "Uhrzeit auf.",
      },
      {
        titel: "Den Tag ordnen",
        text:
          "Innerhalb einer Tagesspalte verschiebst du Einträge mit den Pfeilknöpfen oder per Zug an " +
          "eine andere Stelle; ein Zug in eine andere Spalte plant die Aufgabe auf diesen Tag um. " +
          "Beides geht auch ohne Maus: Tab bis zum Eintrag, Enter, dann die Pfeiltasten.",
      },
      {
        titel: "Arbeiten und fertig melden",
        text:
          "„Starten“ setzt die Aufgabe auf „in Arbeit“ — daran sehen Koordination und Auftraggeber, " +
          "dass sie läuft. „Fertig melden“ verlangt bei Nachweispflicht erst den Nachweis (Text oder " +
          "Bild) und geht danach zur Freigabe, bei einer Selbstaufgabe direkt auf abgeschlossen.",
      },
      {
        titel: "Voraus- und zurückblättern",
        text:
          "‹ und › zeigen andere Wochen. Kontextzeile, Achse und die Zeile „außerhalb dieser Woche“ " +
          "beziehen sich immer auf die GEZEIGTE Woche — liegt sie ganz in der Vergangenheit, steht " +
          "„Abgeschlossene Woche“ über der Achse.",
      },
    ],
    grenzen: [
      "Fremde Zeitpläne siehst du, aber du änderst sie nicht — auch nicht in Vertretung.",
      "Die Koordination schlägt einen Termin vor, sie setzt ihn nicht: über deinen Tag entscheidest du.",
      "Eine Aufgabe, die du selbst eingestellt hast, hat keine Freigabestufe — sie geht von „in Arbeit“ direkt auf abgeschlossen.",
      "Nach deinem letzten Diensttag bleibt alles lesbar, aber keine Aktion mehr bedienbar.",
    ],
    verweise: ["zeitplan", "routinen", "aufgabe", "einstellen"],
    sichtbar: (akteur) => einstiegsSicht(akteur) === "meine-woche",
  },

  verteilung: {
    schluessel: "verteilung",
    titel: "Verteilung",
    fuer: "Koordination",
    wofuer:
      "Was muss ich jetzt verteilen, freigeben oder umhängen — und wer hat noch Luft? Der Einstieg " +
      "zeigt die Lage, nicht den vollständigen Bestand.",
    ziel: { art: "fest", href: "/" },
    skizze: [
      {
        form: "kopf",
        titel: "Verteilung · Aufgabe einstellen",
        erklaerung:
          "Die Kontextzeile nennt die Zahlen des Tages — auch die Nullen, und zwar als Wort. Rechts " +
          "der Textweg zum Einstellformular.",
      },
      {
        form: "karte",
        titel: "Führungskarte — der dringendste Anlass",
        erklaerung:
          "Eine Aufgabe ohne aktiven Träger, ein überfälliger Posteingang, eine wartende Freigabe: " +
          "die Karte nennt den obersten Rang und die Aktion dazu (verteilen, anders zuweisen, freigeben).",
      },
      {
        form: "spalten",
        titel: "Auslastung diese Woche",
        spalten: ["Alina", "Bo", "Cem"],
        erklaerung:
          "Je BuFDi der Wochenwert (verplant / Soll), ein Balken, die fünf Tagesstreifen und die " +
          "Warnung „Mo überbucht“. Das ist die Zahl, die du VOR der Zuweisung brauchst — im " +
          "Zuweisen-Feld steht sie noch einmal, aber dann hast du dich schon entschieden.",
      },
      {
        form: "liste",
        titel: "Zonen: Zu verteilen · Freigabe offen · …",
        erklaerung:
          "Die übrigen Anlässe in Rangfolge, je mit Zahl und Deckel („alle N zeigen“ führt auf " +
          "/verteilen bzw. /freigaben). Die beiden Überfällig-Zonen tragen den Zeilenweg „Anders " +
          "zuweisen“.",
      },
      {
        form: "fuss",
        titel: "Personenverwaltung · Archiv",
        erklaerung: "Die beiden Nebenwege, die keine Tagesarbeit sind.",
      },
    ],
    bilder: ["verteilweg", "tagesbudget"],
    schritte: [
      {
        titel: "Mit der Karte anfangen",
        text:
          "Sie nennt den obersten Rang: eine Aufgabe ohne aktiven Träger steht über einem überfälligen " +
          "Posteingang, dieser über einer wartenden Freigabe. Die Aktion daneben ist immer die zu dem, " +
          "was oben steht.",
      },
      {
        titel: "Auslastung lesen, dann zuweisen",
        text:
          "Der Wochenwert sagt, wie voll jemand insgesamt ist; die fünf Tagesstreifen sagen, ob ein " +
          "einzelner Tag trotzdem überbucht ist. Eine Person kann bei 6 von 39 Wochenstunden stehen und " +
          "montags doppelt verplant sein.",
      },
      {
        titel: "Verteilen",
        text:
          "Der Zeilenweg klappt die Namensliste mit der Wochenauslastung auf — der Klick auf den Namen " +
          "IST das Absenden. Über die Führungskarte kannst du zusätzlich einen Zeitvorschlag mitgeben; " +
          "verbindlich ist er nicht, die BuFDi kann ihn annehmen oder anders einplanen.",
      },
      {
        titel: "Umhängen statt nachfragen",
        text:
          "„Anders zuweisen“ gibt es für zugewiesene, aber noch nicht begonnene Aufgaben. Die Planung " +
          "der bisherigen Person wird dabei geleert — sonst bliebe ein Termin in einem Zeitplan stehen, " +
          "der nicht mehr gilt. Der Satz dazu steht im Feld, bevor du absendest.",
      },
      {
        titel: "Freigeben oder zurückweisen",
        text:
          "Du siehst jede offene Freigabe — deine eigenen und die, bei denen du in Vertretung für den " +
          "eingetragenen Prüfer handelst. Zurückweisen verlangt eine Begründung; sie landet im Verlauf " +
          "und in der Zone „Zurückgewiesen“ der BuFDi.",
      },
    ],
    grenzen: [
      "Du arbeitest nicht mit: du stehst in keiner Verteilliste, und du gibst deine eigene Aufgabe nie frei — das Vier-Augen-Prinzip fiele sonst für genau diesen Fall aus.",
      "Du änderst keinen fremden Zeitplan. Du schlägst einen Termin vor; gesetzt wird er von der Person selbst.",
      "Eine Aufgabe, die schon „in Arbeit“ ist, lässt sich nicht mehr umhängen — erst muss sie zurückgesetzt werden.",
      "Rollen und Gruppen kommen aus Pocket ID; ein Gruppenentzug wirkt mit bis zu einer Stunde Verzug.",
    ],
    verweise: ["verteilen", "freigaben", "personen", "aufgabe"],
    sichtbar: (akteur) => einstiegsSicht(akteur) === "verteilung",
  },

  "meine-auftraege": {
    schluessel: "meine-auftraege",
    titel: "Meine Aufträge",
    fuer: "Auftraggeber",
    wofuer:
      "Was ist aus dem geworden, was ich eingestellt habe — und wartet etwas auf meine Freigabe?",
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
          "Eine fertig gemeldete Aufgabe, die du freigeben sollst; ein überfälliger Auftrag; ein " +
          "Auftrag, den noch niemand bearbeitet. Steht nichts an, sagt die Karte das ausdrücklich.",
      },
      {
        form: "liste",
        titel: "Eigene Aufträge (N)",
        erklaerung:
          "Alle deine Aufträge, ungedeckelt, mit Zustand, Priorität, Frist, Dauer und Empfänger — " +
          "oder „Noch nicht verteilt“, solange die Koordination sie noch nicht zugewiesen hat.",
      },
      {
        form: "fuss",
        titel: "Archiv",
        erklaerung: "Der Weg zu allem, was schon abgeschlossen ist.",
      },
    ],
    bilder: ["lebenszyklus", "freigabe"],
    schritte: [
      {
        titel: "Auftrag einstellen",
        text:
          "„Aufgabe einstellen“ oben rechts. Für andere eingestellt, landet der Auftrag im Posteingang " +
          "der Koordination und wird von dort zugewiesen — du wählst die Person nicht selbst.",
      },
      {
        titel: "Zustand ablesen",
        text:
          "Die Zeile sagt ohne Klick, wo der Auftrag steht: eingegangen, verteilt, in Arbeit, Freigabe " +
          "offen, zurückgewiesen, abgeschlossen. Der Titel führt auf die Aufgabe mit Nachweis und Verlauf.",
      },
      {
        titel: "Freigeben",
        text:
          "Als Ersteller bist du zugleich der eingetragene Prüfer. Fertig gemeldete Aufgaben stehen auf " +
          "/freigaben — mit dem Nachweis daneben, denn wer freigibt, muss sehen, was er freigibt.",
      },
      {
        titel: "Zurückziehen",
        text:
          "Solange ein Auftrag noch im Posteingang liegt (Zustand „eingegangen“), kannst du ihn " +
          "zurückziehen; er wird dabei samt Verlauf gelöscht. Danach nicht mehr — dann hat er eine " +
          "Geschichte mit Dokumentationswert.",
      },
    ],
    grenzen: [
      "Du verteilst nicht: den Empfänger bestimmt die Koordination. Der Weg dorthin existiert in dieser Sicht nicht, und /verteilen antwortet dir mit 404.",
      "Fremde Aufträge siehst du nicht — nur deine eigenen und die, in denen du Prüfer bist.",
      "Ist eine Aufgabe erst verteilt, ist Zurückziehen nicht mehr möglich; die Koordination kann sie aber umhängen.",
    ],
    verweise: ["einstellen", "freigaben", "aufgabe", "archiv"],
    sichtbar: (akteur) => einstiegsSicht(akteur) === "meine-auftraege",
  },

  // ─── Die adressierbaren Sichten ───────────────────────────────────────────────────────────────
  einstellen: {
    schluessel: "einstellen",
    titel: "Aufgabe einstellen",
    fuer: "alle Rollen",
    wofuer: "Eine neue Aufgabe anlegen — für dich selbst oder, wenn du darfst, für jemand anderen.",
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
          "Die Erklärung ist Pflicht, weil die ausführende Person die Aufgabe sonst nicht ohne " +
          "Rückfrage versteht. Die Dauerschätzung ist keine Formalie — sie füllt das Tagesbudget und " +
          "entscheidet mit, ob ein Tag als überbucht gilt.",
      },
      {
        form: "band",
        titel: "Nachweispflicht: Text oder Bild",
        erklaerung:
          "Ist sie gesetzt, kann die Aufgabe erst fertig gemeldet werden, wenn ein Nachweis der " +
          "gewählten Art vorliegt.",
      },
      {
        form: "band",
        titel: "Für mich selbst / für jemand anderen",
        erklaerung:
          "Diese Wahl erscheint nur, wenn du für andere einstellen darfst (Auftraggeber und " +
          "Koordination). Sie entscheidet über den Anfangszustand — und darüber, ob es eine " +
          "Freigabestufe gibt.",
      },
    ],
    bilder: ["lebenszyklus"],
    schritte: [
      {
        titel: "Titel und Erklärung",
        text:
          "Der Titel steht später in jeder Liste und in jeder Tagesspalte — kurz und eindeutig. Die " +
          "Erklärung beantwortet die Frage, die sonst als Rückfrage käme.",
      },
      {
        titel: "Priorität und Frist",
        text:
          "Die Priorität ordnet die Reihenfolge innerhalb eines Tages vor; die Frist entscheidet über " +
          "„überfällig“ und damit darüber, ob die Aufgabe auf einer Führungskarte landet. Eine Uhrzeit " +
          "zur Frist ist optional.",
      },
      {
        titel: "Dauer schätzen",
        text:
          "In Minuten. Zu knapp geschätzt sieht die Woche leerer aus, als sie ist — das Budget rechnet " +
          "mit dieser Zahl, nicht mit der tatsächlichen Arbeitszeit.",
      },
      {
        titel: "Für wen?",
        text:
          "Für dich selbst: die Aufgabe ist sofort dir zugewiesen, du planst sie ein, und sie hat keine " +
          "Freigabestufe. Für jemand anderen: sie geht in den Posteingang der Koordination, du wirst " +
          "ihr Prüfer.",
      },
    ],
    grenzen: [
      "Wer für andere einstellt, wählt die Person nicht — das tut die Koordination beim Verteilen.",
      "BuFDis stellen nur für sich selbst ein; die Wahl erscheint ihnen gar nicht erst.",
      "Eine ausgeschiedene Person kann sich auch selbst keine Aufgabe mehr einstellen.",
      "Fehler kommen am Feld an, nicht auf einer technischen Fehlerseite — Eingaben gehen dabei nicht verloren.",
    ],
    verweise: ["verteilen", "aufgabe", "meine-auftraege"],
    sichtbar: fuerAlle,
  },

  verteilen: {
    schluessel: "verteilen",
    titel: "Verteilen",
    fuer: "Koordination",
    wofuer: "Den ganzen Posteingang abarbeiten — mehrere Aufgaben hintereinander zuweisen.",
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
          "Zwei Formen derselben Daten. Die Wahl steht in der Adresse (?ansicht=brett) und übersteht " +
          "das Neuladen.",
      },
      {
        form: "liste",
        titel: "Posteingang (N)",
        erklaerung:
          "Je Zeile: Titel, Zustand, Priorität, Frist, Dauer und „Von <Auftraggeber>“. Rechts der " +
          "Zuweisen-Weg, der die Namensliste mit Auslastung aufklappt.",
      },
      {
        form: "spalten",
        titel: "Brett (?ansicht=brett)",
        spalten: ["Posteingang", "Alina", "Bo"],
        erklaerung:
          "Dieselben Aufgaben als Karten: links der Posteingang, daneben je BuFDi eine Spalte. Auf dem " +
          "Telefon stapeln sich die Spalten untereinander, statt sich in die Breite zu quetschen.",
      },
    ],
    bilder: ["verteilweg"],
    schritte: [
      {
        titel: "Reihenfolge festlegen",
        text:
          "Der Posteingang steht nach Dringlichkeit: überfällige Aufgaben zuerst, dann nach Priorität " +
          "und Frist. Von oben nach unten abarbeiten ist die richtige Reihenfolge.",
      },
      {
        titel: "Zuweisen",
        text:
          "Der Zeilenweg klappt die Namen mit ihrer Wochenauslastung auf; ein Klick auf den Namen weist " +
          "zu. Kein Dialog, kein zweites Absenden — bei zehn Aufgaben spart das dreißig Schritte.",
      },
      {
        titel: "Brett benutzen, wenn du umschichtest",
        text:
          "Das Brett zeigt nebeneinander, wer schon wie viel bekommen hat. Eine Karte wandert per Zug " +
          "oder über ihren Knopf in eine Personenspalte.",
      },
      {
        titel: "Zeitvorschlag mitgeben",
        text:
          "Über die Aufgabe selbst (/a/<id>) oder die Führungskarte kannst du Tag und Uhrzeit " +
          "vorschlagen. Die BuFDi sieht den Vorschlag als Knopf „Annehmen: …“ — verbindlich ist er nicht.",
      },
    ],
    grenzen: [
      "Verteilziel ist nur, wer heute aktiv ist — ausgeschiedene Personen stehen in keiner Liste, du selbst auch nicht.",
      "Verteilen setzt keinen Termin. Der Zeitplan gehört der ausführenden Person.",
      "Ein Auftraggeber ohne Koordinationsrolle bekommt auf dieser Seite 404 — und in seiner Oberfläche gibt es keinen Weg hierher.",
    ],
    verweise: ["verteilung", "aufgabe", "personen"],
    sichtbar: darfVerteilen,
  },

  freigaben: {
    schluessel: "freigaben",
    titel: "Freigaben",
    fuer: "Auftraggeber und Koordination",
    wofuer: "Fertig gemeldete Arbeit prüfen: freigeben oder mit Begründung zurückweisen.",
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
          "Nur für die Koordination: Freigaben, deren Prüfer jemand anderes ist. Der Verlauf hält " +
          "später fest „Freigegeben von X in Vertretung für Y“.",
      },
      {
        form: "band",
        titel: "Freigeben · Zurückweisen",
        erklaerung:
          "Freigeben ist ein Klick. Zurückweisen öffnet ein Feld und verlangt eine Begründung — ohne " +
          "sie geht es nicht weiter.",
      },
    ],
    bilder: ["freigabe", "nachweisweg"],
    schritte: [
      {
        titel: "Nachweis ansehen",
        text:
          "Er steht in der Zeile, nicht hinter einem Klick. Ein Bildnachweis wird erst ausgeliefert, " +
          "wenn die Virenprüfung ihn freigegeben hat.",
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
          "Die Begründung ist Pflicht: sie ist das Einzige, woran die ausführende Person erkennt, was zu " +
          "tun ist. Die Aufgabe erscheint bei ihr in der Zone „Zurückgewiesen“ und kann von dort " +
          "wieder aufgenommen werden.",
      },
    ],
    grenzen: [
      "Selbstaufgaben haben keine Freigabestufe und erscheinen hier nie.",
      "Niemand gibt seine eigene Arbeit frei — auch die Koordination nicht, wenn die Aufgabe ihr zugewiesen ist.",
      "Nach dem Ausscheiden bleibt die eigene Prüfgeschichte lesbar, aber die Freigabeaktion wird nicht mehr angeboten.",
      "BuFDis ohne Koordinationsrolle bekommen auf dieser Seite 404.",
    ],
    verweise: ["aufgabe", "verteilung", "meine-auftraege"],
    sichtbar: darfFreigabenSehen,
  },

  routinen: {
    schluessel: "routinen",
    titel: "Routinen",
    fuer: "BuFDi",
    wofuer:
      "Wiederkehrende Arbeit hinterlegen, die keine Aufgabe ist — damit sie im Tagesbudget mitzählt, " +
      "statt es still zu sprengen.",
    ziel: { art: "fest", href: "/routinen" },
    skizze: [
      {
        form: "kopf",
        titel: "Aufgaben › Routinen",
        erklaerung: "Die Kontextzeile zählt deine Routinen und sagt, wie viele davon ruhen.",
      },
      {
        form: "formular",
        titel: "Neue Routine anlegen",
        erklaerung:
          "Titel, Wochentage, optionale Uhrzeit und Dauer in Minuten. Dieselbe Maske ändert eine " +
          "bestehende Routine.",
      },
      {
        form: "liste",
        titel: "Deine Routinen",
        erklaerung:
          "Je Zeile die Wochentage, die Dauer und der Schalter „ruhen lassen“ — für Zeiten, in denen " +
          "eine Routine nicht anfällt, ohne sie zu verlieren.",
      },
    ],
    bilder: ["tagesbudget", "wochenachse"],
    schritte: [
      {
        titel: "Routine anlegen",
        text:
          "Wochentage ankreuzen, Dauer schätzen, fertig. Sie erscheint ab sofort in jeder Woche an " +
          "diesen Tagen — in deiner Achse und in der Auslastung, die die Koordination sieht.",
      },
      {
        titel: "Ruhen lassen statt löschen",
        text:
          "Fällt eine Routine für eine Weile weg, stell sie auf ruhend: sie zählt dann nicht mehr ins " +
          "Budget, bleibt aber erhalten und ist mit einem Klick wieder da.",
      },
      {
        titel: "Dauer realistisch halten",
        text:
          "Routinen essen Budget, bevor eine Aufgabe eingeplant wird. Zu niedrig angesetzt, wirkt dein " +
          "Tag freier, als er ist, und die Koordination weist dir zu viel zu.",
      },
    ],
    grenzen: [
      "Routinen gehören dir: fremde Routinen kannst du weder anlegen noch ändern.",
      "Eine Routine ist keine Aufgabe — sie hat keinen Zustand, keinen Nachweis und keine Freigabe, und sie lässt sich in der Achse nicht verschieben.",
      "Auftraggeber und Koordination haben keine Routinen; die Seite antwortet ihnen mit 404.",
    ],
    verweise: ["meine-woche", "zeitplan"],
    sichtbar: darfRoutinenVerwalten,
  },

  personen: {
    schluessel: "personen",
    titel: "Personenverwaltung",
    fuer: "Koordination",
    wofuer:
      "Wer arbeitet hier mit, in welcher Rolle, ab wann und wie lange — und mit wie viel Zeit am Tag?",
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
          "Name, Initialen, Kennung aus Pocket ID, Rolle, Tagessoll in Minuten sowie aktiv von / bis. " +
          "Ist das Verzeichnis angebunden, füllt die Suche die Felder aus.",
      },
      {
        form: "liste",
        titel: "Personen",
        erklaerung:
          "Je Zeile Rolle, Zeitraum, Tagessoll und ob die Person heute aktiv ist — plus „Beenden“ mit " +
          "Rückfrage.",
      },
    ],
    bilder: [],
    schritte: [
      {
        titel: "Zuerst die Kennung",
        text:
          "Die Kennung (der „sub“ aus Pocket ID) verbindet die Anmeldung mit dieser Zeile. Ohne sie " +
          "sieht die Person zwar das Modul, findet sich aber nicht darin wieder — sie bekommt die " +
          "Erklärseite „noch nicht eingetragen“.",
      },
      {
        titel: "Rolle wählen",
        text:
          "„bufdi“ arbeitet Aufgaben ab und führt einen Zeitplan; „auftrag“ stellt Aufgaben für andere " +
          "ein und prüft sie. Die Koordinationsrolle wird NICHT hier vergeben, sondern über die Gruppe " +
          "in Pocket ID.",
      },
      {
        titel: "Tagessoll setzen",
        text:
          "Die Minuten pro Arbeitstag sind die Bezugsgröße jedes Budgetbalkens. Steht hier eine falsche " +
          "Zahl, ist jede Auslastungsangabe falsch — für die Person und für dich.",
      },
      {
        titel: "Beenden statt löschen",
        text:
          "Ein Ende („aktiv bis“) ist einschließend: am letzten Tag kann die Person noch abgeben. " +
          "Danach bleibt alles lesbar, aber nichts mehr bedienbar, und ihre Aufgaben erscheinen bei dir " +
          "als „ohne aktiven Träger“.",
      },
    ],
    grenzen: [
      "Es gibt keine Löschaktion: Personen tragen Verlauf und Nachweise, und eine gelöschte Zeile risse die Dokumentation auf.",
      "Die Koordinationsrolle kommt aus der Pocket-ID-Gruppe, nicht aus dieser Tabelle — ein Entzug wirkt mit bis zu einer Stunde Verzug.",
      "Ein „aktiv bis“ in der Vergangenheit sperrt dich nicht aus der Koordination aus, wohl aber aus jeder Rolle, die an der Zeile hängt.",
    ],
    verweise: ["verteilung", "verteilen"],
    sichtbar: darfPersonenVerwalten,
  },

  zeitplan: {
    schluessel: "zeitplan",
    titel: "Zeitplan",
    fuer: "alle Rollen (ändern nur die Person selbst)",
    wofuer:
      "Eine ganze Woche einer Person am Stück: was liegt an welchem Tag, in welcher Reihenfolge, und " +
      "wie voll ist der Tag damit?",
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
          "Nur im eigenen Plan: die verteilten Aufgaben ohne Termin, je mit einem Formular für Tag, " +
          "Uhrzeit und Reihenfolge.",
      },
      {
        form: "spalten",
        titel: "Die Woche",
        spalten: ["Mo", "Di", "Mi", "Do", "Fr"],
        erklaerung:
          "Aufgaben und Routinen je Tag, mit Budgetzeile darunter. Im eigenen Plan trägt jeder Eintrag " +
          "Rangknöpfe und ist ziehbar; im fremden Plan ist die Woche reine Lektüre.",
      },
    ],
    bilder: ["wochenachse", "tagesbudget"],
    schritte: [
      {
        titel: "Einplanen",
        text:
          "Im Block „Einzuplanen“ Tag und optional Uhrzeit setzen. Danach steht die Aufgabe in der " +
          "Tagesspalte und zählt in dessen Budget.",
      },
      {
        titel: "Reihenfolge ändern",
        text:
          "Die Pfeilknöpfe verschieben einen Eintrag innerhalb des Tages; ein Zug in eine andere Spalte " +
          "plant ihn um. Mit der Tastatur: Tab bis zum Eintrag, Enter, Pfeiltasten, Enter zum Ablegen.",
      },
      {
        titel: "Überbuchung ernst nehmen",
        text:
          "Steht unter einem Tag „überbucht“, ist mehr verplant als Tagessoll — Routinen eingerechnet. " +
          "Das ist kein Fehler, den das Modul verhindert, sondern eine Ansage an dich.",
      },
      {
        titel: "Fremde Pläne lesen",
        text:
          "Über die Fußzeile deines Einstiegs kommst du auf den Plan der anderen BuFDis. Das ist " +
          "gedacht für Absprachen und Vertretungen — ohne die Koordination als Nadelöhr.",
      },
    ],
    grenzen: [
      "Ändern darf nur die Person selbst — die Koordination sieht den Plan, aber sie greift nicht hinein.",
      "Routinen sind nicht ziehbar: sie stehen an ihren Wochentagen, nicht an einem verschobenen Termin.",
      "Ein Zug in eine Spalte plant um, er startet nichts: der Zustand der Aufgabe bleibt, wie er war.",
      "Nach dem Ausscheiden bleibt der Plan lesbar, aber unveränderlich.",
    ],
    verweise: ["meine-woche", "routinen", "aufgabe"],
    sichtbar: fuerAlle,
  },

  aufgabe: {
    schluessel: "aufgabe",
    titel: "Die einzelne Aufgabe",
    fuer: "alle Rollen",
    wofuer:
      "Alles zu einer Aufgabe an einem Ort: Auftrag, Zustand, Nachweis, jede erlaubte Aktion und die " +
      "vollständige Geschichte.",
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
          "Die Chipzeile beantwortet ohne Klick, wo die Aufgabe steht. Farbe ist dabei nie der einzige " +
          "Träger der Bedeutung — es steht immer auch das Wort da.",
      },
      {
        form: "formular",
        titel: "Erklärung und Metablock",
        erklaerung:
          "Auftraggeber, zugewiesene Person, Frist, Dauerschätzung und Prüfer. Bei einer Selbstaufgabe " +
          "steht dort ausdrücklich „— (Selbstaufgabe)“, denn sie hat keinen Prüfer.",
      },
      {
        form: "liste",
        titel: "Nachweis",
        erklaerung:
          "Text- und Bildnachweise, sichtbar nur für Koordination, Ersteller, Zugewiesene und den " +
          "eingetragenen Prüfer. Leistungsnachweise sind kein Aushang.",
      },
      {
        form: "band",
        titel: "Aktion",
        erklaerung:
          "Genau die Aktionen, die diese Person mit dieser Aufgabe in DIESEM Zustand ausführen darf — " +
          "höchstens eine davon ist die rote Hauptaktion. Steht dort nichts, ist gerade nichts zu tun.",
      },
      {
        form: "liste",
        titel: "Verlauf",
        erklaerung:
          "Jeder Schritt mit Zeitpunkt, Person und Notiz — einschließlich Zurückweisungsgründen und " +
          "Vertretungsfreigaben. Das ist die Leistungsdokumentation.",
      },
    ],
    bilder: ["lebenszyklus", "nachweisweg"],
    schritte: [
      {
        titel: "Zustand lesen",
        text:
          "Die Chipzeile oben sagt, wo die Aufgabe steht; das Lebenszyklus-Bild in diesem Kapitel sagt, " +
          "was von dort aus möglich ist und wer es tun darf.",
      },
      {
        titel: "Handeln",
        text:
          "Im Abschnitt „Aktion“ steht nur, was erlaubt ist. Was dir dort fehlt, fehlt aus einem Grund: " +
          "entweder passt der Zustand nicht oder die Rolle.",
      },
      {
        titel: "Nachweis anlegen",
        text:
          "Beim Fertigmelden: Text schreiben oder Bild hochladen. Bilder werden vor der Auslieferung " +
          "geprüft; bis dahin sind sie hinterlegt, aber nicht sichtbar.",
      },
      {
        titel: "Verlauf als Beleg",
        text:
          "Wer wann was getan hat, steht unten — auch, wenn die Koordination in Vertretung freigegeben " +
          "hat. Für Beurteilungen und Rückfragen ist das die belastbare Quelle.",
      },
    ],
    grenzen: [
      "Zurückziehen geht nur aus dem Zustand „eingegangen“ — danach hat die Aufgabe eine Geschichte, die nicht verschwinden soll.",
      "Nachweise sieht nicht jeder BuFDi, sondern nur die vier genannten Rollen zu dieser Aufgabe.",
      "Der Verlauf lässt sich nicht bearbeiten. Eine falsche Angabe wird durch einen neuen Schritt korrigiert, nicht durch Überschreiben.",
    ],
    verweise: ["freigaben", "zeitplan", "archiv"],
    sichtbar: fuerAlle,
  },

  archiv: {
    schluessel: "archiv",
    titel: "Archiv",
    fuer: "alle Rollen",
    wofuer: "Nachschlagen, was abgeschlossen ist — gefiltert auf das, was du sehen darfst.",
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
        erklaerung: "Dieselbe Zeilenform wie überall sonst. Der Titel führt auf Nachweis und Verlauf.",
      },
    ],
    bilder: [],
    schritte: [
      {
        titel: "Suchen über den Filter",
        text: "Priorität wählen — die Liste bleibt vollständig, sie wird nur enger.",
      },
      {
        titel: "In die Aufgabe gehen",
        text: "Nachweis und Verlauf sind dort vollständig erhalten, auch Jahre später.",
      },
    ],
    grenzen: [
      "Das Archiv zeigt nur abgeschlossene Aufgaben — zurückgewiesene stehen bei der ausführenden Person, nicht hier.",
      "Was du nicht sehen darfst, erscheint auch hier nicht: BuFDis sehen alle Aufgaben, ein Auftraggeber nur seine eigenen.",
      "Es gibt keinen Weg, eine abgeschlossene Aufgabe wieder zu öffnen — eine neue Aufgabe ist der richtige Weg.",
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
 * `zurueckziehen` (kein Zielzustand — es LOESCHT die Aufgabe). Sie tragen `sonderfall: true`;
 * der Test nimmt genau diese beiden aus dem Mengenvergleich heraus und prueft dafuer, dass es
 * nicht mehr als diese zwei sind.
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
    wer: "Auftraggeber · Koordination",
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
    wer: "Koordination",
    schluessel: "verteilen",
  },
  {
    von: "eingegangen",
    nach: "geloescht",
    aktion: "zurückziehen (löscht die Aufgabe)",
    wer: "Ersteller · Koordination",
    schluessel: null,
  },
  {
    von: "verteilt",
    nach: "verteilt",
    aktion: "einplanen",
    wer: "zugewiesene Person",
    schluessel: "einplanen",
  },
  {
    von: "verteilt",
    nach: "verteilt",
    aktion: "anders zuweisen (leert die Planung)",
    wer: "Koordination",
    schluessel: "umverteilen",
  },
  {
    von: "verteilt",
    nach: "in_arbeit",
    aktion: "starten",
    wer: "zugewiesene Person",
    schluessel: "starten",
  },
  {
    von: "in_arbeit",
    nach: "in_arbeit",
    aktion: "umplanen",
    wer: "zugewiesene Person",
    schluessel: "einplanen",
  },
  {
    von: "in_arbeit",
    nach: "verteilt",
    aktion: "zurücksetzen",
    wer: "zugewiesene Person",
    schluessel: "zuruecksetzen",
  },
  {
    von: "in_arbeit",
    nach: "freigabe_offen",
    aktion: "fertig melden (Fremdaufgabe)",
    wer: "zugewiesene Person",
    schluessel: "fertig",
  },
  {
    von: "in_arbeit",
    nach: "abgeschlossen",
    aktion: "fertig melden (Selbstaufgabe)",
    wer: "zugewiesene Person",
    schluessel: "fertig",
  },
  {
    von: "freigabe_offen",
    nach: "abgeschlossen",
    aktion: "freigeben",
    wer: "Prüfer · Koordination",
    schluessel: "freigeben",
  },
  {
    von: "freigabe_offen",
    nach: "zurueckgewiesen",
    aktion: "zurückweisen (mit Begründung)",
    wer: "Prüfer · Koordination",
    schluessel: "zurueckweisen",
  },
  {
    von: "zurueckgewiesen",
    nach: "in_arbeit",
    aktion: "wieder aufnehmen",
    wer: "zugewiesene Person",
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
