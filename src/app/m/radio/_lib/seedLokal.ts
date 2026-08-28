// src/app/m/radio/_lib/seedLokal.ts
// KEIN "use client" (Falle 6).
//
// ANREICHERUNG NUR FUER DIE LOKALE ARBEIT — bewusst NICHT am Boot-Pfad.
// `shouldSeed()` (src/core/bootstrap.ts) ist wahr bei `SUITE_SEED=1`, und das ist der
// GENERALPROBEN-Schalter. Fuer `radio` ist der Ausschluss schaerfer als fuer die anderen
// Module: eine geseedete Zeile in `zugangscodes` ist ein gueltiger ANONYMER
// SCHREIBZUGANG — jemand kann damit ohne Anmeldung Geraete ausleihen und zurueckgeben.
// Diese Datei laeuft nur ueber scripts/seed-lokal.ts (seit V23 auch aus `playwright.config.ts:158`).
//
// ⛔ DIE ZUSICHERUNG DAZU, AUSGESCHRIEBEN (Falle No. 31,
// docs/radio-portierung-analyse.md:1740-1749, woertlich): „Fuer `radio` heisst das: ein
// geseedeter Enrollment-Code waere in der Generalprobe ein GUELTIGER anonymer Zugang zum
// gesamten Bestand samt Ausleihernamen … Regel fuer die Spec: `seedLokal` legt Geraete und
// Stammdaten an, NIEMALS eine einloesbare Zugangszeile; die Enrollment-Tabelle bleibt beim
// Seed leer."
//
// ⚠️ UND JETZT DER STAND, WIE ER GEMESSEN IST — NICHT, WIE DIE REGEL IHN BESCHREIBT
// (2026-08-23, Aufgabe A8): diese Datei legt sehr wohl eine EINLOESBARE Zeile an
// (`zc-1`, `aktiv: true`, `CODE_AKTIV`, unten). Getragen wird die Zusage deshalb NICHT von
// der Leere der Tabelle, sondern von EINER Zeile in `core`: `radio` steht in
// `MODULE_MIGRATIONS` ohne Schema-Import und OHNE Eintrag in `seedAllModules()`
// (src/core/bootstrap.ts:49-56, mit genau dieser Begruendung). Der Boot-Pfad ruft diesen
// Seed also nie — und nur deshalb ist `SUITE_SEED=1` in der Generalprobe harmlos.
//
// ⛔ DARAUS FOLGT DIE AUFLAGE, UND SIE GILT FUER JEDEN NACHFOLGER: wer `radio` in
// `seedAllModules()` eintraegt oder `seedLokal` sonstwie an den Boot haengt, MUSS im selben
// Zug `zc-1` entfernen. Beides zusammen ist ein gueltiger anonymer SCHREIBzugang auf einer
// Generalproben-Instanz.
// ⚠️ HIER STAND BIS ZUM 2026-08-23 „und kein Tor dieses Repos wuerde es melden". DAS WAR
// FALSCH (REVIEW-A8 W4), und der Absatz vier Zeilen tiefer sagte bereits das Gegenteil:
// gemeldet wuerde die naheliegende Verdrahtung, durch scripts/seed-lokal.test.ts:55-56 —
// `for (const datei of ["src/core/bootstrap.ts", "src/instrumentation.ts"])` gegen
// `/seedLokal|seed-lokal|seedeLokal/`. Ein `seedLokalRadio(...)` in `seedAllModules()`
// faerbt diesen Fall rot. NUR EIN UMBENANNTES RE-EXPORT KAEME DURCH — CLAUDE.md:187-188
// nennt genau diese eine Luecke („er faengt die naheliegende Verdrahtung, nicht jede
// denkbare"). Was UNGEDECKT bleibt, ist damit nicht der Boot-Scan, sondern allein die
// Zusicherung „diese Datei legt keine einloesbare Zugangszeile an" (NS-A19, unten).
// ⚠️ Der Grund, warum das keine Lokal-Frage ist, steht in `CLAUDE.md` unter „Lokale
// Demodaten": `shouldSeed()` ist `SUITE_SEED === "1" || NODE_ENV === "development"` —
// `SUITE_SEED=1` ist der GENERALPROBEN-Schalter, nicht der Lokalschalter. Der naheliegende
// Griff („ein Seed-Code, damit das Gate lokal testbar ist") ist genau die Falle.
//
// ⬜ EINE SCAN-ZUSICHERUNG DAZU GEHOERT IN `scripts/seed-lokal.test.ts`, NICHT HIERHER
// (Nahtstelle NS-A19): dort steht bereits „jedes Modul aus MODULE_MIGRATIONS hat einen
// Seed" plus der Quelltext-Scan gegen eine Boot-Verdrahtung. Eine zweite Scan-Datei unter
// `m/radio/` waere ein Scan zu viel ueber derselben Flaeche (B14,
// docs/superpowers/specs/2026-08-17-radio-modul-design.md:103).
//
// IDEMPOTENT PRO ENTITAET und REIN ADDITIV: jede Zeile traegt eine STABILE id und wird mit
// `onConflictDoNothing()` geschrieben. `$defaultFn(nanoid)` gaebe bei jedem Lauf eine neue
// id und damit eine Dublette.
//
// ABWEICHUNG VOM PLANTEXT (§2.9.4), IM BERICHT VERMERKT: die Spec-Prosa beschreibt
// `seedLokalRadio(db: DB): void` mit `console.info`-Protokoll. Der tatsaechliche
// Aufrufvertrag ist `SeedModul.lauf: () => Promise<string[]>`
// (scripts/seed-lokal.ts) — GENAUSO wie bei allen sechs Geschwistern
// (`seedLokalPortal`, `seedLokalQr`, `seedLokalFeedback`, `seedLokalFiles`,
// `seedLokalLagerbuch`, `seedLokalAufgaben`, alle `async ... Promise<string[]>`).
// Ein `void`-Ruecksprung waere an der SEED_MODULE-Zeile aus M3 Schritt 4
// (`lauf: () => seedLokalRadio(...)`) ein Typfehler gegen `Promise<string[]>` und liesse
// `pnpm typecheck` nicht grün werden. Diese Datei folgt deshalb der Hausform: sie sammelt
// Protokollzeilen in einem Array und gibt sie zurueck, statt sie auf die Konsole zu
// schreiben. Die Seed-DATEN, ihre Reihenfolge und alle Kommentare bleiben wortwoertlich.
import type { DB } from "../_db/client";
import { devices, loans, softwareVersions, users, zugangscodes } from "../_db/schema";

/** Der `sub`, den das Dev-Login praegt: `dev:${email}` (src/core/auth/config.ts:63).
 *  Zeichengleich zum Praezedenzfall src/app/m/lagerbuch/_lib/seedLokal.ts:114. */
const SEED_SUB = "dev:demo@localtest.me";

/** Ein fester Tag als Ausgangspunkt, damit die Zeilen zwischen zwei Laeufen gleich
 *  aussehen; die Leih-Zeitpunkte haengen relativ daran. */
const JETZT = new Date();
const TAGE = (n: number) => new Date(JETZT.getTime() - n * 24 * 60 * 60 * 1000);
/** `YYYY-MM-DD`, wie `devices.last_updated_at` es fuehrt (§2.2.3) — eine Zeichenkette,
 *  kein Zeitstempel.
 *
 *  ⚠️ DIES IST EINE UTC-KUERZUNG, UND SIE IST HIER ABSICHTLICH: es sind Anzeigewerte fuer
 *  lokale Demodaten, kein Importpfad. Der IMPORT kuerzt in Europe/Berlin (`tagInBerlin`,
 *  scripts/import/radio.ts) — weil eine UTC-Kuerzung nur fuer EINEN der drei Schreibwege
 *  der Quelle richtig ist und fuer die anderen zwei den Tag zurueckschiebt (§2.2.3).
 *  Wer diese Zeile in Produktionscode oder in eine Server Action kopiert, holt genau den
 *  Zeitzonenkonflikt zurueck, den die TEXT-Spalte abschafft. */
const TAG = (d: Date) => d.toISOString().slice(0, 10);

/*
 * ZWEI CODES IN DER KANONISCHEN FORM AUS §3.2.1: 28 Zeichen Crockford-Base32
 * (Alphabet "0123456789ABCDEFGHJKMNPQRSTVWXYZ" — ohne I, L, O, U) in sieben
 * Vierergruppen, Bindestrich TEIL des gespeicherten Werts.
 * Der erste ist das Beispiel der Spec selbst (§3.2.1).
 * ⚠️ Der ERZEUGER (`erzeugeCode`) und die Eingabenormalisierung (`normalisiereCode`)
 * entstehen in Kapitel 3 / Planteil 3. Wenn er steht, sind diese zwei Literale einmal
 * gegen `normalisiereCode` zu pruefen — die Spalte selbst schreibt kein Format vor.
 */
const CODE_AKTIV = "A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW";
const CODE_GESPERRT = "7QK2-M4XN-B9HV-3ZTD-5PJW-6RSG-8YFA";

export async function seedLokalRadio(db: DB): Promise<string[]> {
  const zeilen: string[] = [];

  // --- Eine users-Zeile, damit die sechs Auditspalten einen Namen aufloesen ---
  const nutzerErgebnis = db
    .insert(users)
    .values({ sub: SEED_SUB, name: "Demo Person", lastSeenAt: TAGE(0) })
    .onConflictDoNothing()
    .run();
  zeilen.push(
    nutzerErgebnis.changes > 0
      ? `radio: Nutzerzeile ${SEED_SUB} angelegt.`
      : `radio: Nutzerzeile ${SEED_SUB} war schon da — übersprungen.`,
  );

  // --- Drei Softwareversionen, GENAU EINE mit isTarget ---
  // Zwei Marken machen den angezeigten Update-Stand JEDES Geraets davon abhaengig, welche
  // Zeile SQLite zufaellig zuerst liefert (§2.6, `getTargetVersion` ohne ORDER BY).
  const versionenErgebnis = db
    .insert(softwareVersions)
    .values([
      { id: "sv-1", value: "1.4.2", sortOrder: 0, isTarget: false,
        createdAt: TAGE(120), createdBy: SEED_SUB },
      { id: "sv-2", value: "1.5.0", sortOrder: 1, isTarget: true,
        createdAt: TAGE(60), createdBy: SEED_SUB },
      { id: "sv-3", value: "1.5.1-rc1", sortOrder: 2, isTarget: false,
        createdAt: TAGE(10), createdBy: SEED_SUB },
    ])
    .onConflictDoNothing()
    .run();
  zeilen.push(`radio: ${versionenErgebnis.changes} von 3 Softwareversionen angelegt (Rest bereits vorhanden).`);

  // --- Acht Geraete: ausleihbar/nicht, mit/ohne tei, eines mit updateNote,
  //     eines mit einem Rufnamen MIT UMLAUT. Ohne Umlaut-Testdaten sieht kein Test,
  //     dass die Suchfaltung fehlt
  //     (radio-inventar/apps/frontend/src/lib/device-filter.ts:24-31). ---
  const geraeteErgebnis = db
    .insert(devices)
    .values([
      { id: "g-1", rufname: "Mühlheim 1/83", issi: "1000001", tei: "7000001",
        serialNumber: "SN-0001", deviceType: "Handfunk", status: "einsatzbereit",
        location: "Funkraum", softwareVersion: "1.5.0", lastUpdatedAt: TAG(TAGE(30)),
        hiorgId: "HO-001", opta: "OPTA-001", deviceModes: "TMO,DMO",
        alamosIntegrated: true, loanable: true,
        createdAt: TAGE(300), updatedAt: TAGE(30), createdBy: SEED_SUB, updatedBy: SEED_SUB },
      { id: "g-2", rufname: "Mühlheim 1/84", issi: "1000002", tei: null,
        serialNumber: "SN-0002", deviceType: "Handfunk", status: "einsatzbereit",
        location: "Funkraum", softwareVersion: "1.5.0", lastUpdatedAt: TAG(TAGE(30)),
        deviceModes: "TMO", alamosIntegrated: false, loanable: true,
        createdAt: TAGE(300), updatedAt: TAGE(30), createdBy: SEED_SUB, updatedBy: SEED_SUB },
      { id: "g-3", rufname: "Fahrzeug 11/1", issi: "1000003", tei: "7000003",
        serialNumber: "SN-0003", deviceType: "Fahrzeugfunk", status: "einsatzbereit",
        location: "Fahrzeughalle", softwareVersion: "1.4.2", lastUpdatedAt: TAG(TAGE(90)),
        deviceModes: "TMO,DMO", alamosIntegrated: true, loanable: false,
        createdAt: TAGE(280), updatedAt: TAGE(90), createdBy: SEED_SUB, updatedBy: SEED_SUB },
      { id: "g-4", rufname: "Fahrzeug 11/2", issi: "1000004", tei: null,
        serialNumber: "SN-0004", deviceType: "Fahrzeugfunk", status: "in Reparatur",
        location: "Werkstatt", softwareVersion: "1.4.2", lastUpdatedAt: TAG(TAGE(200)),
        notes: "Antenne defekt", alamosIntegrated: false, loanable: false,
        createdAt: TAGE(260), updatedAt: TAGE(20), createdBy: SEED_SUB, updatedBy: SEED_SUB },
      { id: "g-5", rufname: "Reserve 1", issi: "1000005", tei: "7000005",
        serialNumber: "SN-0005", deviceType: "Handfunk", status: "einsatzbereit",
        location: "Lager", softwareVersion: "1.4.2", lastUpdatedAt: TAG(TAGE(150)),
        // APPEND-ONLY Update-Anmerkung, getrennt von `notes`: der Update-Weg haengt an, er
        // ueberschreibt nie. Genau diese Spalte walzt ein `onConflictDoUpdate` beim
        // Zweitimport platt (§2.8.4) — deshalb steht sie im Seed.
        updateNote: "2026-06-01 auf 1.4.2 gebracht",
        alamosIntegrated: false, loanable: true,
        createdAt: TAGE(250), updatedAt: TAGE(150), createdBy: SEED_SUB, updatedBy: SEED_SUB },
      { id: "g-6", rufname: "Reserve 2", issi: "1000006", tei: null,
        serialNumber: "SN-0006", deviceType: "Handfunk", status: "einsatzbereit",
        location: "Lager", alamosIntegrated: false, loanable: true,
        createdAt: TAGE(240), updatedAt: TAGE(240), createdBy: SEED_SUB, updatedBy: SEED_SUB },
      { id: "g-7", rufname: "Übung 3/1", issi: "1000007", tei: "7000007",
        serialNumber: "SN-0007", deviceType: "Handfunk", status: "ausgemustert",
        location: "Lager", alamosIntegrated: false, loanable: false,
        createdAt: TAGE(700), updatedAt: TAGE(400), createdBy: SEED_SUB, updatedBy: SEED_SUB },
      { id: "g-8", rufname: null, issi: "1000008", tei: null,
        serialNumber: "SN-0008", deviceType: "Handfunk", status: "einsatzbereit",
        location: "Funkraum", alamosIntegrated: false, loanable: true,
        createdAt: TAGE(30), updatedAt: TAGE(30), createdBy: SEED_SUB, updatedBy: SEED_SUB },
    ])
    .onConflictDoNothing()
    .run();
  zeilen.push(`radio: ${geraeteErgebnis.changes} von 8 Geraeten angelegt (Rest bereits vorhanden).`);

  // --- Zwei zugangscodes: einer aktiv, einer gesperrt MIT gesperrtAm/gesperrtVon.
  //     Die Verwaltungsliste muss beide Zustaende zeigen koennen. ---
  const codesErgebnis = db
    .insert(zugangscodes)
    .values([
      { id: "zc-1", code: CODE_AKTIV, bezeichnung: "Aufsteller Funkraum", aktiv: true,
        createdAt: TAGE(45), createdBy: SEED_SUB, lastUsedAt: TAGE(2) },
      { id: "zc-2", code: CODE_GESPERRT, bezeichnung: "Aufsteller Fahrzeughalle (Kaertchen weg)",
        aktiv: false, gesperrtAm: TAGE(7), gesperrtVon: SEED_SUB,
        createdAt: TAGE(90), createdBy: SEED_SUB, lastUsedAt: TAGE(30) },
    ])
    .onConflictDoNothing()
    .run();
  zeilen.push(`radio: ${codesErgebnis.changes} von 2 Zugangscodes angelegt (Rest bereits vorhanden).`);

  // --- Je eine aktive und drei zurueckgegebene Leihen. EINE davon mit `returnedAt`
  //     AELTER ALS ZWEI MONATE, damit der Retention-Lauf lokal ueberhaupt etwas zu tun
  //     hat (§2.9.4). `zugangscodeId` bleibt NULL fuer jede Leihe ueber den Suite-Weg;
  //     eine zeigt auf zc-1, damit die Herkunftsanzeige einen Fall hat. ---
  const leihenErgebnis = db
    .insert(loans)
    .values([
      { id: "l-aktiv", deviceId: "g-1", snapshotCallSign: "Mühlheim 1/83",
        snapshotSerialNumber: "SN-0001", snapshotDeviceType: "Handfunk",
        borrowerName: "Aktive Person", borrowedAt: TAGE(1), returnedAt: null,
        zugangscodeId: "zc-1", createdAt: TAGE(1), updatedAt: TAGE(1) },
      { id: "l-zurueck-1", deviceId: "g-2", snapshotCallSign: "Mühlheim 1/84",
        snapshotSerialNumber: "SN-0002", snapshotDeviceType: "Handfunk",
        borrowerName: "Kurz Zurueck", borrowedAt: TAGE(10), returnedAt: TAGE(9),
        returnNote: "alles in Ordnung", createdAt: TAGE(10), updatedAt: TAGE(9) },
      { id: "l-zurueck-2", deviceId: "g-5", snapshotCallSign: "Reserve 1",
        snapshotSerialNumber: "SN-0005", snapshotDeviceType: "Handfunk",
        borrowerName: "Mittel Zurueck", borrowedAt: TAGE(40), returnedAt: TAGE(38),
        createdAt: TAGE(40), updatedAt: TAGE(38) },
      // ⚠️ AELTER ALS ZWEI MONATE: der einzige Retention-Kandidat des Seeds.
      { id: "l-zurueck-alt", deviceId: "g-6", snapshotCallSign: "Reserve 2",
        snapshotSerialNumber: "SN-0006", snapshotDeviceType: "Handfunk",
        borrowerName: "Lange Her", borrowedAt: TAGE(200), returnedAt: TAGE(190),
        createdAt: TAGE(200), updatedAt: TAGE(190) },
    ])
    .onConflictDoNothing()
    .run();
  zeilen.push(`radio: ${leihenErgebnis.changes} von 4 Leihen angelegt (Rest bereits vorhanden).`);

  // Das Protokoll nennt den erzeugten Code im KLARTEXT — wie bei den uebrigen Modulen,
  // das ist der Zweck des Skripts (§2.9.4, CLAUDE.md "Lokale Demodaten").
  zeilen.push(`radio: Ausleih-Code (aktiv):    ${CODE_AKTIV}`);
  zeilen.push(`radio: Ausleih-Code (gesperrt): ${CODE_GESPERRT}`);

  return zeilen;
}
