"use server";

import { revalidatePath } from "next/cache";
import { getDb, type DB } from "./_db/client";
import {
  aufgabe,
  aktualisiereAufgabe,
  aktualisierePerson,
  aktualisiereRoutine,
  bufdis,
  dateiNachId,
  erstelleAufgabe,
  erstellePerson,
  erstelleNachweis,
  erstelleRoutine,
  loescheAufgabe,
  nachweiseSeitLetzterZurueckweisung,
  personNachId,
  personNachSub,
  planEintraegeFuerTag,
  planRangFuerEinplanen,
  routineNachId,
  schreibeVerlauf,
} from "./_db/queries";
import type { AufgabeRow, Ereignis, NachweisRow } from "./_db/schema";
import { WOCHENTAG_BIT } from "./_lib/anzeige";
import {
  istGueltigeDauerMinuten,
  istGueltigeNachweisArt,
  istGueltigePrioritaet,
  istGueltigerIsoTag,
  istGueltigeRolle,
  istGueltigeUhrzeit,
} from "./_lib/eingabe";
import { FORM_START, type FormState } from "./_lib/formState";
import { anfangsZustand, uebergang, type Aktion } from "./_lib/lebenszyklus";
import { istFreigegeben } from "./_lib/scan";
import {
  darfPersonenVerwalten,
  darfPlanAendern,
  darfRoutinenVerwalten,
  istVertretungsfreigabe,
  akteurFuerSession,
} from "./_lib/zugang";
import { isoTag } from "./_lib/datum";
import { canAdminModule } from "@/core/auth/guards";

/*
 * DIE VIER ACTIONS DER AUFGABE 9 — `einstellen`, `verteilen`, `umverteilen`, `zurueckziehen`.
 * DIESE AUFGABE (10) ERGAENZT DIE RESTLICHEN SIEBEN — `starten`, `zuruecksetzen`, `einplanen`,
 * `fertig`, `freigeben`, `zurueckweisen`, `wiederaufnehmen` — IN DERSELBEN DATEI (Brief), auf
 * denselben Helfern (`revalidate`, `feld`, `istGesetzt`, `_lib/eingabe.ts`).
 *
 * DIE KETTE IST FUER JEDE ACTION DIESELBE, UND IHRE REIHENFOLGE IST DIE ZUSAGE (Brief):
 *   akteurFuerSession  →  Praedikat (hier: `uebergang()`/`anfangsZustand()`)  →  schreiben
 *   →  Verlaufszeile  →  revalidatePath.
 *
 * ZWEI FEHLERARTEN, NIE VERMISCHT (Spec §9.9):
 *   - Feldfehler KOMMEN ZURUECK (`FormState`) — ein Tippfehler im Formular nimmt sonst auf der
 *     technischen Fehlerseite die Eingaben mit.
 *   - Zugriffsverletzungen WERFEN — jede Ablehnung aus `uebergang()`/`anfangsZustand()` (falsche
 *     Rolle, falscher Zustand, inaktive Person) UND ein unbekanntes `aufgabeId`. Eine gerenderte
 *     Meldung "darfst du nicht" waere eine Auskunft ueber fremde Datenbestaende. `uebergang()`
 *     traegt dafuer KEINEN Diskriminator zwischen "falscher Zustand" und "falsche Person" (Aufgabe
 *     8) — die Action baut das nicht nach, sie wirft fuer beide Faelle gleich.
 *
 * DIE BERECHTIGUNG WIRD NICHT NACHGEBAUT: `uebergang()`/`anfangsZustand()` (`_lib/lebenszyklus.ts`)
 * ziehen ihre Praedikate ausschliesslich aus `_lib/zugang.ts`. Diese Datei prueft selbst keinen
 * Zustand und keine Rolle nach.
 *
 * ZWEI NORMATIVE PFLICHTEN LIEGEN AUSSERHALB DER UEBERGANGSTABELLE (Brief, Uebergabe aus Aufgabe 8):
 * `uebergang()` bekommt nur `(AufgabeRow, Aktion, Akteur, heute)` und sieht deshalb WEDER einen
 * Begruendungstext NOCH die `nachweise`-Tabelle. Diese Datei ist die EINZIGE Stelle, an der beide
 * noch durchgesetzt werden koennen — siehe `zurueckweisenAction` (Begruendung Pflicht, Spec §5.2)
 * und `fertigMeldenAction` (Nachweispflicht, Spec §5.3). Beide sind FELDFEHLER, keine Wuerfe: eine
 * fehlende Begruendung oder ein fehlender Nachweis ist ein unvollstaendiges Formular, kein Angriff.
 */

/**
 * EIN Aufruf mit `"layout"` (Vorbild `feedback/actions.ts`): die Routen unter `/m/aufgaben`
 * (Aufgaben 13-16) haengen alle am selben Wurzelsegment, und `"layout"` schliesst sie mit ein,
 * statt jede einzeln aufzaehlen zu muessen und eine davon zu vergessen.
 */
const AUFGABEN_WURZEL = "/m/aufgaben";
function revalidate(): void {
  revalidatePath(AUFGABEN_WURZEL, "layout");
}

/** Ein Textfeld, immer als String — `FormData.get` liefert auch `File`. Vorbild `files/actions.ts`. */
function feld(formData: FormData, name: string): string {
  const wert = formData.get(name);
  return typeof wert === "string" ? wert : "";
}

/**
 * Die Schalterwerte, die ein Kontrollkaestchen bzw. ein verstecktes Feld erzeugt — `"on"` gehoert
 * dazu, weil ein `<input type="checkbox">` ohne `value`-Attribut genau das sendet. Modulprivate
 * Kopie des Musters aus `files/(verwaltung)/actions.ts` (`KAESTCHEN_AN`/`istGesetzt`) — bewusst
 * nicht importiert, weil `(verwaltung)` eine Routen-Gruppe eines ANDEREN Moduls ist.
 */
const KAESTCHEN_AN = ["1", "true", "on"];
function istGesetzt(formData: FormData, name: string): boolean {
  return KAESTCHEN_AN.includes(feld(formData, name).trim().toLowerCase());
}

/**
 * AUFGABE EINSTELLEN (Spec §5.2, §8.3). Zwei Ausprägungen, beide von `anfangsZustand()`
 * entschieden — diese Action fragt nicht selbst, ob "fuer sich selbst" oder "fuer andere" erlaubt
 * ist, sie reicht nur die Absicht (`fuerSichSelbst`) durch und wirft, wenn `anfangsZustand()`
 * ablehnt.
 *
 * `darfEinstellenFuerAndere` wird HIER NICHT zusaetzlich aufgerufen, obwohl der Brief das nahelegt
 * ("wo die Action zusaetzlich etwas pruefen muss ... kommt das Praedikat aus derselben Quelle") —
 * Aufgabe 8 hat es schon IN `anfangsZustand()` verdrahtet (Kopfkommentar dort: "BERECHTIGUNG KOMMT
 * AUSSCHLIESSLICH AUS `_lib/zugang.ts`"). Ein zweiter Aufruf hier waere derselbe Check doppelt
 * gehalten, nicht die vom Brief gemeinte Zusatzpruefung — WIDERSPRUCH, an den Controller gemeldet,
 * nicht still aufgeloest (siehe Bericht).
 */
export async function aufgabeEinstellenAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const db = getDb();
  const ersteller = await akteurFuerSession(db);
  const heute = isoTag(new Date());

  const fuerSichSelbst = istGesetzt(formData, "fuerSichSelbst");
  const start = anfangsZustand(ersteller, fuerSichSelbst, heute);
  if (!start.erlaubt) throw new Error(start.grund);

  const values = {
    titel: feld(formData, "titel"),
    beschreibung: feld(formData, "beschreibung"),
    prioritaet: feld(formData, "prioritaet"),
    faelligAm: feld(formData, "faelligAm"),
    faelligUhrzeit: feld(formData, "faelligUhrzeit"),
    dauerMinuten: feld(formData, "dauerMinuten"),
    nachweisArt: feld(formData, "nachweisArt") || "text",
    // BEIDE SCHALTER GEHOEREN IN `values` (Review Fix-Runde 1, Punkt 2): `feldWert` liefert im
    // Fehlerzustand NUR, was hier steht, nicht die Vorbelegung — ein fehlendes Feld kommt als LEER
    // zurueck, nicht als "unveraendert". Bei einem Textfeld ist das harmlos; hier kippt ein
    // verlorenes `fuerSichSelbst` die Aufgabe beim zweiten Absendeversuch von Selbst- auf
    // Fremdaufgabe, und eine BuFDi, die `darfEinstellenFuerAndere` nicht erfuellt, wirft dann beim
    // NAECHSTEN Versuch — auf genau der technischen Fehlerseite, die `FormState` verhindern soll.
    fuerSichSelbst: istGesetzt(formData, "fuerSichSelbst") ? "true" : "",
    nachweisPflicht: istGesetzt(formData, "nachweisPflicht") ? "true" : "",
  };

  // Nur ueber ein manipuliertes Formular erreichbar (die Oberflaeche bietet je ein `<select>` mit
  // genau den gueltigen Werten an) — deshalb Wurf statt Feldfehler (Brief, Eingabevalidierung).
  if (!istGueltigePrioritaet(values.prioritaet)) {
    throw new Error(`Unbekannte Prioritaet "${values.prioritaet}".`);
  }
  if (!istGueltigeNachweisArt(values.nachweisArt)) {
    throw new Error(`Unbekannte Nachweisart "${values.nachweisArt}".`);
  }

  const fieldErrors: Record<string, string> = {};
  const titel = values.titel.trim();
  if (titel === "") fieldErrors.titel = "Titel fehlt.";
  const beschreibung = values.beschreibung.trim();
  if (beschreibung === "") fieldErrors.beschreibung = "Erklaerung fehlt.";
  if (!istGueltigerIsoTag(values.faelligAm)) {
    fieldErrors.faelligAm = "Frist fehlt oder ist ungueltig.";
  }
  const faelligUhrzeit = values.faelligUhrzeit.trim();
  if (faelligUhrzeit !== "" && !istGueltigeUhrzeit(faelligUhrzeit)) {
    fieldErrors.faelligUhrzeit = "Uhrzeit ungueltig — Format HH:MM.";
  }
  const dauerMinuten = Number(values.dauerMinuten);
  if (!istGueltigeDauerMinuten(dauerMinuten)) {
    fieldErrors.dauerMinuten = "Dauerschaetzung muss eine ganze Zahl groesser 0 sein.";
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors, values };

  const nachweisPflicht = values.nachweisPflicht === "true";

  const neue = erstelleAufgabe(db, {
    titel,
    beschreibung,
    prioritaet: values.prioritaet,
    erstellerId: ersteller.person.id,
    zugewiesenAn: start.zugewiesenAn,
    status: start.status,
    faelligAm: values.faelligAm,
    faelligUhrzeit: faelligUhrzeit === "" ? null : faelligUhrzeit,
    dauerMinuten,
    nachweisPflicht,
    nachweisArt: values.nachweisArt,
    // DIE INVARIANTE, AUF DIE `istVertretungsfreigabe` SICH VERLAESST (Brief): eine Fremdaufgabe
    // bekommt hier ihren Pruefer (den Ersteller), eine Selbstaufgabe keinen.
    prueferId: start.istSelbst ? null : ersteller.person.id,
    istSelbst: start.istSelbst,
  });

  schreibeVerlauf(db, { aufgabeId: neue.id, ereignis: "eingestellt", akteurId: ersteller.person.id });
  revalidate();
  return { ok: true };
}

/**
 * VERTEILEN UND UMVERTEILEN TEILEN SICH DIESEN RUMPF — beide Formulare sind identisch (Zielperson,
 * optionaler Zeitvorschlag), und der einzige fachliche Unterschied (`nach`, `planLoeschen`) kommt
 * bereits aus `uebergang()`. Ein zweites, fast identisches Formular waere derselbe Code doppelt
 * gehalten und bei der naechsten Aenderung ein Ort, an dem nur einer der beiden nachgezogen wird.
 */
async function verteilenGemeinsam(
  formData: FormData,
  aktion: Extract<Aktion, "verteilen" | "umverteilen">,
  ereignis: Ereignis,
): Promise<FormState> {
  const db = getDb();
  const akteur = await akteurFuerSession(db);
  const heute = isoTag(new Date());

  const aufgabeId = feld(formData, "aufgabeId");
  const task = aufgabe(db, aufgabeId);
  if (!task) throw new Error(`Aufgabe "${aufgabeId}" nicht gefunden.`);

  const ergebnis = uebergang(task, aktion, akteur, heute);
  if (!ergebnis.erlaubt) throw new Error(ergebnis.grund);
  if (ergebnis.wirkung !== "aendern") {
    // Nur eine Verteidigungslinie fuer den Typ: "verteilen"/"umverteilen" erzeugen bei `uebergang()`
    // nie `wirkung: "loeschen"` (das ist ausschliesslich `zurueckziehen` vorbehalten).
    throw new Error("Unerwartetes Uebergangsergebnis.");
  }

  /*
   * DIE DRITTE UEBERGABE AUS AUFGABE 8 — UND DIE EINZIGE STELLE, AN DER SIE NOCH ABGEFANGEN WERDEN
   * KANN (Brief). `uebergang()` prueft nur, ob DIESE Person `aktion` ausfuehren darf
   * (`darfVerteilen`) — sie kennt `zielId` gar nicht und kann deshalb nicht pruefen, ob die
   * ZIELPERSON ueberhaupt eine aktive BuFDi ist. Ohne diese Pruefung koennte die Koordination eine
   * fremd eingestellte Aufgabe an SICH SELBST zuweisen: `istSelbst` bliebe dabei `false`
   * (`erstellerId !== zugewiesenAn`, gespeichert bei "einstellen", nicht neu berechnet), und
   * `darfFreigeben`s zweite Klausel waere die letzte verbleibende Bremse gegen eine
   * Vier-Augen-Luecke.
   *
   * `bufdis(db, heute)` ist DIESELBE Quelle wie die Verteilliste der Oberflaeche (Betreiber-
   * entscheidung 2026-08-13, `darfFreigeben`-Kommentar in `_lib/zugang.ts`) — die Action verlaesst
   * sich nicht auf deren Filter, sie STELLT ihn selbst her. Ein Nachbau als
   * `akteur.person.rolle === "bufdi" && istAktiv(...)` waere genau der Nachbau, den der Brief verbietet:
   * er haette dieselbe Pruefung ein zweites Mal an einer Stelle liegen, die bei einer spaeteren
   * Aenderung von `bufdis()` nicht automatisch mitzoege. SEIT DEM QUELLENWECHSEL (2026-08-15) waere
   * er sogar EINE STUFE GEFAEHRLICHER: die koordinierende Person traegt in der Tabelle `auftrag`
   * (`_db/schema.ts`s `ROLLEN` kennt `koordination` nicht mehr), ein handgeschriebener Rollenfilter
   * kann sie also gar nicht mehr benennen — `bufdis()` ist der einzige Ausdruck, der sie
   * strukturell aus der Zielliste haelt.
   */
  const values = {
    // `aufgabeId` gehoert mit hinein — Vorbild `files/(verwaltung)/actions.ts` fuehrt sein `"id"`
    // in `values` ausdruecklich mit (Review Fix-Runde 1, Punkt 2): ohne sie wuesste ein erneutes
    // Absenden nach einem Feldfehler nicht mehr, fuer welche Aufgabe der Dialog offen war.
    aufgabeId,
    zielId: feld(formData, "zielId"),
    vorschlagDatum: feld(formData, "vorschlagDatum"),
    vorschlagUhrzeit: feld(formData, "vorschlagUhrzeit"),
  };
  const fieldErrors: Record<string, string> = {};

  const zielId = values.zielId.trim();
  const zielIstAktiverBufdi = bufdis(db, heute).some((b) => b.id === zielId);
  if (!zielIstAktiverBufdi) {
    fieldErrors.zielId = "Zielperson nicht gefunden, nicht aktiv oder kein BuFDi.";
  }
  const vorschlagDatum = values.vorschlagDatum.trim();
  if (vorschlagDatum !== "" && !istGueltigerIsoTag(vorschlagDatum)) {
    fieldErrors.vorschlagDatum = "Vorschlagstag ungueltig.";
  }
  const vorschlagUhrzeit = values.vorschlagUhrzeit.trim();
  if (vorschlagUhrzeit !== "" && !istGueltigeUhrzeit(vorschlagUhrzeit)) {
    fieldErrors.vorschlagUhrzeit = "Vorschlagsuhrzeit ungueltig — Format HH:MM.";
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors, values };

  aktualisiereAufgabe(db, task.id, {
    status: ergebnis.nach,
    zugewiesenAn: zielId,
    // REGEL 3 (Spec §5.2), AUS `uebergang()` GENOMMEN, NICHT HIER NACHGEBAUT: `planLoeschen` ist
    // ein Pflichtfeld auf jedem "aendern"-Erfolg (Aufgabe 8) — diese Action kann es deshalb nicht
    // vergessen abzufragen. Bei "verteilen" ist es immer `false` (eine frisch aus dem Posteingang
    // verteilte Aufgabe hatte noch keinen Plan); bei "umverteilen" immer `true`.
    ...(ergebnis.planLoeschen ? { planDatum: null, planUhrzeit: null, planRang: 0 } : {}),
    // Ein neuer Zeitvorschlag darf im selben Zug gesetzt werden (Spec §5.2). Beide Felder werden
    // hier IMMER neu geschrieben (leer → `null`), nicht nur wenn ein Wert mitkommt: ein
    // stehengebliebener Vorschlag aus einer vorherigen Verteilung galt der VORHERIGEN Zielperson
    // und waere nach einer Umverteilung ein Vorschlag, den niemand ausgesprochen hat.
    vorschlagDatum: vorschlagDatum === "" ? null : vorschlagDatum,
    vorschlagUhrzeit: vorschlagUhrzeit === "" ? null : vorschlagUhrzeit,
  });

  schreibeVerlauf(db, {
    aufgabeId: task.id,
    ereignis,
    akteurId: akteur.person.id,
    notiz:
      vorschlagDatum !== ""
        ? `Vorschlag: ${vorschlagDatum}${vorschlagUhrzeit !== "" ? ` ${vorschlagUhrzeit}` : ""}`
        : undefined,
  });
  revalidate();
  return { ok: true };
}

/** `eingegangen` → `verteilt` (Spec §5.2) — nur die Koordination (`uebergang()` prueft `darfVerteilen`). */
export async function verteilenAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return verteilenGemeinsam(formData, "verteilen", "verteilt");
}

/** `verteilt` → `verteilt`, mit geleerter Planung (Spec §5.2) — nur die Koordination. */
export async function umverteilenAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return verteilenGemeinsam(formData, "umverteilen", "umverteilt");
}

/**
 * ZURUECKZIEHEN — LOESCHT DIE AUFGABE, NUR AUS `eingegangen` (Spec §5.2, `uebergang()` prueft
 * Zustand UND Berechtigung: Ersteller oder Koordination). Kein `FormState`: es gibt kein Feld,
 * das fehlschlagen koennte (nur eine `aufgabeId`), also keine `useActionState`-Signatur — dieselbe
 * Wahl wie `deleteGroupAction` in `feedback/actions.ts`.
 *
 * SCHREIBT KEINE VERLAUFSZEILE — das ist keine Luecke in "jeder Uebergang schreibt eine
 * Verlaufszeile" (Brief), sondern der Sonderfall, den die Uebergangstabelle selbst so behandelt
 * (Aufgabe 8: `wirkung: "loeschen"`, kein `Ereignis` in `EREIGNISSE` fuer `zurueckziehen`,
 * `schema.ts`-Kommentar: "es bleibt also keine Zeile, die eines tragen koennte"). Die Loeschung
 * selbst nimmt den ganzen bisherigen Verlauf per Kaskade mit.
 */
export async function zurueckziehenAction(formData: FormData): Promise<void> {
  const db = getDb();
  const akteur = await akteurFuerSession(db);
  const heute = isoTag(new Date());

  const aufgabeId = feld(formData, "aufgabeId");
  const task = aufgabe(db, aufgabeId);
  if (!task) throw new Error(`Aufgabe "${aufgabeId}" nicht gefunden.`);

  const ergebnis = uebergang(task, "zurueckziehen", akteur, heute);
  if (!ergebnis.erlaubt) throw new Error(ergebnis.grund);

  loescheAufgabe(db, task.id);
  revalidate();
}

/*
 * AB HIER AUFGABE 10 — DIE RESTLICHEN SIEBEN UEBERGAENGE. Vier davon (`starten`, `zuruecksetzen`,
 * `freigeben`, `wiederaufnehmen`) tragen kein Feld, das fehlschlagen koennte (nur `aufgabeId`) —
 * dieselbe Ueberlegung wie bei `zurueckziehenAction`: kein `FormState`, keine
 * `useActionState`-Signatur. `einplanen`, `fertig` und `zurueckweisen` haben je mindestens ein
 * Formularfeld und tragen deshalb `FormState`.
 */

/**
 * DER GEMEINSAME RUMPF FUER STARTEN, ZURUECKSETZEN UND WIEDERAUFNEHMEN — alle drei sind eine reine
 * Statuswechsel-Aktion ohne eigenes Formularfeld, mit `Ereignis` 1:1 aus `_db/schema.ts`
 * (`EREIGNISSE`-Kommentar: `starten` → `gestartet`, `zuruecksetzen` → `zurueckgesetzt`,
 * `wiederaufnehmen` → `wiederaufgenommen`). Ein viertes Formular fuer denselben Rumpf waere
 * derselbe Code ein drittes Mal gehalten (vgl. `verteilenGemeinsam` oben).
 */
async function einfacherUebergang(
  formData: FormData,
  aktion: Extract<Aktion, "starten" | "zuruecksetzen" | "wiederaufnehmen">,
  ereignis: Ereignis,
): Promise<void> {
  const db = getDb();
  const akteur = await akteurFuerSession(db);
  const heute = isoTag(new Date());

  const aufgabeId = feld(formData, "aufgabeId");
  const task = aufgabe(db, aufgabeId);
  if (!task) throw new Error(`Aufgabe "${aufgabeId}" nicht gefunden.`);

  const ergebnis = uebergang(task, aktion, akteur, heute);
  if (!ergebnis.erlaubt) throw new Error(ergebnis.grund);
  if (ergebnis.wirkung !== "aendern") {
    // Verteidigungslinie fuer den Typ, wie in `verteilenGemeinsam": keine dieser drei Aktionen
    // erzeugt bei `uebergang()` `wirkung: "loeschen"`.
    throw new Error("Unerwartetes Uebergangsergebnis.");
  }

  aktualisiereAufgabe(db, task.id, { status: ergebnis.nach });
  schreibeVerlauf(db, { aufgabeId: task.id, ereignis, akteurId: akteur.person.id });
  revalidate();
}

/** `verteilt` → `in_arbeit` (Spec §5.2) — nur der zugewiesene BuFDi. */
export async function startenAction(formData: FormData): Promise<void> {
  return einfacherUebergang(formData, "starten", "gestartet");
}

/** `in_arbeit` → `verteilt` (Spec §5.2) — nur der zugewiesene BuFDi. */
export async function zuruecksetzenAction(formData: FormData): Promise<void> {
  return einfacherUebergang(formData, "zuruecksetzen", "zurueckgesetzt");
}

/** `zurueckgewiesen` → `in_arbeit` (Spec §5.2) — nur der zugewiesene BuFDi. */
export async function wiederaufnehmenAction(formData: FormData): Promise<void> {
  return einfacherUebergang(formData, "wiederaufnehmen", "wiederaufgenommen");
}

/**
 * DIE VERLAUFSNOTIZ ZU "EINGEPLANT" (Spec §5.1): der Zeitvorschlag BLEIBT STEHEN, wenn eingeplant
 * wird — "der Verlauf soll belegen koennen, ob angenommen oder abgewichen wurde" (Brief). Diese
 * Funktion ist die Stelle, die das festhaelt, weil `aktualisiereAufgabe` den Vorschlag unveraendert
 * laesst (er wird nur bei `verteilen`/`umverteilen` neu gesetzt) und `task` deshalb noch den
 * VORHERIGEN Vorschlag traegt, waehrend `planDatum`/`planUhrzeit` bereits die NEUEN, gerade
 * eingeplanten Werte sind.
 *
 * Kein Vorschlag vorhanden → schlichtes "Eingeplant: …". Ein Vorschlag, der zum eingeplanten Tag
 * UND (falls angegeben) zur eingeplanten Uhrzeit passt, gilt als angenommen; alles andere als
 * Abweichung, mit beiden Angaben nebeneinander — genau das, was "belegen koennen, ob angenommen
 * oder abgewichen wurde" fordert.
 */
function einplanenNotiz(task: AufgabeRow, planDatum: string, planUhrzeit: string | null): string {
  const geplant = `${planDatum}${planUhrzeit !== null ? ` ${planUhrzeit}` : ""}`;
  if (task.vorschlagDatum === null) return `Eingeplant: ${geplant}`;

  const vorschlag = `${task.vorschlagDatum}${task.vorschlagUhrzeit !== null ? ` ${task.vorschlagUhrzeit}` : ""}`;
  const angenommen =
    task.vorschlagDatum === planDatum &&
    (task.vorschlagUhrzeit === null || task.vorschlagUhrzeit === planUhrzeit);
  return angenommen
    ? `Vorschlag angenommen: ${geplant}`
    : `Vorschlag abgewichen — Vorschlag: ${vorschlag}, eingeplant: ${geplant}`;
}

/**
 * EINPLANEN (Spec §5.1, §5.2, §8.5) — der Server-Teil sowohl des Formulars (Aufgabe 12) als auch
 * des Ziehens (Aufgabe 20). BEIDE rufen DIESELBE Action (Brief); diese Datei entscheidet nur, WAS
 * gespeichert wird, nicht WIE die Oberflaeche den Wert ermittelt.
 *
 * ZWEI AUSGANGSZUSTAENDE, BEIDE VON `uebergang()` ENTSCHIEDEN, NICHT HIER: `verteilt`→`verteilt`
 * (die urspruengliche Zeile) UND seit dem Spec-Nachtrag vom 2026-08-13 (Betreiberentscheidung,
 * `72ef235`) auch `in_arbeit`→`in_arbeit` — wer eine angefangene Aufgabe heute nicht schafft, schiebt
 * sie auf morgen, ohne sie erst zuruecksetzen zu muessen. Diese Action fragt `task.status` dafuer
 * NICHT ab: `uebergang()` traegt beide Zeilen in `TABELLE` (`_lib/lebenszyklus.ts`) mit identischer
 * Berechtigung und identischer `planLoeschen: false`-Semantik, die Action nimmt nur das Ergebnis.
 *
 * `uebergang()` prueft die Berechtigung bereits vollstaendig ueber
 * `darfPlanAendern(p, a.zugewiesenAn, heute)` (`_lib/lebenszyklus.ts`) — AUCH DIE KOORDINATION
 * SCHEITERT DORT: sie schlaegt vor (`vorschlagDatum`), sie setzt nicht (`_lib/zugang.ts`-Kommentar zu
 * `darfPlanAendern`). Diese Action baut diese Pruefung nicht nach.
 *
 * `planRang` KOMMT AUS `planRangFuerEinplanen` (`_db/queries.ts`), NICHT AUS EINEM FORMULARFELD —
 * die Reihenfolge innerhalb eines Tages ist keine Eingabe dieses kleinen Formulars (Spec §8.5:
 * "Die Reihenfolge innerhalb des Tages regeln Auf-/Ab-Knoepfe", das ist Aufgabe 12). Die Funktion
 * liest nur `task.planDatum`/`task.zugewiesenAn`, nicht `task.status` — eine `in_arbeit`-Aufgabe, die
 * auf einen anderen Tag geschoben wird, ist fuer sie derselbe Fall wie eine `verteilt`e.
 *
 * `dauerMinuten` IST EIN VIERTES, OPTIONALES FELD (Betreiberentscheidung nach Aufgabe 12: das
 * Tagesbudget im Wochenplan rechnet mit `dauerMinuten`, und wer eine Aufgabe einplant, weiss oft
 * besser als der Auftraggeber, wie lange sie dauert — die urspruengliche Schaetzung ist eine Annahme,
 * kein Faktum). „Optional" heisst hier NICHT „darf `null` werden" (die Spalte ist `NOT NULL`,
 * `_db/schema.ts`) — jede Aufgabe hat immer bereits eine gueltige Dauer —, sondern „ein leeres Feld
 * LAESST DEN BESTEHENDEN WERT UNVERAENDERT". Ein GESENDETER, aber UNGUELTIGER Wert ist dagegen ein
 * Feldfehler wie jedes andere Feld, mit `values.dauerMinuten` zurueckgetragen (Lektion 3 dieser
 * Aufgabenreihe: `feldWert` ignoriert im Fehlerzustand die Vorbelegung — ohne den Ruecktransport
 * kaeme ein Tippfehler leer statt mit der eingetippten Zahl zurueck). `EinplanenFormular.tsx` schickt
 * das Feld in der Praxis IMMER vorbelegt mit `task.dauerMinuten` — die Optionalitaet traegt die
 * Rueckwaertskompatibilitaet zu Aufgabe 20 (Ziehen setzt vielleicht nie eine Dauer) und zu den
 * bestehenden `einplanenAction`-Tests aus Aufgabe 10, die das Feld nicht kennen und weiterhin gruen
 * bleiben sollen — ein PFLICHTFELD haette hier Rueckwaertskompatibilitaet gegen eine schon
 * abgenommene Testreihe gebrochen, ohne dass die Fachlichkeit das verlangt.
 */
export async function einplanenAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const db = getDb();
  const akteur = await akteurFuerSession(db);
  const heute = isoTag(new Date());

  const aufgabeId = feld(formData, "aufgabeId");
  const task = aufgabe(db, aufgabeId);
  if (!task) throw new Error(`Aufgabe "${aufgabeId}" nicht gefunden.`);

  const ergebnis = uebergang(task, "einplanen", akteur, heute);
  if (!ergebnis.erlaubt) throw new Error(ergebnis.grund);
  if (ergebnis.wirkung !== "aendern") throw new Error("Unerwartetes Uebergangsergebnis.");

  const values = {
    aufgabeId,
    planDatum: feld(formData, "planDatum"),
    planUhrzeit: feld(formData, "planUhrzeit"),
    dauerMinuten: feld(formData, "dauerMinuten"),
  };
  const fieldErrors: Record<string, string> = {};
  const planDatum = values.planDatum.trim();
  if (!istGueltigerIsoTag(planDatum)) {
    fieldErrors.planDatum = "Plantag fehlt oder ist ungueltig.";
  }
  const planUhrzeit = values.planUhrzeit.trim();
  if (planUhrzeit !== "" && !istGueltigeUhrzeit(planUhrzeit)) {
    fieldErrors.planUhrzeit = "Uhrzeit ungueltig — Format HH:MM.";
  }
  // LEER = UNVERAENDERT, GESENDET = MUSS GUELTIG SEIN (Kopfkommentar oben) — dieselbe Zweiteilung wie
  // bei `planUhrzeit`, nur mit einem anderen "leer bedeutet"-Ergebnis (dort `null`, hier "kein Patch").
  const dauerMinutenRoh = values.dauerMinuten.trim();
  let dauerMinuten: number | undefined;
  if (dauerMinutenRoh !== "") {
    const n = Number(dauerMinutenRoh);
    if (!istGueltigeDauerMinuten(n)) {
      fieldErrors.dauerMinuten = "Dauerschaetzung muss eine ganze Zahl groesser 0 sein.";
    } else {
      dauerMinuten = n;
    }
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors, values };

  const geplanteUhrzeit = planUhrzeit === "" ? null : planUhrzeit;
  const planRang = planRangFuerEinplanen(db, task, planDatum);

  aktualisiereAufgabe(db, task.id, {
    planDatum,
    planUhrzeit: geplanteUhrzeit,
    planRang,
    ...(dauerMinuten !== undefined ? { dauerMinuten } : {}),
  });
  schreibeVerlauf(db, {
    aufgabeId: task.id,
    ereignis: "eingeplant",
    akteurId: akteur.person.id,
    notiz: einplanenNotiz(task, planDatum, geplanteUhrzeit),
  });
  revalidate();
  return { ok: true };
}

/**
 * DIE FORM-ADAPTER-VARIANTE VON `einplanenAction` FUER „ANNEHMEN" (Aufgabe 13, Posteingang-Streifen
 * in `_ui/EinstiegBufdi.tsx`). „ANNEHMEN" IST KEIN NEUER UEBERGANG (Brief) — es ist `einplanenAction`
 * mit dem vorgeschlagenen Tag und der vorgeschlagenen Uhrzeit, aus einem SCHLICHTEN Formular OHNE
 * sichtbare Felder abgeschickt (nur versteckte, vom Server selbst gesetzte Werte, keine
 * Nutzereingabe). Ein solches Formular kann `einplanenAction` NICHT direkt als `action`-Prop nehmen:
 * dessen Signatur `(prev: FormState, formData) => Promise<FormState>` passt nur auf
 * `useActionState` (eine Client-Insel) — ein zustandsloses `<form action={fn}>` verlangt
 * `(formData: FormData) => Promise<void>`. Diese Funktion ist die DUENNE BRUECKE dazwischen: sie
 * ruft `einplanenAction` UNVERAENDERT auf (Brief: „durch denselben Weg").
 *
 * WIRFT BEI `fieldErrors`, STATT SIE ZU VERWERFEN (Review Fix-Runde 1, Important — vorherige
 * Fassung schluckte `FormState`s Fehlerzweig komplett): `einplanenAction` gibt bei einem ungueltigen
 * `planDatum`/`planUhrzeit` KEINEN Wurf zurueck, sondern `{ ok: false, fieldErrors }` — ein
 * Rueckgabewert, den nur `useActionState` liest. Ein stilles `await einplanenAction(...)` ohne
 * Pruefung des Ergebnisses waere bei einem Fehler ein Klick ohne jede Wirkung: kein `revalidate()`,
 * keine Meldung, keine Verlaufszeile — der schlechteste aller Fehlerfaelle, weil er wie ein
 * Bedienfehler der klickenden Person aussieht, nicht wie ein Programmfehler. Diese Bruecke wirft
 * deshalb JETZT bei `!ergebnis.ok`, mit den Feldfehlern im Text — laut ist besser als still (dieselbe
 * Antwort wie bei `icons.ts`, `anfangsZustand()`, `freigebenAction`).
 *
 * WARUM DAS NICHT NUR THEORETISCH IST: die drei versteckten Felder in `_ui/EinstiegBufdi.tsx`
 * kommen aus `vorschlagDatum`/`vorschlagUhrzeit` der Aufgabe, geschrieben `?? ""` — eine Aufgabe
 * OHNE Vorschlag rendert dort ohnehin keinen „Annehmen"-Knopf (`vorschlagOffen`), aber eine
 * VERTAUSCHTE Quelle (z. B. `a.planDatum` statt `a.vorschlagDatum`) waere `typecheck`, `lint`,
 * `build` und der ganzen bisherigen Suite unsichtbar geblieben — genau das haelt jetzt
 * `actions.test.ts` fest, mit einem geleerten `vorschlagDatum`.
 */
export async function einplanenAnnehmenAction(formData: FormData): Promise<void> {
  const ergebnis = await einplanenAction(FORM_START, formData);
  if (!ergebnis.ok) {
    throw new Error(
      `Annehmen fehlgeschlagen: ${Object.values(ergebnis.fieldErrors).join(" ")}`,
    );
  }
}

/**
 * FERTIG MELDEN (Spec §5.2, §5.3) — `in_arbeit` → `freigabe_offen` (Fremdaufgabe) ODER
 * `abgeschlossen` (Selbstaufgabe, die Kurzstrecke). WELCHER der beiden Faelle vorliegt, ENTSCHEIDET
 * `uebergang()` BEREITS (TABELLE hat zwei Zeilen fuer `in_arbeit`×`fertig`, unterschieden durch
 * `gilt: istSelbst`) — diese Action fragt `task.istSelbst` deshalb NICHT selbst ab (Brief: "nimm
 * das Ergebnis von dort"), sondern leitet Ereignis UND Status aus `ergebnis.nach` ab: derselbe
 * Endzustand "abgeschlossen" entsteht hier UND bei `freigebenAction` (`_db/schema.ts`,
 * `EREIGNISSE`-Kommentar: "derselbe Endzustand, zwei Wege dorthin"), deshalb ist "abgeschlossen"
 * (nicht "fertig_gemeldet") auch das Ereignis fuer den Selbstaufgaben-Weg.
 *
 * DIE ZWEITE UEBERGABE AUS AUFGABE 8 (Brief): `uebergang()` sieht `nachweisPflicht`/`nachweisArt`
 * auf der Zeile, aber NICHT, ob ein `nachweise`-Datensatz vorliegt — das ist eine eigene Tabelle.
 * Diese Action LIEST sie (`nachweiseSeitLetzterZurueckweisung`), sie SCHLIESST nicht von einem
 * ausgefuellten Feld auf einen erfuellten Nachweis. Ein fehlender/unpassender Nachweis ist ein
 * FELDFEHLER: das Formular ist unvollstaendig, kein Angriff.
 *
 * DIE PFLICHT IST EINE UNTERGRENZE, KEINE BESCHRAENKUNG (Spec §5.3, woertlich im Brief): "bild"
 * verlangt eine DATEI und erlaubt zusaetzlich Text; "text" verlangt TEXT und erlaubt zusaetzlich
 * eine Datei. Ein vorhandener Text ersetzt bei `nachweisArt === "bild"` deshalb NICHT die
 * Bildpruefung — genau der Fall, den ein verkuerztes "irgendein Nachweis vorhanden" uebersehen wuerde
 * (Review Fix-Runde 1, Important #1: der Textzweig filtert ausdruecklich auf `art === "text"`, nicht
 * auf "irgendein Nachweis existiert" — sonst genuegte ein Bild-Nachweis fuer eine textpflichtige
 * Aufgabe).
 *
 * EIN ALTER NACHWEIS ERFUELLT DIE PFLICHT NICHT ERNEUT (Review Fix-Runde 1, Befund #6,
 * Betreiberentscheidung 2026-08-14): `nachweiseSeitLetzterZurueckweisung` liefert nur Nachweise, die
 * NACH der letzten Zurueckweisung entstanden sind — ein Nachweis ist der Beleg fuer eine
 * Fertigmeldung, und eine Zurueckweisung erklaert genau diese Fertigmeldung samt Beleg fuer
 * ungenuegend. Ohne diesen Filter koennte "fertig melden -> zurueckgewiesen -> wiederaufnehmen ->
 * erneut fertig melden mit LEEREM Feld" durchgehen, weil die alte Zeile die Untergrenze noch
 * "erfuellt" — die Nachweispflicht waere dann eine Huerde, die man genau einmal nimmt. Gilt fuer
 * beide Zweige gleichermassen, weil beide aus derselben `vorhandene`-Liste lesen.
 *
 * DER BILDNACHWEIS KOMMT MIT AUFGABE 19: die Pruefung joint jetzt gegen `dateien.scanStatus`
 * (`istFreigegeben`, `_lib/scan.ts` — DIESELBE Funktion wie die Auslieferung in `a/[id]/nachweis/
 * [nachweisId]/route.ts`, keine zweite Fassung von "nur sauber liefert aus"). Nicht „irgendein Bild
 * vorhanden", sondern „ein Bild, dessen zugehoerige Datei GENAU `sauber` ist" — `offen` (der Zustand
 * direkt nach jedem Upload) und `befund`/`fehler` erfuellen die Pflicht ausdruecklich NICHT.
 *
 * DIE FOLGE, DIE DIE OBERFLAECHE ERKLAEREN MUSS (Brief): direkt nach dem Upload ist der Status
 * `offen`. Ein Klick auf „Fertig melden" in genau diesem Moment wird abgelehnt — und die Meldung sagt
 * „wird noch geprueft", nicht „fehlt": eine Person, die GERADE ein Bild hochgeladen hat, wird sonst
 * beschuldigt, gar nichts eingereicht zu haben. `bildMeldung` unten unterscheidet drei Faelle: KEIN
 * Bild vorhanden (die urspruengliche Meldung), das NEUESTE Bild ist noch `offen` (Auskunft, keine
 * Luege), oder es ist `befund`/`fehler` (abgelehnt — ein neues Bild ist noetig).
 */
function neuesterBildNachweis(vorhandene: readonly NachweisRow[]): NachweisRow | undefined {
  const bilder = vorhandene.filter((n) => n.art === "bild" && n.dateiId !== null);
  // `erstelltAm` traegt Sekundenaufloesung (Schema-Kommentar) — bei einem Gleichstand entscheidet
  // die zuletzt eingefuegte Zeile (Array-Reihenfolge von `nachweiseFuer`), keine erfundene zweite
  // Sortierregel.
  return bilder.reduce<NachweisRow | undefined>(
    (neuester, n) => (neuester === undefined || n.erstelltAm >= neuester.erstelltAm ? n : neuester),
    undefined,
  );
}

function bildMeldung(db: DB, vorhandene: readonly NachweisRow[]): string | null {
  const neuester = neuesterBildNachweis(vorhandene);
  if (neuester === undefined) return "Für diese Aufgabe ist ein Bildnachweis erforderlich.";
  const datei = neuester.dateiId !== null ? dateiNachId(db, neuester.dateiId) : null;
  if (datei !== null && istFreigegeben(datei.scanStatus)) return null;
  if (datei !== null && datei.scanStatus === "offen") {
    return "Der Nachweis wird noch geprüft — bitte gleich erneut versuchen.";
  }
  return "Der hochgeladene Nachweis wurde nicht freigegeben. Bitte ein neues Bild hochladen.";
}

export async function fertigMeldenAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const db = getDb();
  const akteur = await akteurFuerSession(db);
  const heute = isoTag(new Date());

  const aufgabeId = feld(formData, "aufgabeId");
  const task = aufgabe(db, aufgabeId);
  if (!task) throw new Error(`Aufgabe "${aufgabeId}" nicht gefunden.`);

  const ergebnis = uebergang(task, "fertig", akteur, heute);
  if (!ergebnis.erlaubt) throw new Error(ergebnis.grund);
  if (ergebnis.wirkung !== "aendern") throw new Error("Unerwartetes Uebergangsergebnis.");

  const values = { aufgabeId, nachweisText: feld(formData, "nachweisText") };
  const nachweisText = values.nachweisText.trim();

  if (task.nachweisPflicht) {
    const vorhandene = nachweiseSeitLetzterZurueckweisung(db, task.id);
    if (task.nachweisArt === "bild") {
      const meldung = bildMeldung(db, vorhandene);
      if (meldung !== null) {
        return {
          ok: false,
          // Eigener Schluessel "nachweis" statt "nachweisText": diese Ablehnung handelt vom
          // FEHLENDEN/NOCH NICHT FREIGEGEBENEN BILD, nicht vom Inhalt des Textfelds — ein Formular
          // mit ausgefuelltem Text UND fehlendem Bild soll nicht so aussehen, als sei der Text das
          // Problem.
          fieldErrors: { nachweis: meldung },
          values,
        };
      }
    } else {
      const hatText =
        nachweisText !== "" || vorhandene.some((n) => n.art === "text" && (n.text ?? "").trim() !== "");
      if (!hatText) {
        return {
          ok: false,
          fieldErrors: { nachweisText: "Fuer diese Aufgabe ist ein Textnachweis erforderlich." },
          values,
        };
      }
    }
  }

  if (nachweisText !== "") {
    erstelleNachweis(db, { aufgabeId: task.id, art: "text", text: nachweisText, erstelltVon: akteur.person.id });
  }

  aktualisiereAufgabe(db, task.id, { status: ergebnis.nach });
  schreibeVerlauf(db, {
    aufgabeId: task.id,
    ereignis: ergebnis.nach === "abgeschlossen" ? "abgeschlossen" : "fertig_gemeldet",
    akteurId: akteur.person.id,
  });
  revalidate();
  return { ok: true };
}

/**
 * NACHWEIS HOCHLADEN — WAR HIER EINE SERVER ACTION, IST SEIT AUFGABE 19 FIX-RUNDE 1 EIN ROUTE
 * HANDLER: `a/[id]/nachweis/hochladen/route.ts`. Der Grund steht in dessen Kopfkommentar und in
 * `next.config.ts`s zurueckgebautem Kommentar (`git log` fuer den Wortlaut) — kurz: eine Anhebung
 * von `serverActions.bodySizeLimit` fuer diese eine Route haette sie fuer JEDE Server Action
 * JEDES Moduls angehoben.
 *
 * `_ui/NachweisFormular.tsx` ruft die Route jetzt direkt per `fetch`, nicht mehr ueber
 * `useActionState` gegen eine Funktion aus dieser Datei.
 */

/**
 * FREIGEBEN — `freigabe_offen` → `abgeschlossen` (Spec §5.2), nur Pruefer oder Koordination
 * (`uebergang()` prueft `darfFreigeben`). Kein Formularfeld ausser `aufgabeId`, deshalb kein
 * `FormState` — wie `zurueckziehenAction`.
 *
 * DIE VERTRETUNGSFREIGABE (Brief, Spec §6 `verlauf`): schreibt die Verlaufszeile ALS SOLCHE, wenn
 * `istVertretungsfreigabe(akteur, task)` wahr ist — "Freigegeben von X in Vertretung für Y". Das
 * ist der Punkt, an dem die Leistungsdokumentation aussagekraeftig wird oder nicht: ohne die
 * Unterscheidung saehe eine Freigabe durch die Koordination in Vertretung genauso aus wie eine durch
 * den eingetragenen Pruefer, und am Ende des Dienstjahres liesse sich nicht mehr nachvollziehen, wer
 * tatsaechlich geprueft hat.
 *
 * `istVertretungsfreigabe` traegt selbst die Klausel `prueferId !== null` (die Invariante, dass jede
 * Fremdaufgabe einen Pruefer hat — Aufgabe 9 stellt das beim Einstellen her); diese Action baut das
 * nicht nach, sie nutzt nur, dass `task.prueferId` innerhalb des `if` deshalb `string` ist.
 *
 * FINDET `personNachId` DEN PRUEFER TROTZDEM NICHT (Review Fix-Runde 1, Minor #5), WIRFT DIESE
 * ACTION, STATT SEINE ID INS JOURNAL ZU SCHREIBEN: `personNachId` liefert `null` nur bei einer
 * Datenbankinkonsistenz (eine `prueferId`, die auf keine Person mehr zeigt), und die Verlaufszeile
 * ist laut Spec §6 die LEISTUNGSDOKUMENTATION — eine UUID statt eines Namens waere ein stiller
 * Qualitaetsverlust genau an der Stelle, die aussagekraeftig sein soll. Laut ist besser als still.
 */
export async function freigebenAction(formData: FormData): Promise<void> {
  const db = getDb();
  const akteur = await akteurFuerSession(db);
  const heute = isoTag(new Date());

  const aufgabeId = feld(formData, "aufgabeId");
  const task = aufgabe(db, aufgabeId);
  if (!task) throw new Error(`Aufgabe "${aufgabeId}" nicht gefunden.`);

  const ergebnis = uebergang(task, "freigeben", akteur, heute);
  if (!ergebnis.erlaubt) throw new Error(ergebnis.grund);
  if (ergebnis.wirkung !== "aendern") throw new Error("Unerwartetes Uebergangsergebnis.");

  let notiz: string | undefined;
  if (istVertretungsfreigabe(akteur, task) && task.prueferId !== null) {
    const pruefer = personNachId(db, task.prueferId);
    if (!pruefer) {
      throw new Error(`Pruefer "${task.prueferId}" nicht gefunden — Datenbankinkonsistenz.`);
    }
    notiz = `Freigegeben von ${akteur.person.name} in Vertretung für ${pruefer.name}`;
  }

  aktualisiereAufgabe(db, task.id, { status: ergebnis.nach });
  schreibeVerlauf(db, { aufgabeId: task.id, ereignis: "abgeschlossen", akteurId: akteur.person.id, notiz });
  revalidate();
}

/**
 * ZURUECKWEISEN — `freigabe_offen` → `zurueckgewiesen` (Spec §5.2), nur Pruefer oder Koordination.
 *
 * DIE ERSTE UEBERGABE AUS AUFGABE 8 (Brief): die Spec-Tabelle schreibt woertlich "Begruendung
 * Pflicht" — `uebergang()` sieht keinen Begruendungstext und kann das strukturell nicht pruefen,
 * diese Action ist die einzige verbleibende Stelle. Eine leere Begruendung ist ein FELDFEHLER
 * (Spec §8.4: "eine Zurueckweisung ohne Begruendung ist fuer den BuFDi wertlos" — ein unvollstaendiges
 * Formular, kein Angriff), und sie gehoert in die VERLAUFSZEILE (`notiz`), nicht nur in ein Feld auf
 * der Aufgabe: der Verlauf ist die Leistungsdokumentation (Spec §6).
 */
export async function zurueckweisenAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const db = getDb();
  const akteur = await akteurFuerSession(db);
  const heute = isoTag(new Date());

  const aufgabeId = feld(formData, "aufgabeId");
  const task = aufgabe(db, aufgabeId);
  if (!task) throw new Error(`Aufgabe "${aufgabeId}" nicht gefunden.`);

  const ergebnis = uebergang(task, "zurueckweisen", akteur, heute);
  if (!ergebnis.erlaubt) throw new Error(ergebnis.grund);
  if (ergebnis.wirkung !== "aendern") throw new Error("Unerwartetes Uebergangsergebnis.");

  const values = { aufgabeId, begruendung: feld(formData, "begruendung") };
  const begruendung = values.begruendung.trim();
  if (begruendung === "") {
    return { ok: false, fieldErrors: { begruendung: "Eine Begruendung ist Pflicht." }, values };
  }

  aktualisiereAufgabe(db, task.id, { status: ergebnis.nach });
  schreibeVerlauf(db, {
    aufgabeId: task.id,
    ereignis: "zurueckgewiesen",
    akteurId: akteur.person.id,
    notiz: begruendung,
  });
  revalidate();
  return { ok: true };
}

/*
 * AB HIER AUFGABE 11 — ROUTINEN (Spec §6 `routine`, §8.1, §9.5, §9.7-§9.9).
 *
 * EINE ROUTINE DURCHLAEUFT `uebergang()` NICHT (Brief, Spec §6): sie ist kein Aufgabendatensatz —
 * kein Status, kein Nachweis, keine Freigabe, die Uebergangstabelle kennt sie nicht. Die drei Actions
 * hier pruefen die Berechtigung deshalb DIREKT ueber `_lib/zugang.ts`, statt einen Aufruf zu bauen,
 * den `uebergang()` strukturell nicht bedienen kann.
 *
 * `darfRoutinenVerwalten` STEHT SEIT DEM ABSCHLUSSREVIEW (G6) NEBEN `darfPlanAendern`, IN ALLEN
 * DREI ACTIONS: `routinen/page.tsx:107` gatet die Route mit `darfRoutinenVerwalten`
 * (`rolle === "bufdi" && istAktiv`), die Actions prueften bis dahin nur `darfPlanAendern`
 * (Identitaet + aktiv). Eine koordinierende oder eine `auftrag`-Person bekam auf `/routinen` also ein
 * `notFound()`, konnte aber per direktem POST ihre EIGENEN Routinen anlegen, aendern und ruhen
 * lassen — "Recht ohne Knopf". Praktisch harmlos (fremde Routinen blieben durch `darfPlanAendern`
 * verschlossen), aber es war die EINZIGE Stelle im Modul, an der Oberflaeche und Riegel auf
 * verschiedene Praedikate zeigten, und `_lib/zugang.ts`s eigene Begruendung fuer
 * `darfRoutinenVerwalten` lautet ausdruecklich: "dieselbe Bedingung an EINER Stelle, nicht implizit
 * 'niemand verlinkt dorthin'". Diese Zusage hielt die Action-Seite nicht ein; die Ausnahme kostete
 * mehr als der Einzeiler.
 *
 * `darfPlanAendern(p, zielPersonId, heute)` IST DAS RICHTIGE PRAEDIKAT, KEIN EIGENES (Brief): eine
 * Routine ist ein Zeitplaneintrag mit Wiederholung — sie zweitens zu schuetzen waere eine zweite
 * Fassung derselben Regel (`p.id === zielPersonId` und aktiv), die bei einer kuenftigen Aenderung von
 * `darfPlanAendern` nicht automatisch mitzoege. AUCH DIE KOORDINATION SCHEITERT DARAN — die einzige
 * Klausel ist `p.id === zielPersonId`, sie schlaegt vor, sie setzt nicht (`_lib/zugang.ts`-Kommentar).
 * `routineAnlegenAction` liest dabei GAR KEIN Zielperson-Feld aus dem Formular: `zielPersonId` ist
 * immer die anmeldende Person selbst — ein manipuliertes Formular mit einem fremden `personId`-Feld
 * haette hier strukturell keinen Empfaenger, nicht nur eine gepruefte Ablehnung.
 *
 * KEINE VERLAUFSZEILE FUER ROUTINEN — ENTSCHEIDUNG (Brief liess das offen, Bericht begruendet sie
 * ausfuehrlich): `verlauf.aufgabe_id` ist NOT NULL und referenziert `aufgaben.id` (`_db/schema.ts`);
 * eine Routine hat keine `aufgabeId`, und eine erfundene waere eine falsche Tatsachenbehauptung in der
 * Leistungsdokumentation (Brief: „was NICHT geht"). Ein ZWEITER Weg (eine eigene Routinen-Historie)
 * entfaellt ebenfalls: der Verlauf IST die Leistungsdokumentation (Spec §6 zu `verlauf`), und eine
 * Routine hat laut Spec §6 ausdruecklich KEINE Leistung, die zu dokumentieren waere — „ohne Status,
 * ohne Nachweis, ohne Freigabe". Ergo: gar kein Verlauf, fuer keine der drei Actions.
 */

/** Ein Wochentags-Index (0-4, Mo-Fr) je gesetztem Kontrollkaestchen `name="wochentage"`. */
function wochentageAusFormData(formData: FormData): number[] {
  return formData
    .getAll("wochentage")
    .map((wert) => Number(wert))
    .filter((i) => Number.isInteger(i) && i >= 0 && i < WOCHENTAG_BIT.length);
}

/** Die Bitmaske aus einer Liste von Wochentags-Indizes — `_lib/anzeige.ts`s `WOCHENTAG_BIT`, nicht nachgebaut. */
function maskeAusIndizes(indizes: number[]): number {
  return indizes.reduce((maske, i) => maske | WOCHENTAG_BIT[i]!, 0);
}

/**
 * DER GEMEINSAME RUMPF FUER ANLEGEN UND AENDERN — beide Formulare tragen dieselben vier Felder
 * (Titel, Wochentage, Uhrzeit, Dauer), und der einzige Unterschied ist, ob eine bestehende Zeile
 * geladen und geprueft wird oder die anmeldende Person selbst das Ziel ist. Vorbild `verteilenGemeinsam`
 * oben: ein zweites, fast identisches Formular waere derselbe Code doppelt gehalten.
 *
 * `routineId === null` HEISST „ANLEGEN": `zielPersonId` ist dann `person.id` — eine Routine wird
 * immer fuer die eigene Person angelegt, nie fuer eine andere (Brief: „gehoert einer Person, nur sie
 * verwaltet sie"). `routineId !== null` HEISST „AENDERN": die bestehende Zeile wird geladen, und
 * `zielPersonId` ist ihre `personId` — eine unbekannte `routineId` wirft, wie bei jeder anderen Action
 * dieser Datei (Vorbild `verteilenGemeinsam`s `aufgabe(db, aufgabeId)`-Pruefung).
 */
async function routineFormularGemeinsam(
  formData: FormData,
  routineId: string | null,
): Promise<FormState> {
  const db = getDb();
  const akteur = await akteurFuerSession(db);
  const heute = isoTag(new Date());

  const bestehende = routineId === null ? null : routineNachId(db, routineId);
  if (routineId !== null && !bestehende) {
    throw new Error(`Routine "${routineId}" nicht gefunden.`);
  }
  const zielPersonId = bestehende ? bestehende.personId : akteur.person.id;
  if (!darfRoutinenVerwalten(akteur, heute) || !darfPlanAendern(akteur, zielPersonId, heute)) {
    throw new Error("Keine Berechtigung, diese Routine zu aendern.");
  }

  const indizes = wochentageAusFormData(formData);
  const values: Record<string, string> = {
    titel: feld(formData, "titel"),
    // KOMMAGETRENNTE INDIZES, NICHT DIE FERTIGE MASKE (Review-Punkt aus dem Brief: „values traegt
    // JEDES gesendete Feld zurueck"): `RoutineFormular.tsx` liest diese Liste zurueck, um nach einem
    // Feldfehler GENAU die zuvor angehakten Kontrollkaestchen wieder zu setzen — mit der fertigen
    // Maske allein waere das dieselbe Zerlegung ein zweites Mal, diesmal in der Client-Insel.
    wochentage: indizes.join(","),
    uhrzeit: feld(formData, "uhrzeit"),
    dauerMinuten: feld(formData, "dauerMinuten"),
  };
  if (routineId !== null) values.routineId = routineId;

  const fieldErrors: Record<string, string> = {};
  const titel = values.titel.trim();
  if (titel === "") fieldErrors.titel = "Titel fehlt.";
  if (indizes.length === 0) {
    fieldErrors.wochentage = "Mindestens ein Wochentag muss gewaehlt sein.";
  }
  const uhrzeit = values.uhrzeit.trim();
  if (uhrzeit !== "" && !istGueltigeUhrzeit(uhrzeit)) {
    fieldErrors.uhrzeit = "Uhrzeit ungueltig — Format HH:MM.";
  }
  const dauerMinuten = Number(values.dauerMinuten);
  if (!istGueltigeDauerMinuten(dauerMinuten)) {
    fieldErrors.dauerMinuten = "Dauerschaetzung muss eine ganze Zahl groesser 0 sein.";
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors, values };

  const werte = {
    titel,
    wochentage: maskeAusIndizes(indizes),
    uhrzeit: uhrzeit === "" ? null : uhrzeit,
    dauerMinuten,
  };

  if (bestehende) {
    aktualisiereRoutine(db, bestehende.id, werte);
  } else {
    erstelleRoutine(db, { personId: zielPersonId, ...werte });
  }
  revalidate();
  return { ok: true };
}

/** ANLEGEN — immer fuer die anmeldende Person selbst (Spec §6, §8.1). */
export async function routineAnlegenAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return routineFormularGemeinsam(formData, null);
}

/**
 * AENDERN — dieselben vier Felder an einer bestehenden Routine. `routineId` ist hier PFLICHT (anders
 * als bei `routineAnlegenAction`, wo es keine gibt) — ein leeres Feld ist nur ueber ein manipuliertes
 * Formular erreichbar (die Oberflaeche traegt es immer als verstecktes Feld) und wirft deshalb, statt
 * einen Feldfehler zurueckzugeben.
 */
export async function routineAendernAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const routineId = feld(formData, "routineId");
  if (routineId === "") throw new Error("routineId fehlt.");
  return routineFormularGemeinsam(formData, routineId);
}

/**
 * RUHEN LASSEN / WIEDER AUFWECKEN — schaltet `aktiv` um. Kein Formularfeld ausser `routineId`,
 * deshalb kein `FormState` — wie `zurueckziehenAction`/`freigebenAction` oben.
 */
export async function routineRuhenAction(formData: FormData): Promise<void> {
  const db = getDb();
  const akteur = await akteurFuerSession(db);
  const heute = isoTag(new Date());

  const routineId = feld(formData, "routineId");
  const bestehende = routineNachId(db, routineId);
  if (!bestehende) throw new Error(`Routine "${routineId}" nicht gefunden.`);
  if (
    !darfRoutinenVerwalten(akteur, heute) ||
    !darfPlanAendern(akteur, bestehende.personId, heute)
  ) {
    throw new Error("Keine Berechtigung, diese Routine zu aendern.");
  }

  aktualisiereRoutine(db, bestehende.id, { aktiv: !bestehende.aktiv });
  revalidate();
}

/*
 * AB HIER AUFGABE 12 — DER RANGWECHSEL AUF `planRang` (Spec §8.5, §9.6, Brief). Die zweite Haelfte
 * dieser Aufgabe, `einplanenAction`, gibt es bereits seit Aufgabe 10 (Kopfkommentar dort) — sie wird
 * hier nur AUFGERUFEN, nicht neu gebaut; `EinplanenFormular.tsx` ruft sie direkt.
 */

const RICHTUNGEN = ["hoch", "runter"] as const;
type Richtung = (typeof RICHTUNGEN)[number];
function istGueltigeRichtung(s: string): s is Richtung {
  return (RICHTUNGEN as readonly string[]).includes(s);
}

/**
 * TAUSCHT DEN RANG ZWEIER BENACHBARTER AUFGABEN DERSELBEN PERSON AM SELBEN TAG (Spec §8.5, Brief:
 * „Auf und Ab auf `planRang`, innerhalb eines Tages"). DER TAUSCH LIEGT HIER, NICHT IN DER
 * CLIENT-INSEL (`RangKnoepfe.tsx`, Brief): sonst laege Fachlogik im Browser, und Aufgabe 20 (Ziehen)
 * muesste sie ein zweites Mal bauen — dieselbe Ueberlegung wie bei `einplanenAction`, die beide
 * Bedienwege (Formular UND Ziehen) teilen sollen.
 *
 * KEIN `FormState`: `aufgabeId` und `richtung` sind keine Formularfelder, die als Feldfehler
 * scheitern koennten — beide kommen aus versteckten Feldern eines von der Oberflaeche kontrollierten
 * Formulars (Vorbild `routineRuhenAction`/`freigebenAction`: kein Text, der sich vertippen liesse).
 * Ein unbekannter Wert ist nur ueber ein manipuliertes Formular erreichbar und wirft deshalb, statt
 * einen Feldfehler zurueckzugeben.
 *
 * KEIN `uebergang()`: ein Rangwechsel ist KEIN Statuswechsel der Uebergangstabelle — Spec §5.2 kennt
 * dafuer keine Zeile, und Spec §8.5 nennt ihn ausdruecklich einen Zeitplanvorgang, keinen
 * Zustandswechsel. Wie bei den drei Routinen-Actions (Aufgabe 11, Kopfkommentar dort) kommt die
 * Berechtigung deshalb DIREKT aus `darfPlanAendern` (`_lib/zugang.ts`), nicht aus `uebergang()`.
 * AUCH DIE KOORDINATION SCHEITERT DARAN (Brief) — sie schlaegt vor (`vorschlagDatum`), sie setzt
 * nicht (`darfPlanAendern`-Kommentar in `_lib/zugang.ts`).
 *
 * DIE SKALA IST `planEintraegeFuerTag` (`_db/queries.ts`) — DIESELBE, DIE `tagesOrdnung`
 * (`_lib/tagesplan.ts`) fuer die AUFGABEN-Teilfolge eines Tages verwendet (beide filtern
 * `zugewiesenAn === personId && planDatum === datum` und sortieren nach `planRang`). „Kein Nachbar in
 * dieser Richtung" (die erste Aufgabe + „hoch", die letzte + „runter") WIRFT HIER, SERVERSEITIG — die
 * deaktivierten Knoepfe in der Insel sind nur die AFFORDANZ (sie zeigen die Grenze an), nicht die
 * Pruefung selbst; ein manipuliertes Formular darf nicht funktionieren, nur weil der Browser den
 * Knopf deaktiviert haette. Diese Bedingung ist der Wurf, den die zweite Gegenprobe des Briefs
 * („Begrenzung erster hat kein Auf entfernen") auf DIESER Ebene rot werden lassen soll — die Insel
 * traegt dieselbe Begrenzung ein zweites Mal (`RangKnoepfe.tsx`, `istErste`/`istLetzte`), und beide
 * Ebenen sind einzeln bewacht (`RangKnoepfe.test.tsx` bzw. dieser Datei Tests).
 *
 * KEINE VERLAUFSZEILE — EIGENE BEGRUENDUNG, KEINE WIEDERHOLUNG VON AUFGABE 11 (Brief verlangt das
 * ausdruecklich): Aufgabe 11 verzichtete auf eine Verlaufszeile fuer Routinen aus einem STRUKTURELLEN
 * Grund (`verlauf.aufgabeId` ist `NOT NULL` und referenziert `aufgaben.id`; eine Routine hat keine).
 * Dieser Grund GILT HIER NICHT — eine Aufgabe hat immer eine `aufgabeId`, ein Rangwechsel KOENNTE
 * technisch eine Zeile schreiben. Die Entscheidung dagegen ist trotzdem richtig, aus einem ANDEREN
 * Grund: ein Rangtausch aendert NUR die Reihenfolge INNERHALB eines Tages — er aendert nie, AN
 * WELCHEM TAG oder UM WELCHE UHRZEIT eine Aufgabe steht. Genau das ist `einplanenAction` vorbehalten,
 * und die schreibt dafuer bereits eine „Eingeplant: …"-Zeile (mit Vorschlags-Abgleich, s. dort). Der
 * Verlauf ist die Leistungsdokumentation (Spec §6) — WELCHER TAG und WELCHE UHRZEIT sind darin die
 * dokumentationswuerdigen Fakten, nicht die Position innerhalb eines Tages, die die Person ohnehin
 * frei sortieren darf. Eine Zeile je Auf-/Ab-Klick waere reines Rauschen ohne Dokumentationswert
 * (Brief: „eine Zeile je Auf-Klick wäre Lärm"), waehrend „gar nichts" hier NICHTS verliert, das eine
 * Umplanung betrifft — jede ECHTE Umplanung (anderer Tag, andere Uhrzeit) laeuft ausschliesslich ueber
 * `einplanenAction` und wird DORT bereits festgehalten. `EREIGNISSE` (`_db/schema.ts`) braucht deshalb
 * kein neues Mitglied.
 */
export async function rangVerschiebenAction(formData: FormData): Promise<void> {
  const db = getDb();
  const akteur = await akteurFuerSession(db);
  const heute = isoTag(new Date());

  const aufgabeId = feld(formData, "aufgabeId");
  const task = aufgabe(db, aufgabeId);
  if (!task) throw new Error(`Aufgabe "${aufgabeId}" nicht gefunden.`);

  // `darfPlanAendern` will die ZIELPERSON als `string` — eine unzugewiesene Aufgabe (`null`) hat
  // strukturell keine Person, deren Plan geaendert werden koennte, und faellt deshalb hier heraus,
  // statt `darfPlanAendern` mit einem erfundenen Platzhalter aufzurufen.
  const zielPersonId = task.zugewiesenAn;
  if (zielPersonId === null || !darfPlanAendern(akteur, zielPersonId, heute)) {
    throw new Error("Keine Berechtigung, diesen Rang zu aendern.");
  }
  if (task.planDatum === null) {
    throw new Error("Aufgabe ist nicht eingeplant — kein Rang zu verschieben.");
  }

  const richtung = feld(formData, "richtung");
  if (!istGueltigeRichtung(richtung)) {
    throw new Error(`Unbekannte Richtung "${richtung}".`);
  }

  const zeilen = planEintraegeFuerTag(db, zielPersonId, task.planDatum);
  const index = zeilen.findIndex((z) => z.id === task.id);
  // Unerreichbar nach heutiger Rechtslage: `zeilen` filtert exakt auf
  // `zugewiesenAn === zielPersonId && planDatum === task.planDatum`, und `task` selbst erfuellt beide
  // Bedingungen (wir haben `zielPersonId`/`task.planDatum` gerade aus `task` gelesen) — kein `-1`
  // erreichbar, ohne dass sich die Aufgabe zwischen den beiden Lesevorgaengen aenderte.
  const nachbarIndex = richtung === "hoch" ? index - 1 : index + 1;
  if (nachbarIndex < 0 || nachbarIndex >= zeilen.length) {
    throw new Error("Kein Nachbar in dieser Richtung.");
  }
  const nachbar = zeilen[nachbarIndex]!;

  aktualisiereAufgabe(db, task.id, { planRang: nachbar.planRang });
  aktualisiereAufgabe(db, nachbar.id, { planRang: task.planRang });
  revalidate();
}

/*
 * AB HIER AUFGABE 14 — DIE PERSONENVERWALTUNG (Spec §4, §7 personen-Tabelle, Brief). Gatet ueber
 * `darfPersonenVerwalten` (`_lib/zugang.ts`) ODER `canAdminModule("aufgaben")` — dieselbe
 * Oder-Bedingung, mit der `personen/page.tsx` die Route selbst schuetzt.
 *
 * DER NOTAUSGANG GILT AUF BEIDEN SEITEN, UND ZWAR SEIT DEM ABSCHLUSSREVIEW (K1): bis dahin stand er
 * NUR auf der Seite. Der Suite-Admin sah das Formular und bekam beim Absenden `notFound()` aus
 * `personFuerSession` — genau die zwei Folgen, die die Betreiberentscheidung vom 2026-08-14 abwenden
 * sollte, bestanden damit unveraendert fort: in einer frischen Produktionsdatenbank gab es KEINEN
 * Weg zur allerersten `personen`-Zeile (das Modul war ohne direkten Datenbankeingriff nicht in
 * Betrieb zu nehmen), und die versehentlich beendete einzige Koordinationsperson konnte sich nicht
 * selbst reaktivieren. EIN ZUGANG, DER NUR DEN LESEPFAD OEFFNET, IST KEIN ZUGANG — wer den Riegel
 * hier spaeter "vereinfacht", nimmt beide Folgen zurueck.
 *
 * `canAdminModule` STATT `requireModuleAdmin` (beide `core/auth/guards.ts`): gebraucht wird die
 * ODER-Haelfte einer Bedingung, nicht ein eigener Abbruch — `requireModuleAdmin` wuerfe jede
 * regulaere Koordinationsperson ohne Suite-Admin-Gruppe hinaus.
 *
 * ES GIBT KEINE LOESCHEN-AKTION, UND DAS IST ABSICHT (Brief, Spec §4): eine ausgeschiedene Person
 * wird ueber `aktivBis` beendet, nicht entfernt — ihre Aufgaben, Nachweise und Verlaufszeilen
 * bleiben lesbar (Fremdschluessel aus `aufgaben`/`nachweise`/`verlauf` auf `personen.id`). Wer hier
 * eine `personLoeschenAction` vermisst: das ist kein vergessener Fall, sondern die Fachlichkeit
 * (Jahreswechsel ist keine Loeschaktion) — bitte nicht ergaenzen.
 */

/**
 * DER RIEGEL DER PERSONENVERWALTUNG — EINE STELLE FUER BEIDE SCHREIBWEGE (`personFormularGemeinsam`
 * und `personBeendenAction`). Genau die Bauform, deren Fehlen K1 ausmachte: stuende die
 * Oder-Bedingung zweimal ausgeschrieben da, koennte die naechste Aenderung wieder nur eine Haelfte
 * treffen.
 *
 * DIE REIHENFOLGE IST TRAGEND: `canAdminModule` ZUERST, VOR JEDER PERSONEN-ZEILEN-FRAGE — dieselbe
 * Reihenfolge wie in `personen/page.tsx`. Umgekehrt gefragt, faenge `personFuerSession`s
 * `notFound()` genau den Suite-Admin ohne eigene `personen`-Zeile ab, also den Erstbetriebs-Fall.
 *
 * DIE JIT-ZEILE (`_lib/zugang.ts`s `akteurFuerSeite`, 2026-08-15) NIMMT DIESEM RIEGEL SEINE
 * DRINGLICHKEIT, ABER NICHT SEINE AUFGABE: sie entsteht beim SEITENAUFBAU, und Actions bauen keine
 * Seite auf. Ein POST, der vor jedem Seitenabruf dieser Sitzung eintrifft, traefe weiterhin auf
 * `personFuerSession`s `notFound()` — deshalb bleibt der Zweig hier stehen, statt sich auf einen
 * Aufrufpfad zu verlassen, der im Normalfall vorher lief.
 *
 * `bearbeiter` LEBT NUR IN DIESER FUNKTION und wird nirgends zurueckgegeben: beide Aufrufer
 * arbeiten danach ausschliesslich mit ihren eigenen Werten (`bestehende`/`values`/`db` bzw.
 * `ziel`/`heute`). Fuer den Modul-Admin gibt es unter Umstaenden gar keine Zeile — ein
 * durchgereichter `PersonRow | null` waere eine Einladung, ihn als `erstelltVon`-artigen Wert zu
 * verwenden und dabei still `null` zu schreiben.
 */
async function verlangePersonenverwaltung(db: DB, heute: string): Promise<void> {
  if (await canAdminModule("aufgaben")) return;
  const bearbeiter = await akteurFuerSession(db);
  if (!darfPersonenVerwalten(bearbeiter, heute)) {
    throw new Error("Keine Berechtigung, Personen zu verwalten.");
  }
}

/**
 * DER GEMEINSAME RUMPF FUER ANLEGEN UND AENDERN — Vorbild `verteilenGemeinsam`/
 * `routineFormularGemeinsam`. `personId === null` heisst „anlegen" (der `sub` ist ein echtes
 * Formularfeld); `personId !== null` heisst „aendern" (der `sub` bleibt unveraendert, s. u.).
 */
async function personFormularGemeinsam(
  formData: FormData,
  personId: string | null,
): Promise<FormState> {
  const db = getDb();
  const heute = isoTag(new Date());
  await verlangePersonenverwaltung(db, heute);

  const bestehende = personId === null ? null : personNachId(db, personId);
  if (personId !== null && !bestehende) {
    throw new Error(`Person "${personId}" nicht gefunden.`);
  }

  const values: Record<string, string> = {
    name: feld(formData, "name"),
    rolle: feld(formData, "rolle"),
    initialen: feld(formData, "initialen"),
    sollMinutenTag: feld(formData, "sollMinutenTag"),
    aktivVon: feld(formData, "aktivVon"),
    aktivBis: feld(formData, "aktivBis"),
  };
  // NUR BEIM ANLEGEN EIN FORMULARFELD (Brief, Betreiberentscheidung dieser Aufgabe — s. Bericht):
  // `sub` ist die Pocket-ID-Kennung, unter Aufgabe 13s `NichtEingetragenSeite` fuer die betroffene
  // Person selbst sichtbar (`_lib/zugang.ts`s `subFuerSitzung`) — sie gibt sie der Koordination
  // durch, statt dass die Koordination sie raet. NACH DEM ANLEGEN BLEIBT `sub` UNVERAENDERLICH: ein
  // spaeter geaendertes `sub` haengte die GESAMTE Geschichte einer Person (Aufgaben, Nachweise,
  // Verlauf) still an eine andere Pocket-ID-Anmeldung um — `personAendernAction` liest das Feld
  // deshalb gar nicht erst aus `formData`.
  if (bestehende === null) values.sub = feld(formData, "sub");
  if (personId !== null) values.personId = personId;

  // Nur ueber ein manipuliertes Formular erreichbar (die Oberflaeche bietet ein `<select>` mit
  // genau den gueltigen Werten an) — deshalb Wurf statt Feldfehler, wie bei `istGueltigePrioritaet`.
  if (!istGueltigeRolle(values.rolle)) {
    throw new Error(`Unbekannte Rolle "${values.rolle}".`);
  }

  const fieldErrors: Record<string, string> = {};
  const name = values.name.trim();
  if (name === "") fieldErrors.name = "Name fehlt.";
  const initialen = values.initialen.trim();
  if (initialen === "") fieldErrors.initialen = "Initialen fehlen.";
  const sollMinutenTag = Number(values.sollMinutenTag);
  if (!istGueltigeDauerMinuten(sollMinutenTag)) {
    fieldErrors.sollMinutenTag = "Soll-Minuten pro Tag muss eine ganze Zahl groesser 0 sein.";
  }
  if (!istGueltigerIsoTag(values.aktivVon)) {
    fieldErrors.aktivVon = "Aktiv von fehlt oder ist ungueltig.";
  }
  const aktivBis = values.aktivBis.trim();
  if (aktivBis !== "" && !istGueltigerIsoTag(aktivBis)) {
    fieldErrors.aktivBis = "Aktiv bis ist ungueltig.";
  }
  // `aktivBis` SCHLIESST EIN (Brief, Spec §4) — die Reihenfolge selbst ist trotzdem eine
  // Formalpruefung: ein Enddatum vor dem Anfang waere in jeder Auslegung falsch.
  if (aktivBis !== "" && istGueltigerIsoTag(values.aktivVon) && aktivBis < values.aktivVon) {
    fieldErrors.aktivBis = "Aktiv bis darf nicht vor Aktiv von liegen.";
  }

  let sub = "";
  if (bestehende === null) {
    // KEIN `.toLowerCase()`, KEIN TRIMMEN AUSSER RANDLEERZEICHEN: Pocket-ID-`sub`-Werte sind
    // gross-/kleinschreibungssensitiv — eine Normalisierung erzeugte eine Zeile, die bei der
    // naechsten Anmeldung STILL nie trifft (`personFuerSeite` vergleicht exakt).
    sub = values.sub.trim();
    if (sub === "") {
      fieldErrors.sub = "Die Pocket-ID-Kennung fehlt.";
    } else if (personNachSub(db, sub)) {
      // DIE EINDEUTIGKEIT WIRD HIER GEPRUEFT, NICHT DEM UNIQUE-INDEX UEBERLASSEN
      // (`personen_sub_idx"): eine SQLite-Constraint-Verletzung waere ein Wurf auf der technischen
      // Fehlerseite, obwohl es sich um ein gewoehnliches, vom Formular her erwartbares Problem
      // handelt ("diese Person gibt es schon") — ein Feldfehler ist hier die ehrlichere Antwort.
      fieldErrors.sub = "Diese Kennung ist bereits vergeben.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors, values };

  const aktivBisWert = aktivBis === "" ? null : aktivBis;
  if (bestehende) {
    aktualisierePerson(db, bestehende.id, {
      name,
      initialen,
      rolle: values.rolle,
      sollMinutenTag,
      aktivVon: values.aktivVon,
      aktivBis: aktivBisWert,
    });
  } else {
    erstellePerson(db, {
      sub,
      name,
      initialen,
      rolle: values.rolle,
      sollMinutenTag,
      aktivVon: values.aktivVon,
      aktivBis: aktivBisWert,
    });
  }
  revalidate();
  return { ok: true };
}

/** ANLEGEN — der einzige Weg, aus einer Pocket-ID-Kennung eine `personen`-Zeile zu machen. */
export async function personAnlegenAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return personFormularGemeinsam(formData, null);
}

/**
 * AENDERN — dieselben Felder ausser `sub` an einer bestehenden Person. `personId` ist hier PFLICHT
 * (anders als bei `personAnlegenAction`) — ein leeres Feld ist nur ueber ein manipuliertes Formular
 * erreichbar und wirft deshalb, statt einen Feldfehler zurueckzugeben (Vorbild
 * `routineAendernAction`).
 */
export async function personAendernAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const personId = feld(formData, "personId");
  if (personId === "") throw new Error("personId fehlt.");
  return personFormularGemeinsam(formData, personId);
}

/**
 * BEENDEN — setzt `aktivBis` auf HEUTE. Kein `FormState` (nur `personId`, kein Formularfeld, das
 * scheitern koennte) — dieselbe Wahl wie `zurueckziehenAction`/`freigebenAction`.
 *
 * BESTAETIGUNGSPFLICHTIG (Spec §9.9 nennt „Person deaktivieren" ausdruecklich): die Bestaetigung
 * selbst ist Oberflaechensache (`_ui/PersonenTabelle.tsx`s `Popconfirm`, Vorbild
 * `files/_ui/ShareDetailAktionen.tsx`) — diese Action prueft nur die Berechtigung und schreibt.
 *
 * EIN SPAETERES, ABWEICHENDES ENDDATUM BLEIBT UEBER DAS ALLGEMEINE FORMULAR ERREICHBAR
 * (`personAendernAction`, Feld `aktivBis`) — dieser Knopf ist die schnelle Antwort auf den
 * Normalfall „heute ist der letzte Tag", keine zweite, engere Fassung derselben Schreiboperation.
 */
export async function personBeendenAction(formData: FormData): Promise<void> {
  const db = getDb();
  const heute = isoTag(new Date());
  await verlangePersonenverwaltung(db, heute);

  const personId = feld(formData, "personId");
  const ziel = personNachId(db, personId);
  if (!ziel) throw new Error(`Person "${personId}" nicht gefunden.`);

  aktualisierePerson(db, ziel.id, { aktivBis: heute });
  revalidate();
}
