/**
 * DIE DRUCK-CHECKLISTE EINES FAHRZEUGS — die Fahrzeugliste, wie eine Helferin
 * sie mit dem Kugelschreiber in der Hand abarbeitet. Kein "use client", kein
 * Icon-Import.
 *
 * ⚠️ DIESE DATEI ERFINDET KEINE FACHLICHKEIT. Sie beantwortet genau eine Frage
 * — „was steht auf dem Blatt?" — und beantwortet sie aus DENSELBEN
 * Lesepfaden, die `helfer/check/page.tsx` fuer den Bildschirm-Check benutzt:
 * `sollFuerFahrzeug`, `geraeteFuerLagerort`, `o2FlaschenFuerLagerort`. Das ist
 * die tragende Zusage des ganzen Vorhabens:
 * WER DAS PAPIER ABARBEITET UND WER DIE MASKE ABARBEITET, PRUEFT DIESELBE
 * LISTE. Eine eigene Abfrage hier — und sei sie nur ein zweites
 * `db.select().from(sollPositionen)` — waere die Doppelrechnung aus §5.8.3 in
 * neuer Kleidung, diesmal mit dem besonders undankbaren Ausgang, dass die
 * Abweichung erst auf ausgedrucktem Papier vor dem Fahrzeug auffaellt.
 *
 * ⚠️ DER VERFALL WIRD HIER BEWUSST NICHT GELESEN — `verfallFuerLagerort` ist
 * der vierte Lesepfad des Bildschirm-Checks und fehlt hier mit Absicht. Das
 * Blatt trug den zuletzt gemeldeten Monat einmal in der Verfall-Spalte vor;
 * die Gespraechsnotiz dazu lautet „Verfall vorausgefuellt weg bei Papier".
 * Ein vorgedruckter Monat wird am Fahrzeug abgehakt statt abgelesen, und genau
 * so ueberlebt eine laengst getauschte Packung jede Kontrolle. Die Spalte ist
 * deshalb ein Schreibfeld wie „Ist". Wer den Verfall „zur Vollstaendigkeit"
 * wieder mitnimmt, druckt ihn auch wieder vor — die Position hat dafuer
 * absichtlich kein Feld. Der Bildschirm-Check belegt weiter vor; das ist ein
 * anderer Anwendungsfall mit einem Eingabefeld, das man sieht.
 *
 * ⚠️ GRABSTEINE (`entfernt = true`) SIND KEIN SOLL. Die Regel steht im Kopf von
 * `./fahrzeuge.ts` und verlangt ausdruecklich, dass JEDE neue Ansicht sie
 * SELBST anwendet — `sollFuerFahrzeug` gibt Grabsteine mit zurueck, damit der
 * Editor sie wiederherstellen kann. Ein gedrucktes Blatt mit Grabsteinen
 * schickte jemanden los, um etwas zu suchen, das auf diesem Fahrzeug bewusst
 * nicht vorhanden ist.
 *
 * ⚠️ `Leser`, NICHT `DB` (Festlegung H11): keine dieser vier Quellen ruft
 * `quelleAufloeser`, also gibt es keinen Grund, den Pfad aus einer Transaktion
 * auszusperren.
 */
import { eq } from "drizzle-orm";
import { fahrzeugTemplates, lagerorte } from "../../_db/schema";
import { heuteIso } from "../zeit";
import type { Leser } from "./bestand";
import { sollFuerFahrzeug } from "./fahrzeuge";
import { geraeteFuerLagerort } from "./geraete";
import { o2FlaschenFuerLagerort } from "./o2";

/** ⚠️ KEIN VERFALL-FELD — Begruendung im Kopf dieser Datei. */
export type ChecklistePosition = {
  artikelId: string;
  artikelName: string;
  einheit: string;
  /** Fach im HANDLAGER — wo das Nachfuellgut liegt, nicht wo es hingehoert. */
  handlagerFach: string;
  soll: number;
};

export type ChecklisteFach = {
  label: string;
  positionen: ChecklistePosition[];
};

export type ChecklisteGeraet = {
  id: string;
  name: string;
  typ: "medizin" | "objekt";
  /** MTK-/Ablauftext aus `geraetFaelligChip`, oder `null` (Objekt ohne Datum). */
  fristText: string | null;
  fristAuffaellig: boolean;
};

export type ChecklisteFlasche = {
  id: string;
  name: string;
  nennfuelldruckBar: number;
  /** ⚠️ `null` = NIE gemessen. Nicht 0 bar — der Fehlalarm aus §5.12. */
  letzterDruck: number | null;
};

export type ChecklisteBlatt = {
  id: string;
  name: string;
  kennung: string | null;
  vorlage: string | null;
  faecher: ChecklisteFach[];
  geraete: ChecklisteGeraet[];
  flaschen: ChecklisteFlasche[];
  /** Summe ueber alle Faecher — die Kopfzeile nennt sie, damit ein halb
   *  gedrucktes Blatt als solches erkennbar ist. */
  positionen: number;
};

/**
 * Soll-Zeilen → Faecher, in der Reihenfolge, in der `sollFuerFahrzeug` sie
 * liefert (fachLabel, dann `sort`).
 *
 * ⚠️ EINE `Map`, KEIN `group by` mit anschliessendem Sortieren. Die Eingabe ist
 * BEREITS sortiert; eine Map bewahrt die Einfuegereihenfolge und uebernimmt
 * damit genau diese Ordnung. Wer hier nachsortiert, kann nur davon abweichen —
 * und die Fachreihenfolge auf dem Papier muss der Reihenfolge im
 * Bildschirm-Check entsprechen, sonst laeuft jemand mit dem Blatt in der Hand
 * am Fahrzeug in einer anderen Richtung durch als die Maske.
 *
 * Exportiert, weil sie die einzige Umformung dieser Datei ist, die eine eigene
 * Zusicherung tragen kann, ohne eine Datenbank zu brauchen.
 */
export function nachFaechern(
  positionen: (ChecklistePosition & { fachLabel: string })[],
): ChecklisteFach[] {
  const faecher = new Map<string, ChecklistePosition[]>();
  for (const { fachLabel, ...position } of positionen) {
    const vorhanden = faecher.get(fachLabel);
    if (vorhanden) vorhanden.push(position);
    else faecher.set(fachLabel, [position]);
  }
  return [...faecher].map(([label, eintraege]) => ({ label, positionen: eintraege }));
}

/**
 * Das Blatt eines Fahrzeugs, oder `null`, wenn die ID keins ist.
 *
 * ⚠️ `typ !== "fahrzeug"` GIBT `null`, NICHT das Handlager. Eine bekannte
 * Lager-ID ist noch kein Fahrzeug — dieselbe zweite Linie, die
 * `fahrzeugInhalt` mit `notFound()` zieht. Hier ist `null` richtig und
 * `notFound()` falsch, weil der Aufrufer MEHRERE Blaetter sammelt: eine
 * einzelne unbekannte `?fz=`-Angabe darf nicht die ganze Druckseite abraeumen.
 */
export function checklisteFuerFahrzeug(
  db: Leser,
  fahrzeugId: string,
  now: Date = new Date(),
): ChecklisteBlatt | null {
  const fahrzeug = db.select().from(lagerorte)
    .where(eq(lagerorte.id, fahrzeugId)).get();
  if (!fahrzeug || fahrzeug.typ !== "fahrzeug") return null;

  const positionen = sollFuerFahrzeug(db, fahrzeugId)
    // GRABSTEINE RAUS — die Regel aus `./fahrzeuge.ts`, hier selbst angewandt.
    .filter((position) => !position.entfernt)
    .map((position) => ({
      fachLabel: position.fachLabel,
      artikelId: position.artikelId,
      artikelName: position.artikelName,
      einheit: position.einheit,
      handlagerFach: position.handlagerFach,
      soll: position.soll,
    }));

  const vorlage = fahrzeug.templateId
    ? (db.select().from(fahrzeugTemplates)
        .where(eq(fahrzeugTemplates.id, fahrzeug.templateId)).get()?.name ?? null)
    : null;

  return {
    id: fahrzeug.id,
    name: fahrzeug.name,
    kennung: fahrzeug.kennung,
    vorlage,
    faecher: nachFaechern(positionen),
    geraete: geraeteFuerLagerort(db, fahrzeugId, now).map((geraet) => ({
      id: geraet.id,
      name: geraet.name,
      typ: geraet.typ,
      fristText: geraet.chip?.text ?? null,
      // "grau" heisst „kein Datum gepflegt" und ist KEIN Befund — nur rot und
      // gelb gehoeren auf dem Blatt hervorgehoben.
      fristAuffaellig: geraet.chip !== null
        && (geraet.chip.ton === "rot" || geraet.chip.ton === "gelb"),
    })),
    flaschen: o2FlaschenFuerLagerort(db, fahrzeugId).map((flasche) => ({
      id: flasche.id,
      name: flasche.name,
      nennfuelldruckBar: flasche.nennfuelldruckBar,
      // ⚠️ UNVERAENDERT WEITER, `null` EINGESCHLOSSEN. Ein `?? 0` stellte den
      // Fehlalarm aus §5.12 wieder her: „nie gemessen" laese sich als leere
      // Flasche, und jemand traegt eine volle Flasche aus dem Fahrzeug.
      letzterDruck: flasche.letzterDruck,
    })),
    positionen: positionen.length,
  };
}

/**
 * Die Blaetter fuer den Druckbogen.
 *
 * `ids === null` heisst „alle AKTIVEN Fahrzeuge" — der Regelfall „ich drucke
 * die Checklisten fuer den Samstag". Eine ausdrueckliche Liste dagegen nimmt
 * auch ein STILLGELEGTES Fahrzeug mit: wer den Weg von der Fahrzeugseite aus
 * geht, hat es dort vor sich und meint genau dieses eine. Unbekannte IDs fallen
 * still heraus (`checklisteFuerFahrzeug` gibt `null`), damit ein veralteter
 * Lesezeichen-Link die uebrigen Blaetter nicht mitnimmt.
 *
 * Sortiert wie ueberall im Modul: aktive zuerst, dann alphabetisch.
 */
export function checklistenDaten(
  db: Leser,
  ids: string[] | null,
  now: Date = new Date(),
): ChecklisteBlatt[] {
  const fahrzeuge = db.select().from(lagerorte)
    .where(eq(lagerorte.typ, "fahrzeug")).all()
    .filter((f) => (ids === null ? f.aktiv : ids.includes(f.id)))
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || a.name.localeCompare(b.name));

  return fahrzeuge
    .map((f) => checklisteFuerFahrzeug(db, f.id, now))
    .filter((blatt): blatt is ChecklisteBlatt => blatt !== null);
}

/**
 * `?fz=` → die Auswahl, mit der `checklistenDaten` etwas anfangen kann.
 *
 * ⚠️ SIE STEHT HIER UND NICHT ZWEIMAL IN DEN AUFRUFERN. Die Seite
 * (`(druck)/checklisten/page.tsx`) und der PDF-Handler
 * (`(druck)/checklisten/pdf/route.ts`) muessen dieselbe Auswahl treffen —
 * sonst zeigte das Blatt zwei Fahrzeuge und die Datei daneben drei, und der
 * Unterschied faellt erst auf, wenn jemand vor der Flotte steht.
 *
 * ⚠️ LEERE WERTE FALLEN HERAUS, und ein `?fz=` ohne Wert ist damit dasselbe wie
 * gar kein Parameter. Ohne diese Zeile suchte `checklistenDaten` nach einem
 * Fahrzeug mit der ID `""`, faende keins und lieferte einen leeren Bogen — eine
 * leere Seite, die wie ein Datenverlust aussieht und keiner ist.
 */
export function gewaehlteFahrzeuge(fz: string | string[] | undefined): string[] {
  return (fz === undefined ? [] : Array.isArray(fz) ? fz : [fz])
    .map((wert) => wert.trim())
    .filter((wert) => wert !== "");
}

/**
 * "TT.MM.JJJJ" in der Modulzone — der Stand-Vermerk auf dem Blatt.
 *
 * ⚠️ UEBER `heuteIso()`, NICHT UEBER `getDate()`/`getMonth()`. Die Regel steht
 * im Kopf von `_lib/zeit.ts` und gilt fuer das ganze Modul: ausserhalb jener
 * Datei wird auf einem angezeigten Datum kein Datumsfeld einzeln gelesen. Hier
 * wird deshalb eine ZEICHENKETTE umgestellt, kein Datum zerlegt — der Ausdruck
 * bleibt damit auch dann in Europe/Berlin, wenn der Container in UTC laeuft.
 */
export function standDatum(now: Date = new Date()): string {
  const [jahr, monat, tag] = heuteIso(now).split("-");
  return `${tag}.${monat}.${jahr}`;
}
