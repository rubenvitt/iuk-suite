// src/app/m/radio/_lib/boot.ts
// KEIN "use client" (Falle 6).
//
// ⚠️ DIESE DATEI TRAEGT AM ENDE ZWEI EXPORTGRUPPEN AUS ZWEI PLANTEILEN, und die
// Reihenfolge ist Pflicht (Spec 1 B8):
//   * Kapitel 2 (HIER): `retentionGrenze`, `raeumeLeihhistorie` — die Rechnung.
//   * Kapitel 7 (Planteil 5, G2 — GEBAUT, am Dateiende): `radioBootFehler()`, das VOR den
//     Migrationen laeuft und keine Tabelle liest, samt `historieMonate()`/
//     `historieMonateFehler()` fuer RADIO_HISTORIE_MONATE.
//   * Kapitel 7 (Planteil 5, G4 — NOCH NICHT GEBAUT): `starteRadioHintergrund()`/
//     `stoppeRadioHintergrund()` samt RADIO_HISTORIE_PURGE/_ERSTLAUF_MINUTEN, die DANACH
//     laufen und die Tabelle brauchen.
// Zwei Ruempfe fuer denselben Takt waeren zwei Timer in einer Datei und zwei Laeufe je
// Takt — deshalb steht der Takt hier NICHT, auch nicht "vorlaeufig".
import { and, isNotNull, lt } from "drizzle-orm";
import { existsSync } from "node:fs";
import { moduleDbPath } from "@/core/db";
import { getModule, prodHostsFor } from "@/core/registry";
import type { DB } from "../_db/client";
import { loans } from "../_db/schema";
import { grenzenFehler } from "./grenzen";

type EnvLike = Record<string, string | undefined>;

/** Vorbelegung von `RADIO_HISTORIE_MONATE` (§7.4.1). Die Umgebungsvariable liest
 *  `historieMonate()` am Dateiende (G2); der Takt, der sie verbraucht, kommt mit G4 —
 *  dieselbe Datei, aber nicht dieser Abschnitt.
 *
 *  Uebernommen wird die Regel `HISTORY_RETENTION_MONTHS = 2`
 *  (radio-admin/server/src/services/retentionService.ts:9). Der Grund steht dort im
 *  Kommentar und ist der einzige, der zaehlt: `borrower_name` ist personenbezogen, und das
 *  Loeschen ist eine ausdrueckliche geplante Richtlinie, keine Nebenwirkung davon, dass
 *  jemand die Historie liest. */
export const RETENTION_MONATE_VORGABE = 2;

/**
 * Der Cutoff als DATE, nicht als Millisekundenzahl (§2.7.4). Rein und testbar.
 *
 * WARUM `Date` UND NICHT `number`: die eigentliche Gefahr ist ein falscher Cutoff, und er
 * hat zwei Gestalten — die Einheit und das Vorzeichen. Eine `Date`-Grenze kann keinen
 * Faktor 1000 tragen, weil Drizzle die Umrechnung fuer `mode: "timestamp"` selbst besorgt.
 * Spec 1 B16 hat aus genau diesem Grund eine `number`-Fassung gestrichen: "eine Zahl ist
 * in eine `mode: \"timestamp\"`-Spalte nicht einfuegbar — das haette erst der erste echte
 * Insert gezeigt, nie der Mapper-Test."
 *
 * `monate` kommt aus `RADIO_HISTORIE_MONATE` (Planteil 5) — der Aufrufer reicht ihn durch,
 * diese Funktion liest KEINE Umgebung.
 */
export function retentionGrenze(jetzt: Date = new Date(), monate = RETENTION_MONATE_VORGABE): Date {
  const d = new Date(jetzt.getTime());
  d.setUTCMonth(d.getUTCMonth() - monate);
  return d;
}

/**
 * Ein Lauf. Gibt die Zahl geloeschter Zeilen zurueck. WIRFT NICHT.
 *
 * ZU OFT IST HARMLOS: der Cutoff ist zeitbasiert und der DELETE idempotent; zwei Laeufe in
 * einer Minute loeschen dieselbe leere Menge. Die Kosten sind ein indizierter DELETE ueber
 * `loans_returned_at_idx`.
 *
 * NIE IST EINE RICHTLINIEN-ABWEICHUNG, KEIN FUNKTIONSAUSFALL: `borrower_name` sammelt sich
 * ueber die Zwei-Monats-Richtlinie hinaus an, nichts bricht. Feststellbar mit
 * `SELECT COUNT(*) FROM loans WHERE returned_at IS NOT NULL
 *  AND returned_at < unixepoch('now','-2 months');` — sie gehoert als wiederkehrende
 * Pruefung ins Runbook (Zusage an Spec 2), weil ein stehengebliebener Timer sich nicht von
 * selbst meldet.
 *
 * AKTIVE LEIHEN BLEIBEN, IMMER: `isNotNull(returnedAt)` ist die halbe Zusage von §2.7.4.
 */
export function raeumeLeihhistorie(db: DB, jetzt?: Date, monate?: number): number {
  const grenze = retentionGrenze(jetzt, monate);
  const ergebnis = db
    .delete(loans)
    .where(and(isNotNull(loans.returnedAt), lt(loans.returnedAt, grenze)))
    .run();
  return ergebnis.changes;
}

// ─────────────────────────────────────────────────────────────────────────────
// KAPITEL 7 (PLANTEIL 5, G2) — DIE BOOT-PRUEFUNGEN.
//
// ⛔ SIE STEHEN AM DATEIENDE, NACH `raeumeLeihhistorie()` (Naht NS-M1). Der Takt
// (`starteRadioHintergrund()`) kommt mit G4 dahinter — er laeuft NACH den Migrationen
// und braucht die Tabelle, waehrend alles hier VOR ihnen laeuft und keine liest.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Die Vorbelegung von `RADIO_HISTORIE_MONATE` als kleinster zulaessiger Wert.
 *
 * ⛔ `0` WIRD AUSDRUECKLICH ABGEWIESEN, NICHT ALS „AUS" GELESEN (§7.3.3 Nr. 4): 0 Monate
 * loeschte beim ersten Lauf die gesamte abgeschlossene Leihhistorie. Abgeschaltet wird der
 * Purge ueber `RADIO_HISTORIE_PURGE=0` — eine eigene Variable, bei jedem Start laut.
 *
 * ⛔ KEINE OBERGRENZE. Die Spec gibt fuer diese Variable keine („keine ganze Zahl >= 1");
 * eine erfundene waere ein Startabbruch, den kein Kapiteltext rechtfertigt.
 */
const HISTORIE_MONATE_MINDESTENS = 1;

/**
 * Ganze Dezimalzahl mit optionalem Vorzeichen — bewusst NICHT `Number()`.
 * `Number("0x10")` ist 16 und `Number.isInteger(16)` wahr: eine Pruefung ueber `Number`
 * allein liesse Hex und `1e7` durch, und die GELTENDE Loeschgrenze waere eine andere als
 * die, die in der .env steht.
 *
 * ⚠️ SIE STEHT HIER ZWEITSCHRIFTLICH NEBEN `_lib/grenzen.ts:122` UND WIRD NICHT VON DORT
 * IMPORTIERT. Grund: `RADIO_HISTORIE_MONATE` gehoert Kapitel 7 und ausdruecklich NICHT in
 * die `ZAHLEN`-Tabelle (E-G3) — sie hat keine Obergrenze, `ZahlRegel` verlangt eine, und
 * `ZAHL_NAMEN` (`_lib/grenzen.ts:106`) wird von `grenzen.test.ts` gegen eine dort gefuehrte
 * Erwartungstabelle gespiegelt. Ein Export dieses Regexes waere die kleinere Kopplung, aber
 * er vergroesserte die bewusst schmale Exportflaeche von `grenzen.ts` um einen Namen, den
 * niemand sonst braucht.
 */
const GANZZAHL = /^[+-]?\d+$/;

/**
 * Dieselbe Pruefung wie `historieMonate()`, aber als Meldung. WIRFT NIE (E-G3).
 *
 * ⛔ HIER, NICHT IN `historieMonate()`, LIEGT DIE UNTERGRENZE — und das ist tragend: der
 * Boot will ALLE Fehler auf einmal melden, nicht den ersten, also ist der meldende Weg der
 * fuehrende und der werfende der abgeleitete. Umgekehrt gaebe es zwei Auswertungen und
 * damit zwei Wahrheiten (dieselbe Begruendung wie `_lib/grenzen.ts:166-170`).
 *
 * LEER GESETZT GILT WIE NICHT GESETZT: `RADIO_HISTORIE_MONATE=` ist der haeufigere Fall als
 * die fehlende Zeile (jemand raeumt eine .env auf), und `Number("")` waere 0 — genau der
 * verbotene Wert (Vorbild `_lib/grenzen.ts:126-133`).
 */
export function historieMonateFehler(env: EnvLike = process.env): string | null {
  const roh = env.RADIO_HISTORIE_MONATE?.trim();
  if (roh === undefined || roh === "") return null;

  if (!GANZZAHL.test(roh)) {
    return (
      `RADIO_HISTORIE_MONATE="${roh}" ist keine ganze Zahl. Erwartet: eine ganze Zahl ` +
      `ab ${HISTORIE_MONATE_MINDESTENS} (Monate). Achtung auf die Schreibweise — "0x10" ` +
      `und "1e7" sind fuer JavaScript Zahlen, fuer diese Pruefung nicht, und die geltende ` +
      `Loeschgrenze waere sonst eine andere als die in der .env.`
    );
  }

  const wert = Number.parseInt(roh, 10);
  if (wert < HISTORIE_MONATE_MINDESTENS) {
    return (
      `RADIO_HISTORIE_MONATE=${wert} liegt unter ${HISTORIE_MONATE_MINDESTENS} (Monate). ` +
      `⛔ 0 IST KEIN „AUS": 0 Monate loeschte beim ersten Lauf die gesamte abgeschlossene ` +
      `Leihhistorie, und ein negativer Wert schoebe den Cutoff in die Zukunft. Wer den ` +
      `Purge abschalten will, setzt RADIO_HISTORIE_PURGE=0 — dieser Schalter ist bewusst ` +
      `und meldet sich bei jedem Start.`
    );
  }
  return null;
}

/**
 * Die geltende Retention in MONATEN. Vorbelegung ist `RETENTION_MONATE_VORGABE` (`:34`).
 *
 * ⚠️ SIE WIRFT bei einem gesetzten, ungueltigen Wert — sie faellt NICHT still auf die
 * Vorgabe zurueck. Ein Modul, das mit einer kaputten Zahl gar nicht erst startet, ist
 * richtiger als eines, das still eine andere Loeschgrenze faehrt als die, die in der .env
 * steht (`src/app/m/lagerbuch/_lib/gateSchranke.ts:12-14`). Der Wurf erreicht den Boot nie:
 * `radioBootFehler()` fragt `historieMonateFehler()` und liefert die Meldung als Liste.
 * Der Konsument des Wurfs ist der Takt aus G4.
 */
export function historieMonate(env: EnvLike = process.env): number {
  const fehler = historieMonateFehler(env);
  if (fehler !== null) throw new Error(fehler);

  const roh = env.RADIO_HISTORIE_MONATE?.trim();
  if (roh === undefined || roh === "") return RETENTION_MONATE_VORGABE;
  return Number.parseInt(roh, 10);
}

/**
 * Die Hostnamen, die in einer Traefik-Regel stehen — als Tokens, nicht als Teilzeichenkette.
 *
 * `SUITE_TRAEFIK_RULE` sieht so aus: ``Host(`iuk-ue.de`) || Host(`radio.iuk-ue.de`)``
 * (`compose.yaml:152-153`, `.env.example:457-458`). Backtick, Klammer und `|` gehoeren nicht
 * zu einem Hostnamen, also trennt genau ihr Gegenzeichensatz die Tokens.
 *
 * ⛔ WARUM NICHT `regel.includes(host)`: ein Vergleich auf Teilzeichenketten haelt
 * `radio.iuk-ue.de` faelschlich fuer enthalten, sobald irgendwo `xradio.iuk-ue.de` steht —
 * und die zweite Meldung unten fragt gerade nach einem Praefix, das sich von einem echten
 * Hostnamen nur durch seine Grenze unterscheidet (`radio-admin.` gegen `radio.`).
 *
 * ⛔ SIE GIBT DIE TOKENS IN DER SCHREIBWEISE DER .env ZURUECK — kleingeschrieben wird erst
 * beim VERGLEICH. Hostnamen sind fallunabhaengig, und der Laufzeitpfad rechnet damit
 * (`src/core/registry.ts:252` senkt den Host, `:255` vergleicht gesenkt); ein Vergleich
 * ohne Senkung uebersaehe `Radio-Admin.iuk-ue.de` und waere damit falsch-negativ und
 * still — genau die Richtung, die `_lib/quelltextScan.ts:55-59` verbietet. Die MELDUNG
 * nennt trotzdem den getippten Wert: wer die Zeile in der .env suchen soll, sucht nach
 * dem, was er geschrieben hat.
 */
function hostsInTraefikRegel(regel: string): string[] {
  return regel.split(/[^A-Za-z0-9.-]+/).filter(Boolean);
}

/**
 * Die Boot-Pruefungen des Moduls `radio` (§7.3.1 bis §7.3.4).
 *
 * Kein "use client", kein Icon-Import — die Datei laeuft im Instrumentation-Hook, bevor
 * irgendetwas rendert (`:2`). Vorbild und Begruendung: `src/app/m/lagerbuch/_lib/boot.ts:1-27`.
 *
 * ⚠️ SIE WIRFT NIE. `assertHostConfig()` sammelt die Meldungen ALLER Module ein und
 * entscheidet EINMAL, ob daraus ein Abbruch wird (`src/core/bootstrap.ts:105-107`). Ein Wurf
 * von hier braeche die Kette mit einem fremden Fehler ab — und `assertHostConfig()` laeuft
 * fuer alle ELF Eintraege aus `src/core/registry.ts:53-213` (Spec:5909-5911 zaehlt an dieser
 * Stelle sechs; selbst nachgezaehlt sind es elf — Ruling R-G1-1). „Und die Meldung naennte
 * nicht einmal das ausloesende Modul."
 *
 * ⛔ SIE LIEST KEINE TABELLE. Sie laeuft VOR `migrateAllModules()`
 * (`src/instrumentation.ts:55` vor `:56`); ein `getDb()`, ein `select` oder ein
 * `openModuleDatabase` waere ein Fehler, den KEIN Typecheck sieht — zur Laufzeit hiesse er
 * entweder „Tabelle existiert nicht" beim allerersten Start oder, schlimmer, ein still
 * angelegtes leeres Schema. Bewacht von `boot.test.ts` („radioBootFehler liest KEINE
 * Tabelle"), und zwar an der entstandenen Datei, nicht an einem Quelltext-Scan.
 * ⛔ `existsSync` unten IST KEIN Tabellenzugriff und legt nichts an.
 *
 * ⚠️ `async` UND `Promise<string[]>`, obwohl nichts hier asynchron ist — Pflicht, keine
 * Kosmetik. Die Naht daneben sieht so aus (`...(await filesBootFehler())`,
 * `...(await lagerbuchBootFehler())`, `src/core/bootstrap.ts:96`, `:99`), und eine synchrone
 * Funktion an derselben Stelle laedt dazu ein, das `await` beim naechsten Umbau zu
 * vergessen — aus einem Startabbruch wuerde dann eine unbehandelte Rejection, die NICHTS
 * abbricht. Die Begruendung ist woertlich uebernommen aus
 * `src/app/m/lagerbuch/_lib/boot.ts:21-26` und hier nicht neu erfunden.
 */
export async function radioBootFehler(env: EnvLike = process.env): Promise<string[]> {
  /*
   * ⛔ DER SCHALTER IST DIE ERSTE ANWEISUNG (Spec:5915-5917). `prodHostsFor` liest
   * `SUITE_HOST_RADIO` und faellt sonst auf `mod.prodHosts` zurueck
   * (`src/core/registry.ts:233-235`); mit `prodHosts: []` (`:199`) ist er genau „der
   * Betreiber hat radio eingeschaltet". Eine unbedingte Pflicht hiesse, die Suite startet
   * ab dem ersten Image mit `radio` nicht mehr, bis die .env ergaenzt ist — „dieses Modul
   * blockierte damit jeden unbeteiligten Deploy im Fenster zwischen Merge und Cutover"
   * (Spec:5921-5926). ⛔ Es ist DIESELBE Variable, die das Modul einschaltet; einen
   * zweiten, vergessbaren gibt es nicht.
   */
  const radioHosts = prodHostsFor(getModule("radio"), env);
  if (radioHosts.length === 0) return [];

  /*
   * Pruefungen 3, 5 und 6 der Achtertafel — die vier Zahlen aus `ZAHLEN`, das
   * Sitzungsgeheimnis und die Gate-Ungleichungskette. Sie liegen in `_lib/grenzen.ts`,
   * weil sie die modul-private `ZAHLEN`-Tabelle brauchen und die ausdruecklich NICHT
   * exportiert wird (`_lib/grenzen.ts:96-105`). `grenzenFehler()` faengt die Wuerfe von
   * `zahl()` selbst ab und liefert immer eine Liste.
   */
  const fehler: string[] = [...grenzenFehler(env)];

  /*
   * Pruefung 1 — SUITE_ADMIN_GROUP_RADIO ist gesetzt und nicht leer.
   *
   * ⚠️ GELESEN WIRD DIE VARIABLE DIREKT, NICHT UEBER `adminGroupsFor`. Die faellt bei
   * nicht gesetzter Variable still auf `mod.adminGroups` zurueck
   * (`src/core/groups.ts:102-108`), also auf den ENTWICKLUNGS-Vorgabewert
   * `["iuk-radio-admin"]` (`src/core/registry.ts:198`) — und meldete nichts. Die Frage hier
   * ist eine andere: HAT DER BETREIBER DIE PRODUKTIVE GRUPPE GESETZT?
   */
  const adminGruppen = (env.SUITE_ADMIN_GROUP_RADIO ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
  if (adminGruppen.length === 0) {
    fehler.push(
      `SUITE_ADMIN_GROUP_RADIO ist nicht gesetzt oder leer. Ohne sie greift der ` +
        `Entwicklungs-Vorgabewert aus dem Registry ("iuk-radio-admin"); ist in Pocket ID ` +
        `niemand in dieser Gruppe, ist die Folge ein STUMMES 404 fuer ALLE Verwaltenden — ` +
        `fuer dieses Modul gibt es bewusst KEINE Suite-Admin-Rueckfallebene ` +
        `(Betreiber-Entscheidung 9). Der Wert wandert 1:1 aus OIDC_ADMIN_GROUP der alten ` +
        `stack.env. ⚠️ Diese Pruefung faengt den LEEREN, nicht den FALSCHEN Wert.`,
    );
  }

  /*
   * Pruefung 2 — SUITE_ACCESS_GROUP_RADIO ist NICHT gesetzt.
   *
   * ⛔ `!== undefined`, NICHT `!== ""`. Ein GESETZTER Wert waere still wirkungslos:
   * `canAccess` steigt bei `requiresAuth: false` sofort mit `true` aus
   * (`src/core/registry.ts:265`) und liest `requiredGroups` nie; `validateGroupConfig`
   * meldet nur den LEER gesetzten Fall. Der Betreiber setzte also eine Zugangsgruppe,
   * bekaeme keine Warnung, und das Modul bliebe fuer jeden offen.
   */
  if (env.SUITE_ACCESS_GROUP_RADIO !== undefined) {
    fehler.push(
      `SUITE_ACCESS_GROUP_RADIO ist gesetzt und waere fuer dieses Modul WIRKUNGSLOS. ` +
        `radio traegt requiresAuth: false (zwingend — der Kiosk und /t/<code> werden ohne ` +
        `jede Suite-Sitzung aufgerufen); canAccess steigt damit sofort mit true aus und ` +
        `liest requiredGroups nie. Ausweg: die Zeile ersatzlos entfernen. Wer den ` +
        `Verwaltungszugang steuern will, setzt SUITE_ADMIN_GROUP_RADIO.`,
    );
  }

  // Pruefung 4 — RADIO_HISTORIE_MONATE (E-G3, oben).
  const monateFehler = historieMonateFehler(env);
  if (monateFehler !== null) fehler.push(monateFehler);

  /*
   * ── DIE ZWEI MELDENDEN PRUEFUNGEN (§7.3.4) — `console.warn`, KEIN Rueckgabewert.
   *
   * Grenzregel woertlich (Spec:5936-5938): „Werfen darf nur, was `radio` fuer seine eigenen
   * Nutzer falsch macht und im Repo bzw. in der .env behebbar ist. Alles, was erst am
   * Server sichtbar wird und dort behoben werden muss, meldet — sonst steht die Suite am
   * Cutover-Abend still, weil eine Traefik-Zeile fehlt."
   *
   * ⚠️ BEIDE SCHWEIGEN, WENN `SUITE_TRAEFIK_RULE` FEHLT ODER LEER IST: ein Dev-Container
   * hat die Variable legitim nicht, und eine Warnung ueber eine Regel, die es nicht gibt,
   * waere Laerm an genau der Stelle, an der das Runbook auf Stille prueft.
   *
   * ⛔ `warn` = Stopp, `info` = Zustand. Zusage an Spec 2: das Runbook liest nach dem Start
   * einmal `docker compose logs --since 2m suite` und erwartet KEINE `[radio]`-WARNUNG;
   * eine gefundene ist ein Stopp-Punkt, kein Hinweis.
   */
  const traefikRegel = env.SUITE_TRAEFIK_RULE?.trim() ?? "";
  if (traefikRegel !== "") {
    const genannt = hostsInTraefikRegel(traefikRegel);
    const genanntKlein = genannt.map((h) => h.toLowerCase());

    /*
     * `radioHosts` ist bereits kleingeschrieben — `envHostsFor` senkt beim Lesen
     * (`src/core/hosts.ts:44`). Das `.toLowerCase()` hier ist trotzdem kein toter Code: es
     * haelt die Zusage an DIESER Stelle fest, statt sie aus einer fremden Datei zu leihen,
     * und der Registry-Rueckfall `mod.prodHosts` (`src/core/registry.ts:199`) laeuft durch
     * `envHostsFor` gar nicht erst hindurch.
     */
    const fehlende = radioHosts.filter((h) => !genanntKlein.includes(h.toLowerCase()));
    if (fehlende.length > 0) {
      console.warn(
        `[radio] SUITE_HOST_RADIO nennt ${fehlende.join(", ")}, aber SUITE_TRAEFIK_RULE ` +
          `nennt diesen Host nicht. Traefik leitet die Domain dann nicht an die Suite ` +
          `weiter, und die Seite bleibt am Cutover-Abend unerreichbar. Zu ergaenzen ist in ` +
          `der .env eine weitere Host()-Klausel. KEIN Startabbruch: die Traefik-Labels ` +
          `leben serverseitig (compose.yaml:153), und ein Abbruch traefe genau dann, wenn ` +
          `der Betreiber die .env gerade umstellt.`,
      );
    }

    const altHosts = genannt.filter((h) => h.toLowerCase().startsWith("radio-admin."));
    if (altHosts.length > 0) {
      console.warn(
        `[radio] SUITE_TRAEFIK_RULE nennt ${altHosts.join(", ")} — der ALT-Host ` +
          `radio-admin.* darf dort ausdruecklich NICHT stehen. moduleForHost findet fuer ` +
          `ihn kein Modul und faellt auf PORTAL zurueck statt auf die Weiterleitung ` +
          `(Analyse-Falle 28, docs/radio-portierung-analyse.md:1646-1652); der Alt-Kiosk ` +
          `bekaeme also die Portal-Startseite statt des Wegs ins neue Modul. Zu entfernen ` +
          `ist die Host()-Klausel aus der .env.`,
      );
    }
  }

  /*
   * ── DIE ZWEI MELDE-ZEILEN — `console.info`, KEIN Rueckgabewert, KEINE Pruefungen.
   *
   * Zeile 1 (NS-V4): der Zustand von SUITE_UPDATER_GROUP_RADIO.
   * ⛔ EIN GESETZTER, ABER LEERER WERT IST GUELTIG („niemand ist Updater") und darf NICHT
   * abbrechen; ein Tippfehler ist von aussen nicht unterscheidbar. Deshalb prueft dieser
   * Helfer nicht den INHALT, sondern meldet den ZUSTAND laut — und er nennt den gelesenen
   * Wert, weil nur daran ein Mensch den Tippfehler sieht. Ein Gruppenname ist kein
   * Geheimnis; ⬜ E1b/V-L1 (wie die Gruppe heisst) ist vor Cut 26 faellig.
   */
  const updater = env.SUITE_UPDATER_GROUP_RADIO;
  const updaterZustand =
    updater === undefined
      ? `NICHT GESETZT — die Updater-Stufe ist geschlossen, nur die Admin-Stufe verwaltet`
      : updater.trim() === ""
        ? `GESETZT UND LEER — gueltig: niemand ist Updater`
        : `GESETZT auf "${updater.trim()}"`;
  console.info(
    `[radio] SUITE_UPDATER_GROUP_RADIO ist ${updaterZustand}. Diese Zeile ist ein ZUSTAND, ` +
      `kein Stopp-Punkt (NS-V4) — ein Tippfehler im Gruppennamen ist von aussen nicht von ` +
      `einer absichtlich unbesetzten Stufe zu unterscheiden, also meldet der Start den ` +
      `gelesenen Wert, statt ihn zu bewerten.`,
  );

  /*
   * Zeile 2 (⬜ G-L2, entschieden): existierte `radio.db` vor diesem Start?
   *
   * ⛔ SIE STEHT HIER UND NICHT IN `starteRadioHintergrund()`, weil sie dort gemessen NIE
   * feuern koennte: `src/instrumentation.ts:56` ruft `migrateAllModules()` VOR `:60`
   * `startBackgroundWork()`, und `src/core/bootstrap.ts:114` legt ueber
   * `openModuleDatabase(moduleDbPath("radio"))` Verzeichnis UND Datei an
   * (`src/core/db/index.ts:12-17`). Wenn der Takt laeuft, existiert `radio.db` IMMER.
   *
   * ⛔ `info` UND NICHT `warn`: beim ERSTEN Deploy — der traegt den Abraeum-Worker und
   * liegt VOR dem Import — ist die Abwesenheit legitim; ein `warn` machte einen
   * vorgeschriebenen, normalen Deploy zum Stopp-Punkt nach der Zusage oben. Ihre
   * Alarmwirkung holt das Runbook, indem es diese Zeile an einem benannten Punkt NACH dem
   * Import NICHT sehen darf (Zusage 16 an Spec 2) — dort waere sie der Hinweis auf ein
   * nicht gemountetes Volume.
   */
  const dbPfad = moduleDbPath("radio");
  if (!existsSync(dbPfad)) {
    console.info(
      `[radio] ${dbPfad} existierte vor diesem Start nicht — die Datei wird von ` +
        `migrateAllModules() gleich neu angelegt. Vor dem Import ist das der Normalfall. ` +
        `NACH dem Import bedeutet diese Zeile, dass das Datenverzeichnis nicht gemountet ` +
        `ist und die importierten Leihen und Geraete nicht sichtbar sein werden.`,
    );
  }

  return fehler;
}
