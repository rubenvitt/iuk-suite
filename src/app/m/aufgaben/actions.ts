"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "./_db/client";
import { aufgabe, aktualisiereAufgabe, bufdis, erstelleAufgabe, loescheAufgabe, schreibeVerlauf } from "./_db/queries";
import type { Ereignis } from "./_db/schema";
import {
  istGueltigeDauerMinuten,
  istGueltigeNachweisArt,
  istGueltigePrioritaet,
  istGueltigerIsoTag,
  istGueltigeUhrzeit,
} from "./_lib/eingabe";
import type { FormState } from "./_lib/formState";
import { anfangsZustand, uebergang, type Aktion } from "./_lib/lebenszyklus";
import { personFuerSession } from "./_lib/zugang";
import { isoTag } from "./_lib/datum";

/*
 * DIE VIER ACTIONS DIESER AUFGABE — `einstellen`, `verteilen`, `umverteilen`, `zurueckziehen`.
 * Aufgaben 10-12 ergaenzen weitere Actions IN DERSELBEN DATEI (Brief); die Naht dafuer sind die
 * Helfer unten (`revalidate`, `feld`, `istGesetzt`, `_lib/eingabe.ts`), die keine dieser vier
 * Actions exklusiv fuer sich beansprucht.
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

  const nachweisPflicht = istGesetzt(formData, "nachweisPflicht");

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
