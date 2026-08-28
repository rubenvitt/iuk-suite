"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, getTableColumns, ne, sql } from "drizzle-orm";
import { getDb } from "../_db/client";
import type { DB } from "../_db/client";
import { bucheRueckgabe, offeneLeiheZuGeraet } from "../_db/leihen";
import { deviceEvents, devices, softwareVersions } from "../_db/schema";
import type { Geraet } from "../_db/schema";
import { klassifiziereZeilen, zeileZuEingehend } from "../_lib/csv/klassifizieren";
import { IMPORTIERBARE_FELDER } from "../_lib/csv/kopfzeilen";
import type {
  KlassifizierteZeile,
  Spaltenzuordnung,
  Zusammenfassung,
} from "../_lib/csv/klassifizieren";
import { diffGeraet } from "../_lib/geraeteDiff";
import type { FeldDiff } from "../_lib/geraeteDiff";
import { haengeNotizAn } from "../_lib/notiz";
import { filterSchreibbareFelder } from "../_lib/rollen";
import type { RadioRolle } from "../_lib/rollen";
import { requireRadioAdmin, requireRadioVerwaltung } from "../_lib/zugang";

/**
 * DIE NEUN SERVER ACTIONS DER VERWALTUNG (Spec 1 §5.8,
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:4647-4666`).
 *
 * ⛔ `"use server";` STEHT IN ZEILE 1, OHNE PFADKOMMENTAR DAVOR — dieselbe Hausform wie
 * `_actions/ausleihe.ts:1` und aus demselben gemessenen Grund: der Scan liest
 * `trimStart().split("\n")[0]` (`_actions/guards.test.ts:713-717`), und der Waechter dieser
 * Datei (`admin/actions.test.ts`, Aufgabe V11) prueft dieselbe Zeile.
 *
 * ⛔ NEUN, NICHT ZEHN. `importVorschauAction` aus `Spec:4663` ist nach Entscheidung **E-V16**
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:994-1045`) ein Route Handler
 * (`admin/(arbeit)/import/hochladen/route.ts`, Aufgabe V18) und entsteht NICHT hier: er nimmt
 * eine hochgeladene Datei und traegt die nicht-werfende Riegelform (404, nie 403).
 *
 * ⛔ JEDE ACTION RUFT IHREN RIEGEL SELBST, ALS ERSTE ANWEISUNG. Es gibt kein Layout ueber
 * einer Action (`Spec:4382-4386`): „Die Zeile in jeder Action ist ebenfalls keine Redundanz —
 * wer sie fuer doppelt haelt und entfernt, oeffnet die Luecke, gegen die der Riegel gebaut
 * ist." SIEBEN auf `requireRadioAdmin`, ZWEI auf `requireRadioVerwaltung`
 * (`geraetAendernAction`, `notizAnfuegenAction`) — `Spec:4655-4664`, um `importVorschau`
 * gekuerzt.
 *
 * ⛔ AUFLAGE AN DEN WAECHTER IN V11 (Review V10 Fund F14): DER BEZEICHNER
 * `requireRadioAdmin` STEHT ZEHNMAL IN DIESER DATEI (gemessen mit rohem `/usr/bin/grep -c`)
 * — siebenmal als Aufruf, einmal in der Importzeile und zweimal in den Kopfkommentaren. Ein
 * naiver Vorkommenszaehler ergibt also **10** und nicht **7**, und eine falsche Zahl in einem
 * `toBe` ist rot-by-construction oder wird
 * auf den falschen Wert „repariert" — genau die NT11-Klasse. Der Scan muss auf
 * `await require…(` NACH der Kommentarbereinigung zaehlen, nicht auf den blossen Bezeichner.
 *
 * ⚠️ DIESE DATEI HAT IHREN QUELLTEXT-WAECHTER NOCH NICHT. ⛔ IHR UNMITTELBARER NACHFOLGER IST
 * **AUFGABE V11** (`admin/actions.test.ts`), und die Reihenfolge ist Absicht: der Scan braucht
 * diese Datei, um nicht leer-gruen zu sein, und er darf nicht im selben Diff entstehen wie
 * das, was er bewachen soll — sonst haette ihn niemand je rot gesehen
 * (`.superpowers/sdd/planteil4/briefs/V10.md:17-21`).
 *
 * ⛔ `revalidatePath` BEKOMMT IMMER DIE INNERE FORM `/m/radio/...` (`Spec:4212-4216`) —
 * es adressiert Nexts Zwischenspeicher, nicht die Adresszeile. `redirect()` dagegen geht an
 * den BROWSER und traegt den AEUSSEREN Pfad; die zwei Pfadraeume stehen in
 * `_actions/ausleihe.ts:64-77` ausgeschrieben. ⛔ Wer sie vertauscht, bekommt KEINEN Fehler.
 *
 * ⛔ SCHREIBWEGE GIBT ES IN DIESEM MODUL NUR HIER. Die Suite hat kein Gegenstueck zu
 * `deviceRepo`/`softwareVersionRepo`; die vier privaten Helfer unten (`schreibeEreignisse`,
 * `registriereVersion`, `naechsteReihenfolge`, `istUniqueVerletzung`) sind ihre 1:1-Uebernahme
 * und verlassen diese Datei nicht — eine `"use server"`-Datei darf ohnehin nur asynchrone
 * Funktionen exportieren.
 */

/**
 * DIE RUECKGABEFORM ALLER NEUN (`Spec:4650-4651`): `{ ok: true } | { ok: false; fehler: string }`.
 *
 * ⛔ RUECKGABEWERT STATT WURF FUER JEDE FACHLICHE ABLEHNUNG (`Spec:3458-3459`, `:5229-5232`,
 * dieselbe Wahl wie `_db/leihen.ts:532-534`): ein `throw` aus einer Server Action kommt in
 * Produktion als anonymisierte Meldung an und verliert genau die Auskunft, die der Mensch
 * braucht.
 *
 * Der Typparameter traegt die Nutzlast des Erfolgsfalls. ⚠️ SEIN VORGABEWERT IST `unknown` UND
 * NICHT `Record<string, never>`: jenes ist ein Indexsignatur-Typ, und `{ ok: true }` ist ihm
 * nicht zuweisbar („Property 'ok' is incompatible with index signature", gemessen). `unknown`
 * faellt in der Schnittmenge weg, und `Ergebnis` ohne Argument ist damit zeichengleich das,
 * was `Spec:4650-4651` schreibt.
 */
export type Ergebnis<T = unknown> = ({ ok: true } & T) | { ok: false; fehler: string };

/**
 * Die Felder, die ein Formular an einem Geraet setzen darf — ABGELEITET aus dem Schema, nicht
 * abgeschrieben: alles ausser dem Schluessel und den vier Auditspalten (`_db/schema.ts:19-65`).
 *
 * ⛔ EINE ZWEITE, HANDGEPFLEGTE LISTE WAERE DIE STELLE, AN DER EINE NEUE SPALTE STILL
 * UNSCHREIBBAR BLEIBT. Der Alt-Bestand fuehrt sie als zod-Schema mit `issi` als einzigem
 * Pflichtfeld und **19** weiteren `nullable().optional()`
 * (`radio-admin/shared/src/schemas.ts:50-99`); ⛔ KEINE serverseitige Maximallaenge auf
 * irgendeinem Textfeld, und `status` ist schemaseitig NICHT auf die fuenf Optionen begrenzt.
 */
type SchreibbaresGeraetFeld = Exclude<
  keyof Geraet,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>;

/** Der Patch des Aendern-Wegs: jedes schreibbare Feld optional, `issi` eingeschlossen. */
export type GeraetPatch = Partial<Pick<Geraet, SchreibbaresGeraetFeld>>;

/** Die Eingabe des Anlege-Wegs: derselbe Satz, aber `issi` ist Pflicht (`DeviceFields.tsx:64`). */
export type GeraetEingabe = GeraetPatch & { issi: string };

/**
 * Die Bilanz eines geschriebenen Imports.
 *
 * ⛔ ABGELEITET AUS DER GEMESSENEN ALT-RUECKGABE, NICHT ERFUNDEN: `applyCommit` gibt
 * `{ summary, rows }` zurueck (`radio-admin/server/src/import/apply-commit.ts:29`, `:74`), und
 * der Endpunkt reicht genau die zwei weiter (`radio-admin/server/src/routes/import.ts:64`).
 * Die Spec nennt den Namen `ImportBilanz` (`Spec:4664`) und schreibt seine Form nirgends aus.
 */
export type ImportBilanz = { zusammenfassung: Zusammenfassung; zeilen: KlassifizierteZeile[] };

/*
 * ⛔ DIE MELDUNGSTEXTE STEHEN HIER, ALS BENANNTE LISTE, UND NICHT INLINE (1:1-Tafel Abschnitt E,
 * `.superpowers/sdd/planteil4/briefs/KOPF.md:1320-1348`; `Spec:4815-4832`) — sonst ist die
 * naechste Formulierungsaenderung eine Suche ueber neun Dateien.
 *
 * ⛔ SIE TRAGEN IHRE UMLAUTE: es sind Bildschirmtexte, keine Bezeichner.
 *
 * ⛔ JEDER SATZ IST GEMESSEN, KEINER IST NEU FORMULIERT. Der Alt-Bestand bildet die
 * HTTP-Antwort auf genau diese Saetze ab; ein 404 (`not_found`) faellt dort in den
 * ALLGEMEINEN Zweig — deshalb tragen „Geraet fehlt" und „Schreiben fehlgeschlagen" hier
 * denselben Text, statt einen dritten zu erfinden.
 */
const ANLEGEN_FEHLER = "Anlegen fehlgeschlagen"; // DeviceFormModal.tsx:80
const ISSI_VERGEBEN = "ISSI bereits vergeben"; // DeviceEditForm.tsx:98, DeviceFormModal.tsx:78
const SPEICHERN_FEHLER = "Speichern fehlgeschlagen"; // DeviceEditForm.tsx:100
const LOESCHEN_FEHLER = "Löschen fehlgeschlagen"; // DeviceDetailDrawer.tsx:57
const ANMERKUNG_FEHLER = "Anmerkung fehlgeschlagen"; // UpdateNotePanel.tsx:23
const VERSION_VORHANDEN = "Diese Version existiert bereits"; // SoftwareVersionsPage.tsx:37
const VERSION_ANLEGEN_FEHLER = "Version konnte nicht angelegt werden"; // SoftwareVersionsPage.tsx:38
const ZIEL_FEHLER = "Zielversion konnte nicht gesetzt werden"; // SoftwareVersionsPage.tsx:48
const VERSION_LOESCHEN_FEHLER = "Version konnte nicht gelöscht werden"; // SoftwareVersionsPage.tsx:61
const REIHENFOLGE_FEHLER = "Reihenfolge konnte nicht gespeichert werden"; // SoftwareVersionsPage.tsx:80
const ISSI_SPALTE_FEHLT = "ISSI-Spalte muss zugeordnet sein"; // ImportWizard.tsx:109
const IMPORT_FEHLER = "Import fehlgeschlagen"; // ImportWizard.tsx:131

/**
 * ⛔ WOERTLICH, MIT DER ZAHL DAZWISCHEN — `SoftwareVersionsPage.tsx:60`. Die Klammerform
 * „Gerät(en)" ist der Alt-Text und wird NICHT zu einem Plural aufgeloest.
 */
function versionInBenutzung(anzahl: number): string {
  return `Version wird noch von ${anzahl} Gerät(en) genutzt`;
}

/**
 * ⛔ DIESER TEXT IST NEU, UND ER IST DER EINZIGE. Er traegt Punkt 3 der Betreiberentscheidung
 * ⬜ V-L6 (`.superpowers/sdd/planteil4/progress.md`, Abschnitt „✅ V-L6"): „Die Buchung ist in
 * der Historie als solche erkennbar — sie darf nicht wie eine normale Rueckgabe aussehen. Wie
 * das festgehalten wird … entscheidet der Bau am Bestand: es muss ein Feld geben, das es
 * traegt … Erfinde keine Spalte."
 *
 * ⛔ DAS FELD IST `loans.return_note` (`_db/schema.ts:220`), UND ES IST DAS EINZIGE, DAS ES
 * TRAGEN KANN: `loans` fuehrt kein Grund- oder Herkunftsfeld fuer eine Rueckgabe, und
 * `zugangscode_id` traegt die Herkunft des ZUGANGS, nicht der Rueckgabe (`_db/schema.ts:221-230`).
 * Eine neue Spalte ist ausgeschlossen — Migrationen sind append-only, und dieser Planteil legt
 * keine an (Bauform-Zulaessigkeitstafel Zeile 20).
 *
 * ⚠️ EINE EREIGNISZEILE KANN ES NICHT TRAGEN: `device_events` haengt am Geraet mit
 * `onDelete: "cascade"` (`_db/schema.ts:127-129`) und verschwindet im selben Vorgang.
 */
const RUECKGABE_BEIM_LOESCHEN = "Automatisch zurückgegeben: Gerät gelöscht";

/*
 * ⛔ DIE DREI `revalidatePath`-LISTEN, ABGELEITET AUS DEM `invalidateQueries`-FAECHER DES
 * BESTANDS (1:1-Tafel Abschnitt D, `KOPF.md:1300-1318`; `Spec:4612-4615`). Dass
 * `useCreateDevice.ts:11-13` DREI Schluessel invalidiert, ist die gemessene Aussage „ein neues
 * Geraet veraendert Liste, Vorschlaege und Versionsliste" — sie steht hier als drei Aufrufe da,
 * nicht als einer.
 *
 * ⛔ INNERE FORM, IMMER. Fund F3 der Planteil-3-Schlusspruefung war genau dieser Fehler.
 */
const UEBERSICHT = "/m/radio/admin";
const GERAETELISTE = "/m/radio/admin/geraete";
const VERSIONSLISTE = "/m/radio/admin/versionen";
const AUSLEIHENLISTE = "/m/radio/admin/ausleihen";
/**
 * ⛔ DER UPDATE-MODUS — NACHGETRAGEN IN FIX-RUNDE 1 ZU V17 (REVIEW-V17, Fund F1).
 *
 * ⚠️ Die 1:1-Tafel Abschnitt D (`.superpowers/sdd/planteil4/briefs/KOPF.md:1300-1318` — der
 * Planteil gehoert in den Pfad, R-V3-1 Auflage 3) fuehrt ihn NICHT: sie entstand, bevor
 * `/admin/software` unter Regime B eine geraetefuehrende Flaeche wurde (E-V17,
 * `.superpowers/sdd/planteil4/VORABSCAN.md:158-196`). ⛔ Das ist keine Erweiterung der Tafel,
 * sondern ihre Ableitungsregel zu Ende gefuehrt: die Tafel bildet den `invalidateQueries`-
 * Faecher des Bestands ab, `useUpdateDevice.ts:39` und `useUpdateNote.ts:16` invalidieren
 * `['devices']`, und der Listenschluessel des Update-Modus ist `['devices', params]`
 * (`useDevices.ts:62`) — die Karte lud im Bestand nach.
 *
 * ⛔ ER STEHT AN GENAU ZWEI STELLEN: `geraetAendernAction` und `notizAnfuegenAction` — die zwei
 * Wege eines Taps (`admin/(arbeit)/software/UpdateSuche.tsx`, `anwenden`/`anhaengen`). ⬜
 * **BENANNTE LEERSTELLE, EIGENTUEMER PLANHALTER:** die SIEBEN uebrigen Actions entwerten sie
 * nicht, obwohl der Alt-Faecher aus jeder `['devices']` invalidiert — `geraetAnlegenAction`
 * (`useCreateDevice.ts:11`), `geraetLoeschenAction` (`useDeleteDevice.ts:15`), die vier
 * Versions-Actions (`useSoftwareVersions.ts:32`) und `importSchreibenAction` (⛔ am Aufrufer,
 * nicht im Haken: `ImportWizard.tsx:128`). Ob die Tafel nachzieht, ist die Planentscheidung.
 */
const SOFTWARE = "/m/radio/admin/software";

/**
 * ⛔ DER AEUSSERE PFAD DER GERAETELISTE — er geht an den Browser, nicht an den Zwischenspeicher.
 *
 * ⚠️ BENANNTE ABWEICHUNG von `Spec:4605` und `KOPF.md:1315`, die hier `redirect("/m/radio/admin/geraete")`
 * schreiben. Der innere Pfad WUERDE rendern (`src/core/routing.ts:68-77` laesst `/m/<key>/…`
 * durch), und genau deshalb ist der Fehler still: die Adresszeile behielte `/m/radio/...`, und
 * jeder relative Weg danach loeste sich dagegen auf. Die Hausregel steht ausgeschrieben in
 * `_actions/ausleihe.ts:64-77` und `_actions/gate.ts:146` („AEUSSERER Pfad"); `_lib/nav.ts:9-10`
 * fuehrt dieselbe Trennung fuer jeden `href` und laesst sie von `_lib/nav.test.ts` pruefen.
 */
const GERAETELISTE_AUSSEN = "/admin/geraete";

/**
 * ⛔ DIE DREI PRIVATEN SCHREIBHELFER LAUFEN SOWOHL AUF DER VERBINDUNG ALS AUCH INNERHALB EINER
 * TRANSAKTION, und drizzle fuehrt dafuer ZWEI VERSCHIEDENE TYPEN. Der Typ wird deshalb aus der
 * Signatur von `transaction` ABGELEITET statt abgeschrieben — eine handgeschriebene zweite
 * Fassung liefe beim naechsten drizzle-Wechsel auseinander, und der billige Ausweg waere ein
 * `as unknown as`, das jede echte Typaenderung verschluckt.
 */
type SchreibDB = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];

/**
 * ⛔ DIE SERVEREIGENEN SPALTEN, DIE KEINE EINGABE SETZEN DARF — die Laufzeitfassung von
 * `SchreibbaresGeraetFeld` oben, und der 1:1-Ersatz fuer zods `.strip()`
 * (`radio-admin/shared/src/schemas.ts:49`, woertlich: „server-owned fields
 * (id/createdAt/updatedAt/...) are NOT accepted (strip unknown keys)", durchgesetzt in `:73`
 * und `:99`).
 *
 * ⛔ DIE TYPSIGNATUR ALLEIN TRAEGT DAS NICHT. Eine Server Action bekommt ihre Argumente ueber
 * die Leitung; `GeraetPatch` ist beim Aufruf eine Zusage des Aufrufers, keine Pruefung. Ein
 * mitgeschicktes `id` waere in drizzles `.set(...)`/`.values(...)` eine echte Spalte — der
 * Primaerschluessel liesse sich umschreiben, `createdAt`/`createdBy` faelschen. ⚠️ Der
 * Rollenfilter faengt das NICHT: fuer die Admin-Stufe ist er eine flache Kopie
 * (`_lib/rollen.ts:105`).
 *
 * ⛔ DIE LISTE WIRD AUS DER TABELLE ABGELEITET, NICHT ABGESCHRIEBEN (`getTableColumns`): eine
 * handgepflegte zweite Fassung waere die Stelle, an der eine neue Spalte still unschreibbar
 * bleibt — oder, schlimmer, still schreibbar wird.
 */
const SERVEREIGENE_FELDER = new Set(["id", "createdAt", "updatedAt", "createdBy", "updatedBy"]);
const SCHREIBBARE_FELDER = new Set(
  Object.keys(getTableColumns(devices)).filter((feld) => !SERVEREIGENE_FELDER.has(feld)),
);

/** Schneidet aus einer eingehenden Nutzlast alles heraus, was keine schreibbare Spalte ist. */
function nurSchreibbareFelder<T extends Record<string, unknown>>(eingabe: T): Partial<T> {
  const ergebnis: Partial<T> = {};
  for (const feld of Object.keys(eingabe)) {
    if (SCHREIBBARE_FELDER.has(feld)) {
      (ergebnis as Record<string, unknown>)[feld] = eingabe[feld];
    }
  }
  return ergebnis;
}

/**
 * ⛔ DIE ART JEDER SCHREIBBAREN SPALTE, ABGELEITET AUS DER TABELLE — der 1:1-Ersatz fuer die
 * TYPPRAEDIKATE der zod-Schemata des Bestands (`radio-admin/shared/src/schemas.ts:50-99`:
 * `z.string()`, `z.boolean()`, jeweils `.nullable().optional()`).
 *
 * ⛔ WARUM DAS NICHT DIE TYPSIGNATUR ERLEDIGT — derselbe Grund wie bei `SCHREIBBARE_FELDER`
 * oben: eine Server Action bekommt ihre Argumente ueber die Leitung, `GeraetPatch` ist beim
 * Aufruf eine Zusage des Aufrufers, keine Pruefung. ⛔ UND DIE FOLGE IST EINE
 * BEDEUTUNGSUMKEHR, KEIN SCHOENHEITSFEHLER (gemessen, Review V10 Fund F2): better-sqlite3
 * bindet fuer eine `mode: "boolean"`-Spalte (`_db/schema.ts:50`, `:55`) jeden
 * wahrheitswertigen Wert — aus dem Text „nein" wird `true`. Eine Zahl in einer Textspalte
 * kommt als `"42.0"` an.
 *
 * ⚠️ DIE ARTEN KOMMEN AUS DRIZZLES `dataType`, NICHT AUS EINER ZWEITEN ABSCHRIFT (gemessen:
 * `string` fuer jede Textspalte, `boolean` fuer `alamosIntegrated`/`loanable`, `date` fuer
 * `createdAt`/`updatedAt`). Eine handgepflegte Liste waere die Stelle, an der eine neue
 * Spalte still ungeprueft bleibt.
 */
const FELD_ART = new Map<string, string>(
  Object.entries(getTableColumns(devices)).map(([feld, spalte]) => [feld, spalte.dataType]),
);

/**
 * ⛔ WAHR, SOBALD EIN UEBERGEBENER WERT NICHT DIE ART SEINER SPALTE HAT. `null` und
 * `undefined` kommen durch: jede schreibbare Spalte ist nullbar, und `undefined` heisst
 * „nicht mitgeschickt" (`schemas.ts:50-99`, durchgehend `.nullable().optional()`).
 *
 * ⛔ DER AUFRUFER LEHNT DIE GANZE ANFRAGE AB UND SCHNEIDET DAS FELD NICHT STILL WEG — so
 * antwortet der Bestand (400 `invalid`, `radio-admin/server/src/routes/devices.ts:102`). Ein
 * stilles Wegschneiden waere eine NEUE Bedeutung: der Bedienende bekaeme „gespeichert" fuer
 * etwas, das nicht gespeichert wurde.
 *
 * ⚠️ EINE ART, DIE HIER NICHT AUFGEFUEHRT IST, WIRD NICHT GEPRUEFT — `devices` fuehrt heute
 * gemessen nur `string`, `boolean` und `date`, und die drei stehen alle da. Der Satz steht
 * hier, damit niemand die Luecke fuer eine Zusage haelt: wer eine `number`-Spalte einfuehrt,
 * bekommt von dieser Funktion kein Signal.
 *
 * ⚠️ DER `date`-ZWEIG IST HEUTE STRUKTURELL UNERREICHT UND DESHALB UNBEWACHT: die einzigen
 * `date`-Spalten von `devices` sind `createdAt` und `updatedAt`, und die schneidet
 * `nurSchreibbareFelder` VOR jedem Aufruf dieser Funktion weg (`SERVEREIGENE_FELDER`). Er
 * steht trotzdem da, weil er die Zeile ist, die fehlte, sobald eine schreibbare Datumsspalte
 * entstuende — und ein Fall, der ihn heute faerbt, koennte nur an dieser Funktion
 * vorbeigebaut werden. ⛔ BENANNT STATT SCHEINBEWACHT.
 */
function artFalsch(eingabe: Record<string, unknown>): boolean {
  for (const [feld, wert] of Object.entries(eingabe)) {
    if (wert === null || wert === undefined) continue;
    const art = FELD_ART.get(feld);
    if (art === "string" && typeof wert !== "string") return true;
    if (art === "boolean" && typeof wert !== "boolean") return true;
    if (art === "date" && !(wert instanceof Date)) return true;
  }
  return false;
}

/**
 * ⛔ DIE ISSI IST DAS EINZIGE PFLICHTFELD, UND SIE DARF NICHT LEER SEIN —
 * `z.string().min(1)` im Anlegeschema (`radio-admin/shared/src/schemas.ts:52`) und
 * `z.string().min(1).optional()` im Patchschema (`:78`). ⛔ NICHT GETRIMMT, anders als beim
 * Anmerkungstext (`:103`): der Bestand misst hier die ROHE Laenge, und ein `" "` kommt dort
 * durch. Diese Funktion misst dasselbe.
 *
 * ⛔ `notNull()` IN DER SPALTE ERSETZT DAS NICHT (`_db/schema.ts:22`): SQLite nimmt die leere
 * Zeichenkette an. Die erste leere ISSI ginge durch, die zweite kollidierte auf dem
 * Unique-Index — und die Meldung spraeche von einer vergebenen ISSI, also von einem ganz
 * anderen Problem. Die Regel steht im Alt-Formular ebenfalls („ISSI ist erforderlich",
 * `DeviceFields.tsx:64`); „eine Regel, die nur im Client steht, ist keine Regel"
 * (Spec:3583-3585).
 */
function issiUnbrauchbar(issi: unknown): boolean {
  return typeof issi !== "string" || issi.length === 0;
}

/**
 * better-sqlite3 meldet eine Unique-Verletzung mit diesem Code — 1:1 aus
 * `_db/leihen.ts:502-507`, dieselbe Doppelpruefung auf `cause`.
 *
 * ⛔ AUF `devices` HEISST ER EINDEUTIG „DIE ISSI IST SCHON VERGEBEN": `issi` traegt den einzigen
 * `unique()` dieser Tabelle (`_db/schema.ts:22`), `tei` ausdruecklich nicht (`:23-27`), und die
 * Primaerschluesselverletzung meldet `SQLITE_CONSTRAINT_PRIMARYKEY`.
 *
 * ⚠️ DER `cause`-ZWEIG IST AUF DIESEM WEG HEUTE UNERREICHT UND DESHALB UNBEWACHT (Review V10
 * Fund F11, Sonde P38: `return false;` → 0 rot). Er steht trotzdem da, weil er 1:1 aus
 * `_db/leihen.ts:502-507` kommt, wo eigene Faelle ihn tragen — und weil drizzle eine
 * geworfene Ausnahme umhuellen kann, sobald ein Aufrufer sie durch eine weitere Schicht
 * reicht. ⛔ EIN KUENSTLICH UMHUELLTER FEHLER WAERE EIN FALL UEBER DEN TEST, NICHT UEBER DEN
 * BESTAND; die Zeile bleibt benannt statt scheinbewacht.
 */
function istUniqueVerletzung(fehler: unknown): boolean {
  if (!(fehler instanceof Error)) return false;
  if ((fehler as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") return true;
  const ursache = (fehler as { cause?: unknown }).cause;
  return ursache instanceof Error && (ursache as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE";
}

/**
 * EINE EREIGNISZEILE JE FELD, UND EIN EINZIGER `changedAt` FUER ALLE — 1:1 aus `writeEvents`
 * (`radio-admin/server/src/repos/deviceRepo.ts:222-245`).
 *
 * ⛔ DIE ZWEI EIGENSCHAFTEN SIND JE EINE ZUSAGE. Ein `new Date()` je Zeile liesse die Zeilen
 * einer Aenderung ueber eine Sekunden- oder Mitternachtsgrenze auseinanderfallen, und die
 * Ereignisliste sortiert nach `changedAt` (`_lib/lesepfade/ereignisse.ts`) — die Felder einer
 * Aenderung stuenden dann nicht mehr beieinander.
 *
 * ⛔ LEERE LISTE = KEIN SCHREIBVORGANG (`deviceRepo.ts:229`: `if (diffs.length === 0) return;`).
 */
function schreibeEreignisse(
  db: SchreibDB,
  geraeteId: string,
  diffs: FeldDiff[],
  wer: string,
  quelle: "manual" | "csv-import" | "create" | "update-note",
): void {
  if (diffs.length === 0) return;
  const geaendertAm = new Date();
  db.insert(deviceEvents)
    .values(
      diffs.map((d) => ({
        deviceId: geraeteId,
        field: d.feld,
        oldValue: d.alt,
        newValue: d.neu,
        changedBy: wer,
        changedAt: geaendertAm,
        source: quelle,
      })),
    )
    .run();
}

/**
 * Die naechste Anzeigereihenfolge: eins ueber dem heutigen Maximum — 1:1 aus `nextSortOrder`
 * (`radio-admin/server/src/repos/softwareVersionRepo.ts:19-25`). Eine neu gesehene Version
 * landet oben in der Liste, ⛔ wird davon aber NIE zum Ziel (`_db/schema.ts:80-82`).
 */
function naechsteReihenfolge(db: SchreibDB): number {
  const zeile = db
    .select({ max: sql<number | null>`MAX(${softwareVersions.sortOrder})` })
    .from(softwareVersions)
    .get();
  return (zeile?.max ?? 0) + 1;
}

/**
 * Registriert eine Softwareversion, falls es sie noch nicht gibt — 1:1 aus
 * `insertSoftwareVersionIfNew` (`softwareVersionRepo.ts:32-42`), samt `onConflictDoNothing`.
 *
 * ⛔ SIE LAEUFT IN DERSELBEN TRANSAKTION WIE DER GERAETESCHREIBVORGANG (`devices.ts:112-119`,
 * `:146-153`): rollt die Geraetezeile zurueck, darf die Version nicht stehenbleiben.
 */
function registriereVersion(db: SchreibDB, wert: string, wer: string): void {
  db.insert(softwareVersions)
    .values({
      value: wert,
      createdAt: new Date(),
      createdBy: wer,
      sortOrder: naechsteReihenfolge(db),
    })
    .onConflictDoNothing({ target: softwareVersions.value })
    .run();
}

/**
 * Der Autorname fuer die Update-Anmerkung, mit demselben BENANNTEN RUECKFALL wie `merkeNutzer`
 * (`_lib/zugang.ts:427-430`): ein leerer oder aus Leerraum bestehender Name ist kein Name, und
 * der Ersatz ist der ROHE `sub` — genau der Wert, den der Bestand auf der Leseseite einsetzt,
 * „so the field is never blank" (`radio-admin/server/src/routes/devices.ts:70-78`).
 * ⚠️ Der Bestand reicht hier `user.name` durch (`devices.ts:175-176`); dessen Typ ist dort
 * nicht nullbar, `RadioViewer.name` ist es (`_lib/zugang.ts:61`).
 */
function autorName(viewer: { sub: string; name: string | null }): string {
  return viewer.name?.trim() ? viewer.name : viewer.sub;
}

/**
 * ANLEGEN — 1:1 aus `POST /devices` (`radio-admin/server/src/routes/devices.ts:99-122`).
 *
 * ⛔ EINE `create`-EREIGNISZEILE JE NICHT-NULL UEBERGEBENEM FELD, `oldValue: null`
 * (`devices.ts:106-108`, `:117`). ⚠️ Das ist NICHT derselbe Weg wie beim Import, der dafuer
 * gegen ein synthetisches Leergeraet difft (`_lib/csv/klassifizieren.ts:220-248`) — beide
 * Wege ergeben dieselbe Menge, aber nur dieser hier ist der gemessene Anlegeweg.
 *
 * ⛔ EINE TRANSAKTION: Versionsregistrierung, Einfuegen und Ereignisse gelingen oder rollen
 * gemeinsam zurueck — woertlich `devices.ts:110-111`: „a duplicate-ISSI throw rolls back the
 * whole write".
 */
export async function geraetAnlegenAction(werte: GeraetEingabe): Promise<Ergebnis<{ id: string }>> {
  const viewer = await requireRadioAdmin();

  if (issiUnbrauchbar(werte.issi)) return { ok: false, fehler: ANLEGEN_FEHLER };
  const sauber = { ...nurSchreibbareFelder(werte), issi: werte.issi };
  // ⛔ DIE TYPPRAEDIKATE DES ANLEGESCHEMAS (`schemas.ts:50-73`), siehe `artFalsch`. Sie
  // stehen NACH dem Feldschnitt: was `.strip()` ohnehin entfernt, braucht keine Artpruefung.
  if (artFalsch(sauber)) return { ok: false, fehler: ANLEGEN_FEHLER };

  const db = getDb();
  const jetzt = new Date();
  const diffs: FeldDiff[] = Object.entries(sauber)
    .filter(([, wert]) => wert !== null && wert !== undefined)
    .map(([feld, wert]) => ({ feld, alt: null, neu: String(wert) }));

  let id: string;
  try {
    id = db.transaction((tx) => {
      if (sauber.softwareVersion) registriereVersion(tx, sauber.softwareVersion, viewer.sub);
      const zeile = tx
        .insert(devices)
        .values({
          ...sauber,
          createdAt: jetzt,
          updatedAt: jetzt,
          createdBy: viewer.sub,
          updatedBy: viewer.sub,
        })
        .returning({ id: devices.id })
        .get();
      schreibeEreignisse(tx, zeile.id, diffs, viewer.sub, "create");
      return zeile.id;
    });
  } catch (fehler) {
    return { ok: false, fehler: istUniqueVerletzung(fehler) ? ISSI_VERGEBEN : ANLEGEN_FEHLER };
  }

  revalidatePath(GERAETELISTE);
  revalidatePath(UEBERSICHT);
  revalidatePath(VERSIONSLISTE);
  return { ok: true, id };
}

/**
 * AENDERN — 1:1 aus `PATCH /devices/:id` (`devices.ts:126-157`), und ⛔ DIE REIHENFOLGE IST DER
 * GANZE PUNKT (`Spec:4586-4592`):
 *
 * 1. Geraet lesen; fehlt es, ist Schluss (`devices.ts:128-129`).
 * 2. ⛔ ROLLE-FILTER VOR DEM DIFF (`devices.ts:136-137`). Umgekehrt entstuenden Ereigniszeilen
 *    fuer Felder, die gar nicht geschrieben werden — und die Historie behauptete eine
 *    Aenderung, die es nicht gab.
 * 3. `diffGeraet` (`_lib/geraeteDiff.ts:69`).
 * 4. ⛔ LEERER DIFF ⇒ FRUEHER AUSSTIEG mit dem unveraenderten Geraet (`devices.ts:139-142`,
 *    derselbe Satz in `deviceRepo.ts:229`). Kein Ereignis, kein `updatedAt`, kein
 *    `revalidatePath`.
 * 5. Sonst EINE Transaktion (`devices.ts:146-153`) — Grund woertlich `devices.ts:144-145`:
 *    „roll back together (e.g. changing issi to an existing one rolls back)".
 *
 * ⛔ DIE RIEGELZEILE LIEFERT DIE STUFE MIT (`Spec:4351-4353`). Sie ein zweites Mal abzuleiten
 * waere die Ableitung, die auseinanderlaeuft (`_lib/zugang.ts:488-491`).
 */
export async function geraetAendernAction(id: string, patch: GeraetPatch): Promise<Ergebnis> {
  const { viewer, rolle } = await requireRadioVerwaltung();

  // ⛔ `issi` DARF FEHLEN, ABER NICHT LEER SEIN (`schemas.ts:78`) — deshalb `!== undefined`
  // vor der Pruefung und nicht statt ihr.
  if (patch.issi !== undefined && issiUnbrauchbar(patch.issi)) {
    return { ok: false, fehler: SPEICHERN_FEHLER };
  }

  // ⛔ DIE TYPPRAEDIKATE DES PATCHSCHEMAS (`schemas.ts:76-99`), siehe `artFalsch`. Sie stehen
  // VOR dem Lesen, weil der Bestand die Anfrage schon an der Validierung abweist
  // (400 `invalid`, `devices.ts:102`) und gar nicht erst in die Datenbank sieht.
  const eingang = nurSchreibbareFelder(patch);
  if (artFalsch(eingang)) return { ok: false, fehler: SPEICHERN_FEHLER };

  const db = getDb();
  const bestehend = db.select().from(devices).where(eq(devices.id, id)).get();
  if (!bestehend) return { ok: false, fehler: SPEICHERN_FEHLER };

  const erlaubt = filterSchreibbareFelder(rolle, eingang) as GeraetPatch;
  const diffs = diffGeraet(bestehend, erlaubt);
  if (diffs.length === 0) return { ok: true };

  try {
    db.transaction((tx) => {
      if (erlaubt.softwareVersion) registriereVersion(tx, erlaubt.softwareVersion, viewer.sub);
      tx.update(devices)
        .set({ ...erlaubt, updatedAt: new Date(), updatedBy: viewer.sub })
        .where(eq(devices.id, id))
        .run();
      schreibeEreignisse(tx, id, diffs, viewer.sub, "manual");
    });
  } catch (fehler) {
    return { ok: false, fehler: istUniqueVerletzung(fehler) ? ISSI_VERGEBEN : SPEICHERN_FEHLER };
  }

  revalidatePath(`${GERAETELISTE}/${id}`);
  revalidatePath(GERAETELISTE);
  revalidatePath(UEBERSICHT);
  revalidatePath(SOFTWARE);
  return { ok: true };
}

/** Der Abbruch, der eine Transaktion zurueckrollt, ohne die Meldung zu verlieren. */
class LoeschAbbruch extends Error {}

/**
 * LOESCHEN — `DELETE /devices/:id` (`devices.ts:188-192`), ⛔ MIT DER BENANNTEN ABWEICHUNG
 * ⬜ V-L6.
 *
 * ⛔ DIE BETREIBERENTSCHEIDUNG VOM 2026-08-24 UEBERHOLT DEN PLAN
 * (`.superpowers/sdd/planteil4/progress.md`, Abschnitt „✅ V-L6"): eine aktive Leihe wird
 * NICHT abgelehnt und NICHT verwaist gelassen, sondern beim Loeschen automatisch als
 * zurueckgegeben gebucht. ⚠️ `briefs/V10.md:71-79` und `KOPF.md:378` schreiben noch die
 * Ablehnung; das Ledger gilt.
 *
 * Die vier Ausformungen und wo sie stehen:
 * 1. Die WARNUNG steht VOR dem Loeschen und nennt den Entleiher — sie gehoert der Flaeche
 *    (`GeraetLoeschen.tsx`, Aufgabe V14) und speist sich aus `offeneLeiheZuGeraet`
 *    (`_db/leihen.ts`). Diese Action ist der Vollzug, nicht die Warnung.
 * 2. Die Rueckgabe traegt den Zeitpunkt des Loeschens — `bucheRueckgabe` liest die Uhr selbst
 *    (`_db/leihen.ts:692`), und der Aufruf steht in DIESEM Vorgang. ⛔ Kein `new Date(0)`:
 *    der vernarbte Praezedenzfall (B7) haette jede aktive Leihe zu einer 1970 zurueckgegebenen
 *    gemacht, und der naechste Retention-Lauf haette sie geloescht.
 * 3. Erkennbar in der Historie ueber `return_note` — siehe `RUECKGABE_BEIM_LOESCHEN` oben.
 * 4. ⛔ BEIDES IN EINER TRANSAKTION. Ein Abbruch dazwischen hinterliesse genau den verwaisten
 *    Zustand, den die Entscheidung vermeiden soll.
 *
 * ⛔ DIE RUECKGABE LAEUFT DURCH `bucheRueckgabe` UND NICHT DURCH EIN EIGENES `UPDATE`
 * (NS-A1): `loans` hat genau einen Schreibort. ⚠️ Und ihr Ergebnis wird GEPRUEFT — sie faengt
 * jeden Fehler selbst ab und liefert `{ ok: false }` (`_db/leihen.ts:720-724`); ohne die
 * Pruefung liefe die Loeschung weiter und die Leihe bliebe offen, in derselben Transaktion,
 * die das gerade verhindern soll.
 *
 * ⚠️ `bucheRueckgabe` BEKOMMT DIE AEUSSERE VERBINDUNG, NICHT DAS `tx`-OBJEKT: better-sqlite3
 * ist synchron und einverbindungsgebunden, drizzles `transaction()` setzt `BEGIN` auf genau
 * dieser Verbindung — jede Anweisung ueber `db` waehrend des Rumpfs liegt damit IN der
 * Transaktion. Der Fall „bei einem Abbruch bleibt weder die Rueckgabe noch die Loeschung
 * stehen" in `admin/actions.verhalten.test.ts` misst das, statt es zu behaupten.
 *
 * ⛔ `device_events` BRAUCHT KEINE EIGENE BEHANDLUNG — der Fremdschluessel ist
 * `onDelete: "cascade"` (`_db/schema.ts:127-129`), und `foreign_keys = ON` ist gesetzt
 * (`src/core/db/index.ts:19`).
 */
export async function geraetLoeschenAction(id: string): Promise<Ergebnis> {
  await requireRadioAdmin();

  const db = getDb();
  try {
    db.transaction((tx) => {
      const offene = offeneLeiheZuGeraet(db, id);
      if (offene) {
        const rueckgabe = bucheRueckgabe(db, offene.id, RUECKGABE_BEIM_LOESCHEN);
        if (!rueckgabe.ok) throw new LoeschAbbruch(rueckgabe.grund);
      }
      const ergebnis = tx.delete(devices).where(eq(devices.id, id)).run();
      if (ergebnis.changes === 0) throw new LoeschAbbruch("not_found");
    });
  } catch {
    return { ok: false, fehler: LOESCHEN_FEHLER };
  }

  revalidatePath(GERAETELISTE);
  revalidatePath(UEBERSICHT);
  // ⛔ V-L6s Folge, die der Plan nachziehen muss (VORABSCAN F2 Punkt d): die Action mutiert
  // jetzt auch `loans`, und ohne diese Zeile zeigte `/admin/ausleihen` danach eine
  // veraltete Liste.
  revalidatePath(AUSLEIHENLISTE);

  // ⛔ AUSSERHALB JEDES `try`: `redirect()` arbeitet ueber einen geworfenen Sentinel, und ein
  // `catch` darueber machte aus dem gelungenen Loeschen eine Fehlermeldung. Aus demselben
  // Grund steht er NACH der Transaktion — im Rumpf haette sein Wurf sie zurueckgerollt.
  redirect(GERAETELISTE_AUSSEN);
}

/**
 * NOTIZ ANFUEGEN — 1:1 aus `POST /devices/:id/update-note` (`devices.ts:162-186`).
 *
 * ⛔ KEIN SONDERFALL VON „AENDERN" (`Spec:4679-4684`): eigener Endpunkt, eigener `quelle`-Wert,
 * eigene Regel. Sie haengt an und ueberschreibt nie (`_db/schema.ts:56-59`).
 *
 * ⛔ EIN EINZIGER ZEITSTEMPEL FUER DIE ANGEHAENGTE ZEILE UND IHR EREIGNIS (`devices.ts:172-176`,
 * woertlich: „so they can never diverge across a midnight-UTC boundary"). Deshalb liest
 * `haengeNotizAn` keine Uhr, sondern nimmt `wann` entgegen (`_lib/notiz.ts:67-73`).
 *
 * ⛔ DAS EREIGNIS TRAEGT ALS `newValue` NUR DIE NEUE ZEILE, NICHT DIE GANZE NOTIZ
 * (`devices.ts:180`) — sonst waechst jede Ereigniszeile um den gesamten bisherigen Verlauf,
 * und die Historie wird unlesbar.
 *
 * ⚠️ DIE UPDATER-STUFE DARF DAS (`Spec:4448`, Tafel `Spec:4444-4454`: „Notiz anfuegen | ja |
 * ja") — ⛔ und `updateNote` steht trotzdem NICHT in `UPDATER_FELDER` (`_lib/rollen.ts:79`):
 * dort eingetragen oeffnete es das Notizfeld des GERAETEFORMULARS, was etwas anderes ist
 * (`_lib/rollen.ts:73-77`).
 */
export async function notizAnfuegenAction(id: string, text: string): Promise<Ergebnis> {
  const { viewer } = await requireRadioVerwaltung();

  // ⛔ `z.string().trim().min(1)` (`schemas.ts:103`) — GETRIMMT, anders als bei der ISSI. Ohne
  // die Zeile haengt ein leerer Text eine dauerhafte Auditzeile ohne Inhalt an
  // (`[YYYY-MM-DD · Autor] `), die niemand mehr entfernen kann: die Spalte ist append-only
  // (`_db/schema.ts:56-59`).
  if (text.trim().length === 0) return { ok: false, fehler: ANMERKUNG_FEHLER };

  const db = getDb();
  const bestehend = db.select().from(devices).where(eq(devices.id, id)).get();
  if (!bestehend) return { ok: false, fehler: ANMERKUNG_FEHLER };

  const jetzt = new Date();
  const autor = autorName(viewer);
  const zeile = haengeNotizAn("", text, autor, jetzt);
  const neueNotiz = haengeNotizAn(bestehend.updateNote, text, autor, jetzt);

  try {
    db.transaction((tx) => {
      tx.update(devices)
        .set({ updateNote: neueNotiz, updatedAt: jetzt, updatedBy: viewer.sub })
        .where(eq(devices.id, id))
        .run();
      schreibeEreignisse(
        tx,
        id,
        [{ feld: "updateNote", alt: bestehend.updateNote, neu: zeile }],
        viewer.sub,
        "update-note",
      );
    });
  } catch {
    return { ok: false, fehler: ANMERKUNG_FEHLER };
  }

  revalidatePath(`${GERAETELISTE}/${id}`);
  revalidatePath(GERAETELISTE);
  revalidatePath(SOFTWARE);
  return { ok: true };
}

/**
 * VERSION ANLEGEN — 1:1 aus `createSoftwareVersion` (`softwareVersionRepo.ts:48-60`).
 *
 * ⛔ DER WEG ZUM 409 IST `onConflictDoNothing` UND DIE PRUEFUNG `res.changes > 0`
 * (`softwareVersionRepo.ts:54-59`), nicht ein `SELECT` davor: ein Wettlauf zwischen Pruefung
 * und Einfuegen gaebe es sonst umsonst.
 *
 * ⛔ EINE NEU ANGELEGTE VERSION WIRD NIE AUTOMATISCH ZUM ZIEL (`_db/schema.ts:80-82`,
 * `SoftwareVersionsPage.tsx:185`).
 */
export async function versionAnlegenAction(wert: string): Promise<Ergebnis> {
  const viewer = await requireRadioAdmin();

  // `value` getrimmt, min 1 (`radio-admin/server/src/routes/softwareVersions.ts:13`). Die
  // Fassung im Client prueft dasselbe (`SoftwareVersionsPage.tsx:28-29`) — eine Regel, die
  // nur im Client steht, ist keine Regel (Spec:3583-3585).
  const sauber = wert.trim();
  if (sauber === "") return { ok: false, fehler: VERSION_ANLEGEN_FEHLER };

  const db = getDb();
  try {
    const ergebnis = db
      .insert(softwareVersions)
      .values({
        value: sauber,
        createdAt: new Date(),
        createdBy: viewer.sub,
        sortOrder: naechsteReihenfolge(db),
      })
      .onConflictDoNothing({ target: softwareVersions.value })
      .run();
    if (ergebnis.changes === 0) return { ok: false, fehler: VERSION_VORHANDEN };
  } catch {
    return { ok: false, fehler: VERSION_ANLEGEN_FEHLER };
  }

  revalidatePath(VERSIONSLISTE);
  revalidatePath(GERAETELISTE);
  revalidatePath(UEBERSICHT);
  return { ok: true };
}

/**
 * ZIELVERSION SETZEN — 1:1 aus `setTargetVersion` (`softwareVersionRepo.ts:77-90`).
 *
 * ⛔ ES SETZT ZUERST UND PRUEFT `changes === 0`, BEVOR ES DIE ANDEREN ABRAEUMT — woertlich
 * `softwareVersionRepo.ts:79-80`: „Set first: changes === 0 means the id is unknown, so we bail
 * without having cleared anything (no pre-flight existence SELECT needed)."
 *
 * ⛔ EIN `SELECT`-DANN-`UPDATE` WAERE HIER EIN WETTLAUF UND EIN FACHLICHER FEHLER: eine
 * unbekannte Id loeschte die Marke ueberall — und der Update-Stand JEDES Geraets haengt allein
 * an dieser einen Marke (`_db/schema.ts:84-92`).
 */
export async function versionZielSetzenAction(id: string): Promise<Ergebnis> {
  await requireRadioAdmin();

  const db = getDb();
  let gesetzt: boolean;
  try {
    gesetzt = db.transaction((tx) => {
      const ergebnis = tx
        .update(softwareVersions)
        .set({ isTarget: true })
        .where(eq(softwareVersions.id, id))
        .run();
      if (ergebnis.changes === 0) return false;
      tx.update(softwareVersions)
        .set({ isTarget: false })
        .where(ne(softwareVersions.id, id))
        .run();
      return true;
    });
  } catch {
    return { ok: false, fehler: ZIEL_FEHLER };
  }
  if (!gesetzt) return { ok: false, fehler: ZIEL_FEHLER };

  revalidatePath(VERSIONSLISTE);
  revalidatePath(GERAETELISTE);
  revalidatePath(UEBERSICHT);
  return { ok: true };
}

/**
 * VERSION LOESCHEN — 1:1 aus `deleteSoftwareVersion` (`softwareVersionRepo.ts:102-120`).
 *
 * ⛔ GESPERRT, SOLANGE `deviceCount > 0`, und die Meldung nennt die Zahl. Der Alt-Kommentar
 * gibt den Grund (`:98-101`): „the admin must reassign those devices first, so deletion can
 * never orphan a device's version string."
 */
export async function versionLoeschenAction(id: string): Promise<Ergebnis> {
  await requireRadioAdmin();

  const db = getDb();
  try {
    const zeile = db
      .select({ value: softwareVersions.value })
      .from(softwareVersions)
      .where(eq(softwareVersions.id, id))
      .get();
    if (!zeile) return { ok: false, fehler: VERSION_LOESCHEN_FEHLER };

    const benutzt = db
      .select({ anzahl: sql<number>`COUNT(*)` })
      .from(devices)
      .where(eq(devices.softwareVersion, zeile.value))
      .get();
    const anzahl = benutzt?.anzahl ?? 0;
    if (anzahl > 0) return { ok: false, fehler: versionInBenutzung(anzahl) };

    db.delete(softwareVersions).where(eq(softwareVersions.id, id)).run();
  } catch {
    return { ok: false, fehler: VERSION_LOESCHEN_FEHLER };
  }

  revalidatePath(VERSIONSLISTE);
  revalidatePath(GERAETELISTE);
  revalidatePath(UEBERSICHT);
  return { ok: true };
}

/**
 * REIHENFOLGE SETZEN — 1:1 aus `reorderSoftwareVersions` (`softwareVersionRepo.ts:127-136`).
 *
 * ⛔ DIE ERSTE ID BEKOMMT DEN HOECHSTEN `sortOrder` (`ids.length - index`, `:131`) — die Liste
 * kommt von oben nach unten herein, die Anzeige sortiert `desc(sortOrder)`
 * (`softwareVersionRepo.ts:150`). Wer `index` statt `ids.length - index` schreibt, dreht die
 * Liste um, ohne dass ein Tor rot wird.
 *
 * ⛔ UNBEKANNTE IDS WERDEN IGNORIERT, DIE ZIEL-MARKE BLEIBT UNBERUEHRT (`:124-125`).
 */
export async function versionenSortierenAction(ids: string[]): Promise<Ergebnis> {
  await requireRadioAdmin();

  const db = getDb();
  try {
    db.transaction((tx) => {
      ids.forEach((id, index) => {
        tx.update(softwareVersions)
          .set({ sortOrder: ids.length - index })
          .where(eq(softwareVersions.id, id))
          .run();
      });
    });
  } catch {
    return { ok: false, fehler: REIHENFOLGE_FEHLER };
  }

  revalidatePath(VERSIONSLISTE);
  revalidatePath(GERAETELISTE);
  revalidatePath(UEBERSICHT);
  return { ok: true };
}

/**
 * DEN IMPORT SCHREIBEN — die zweite Haelfte des ZWEIPHASIGEN Imports (`Spec:4695-4702`), 1:1
 * aus `applyCommit` (`radio-admin/server/src/import/apply-commit.ts:29-75`).
 *
 * ⛔ ZWEIPHASIG, UND DAS IST KEINE FORMSACHE: „Eine einphasige Suite-Fassung (‚Datei hoch,
 * fertig') ist kein Port, sondern ein anderes Produkt — der Import ist der Weg, ueber den
 * Geraete tatsaechlich in den Bestand kommen." Der Dateischritt ist nach Entscheidung E-V16
 * der Route Handler `admin/(arbeit)/import/hochladen/route.ts` (Aufgabe V18).
 *
 * ⛔ SIE KLASSIFIZIERT ERNEUT, UND DAS IST KEIN DOPPELAUFWAND: der Bestand kann sich zwischen
 * Vorschau und Schreiben veraendert haben, und der Alt-Weg ruft `commit` ebenfalls zweimal
 * (`ImportWizard.tsx:107`, `:123`).
 *
 * ⛔ EINE TRANSAKTION UEBER ALLE ZEILEN (`apply-commit.ts:32-36`): „a thrown error rolls back
 * the entire batch … all-or-nothing import semantics".
 *
 * ⛔ DIE ROLLE WIRD MITGEGEBEN (`classifyRows({ …, role })`,
 * `radio-admin/server/src/routes/import.ts:54`) — auch wenn der Riegel eine Zeile darueber
 * ohnehin nur die Admin-Stufe durchlaesst. Der Klassifikator ist die 1:1-Fachlogik, und eine
 * Abzweigung „hier ist es ja immer admin" waere ein zweiter Wahrheitsort. ⚠️ Und E-V4s
 * Verschaerfung gilt: die zwei Import-Wege tragen die ADMIN-Stufe, waehrend der Alt-Bestand
 * den Dateischritt jeder angemeldeten Rolle oeffnet (`import.ts:17` mit der Notiz „any
 * authenticated role may parse a file", `:40`) und die Rechte erst im Klassifikator zieht
 * (`classify-import-row.ts:43-49`).
 *
 * ⛔ DIE ROLLENFILTERUNG LAEUFT SERVERSEITIG NOCH EINMAL (`apply-commit.ts:54-57`, woertlich
 * „Re-apply the role allowlist server-side (source of truth)") — auch hier, wo sie nichts
 * wegnimmt.
 *
 * ⚠️ `quelle` IST `csv-import` FUER JEDE GESCHRIEBENE EREIGNISZEILE — so schreibt es
 * `briefs/V10.md:115` und die 1:1-Tafel (`KOPF.md:1281`) vor. ⛔ GEMESSEN WEICHT DER BESTAND
 * DAVON AB: `apply-commit.ts:50` schreibt fuer eine NEU ANGELEGTE Zeile `'create'` und erst
 * `:67` fuer eine geaenderte `'csv-import'`. Die Abweichung ist hier BENANNT statt still; sie
 * betrifft weder Filter noch Sortierung noch eine Feldgrenze, und beide Werte stehen im
 * geschlossenen Satz der Spalte (`_db/schema.ts:139-141`).
 *
 * ⬜ V-L12 bleibt offen: ob die Rohzeilen einer Produktions-CSV unter der suiteweiten
 * 1-MB-Grenze einer Server Action bleiben, misst die Generalprobe. Reisst die Grenze, bekommt
 * diese Action dieselbe Handler-Bauform wie `hochladen` — eine Datei, kein Umbau.
 *
 * ⛔ `probelauf` IST DER DRITTE PARAMETER, UND ER IST DIE ZWEITE PHASE — nachgetragen in V18.
 * Der Bestand ruft SEINEN Endpunkt zweimal: `POST /import/commit` mit `dryRun: true` fuer die
 * Vorschau (`ImportWizard.tsx:107`) und mit `dryRun: false` fuer das Schreiben (`:123`); das
 * Feld steht in `importCommitSchema` und wird in `import.ts:46`, `:56-58` ausgewertet.
 * ⚠️ V10 hat die Action ohne diesen Parameter gebaut — nicht als Entscheidung, sondern weil
 * ihr Brief den Vorschauschritt nicht fuehrte (`briefs/V10.md:101-118` nennt zweiphasig,
 * ohne den Probelauf zu verorten). ⛔ OHNE IHN GAEBE ES DEN VORSCHAUSCHRITT NICHT: die
 * Klassifikation braucht den Bestand aus `devices`, den weder die Insel noch der
 * Hochladen-Handler lesen darf — und eine ZEHNTE Action ist ausgeschlossen
 * (`ACTION_ANZAHL = 9` mit `toBe`, `admin/actions.test.ts`). Der Probelauf ist damit
 * dieselbe Aktion in derselben Datei, genau wie im Bestand.
 */
export async function importSchreibenAction(
  zuordnung: Spaltenzuordnung,
  zeilen: string[][],
  probelauf = false,
): Promise<Ergebnis<ImportBilanz>> {
  const viewer = await requireRadioAdmin();

  /*
   * ⛔ DER SCHNITT LIEGT AN DER ZUORDNUNG, DEM EINTRITTSORT DER FREMDEN DATEN — und nicht
   * zwei Stellen dahinter. `Spaltenzuordnung` ist beim Aufruf eine Typzusage des Aufrufers,
   * keine Pruefung, und `zeileZuEingehend` schreibt JEDEN ihrer Schluessel in die Zeile
   * (`_lib/csv/klassifizieren.ts:186-201`).
   *
   * ⛔ WARUM HIER UND NICHT AM SCHREIBVORGANG (Review V10 Fund F4, beide Faelle gemessen):
   * der Klassifikator und der Schreibvorgang muessen aus DERSELBEN Filterung speisen, so wie
   * im Bestand, wo `row.changes` und `patch` beide aus `filterEditableFields` kommen
   * (`apply-commit.ts:53-57`). Fiel der Schnitt nur am Schreibvorgang, dann (a) trug die
   * Ereignisliste einer Neuanlage `{ feld: "id", … }` — eine Auditzeile ueber eine Aenderung,
   * die nie stattfand —, und (b) machte `zuSetzen[feld] = erlaubt[feld] ?? null` aus dem
   * weggeschnittenen Feld ein EXPLIZITES `NULL`, dessen `NOT NULL`-Verletzung den GANZEN
   * Stapel mitriss.
   *
   * ⛔ DIE GRENZE IST `IMPORTIERBARE_FELDER` UND NICHT `SCHREIBBARE_FELDER`: sie ist die
   * engere und die gemessene (`_lib/csv/kopfzeilen.ts:32-52`, 1:1 aus
   * `radio-admin/shared/src/import/auto-map-headers.ts:2-22`, woertlich „Device columns a CSV
   * may target (no system/identity-internal fields)"). `updateNote` faellt damit ebenfalls
   * heraus — es ist append-only und hat einen eigenen Schreibpfad.
   */
  const zuordnungSauber: Spaltenzuordnung = {};
  for (const feld of IMPORTIERBARE_FELDER) {
    const spalte = zuordnung[feld];
    if (spalte !== undefined) zuordnungSauber[feld] = spalte;
  }

  // ⛔ OHNE ZUGEORDNETE ISSI-SPALTE GIBT ES KEINEN SCHLUESSEL (`ImportWizard.tsx:109`, `:211`).
  const issiSpalte = zuordnungSauber.issi;
  if (issiSpalte === undefined) return { ok: false, fehler: ISSI_SPALTE_FEHLT };

  const rolle: RadioRolle = "admin";
  const db = getDb();

  let klassifiziert: KlassifizierteZeile[];
  let zusammenfassung: Zusammenfassung;
  try {
    const bestehendNachIssi = new Map<string, Geraet>();
    for (const geraet of db.select().from(devices).all()) {
      bestehendNachIssi.set(geraet.issi, geraet);
    }

    ({ zeilen: klassifiziert, zusammenfassung } = klassifiziereZeilen({
      zeilen,
      zuordnung: zuordnungSauber,
      bestehendNachIssi,
      rolle,
    }));

    /*
     * ⛔ DER PROBELAUF ENDET HIER — VOR DER TRANSAKTION UND VOR JEDEM `revalidatePath`.
     * 1:1 aus `import.ts:56-58` (`if (dryRun) return c.json({ dryRun: true, summary, rows })`).
     * ⛔ EINE ENTWERTUNG WAERE HIER EINE LUEGE: es hat sich nichts geaendert, und der
     * Zwischenspeicher jeder Verwaltungsflaeche fiele bei jedem Blick in die Vorschau.
     * ⛔ UND DIE KLASSIFIKATION LAEUFT VOR DEM SCHREIBEN NOCH EINMAL — der Bestand kann sich
     * zwischen Vorschau und Schreiben veraendert haben; deshalb ruft der Bestand denselben
     * Endpunkt zweimal statt das Ergebnis der Vorschau weiterzureichen.
     */
    if (probelauf) return { ok: true, zusammenfassung, zeilen: klassifiziert };

    db.transaction((tx) => {
      klassifiziert.forEach((zeile) => {
        const eingehend = zeileZuEingehend(zeilen[zeile.zeilenNummer] ?? [], zuordnungSauber);
        const { issi: _issi, ...uebrige } = eingehend;
        // ⛔ HIER STEHT KEIN ZWEITER FELDSCHNITT: `zuordnungSauber` oben ist der EINE, und
        // ein zweiter daneben waere genau die Asymmetrie, gegen die er gebaut ist.
        const erlaubt = filterSchreibbareFelder(
          rolle,
          uebrige as Record<string, unknown>,
        ) as GeraetPatch;
        const jetzt = new Date();

        if (zeile.klasse === "created") {
          if (erlaubt.softwareVersion) registriereVersion(tx, erlaubt.softwareVersion, viewer.sub);
          const angelegt = tx
            .insert(devices)
            .values({
              ...erlaubt,
              issi: zeile.issi,
              createdAt: jetzt,
              updatedAt: jetzt,
              createdBy: viewer.sub,
              updatedBy: viewer.sub,
            })
            .returning({ id: devices.id })
            .get();
          schreibeEreignisse(tx, angelegt.id, zeile.aenderungen, viewer.sub, "csv-import");
          return;
        }

        if (zeile.klasse === "updated") {
          const bestehend = bestehendNachIssi.get(zeile.issi);
          if (!bestehend) return;
          /*
           * ⛔ NUR DIE TATSAECHLICH GEAENDERTEN FELDER WERDEN GESCHRIEBEN
           * (`apply-commit.ts:58-61`, woertlich „persist only the fields that actually
           * changed") — nicht der ganze Patch.
           *
           * ⚠️ UND DAS IST HEUTE EIN NACHGEWIESENER NO-OP, DER TROTZDEM STEHENBLEIBT. Sonde
           * S-V10r dieser Aufgabe hat `zuSetzen` durch `{ ...erlaubt }` ersetzt: `18 passed`,
           * ⛔ 0 rot. Der Grund ist beweisbar und nicht zufaellig — `zeile.aenderungen` kommt
           * aus `diffGeraet(bestehend, erlaubt)` (`_lib/csv/klassifizieren.ts:292`), die
           * uebrigen Schluessel von `erlaubt` tragen also ZEICHENGLEICH den Wert, der schon
           * in der Zeile steht. Die zwei Schreibvorgaenge sind fuer jede heutige Eingabe
           * identisch.
           *
           * ⛔ DIE ZEILE BLEIBT, WEIL DER BEWEIS AN EINER ANNAHME HAENGT, die kein Tor haelt:
           * sobald ein Feld existiert, dessen Diff-Vergleich nicht der Schreibwert ist (eine
           * normalisierende Spalte, ein berechneter Wert), fallen die beiden Mengen
           * auseinander — und dann ist das hier die richtige. Der Satz steht da, damit
           * niemand die Nullmessung fuer eine Testschwaeche haelt (dieselbe Bauform wie
           * `_lib/csv/klassifizieren.ts:170-179`).
           */
          const zuSetzen: Record<string, unknown> = {};
          for (const aenderung of zeile.aenderungen) {
            zuSetzen[aenderung.feld] = (erlaubt as Record<string, unknown>)[aenderung.feld] ?? null;
          }
          if (erlaubt.softwareVersion) registriereVersion(tx, erlaubt.softwareVersion, viewer.sub);
          tx.update(devices)
            .set({ ...zuSetzen, updatedAt: jetzt, updatedBy: viewer.sub })
            .where(eq(devices.id, bestehend.id))
            .run();
          schreibeEreignisse(tx, bestehend.id, zeile.aenderungen, viewer.sub, "csv-import");
        }
        // `unchanged` | `error` | `skipped-no-permission` schreiben nichts (`apply-commit.ts:69`).
      });
    });
  } catch {
    return { ok: false, fehler: IMPORT_FEHLER };
  }

  /*
   * ⛔ DER ERFOLGSABSCHLUSS STEHT AUSSERHALB DES `try`, WIE IN `geraetAnlegenAction` UND
   * `geraetAendernAction` (Review V10 Fund F13). Innerhalb machte ein Wurf aus
   * `revalidatePath` aus einem VOLLSTAENDIG GESCHRIEBENEN Import die Meldung
   * „Import fehlgeschlagen" — und der Bedienende faehrt ihn ein zweites Mal.
   */
  revalidatePath(GERAETELISTE);
  revalidatePath(UEBERSICHT);
  revalidatePath(VERSIONSLISTE);
  return { ok: true, zusammenfassung, zeilen: klassifiziert };
}
