"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "./_db/client";
import {
  aufgabe,
  aktualisiereAufgabe,
  bufdis,
  erstelleAufgabe,
  erstelleNachweis,
  loescheAufgabe,
  nachweiseSeitLetzterZurueckweisung,
  personNachId,
  planRangFuerEinplanen,
  schreibeVerlauf,
} from "./_db/queries";
import type { AufgabeRow, Ereignis } from "./_db/schema";
import {
  istGueltigeDauerMinuten,
  istGueltigeNachweisArt,
  istGueltigePrioritaet,
  istGueltigerIsoTag,
  istGueltigeUhrzeit,
} from "./_lib/eingabe";
import type { FormState } from "./_lib/formState";
import { anfangsZustand, uebergang, type Aktion } from "./_lib/lebenszyklus";
import { istVertretungsfreigabe, personFuerSession } from "./_lib/zugang";
import { isoTag } from "./_lib/datum";

/*
 * DIE VIER ACTIONS DER AUFGABE 9 — `einstellen`, `verteilen`, `umverteilen`, `zurueckziehen`.
 * DIESE AUFGABE (10) ERGAENZT DIE RESTLICHEN SIEBEN — `starten`, `zuruecksetzen`, `einplanen`,
 * `fertig`, `freigeben`, `zurueckweisen`, `wiederaufnehmen` — IN DERSELBEN DATEI (Brief), auf
 * denselben Helfern (`revalidate`, `feld`, `istGesetzt`, `_lib/eingabe.ts`).
 *
 * DIE KETTE IST FUER JEDE ACTION DIESELBE, UND IHRE REIHENFOLGE IST DIE ZUSAGE (Brief):
 *   personFuerSession  →  Praedikat (hier: `uebergang()`/`anfangsZustand()`)  →  schreiben
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
 * `uebergang()` bekommt nur `(AufgabeRow, Aktion, PersonRow, heute)` und sieht deshalb WEDER einen
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
  const ersteller = await personFuerSession(db);
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
    erstellerId: ersteller.id,
    zugewiesenAn: start.zugewiesenAn,
    status: start.status,
    faelligAm: values.faelligAm,
    faelligUhrzeit: faelligUhrzeit === "" ? null : faelligUhrzeit,
    dauerMinuten,
    nachweisPflicht,
    nachweisArt: values.nachweisArt,
    // DIE INVARIANTE, AUF DIE `istVertretungsfreigabe` SICH VERLAESST (Brief): eine Fremdaufgabe
    // bekommt hier ihren Pruefer (den Ersteller), eine Selbstaufgabe keinen.
    prueferId: start.istSelbst ? null : ersteller.id,
    istSelbst: start.istSelbst,
  });

  schreibeVerlauf(db, { aufgabeId: neue.id, ereignis: "eingestellt", akteurId: ersteller.id });
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
  const person = await personFuerSession(db);
  const heute = isoTag(new Date());

  const aufgabeId = feld(formData, "aufgabeId");
  const task = aufgabe(db, aufgabeId);
  if (!task) throw new Error(`Aufgabe "${aufgabeId}" nicht gefunden.`);

  const ergebnis = uebergang(task, aktion, person, heute);
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
   * `person.rolle === "bufdi" && istAktiv(...)` waere genau der Nachbau, den der Brief verbietet:
   * er traefe die Koordination selbst nicht (deren Rolle ist "koordination"), aber er haette
   * dieselbe Pruefung ein zweites Mal an einer Stelle liegen, die bei einer spaeteren Aenderung von
   * `bufdis()` (z. B. einer vierten Rolle) nicht automatisch mitzoege.
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
    akteurId: person.id,
    notiz:
      vorschlagDatum !== ""
        ? `Vorschlag: ${vorschlagDatum}${vorschlagUhrzeit !== "" ? ` ${vorschlagUhrzeit}` : ""}`
        : undefined,
  });
  revalidate();
  return { ok: true };
}

/** `eingegangen` → `verteilt` (Spec §5.2) — nur `koordination` (`uebergang()` prueft `darfVerteilen`). */
export async function verteilenAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return verteilenGemeinsam(formData, "verteilen", "verteilt");
}

/** `verteilt` → `verteilt`, mit geleerter Planung (Spec §5.2) — nur `koordination`. */
export async function umverteilenAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return verteilenGemeinsam(formData, "umverteilen", "umverteilt");
}

/**
 * ZURUECKZIEHEN — LOESCHT DIE AUFGABE, NUR AUS `eingegangen` (Spec §5.2, `uebergang()` prueft
 * Zustand UND Berechtigung: Ersteller oder `koordination`). Kein `FormState`: es gibt kein Feld,
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
  const person = await personFuerSession(db);
  const heute = isoTag(new Date());

  const aufgabeId = feld(formData, "aufgabeId");
  const task = aufgabe(db, aufgabeId);
  if (!task) throw new Error(`Aufgabe "${aufgabeId}" nicht gefunden.`);

  const ergebnis = uebergang(task, "zurueckziehen", person, heute);
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
  const person = await personFuerSession(db);
  const heute = isoTag(new Date());

  const aufgabeId = feld(formData, "aufgabeId");
  const task = aufgabe(db, aufgabeId);
  if (!task) throw new Error(`Aufgabe "${aufgabeId}" nicht gefunden.`);

  const ergebnis = uebergang(task, aktion, person, heute);
  if (!ergebnis.erlaubt) throw new Error(ergebnis.grund);
  if (ergebnis.wirkung !== "aendern") {
    // Verteidigungslinie fuer den Typ, wie in `verteilenGemeinsam": keine dieser drei Aktionen
    // erzeugt bei `uebergang()` `wirkung: "loeschen"`.
    throw new Error("Unerwartetes Uebergangsergebnis.");
  }

  aktualisiereAufgabe(db, task.id, { status: ergebnis.nach });
  schreibeVerlauf(db, { aufgabeId: task.id, ereignis, akteurId: person.id });
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
 */
export async function einplanenAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const db = getDb();
  const person = await personFuerSession(db);
  const heute = isoTag(new Date());

  const aufgabeId = feld(formData, "aufgabeId");
  const task = aufgabe(db, aufgabeId);
  if (!task) throw new Error(`Aufgabe "${aufgabeId}" nicht gefunden.`);

  const ergebnis = uebergang(task, "einplanen", person, heute);
  if (!ergebnis.erlaubt) throw new Error(ergebnis.grund);
  if (ergebnis.wirkung !== "aendern") throw new Error("Unerwartetes Uebergangsergebnis.");

  const values = {
    aufgabeId,
    planDatum: feld(formData, "planDatum"),
    planUhrzeit: feld(formData, "planUhrzeit"),
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
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors, values };

  const geplanteUhrzeit = planUhrzeit === "" ? null : planUhrzeit;
  const planRang = planRangFuerEinplanen(db, task, planDatum);

  aktualisiereAufgabe(db, task.id, { planDatum, planUhrzeit: geplanteUhrzeit, planRang });
  schreibeVerlauf(db, {
    aufgabeId: task.id,
    ereignis: "eingeplant",
    akteurId: person.id,
    notiz: einplanenNotiz(task, planDatum, geplanteUhrzeit),
  });
  revalidate();
  return { ok: true };
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
 * DER BILDNACHWEIS SELBST KOMMT ERST MIT AUFGABE 17-19 (Brief). Die Pruefung hier fragt deshalb nur,
 * OB EIN `nachweise`-DATENSATZ MIT `art === "bild"` EXISTIERT — sie kann (noch) nicht gegen
 * `dateien.scanStatus` joinen, weil `nachweise.dateiId` heute von niemandem gesetzt wird. AUFGABE 19
 * SCHAERFT GENAU DAS: sie ergaenzt den Join gegen `dateien.scanStatus === "sauber"`, sodass ein noch
 * nicht sauber gescanntes Bild NICHT ausreicht. Diese Zeile absichtlich NICHT auf "Text vorhanden"
 * verkuerzt zu lassen (Brief), auch wenn Bilder heute noch nicht hochladbar sind — sonst waere die
 * Pruefung spaeter still zu schwach.
 */
export async function fertigMeldenAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const db = getDb();
  const person = await personFuerSession(db);
  const heute = isoTag(new Date());

  const aufgabeId = feld(formData, "aufgabeId");
  const task = aufgabe(db, aufgabeId);
  if (!task) throw new Error(`Aufgabe "${aufgabeId}" nicht gefunden.`);

  const ergebnis = uebergang(task, "fertig", person, heute);
  if (!ergebnis.erlaubt) throw new Error(ergebnis.grund);
  if (ergebnis.wirkung !== "aendern") throw new Error("Unerwartetes Uebergangsergebnis.");

  const values = { aufgabeId, nachweisText: feld(formData, "nachweisText") };
  const nachweisText = values.nachweisText.trim();

  if (task.nachweisPflicht) {
    const vorhandene = nachweiseSeitLetzterZurueckweisung(db, task.id);
    if (task.nachweisArt === "bild") {
      const hatBild = vorhandene.some((n) => n.art === "bild");
      if (!hatBild) {
        return {
          ok: false,
          // Eigener Schluessel "nachweis" statt "nachweisText": diese Ablehnung handelt vom
          // FEHLENDEN BILD, nicht vom Inhalt des Textfelds — ein Formular mit ausgefuelltem Text
          // UND fehlendem Bild soll nicht so aussehen, als sei der Text das Problem.
          fieldErrors: { nachweis: "Fuer diese Aufgabe ist ein Bildnachweis erforderlich." },
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
    erstelleNachweis(db, { aufgabeId: task.id, text: nachweisText, erstelltVon: person.id });
  }

  aktualisiereAufgabe(db, task.id, { status: ergebnis.nach });
  schreibeVerlauf(db, {
    aufgabeId: task.id,
    ereignis: ergebnis.nach === "abgeschlossen" ? "abgeschlossen" : "fertig_gemeldet",
    akteurId: person.id,
  });
  revalidate();
  return { ok: true };
}

/**
 * FREIGEBEN — `freigabe_offen` → `abgeschlossen` (Spec §5.2), nur Pruefer oder `koordination`
 * (`uebergang()` prueft `darfFreigeben`). Kein Formularfeld ausser `aufgabeId`, deshalb kein
 * `FormState` — wie `zurueckziehenAction`.
 *
 * DIE VERTRETUNGSFREIGABE (Brief, Spec §6 `verlauf`): schreibt die Verlaufszeile ALS SOLCHE, wenn
 * `istVertretungsfreigabe(person, task)` wahr ist — "Freigegeben von X in Vertretung für Y". Das
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
  const person = await personFuerSession(db);
  const heute = isoTag(new Date());

  const aufgabeId = feld(formData, "aufgabeId");
  const task = aufgabe(db, aufgabeId);
  if (!task) throw new Error(`Aufgabe "${aufgabeId}" nicht gefunden.`);

  const ergebnis = uebergang(task, "freigeben", person, heute);
  if (!ergebnis.erlaubt) throw new Error(ergebnis.grund);
  if (ergebnis.wirkung !== "aendern") throw new Error("Unerwartetes Uebergangsergebnis.");

  let notiz: string | undefined;
  if (istVertretungsfreigabe(person, task) && task.prueferId !== null) {
    const pruefer = personNachId(db, task.prueferId);
    if (!pruefer) {
      throw new Error(`Pruefer "${task.prueferId}" nicht gefunden — Datenbankinkonsistenz.`);
    }
    notiz = `Freigegeben von ${person.name} in Vertretung für ${pruefer.name}`;
  }

  aktualisiereAufgabe(db, task.id, { status: ergebnis.nach });
  schreibeVerlauf(db, { aufgabeId: task.id, ereignis: "abgeschlossen", akteurId: person.id, notiz });
  revalidate();
}

/**
 * ZURUECKWEISEN — `freigabe_offen` → `zurueckgewiesen` (Spec §5.2), nur Pruefer oder `koordination`.
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
  const person = await personFuerSession(db);
  const heute = isoTag(new Date());

  const aufgabeId = feld(formData, "aufgabeId");
  const task = aufgabe(db, aufgabeId);
  if (!task) throw new Error(`Aufgabe "${aufgabeId}" nicht gefunden.`);

  const ergebnis = uebergang(task, "zurueckweisen", person, heute);
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
    akteurId: person.id,
    notiz: begruendung,
  });
  revalidate();
  return { ok: true };
}
