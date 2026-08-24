import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/core/auth";
import { adminGroupsFor } from "@/core/groups";
import { getModule, prodHostsFor } from "@/core/registry";
import { resolveHost } from "@/core/routing";
import { getDb } from "../_db/client";
import type { DB } from "../_db/client";
import { users } from "../_db/schema";
import { istRadioHost, requireRadioHost } from "./host";
import type { RadioRolle } from "./rollen";

/**
 * DER ZUGANG ZUR VERWALTUNG (Spec 1 §1.5, Zeilen 637-701). KEIN "use client" (Falle 6).
 *
 * ZWEI FORMEN, EINE REGEL: der werfende Riegel `requireRadioAdmin` gehoert in die beiden
 * Verwaltungs-Layouts und in JEDE Verwaltungs-Action; das nicht-werfende Paar
 * `viewerOderNull` + `istRadioAdmin` gehoert dorthin, wo „keine Sitzung" ein DRITTER
 * gueltiger Fall ist und kein Fehlerfall — namentlich an den /admin-Link auf der
 * Ausleihflaeche (Spec:2919-2920, Planteil 3).
 *
 * ⚠️ DIE GRENZE GEHOERT ZUR REGEL: „Praedikat in Weichen" gilt NICHT fuer `_actions/`.
 * Eine Action hat keine Weiche — sie hat einen Aufrufer, der schon entschieden hat. Der
 * Guard-Scan dafuer liegt in `_actions/guards.test.ts` (Kapitel 3 §3.8, Planteil 3) und
 * ausdruecklich NICHT in `riegel.test.ts` (korrigiert, B14, Spec:103/714).
 */

/**
 * DREI FELDER, NICHT VIER — und der Name ist `RadioViewer`, nicht `Viewer`.
 *
 * ⚠️ DIE SPEC WIDERSPRICHT SICH HIER UND LOEST ES NICHT AUF. Spec:648 schreibt
 * `RadioViewer` mit `{ sub, name, groups }`; Spec:2794 schreibt `Viewer` mit
 * `{ sub, groups, name, email }` (Spec:2793 ist der Dateikommentar darueber). Kein A-
 * oder B-Punkt behandelt den Unterschied.
 *
 * ENTSCHIEDEN ZUGUNSTEN VON KAPITEL 1, aus einem GEMESSENEN Grund und nicht aus
 * Rangfolge: `lagerbuch`s vierfeldriger `Viewer` existiert, weil `merkeNutzer` `name` UND
 * `email` in `users` schreibt (src/app/m/lagerbuch/_lib/zugang.ts:32-38). Die
 * `users`-Tabelle von `radio` hat DREI Spalten und KEINE E-Mail
 * (`src/app/m/radio/_db/schema.ts:113-117`: `sub`, `name`, `lastSeenAt`). Ein
 * `email`-Feld haette in diesem Modul heute keinen Konsumenten — und ein Feld ohne
 * Konsument ist eine Zusage ohne Traeger.
 *
 * ⬜ Braucht Planteil 4 spaeter eine E-Mail, ist das eine Schema-Aenderung (neue Spalte,
 * neue Migration) UND eine Erweiterung hier — nicht nur hier.
 *
 * ✅ DIE ZWEITE KOLLISION IST AUFGELOEST — ENTSCHIEDEN IN PLANTEIL 4, AUFGABE V3.
 * `name` ist hier `string | null`, `radio`s Spalte ist `.notNull()`
 * (`src/app/m/radio/_db/schema.ts:115`). `lagerbuch` traegt denselben Fall nicht, weil seine
 * Spalte nullable ist (`src/app/m/lagerbuch/_db/schema.ts:438`: `name: text("name")`).
 * Zur Wahl standen ein BENANNTER Rueckfall oder eine Migration, die die Spalte nullable macht.
 * ⛔ GEWAEHLT IST DER BENANNTE RUECKFALL, und sein Wert ist der ROHE `sub` — er steht an der
 * Zeile selbst (`merkeNutzer` unten). Zwei Gruende, in dieser Reihenfolge: (1) eine Migration
 * ist in diesem Planteil verboten, Migrationen sind append-only und eine ueberfluessige ist
 * eine Absturzschleife im Container; (2) der `sub` ist genau der Wert, den der Bestand auf der
 * LESEseite einsetzt — `resolveUserNames` faellt beim Aufloesen von `changedBy` auf den rohen
 * `sub` zurueck, „so the field is never blank"
 * (radio-admin/server/src/routes/devices.ts:70-78). Ein `""` oder ein „Unbekannt" waere ein
 * dritter, erfundener Wert.
 */
export type RadioViewer = { sub: string; name: string | null; groups: string[] };

/**
 * Sitzung -> Viewer, OHNE Wurf und OHNE IO — damit der Test sie ohne `auth()`-Mock fahren
 * kann (Spec:650).
 *
 * Ohne `user.id` gibt es keinen Viewer; ein fehlender `groups`-Claim ist die LEERE MENGE
 * und laeuft damit in den 404 des Riegels, nicht in einen 500 — sonst haenge die
 * Fehlerform an der Token-Version (src/app/m/lagerbuch/_lib/zugang.ts:40-42).
 */
export function viewerAusSession(
  session: { user?: { id?: string; groups?: string[]; name?: string | null } } | null,
): RadioViewer | null {
  const id = session?.user?.id;
  if (!id) return null;
  return {
    sub: id,
    name: session.user?.name ?? null,
    groups: session.user?.groups ?? [],
  };
}

/**
 * DIE NICHT-WERFENDE FORM — fuer das Gate und fuer den /admin-Link der Ausleihflaeche.
 *
 * ⛔ SIE RUFT `requireRadioHost` ABSICHTLICH NICHT (Spec §1.4.4, Gegenregel, Zeilen
 * 595-607). Das Gate ist die Flaeche, die eine ANONYME Person zuerst sieht;
 * `requireRadioAdmin()` an ihrer Weiche schickte jeden anonymen Aufruf nach /login statt
 * aufs Gate — genau der Ausfall, den `requiresAuth: false` verhindern soll. Und ein
 * Host-Riegel HIER machte aus der Sichtbarkeitsfrage eine Sperre.
 *
 * ⚠️ `riegel.test.ts` (Klausel d) haelt diese Abwesenheit als Quelltext-Zusicherung fest —
 * sie ist die einzige Aussage dieser Datei, die man nicht durch Aufrufen beweisen kann.
 */
export async function viewerOderNull(): Promise<RadioViewer | null> {
  return viewerAusSession(await auth());
}

/**
 * DAS PRAEDIKAT — `adminGroupsFor(getModule("radio"))` + `.some()`, selbst gebaut.
 *
 * ⛔ BEWUSST NICHT `isModuleAdmin` AUS `core/groups` und keiner seiner drei Verwandten
 * (Kapitel-4-Pflicht 17, docs/radio-portierung-analyse.md:979-997). Alle vier tragen den
 * Suite-Admin-Kurzschluss — `src/core/groups.ts:125` steigt woertlich mit
 * `if (groups.includes(suiteAdminGroup(env))) return true;` aus. Ein Import saehe wie
 * Wiederverwendung aus.
 *
 * DER ANLASS IST MODULEIGEN: hinter /admin liegen Klarnamen samt Bewegungshistorie und
 * die Enrollment-Codes. Betrieb und Einsicht sind zwei Rollen; wer den Server betreibt,
 * hat damit noch keinen Anlass, die Bewegungen einer Bereitschaft zu lesen oder
 * Zugangscodes zu drucken. Wer `radio` verwalten soll, gehoert in das, was
 * SUITE_ADMIN_GROUP_RADIO benennt — auch der Betreiber selbst (Entscheidung 9).
 *
 * `canAdminModule` ist dabei der teuerste der vier: es ist die hausuebliche
 * SICHTBARKEITSfrage und zeigte dem Suite-Admin einen Verwaltungs-Eintrag, dessen Ziel
 * `requireRadioAdmin` mit 404 beantwortet — genau der Zustand, den
 * `docs/design/README.md:420` ausschliesst („fuehrt KEIN Weg dorthin, wo die aufrufende
 * Person nicht hindarf?").
 *
 * `adminGroupsFor(mod)`, NIE `mod.adminGroups` — der direkte Feldzugriff macht
 * SUITE_ADMIN_GROUP_RADIO an genau dieser Stelle wirkungslos (src/core/registry.ts:29-35
 * schreibt dieselbe Falle fuer prodHosts aus). Und NIE `canAccess`: das gewaehrt bei
 * leerer Liste `true` (`src/core/registry.ts:263`) und steigt unter `requiresAuth: false`
 * ohnehin sofort aus (`:260`).
 *
 * ⚠️ `.some()` AUF LEERER LISTE GEWAEHRT NICHTS — das ist richtig und es ist Falle 23:
 * ein LEER gesetztes SUITE_ADMIN_GROUP_RADIO sperrt damit JEDEN aus, den Betreiber
 * eingeschlossen, und wird NICHT gemeldet (docs/radio-portierung-analyse.md:1547-1576).
 * Die Abhilfe ist eine Runbook-Zeile, kein Zweig hier: ein „leer bedeutet alle"-Zweig
 * waere die Sperre, die sich selbst abschaltet.
 *
 * ✅ DIE ZWEITE RECHTESTUFE (Updater) IST GEBAUT — PLANTEIL 4, AUFGABE V3, und sie steht
 * unmittelbar unter dieser Funktion (`updaterGruppe`, `istInUpdaterGruppe`, `istRadioUpdater`).
 * ⛔ DIE AUFLAGE DARUNTER BLEIBT BINDEND: sie ist eine ZWEITE FUNKTION, kein `||` hier.
 * Entschieden ist sie (C.6 / B4, 2026-08-21: zwei Rollen wie im Bestand). Spec:191 sagt es
 * ausdruecklich: wer `radio` eine zweite Rolle gibt,
 * „baut sie modulintern — das ist nicht Sache dieses Kapitels".
 * ⚠️ DAS ZITAT TRAEGT NUR SO WEIT WIE SEINE FUNDSTELLE (REVIEW-Z4, Fund K5): Spec:191 ist
 * die `requiredGroups`-Zeile der Registry-Tabelle, der Satz gilt dort EINEM Weg — dem
 * Zweckentfremden von `SUITE_ACCESS_GROUP_RADIO` —, nicht der Updater-Stufe allgemein. Die
 * tragende Fundstelle fuer „nicht hier, sondern Planteil 4" ist Spec:4420-4422 — sie steht
 * in diesem Kommentar wenige Zeilen tiefer, an der GRUPPENQUELLE.
 *
 * ⚠️ ZWEI DINGE, DIE MAN LEICHT VERWECHSELT, UND DIE SPEC TRENNT SIE:
 *   - die FELD-ALLOWLIST liegt in einer EIGENEN Datei mit eigenem Test (`_lib/rollen.ts` /
 *     `_lib/rollen.test.ts`, gebaut in Planteil 4 / V2). ⚠️ Die GRUPPENQUELLE dagegen kommt
 *     HIERHER, nicht dorthin — Grund gemessen in `_lib/rollen.ts:7-19`; Spec:4420-4422.
 *   - der ZUGRIFFSRIEGEL beider Stufen liegt in DIESER Datei: Spec:4287-4288 fuehrt
 *     `requireRadioAdmin` UND `requireRadioVerwaltung` (werfend) sowie `istRadioAdmin`
 *     UND `istRadioUpdater` (Praedikate) unter `zugang.ts`. Planteil 4 traegt sie HIER
 *     nach — die Naht ist also hier, nicht woanders.
 *
 * ⛔ AUFLAGE AN PLANTEIL 4, DAMIT DIE NAHT NICHT ZUR AUFWEICHUNG WIRD: die zweite Stufe
 * kommt als ZWEITE FUNKTION dazu (`requireRadioVerwaltung`, `istRadioUpdater`), NICHT als
 * `||` in `istRadioAdmin`. Spec:4367 setzt `admin/(arbeit)/layout.tsx` auf
 * `requireRadioVerwaltung()`, Spec:4368 laesst `admin/(druck)/layout.tsx` bei
 * `requireRadioAdmin()`, und Spec:4369-4378 verteilt die zehn Seiten einzeln.
 * ⛔ DABEI BLEIBEN DREI DER ZEHN AUF `requireRadioAdmin()` — `admin/(arbeit)/versionen`
 * (Spec:4376), `admin/(arbeit)/zugaenge` (Spec:4377) und `admin/(druck)/zugaenge/blatt`
 * (Spec:4378); sie tragen die Zugangscodes. Wer nur `Spec:4369-4375` liest, setzt
 * `requireRadioVerwaltung()` auf ALLE zehn und senkt genau die drei Flaechen ab,
 * derentwegen `riegel.test.ts` (Klausel a) ueberhaupt pfadsensitiv gebaut ist. Klausel (a)
 * laesst im Arbeits-Zweig beide Namen zu; die Aufweichung dagegen faengt `zugang.test.ts`
 * ab. ⚠️ Auf der ACTION-Achse gilt dasselbe: Spec:4380 sagt „`requireRadioVerwaltung()`
 * BZW. `requireRadioAdmin()`", nicht „immer der eine".
 *
 * Der Gruppenname ist ⬜ E1b
 * (docs/superpowers/plans/SPERREN-radio-spec2.md:110), der Bestand nennt als Default
 * `personal` (radio-admin/.env.example:15) — beides ist HIER kein Wert, sondern ein
 * Verweis.
 *
 * ⛔ UND DIE RICHTUNG, IN DER DIESE FUNKTION NICHT WACHSEN DARF: `istRadioAdmin` bleibt
 * die ADMIN-Stufe. Im Bestand gewinnt `admin` bei Ueberschneidung, und `updater` ist
 * STRIKT WENIGER: `mapGroupsToRole` gibt `admin` vor `updater`
 * (radio-admin/shared/src/role.ts:3-10, Faelle in role.test.ts:4-33); ELF Routen sind
 * hart admin-only ueber `requireRole('admin')` — radio-admin/server/src/routes/
 * devices.ts:99,188, softwareVersions.ts:30,40,48,56, loans.ts:28, tokens.ts:22,44,47,
 * export.ts:71 —, und der Rest wird ueber die FELD-Allowlist in
 * shared/src/editable-fields.ts:1-18 gefiltert, nicht ueber eine zweite Routensperre.
 * ⚠️ Ein `grep` auf `requireRole('admin')` unter `radio-admin/server/src/routes/` liefert
 * ZWOELF Zeilen; die zwoelfte (export.ts:66) steht in einem Kommentar und ist keine Route.
 * ⚠️ In `role.ts`/`role.test.ts` steht nur die Rangfolge; `requireRole` kommt dort NICHT
 * vor. Wer die Updater-Gruppe hier mit `||` danebenstellt, macht aus einer Verfeinerung
 * eine AUFWEICHUNG: jeder Updater kaeme dann durch jeden Admin-Riegel, und
 * `pnpm typecheck`, `pnpm lint` und `pnpm build` blieben gruen. `zugang.test.ts` haelt
 * diese eine Richtung fest.
 */
export function istRadioAdmin(viewer: RadioViewer | null): boolean {
  if (!viewer) return false;
  const erlaubt = adminGroupsFor(getModule("radio"));
  return viewer.groups.some((g) => erlaubt.includes(g));
}

/**
 * DIE GRUPPENQUELLE DER ZWEITEN STUFE — und sie liegt HIER und nicht in `_lib/rollen.ts`.
 *
 * ⚠️ BENANNTE ABWEICHUNG VON `Spec:4415-4425` und `Spec:4843-4845`, die beide die
 * Gruppenquelle in `_lib/rollen.ts` fuehren. Der Grund ist gemessen und steht im
 * Kopfkommentar dort (`_lib/rollen.ts:7-19`): dieselbe Datei liefert `UPDATER_FELDER` als
 * WERT an eine `"use client"`-Insel und liegt damit im Browser-Bundle. Eine
 * Umgebungsvariable ohne den Praefix, den Next in den Browser reicht, ist dort schlicht
 * nicht gesetzt — die Stufenpruefung gaebe still `false`. Diese Datei wird ausschliesslich
 * serverseitig gelesen.
 *
 * ⛔ EIN EIGENER MECHANISMUS, KEINE REGISTRY-UEBERSCHREIBUNG: `src/core/registry.ts` kennt je
 * Modul genau zwei, `SUITE_HOST_<KEY>` und `SUITE_ADMIN_GROUP_<KEY>` (`CLAUDE.md:139-140`).
 * Eine zweite Gruppe ist dort nicht vorgesehen.
 *
 * ⛔ LEER, FEHLEND ODER NUR LEERRAUM SCHLIESST DIE STUFE (`Spec:4420-4422`, ausgeliefert in
 * `.env.example:107-114`): dann ist NIEMAND Updater. Das ist hier die richtige Richtung —
 * anders als bei SUITE_ADMIN_GROUP_RADIO, wo leer eine stille Aussperrung ALLER ist
 * (Falle 23). Einen „leer bedeutet alle"-Zweig gibt es in keinem der beiden Faelle.
 *
 * ⛔ GETRIMMT WIRD DIE VARIABLE, NICHT DIE GRUPPENLISTE: ein Tippfehler in der `.env`
 * (` name `) truege sonst eine Gruppe, in der niemand ist — still. Der Vergleich selbst
 * bleibt ZEICHENGLEICH, 1:1 aus `radio-admin/shared/src/role.ts:8`
 * (`groups.includes(cfg.updaterGroup)`); ein normalisierender Vergleich waere eine
 * Rechteerweiterung, die kein Tor sieht.
 *
 * ⬜ V-L1 / E1b — wie die Gruppe in PRODUKTION heisst, weiss nur der Betreiber; faellig vor
 * Cut 26 (`docs/superpowers/plans/SPERREN-radio-spec2.md:110`). Hier steht deshalb KEIN
 * Gruppenname, sondern nur der Zugriff; `.env.example:114` traegt einen auskommentierten
 * Vorschlag.
 */
export function updaterGruppe(): string | null {
  const roh = process.env.SUITE_UPDATER_GROUP_RADIO?.trim();
  return roh ? roh : null;
}

/** Nur die Gruppenliste, ohne Sitzung — der pruefbare Kern von `istRadioUpdater`. */
export function istInUpdaterGruppe(gruppen: string[]): boolean {
  const gruppe = updaterGruppe();
  if (!gruppe) return false;
  return gruppen.includes(gruppe);
}

/**
 * DAS PRAEDIKAT DER ZWEITEN STUFE — neben `istRadioAdmin`, NICHT in ihm.
 *
 * ⛔ ES RUFT `requireRadioHost` NICHT (Gegenregel §1.4.4, Spec:595-607) — dieselbe Richtung
 * wie bei `viewerOderNull` (`_lib/zugang.ts:77-81`): ein Praedikat beantwortet eine FRAGE und
 * baut keine Sperre; der Host-Riegel steht EINMAL, im werfenden Riegel `riegelAufStufe`.
 * `_lib/zugang.test.ts` haelt die Abwesenheit als Rumpf-Scan fest.
 *
 * ⛔ `admin` BLEIBT STRIKT STRENGER ALS `updater`. Im Bestand gewinnt `admin` bei
 * Ueberschneidung, WEIL DIE PRUEFUNG ZUERST STEHT (`radio-admin/shared/src/role.ts:7-8`);
 * die Rangfolge wird in `requireRadioVerwaltung` unten genauso gebildet. Wer die zwei
 * Praedikate hier mit `||` verschmilzt, macht aus einer Verfeinerung eine AUFWEICHUNG.
 */
export function istRadioUpdater(viewer: RadioViewer | null): boolean {
  if (!viewer) return false;
  return istInUpdaterGruppe(viewer.groups);
}

/**
 * DIE EINZIGE STELLE, AN DER FALLE 23 UEBERHAUPT SICHTBAR WIRD.
 *
 * Spec:206-210 verlangt sie ausdruecklich und nennt sie so: „Das gehoert als Zeile in die
 * `.env.example` und ins Runbook — UND ALS PROTOKOLLZEILE IN DEN RIEGEL SELBST:
 * `meldeFehlendeGruppe` aus 1.5 ist die einzige Stelle, an der dieser Zustand ueberhaupt
 * sichtbar wird." Die Bauform steht ausgeschrieben in Spec:4348.
 *
 * ⚠️ DER ZUSTAND, DEN SIE SICHTBAR MACHT, IST GUELTIGE KONFIGURATION: ein leer gesetztes
 * SUITE_ADMIN_GROUP_RADIO wird von `validateGroupConfig` NICHT gemeldet
 * (src/core/groups.ts:156, begruendet :136-140), und `.some()` auf leerer Liste gewaehrt
 * nichts. Kein Test kann das verhindern; ohne diese Zeile gibt es aber auch KEIN Signal —
 * die Verwaltung antwortet dann stumm mit 404, fuer jeden, den Betreiber eingeschlossen.
 *
 * Form 1:1 aus `src/app/m/lagerbuch/_lib/zugang.ts:135-151` (Begruendung dort
 * :118-134): dedupliziert ueber einen prozess-lokalen Set, damit ein Abweisungssturm das
 * Protokoll nicht flutet. ⛔ KEINE Kennung, keine E-Mail, kein Name in der Zeile — der
 * `sub` dient AUSSCHLIESSLICH als Dedup-Schluessel im Speicher und steht nicht in der
 * Ausgabe.
 *
 * ⚠️ ANNAHME, wie dort: der Set waechst mit der Zahl abgewiesener PERSONEN, nicht mit der
 * Zahl der Anfragen — bei einer Organisation dieser Groesse eine dreistellige Obergrenze
 * ohne Verdraengungsbedarf.
 */
const bereitsGemeldet = new Set<string>();

function meldeFehlendeGruppe(sub: string, gruppen: string[]): void {
  if (bereitsGemeldet.has(sub)) return;
  bereitsGemeldet.add(sub);
  console.warn(
    `[radio] Zugriff auf /admin abgelehnt: keine der Gruppen ` +
      `${JSON.stringify(adminGroupsFor(getModule("radio")))} in den Token-Gruppen ` +
      `${JSON.stringify(gruppen)}. Pruefe SUITE_ADMIN_GROUP_RADIO und ob Pocket ID ` +
      `einen "groups"-Claim mit dieser Gruppe ausliefert.`,
  );
}

/**
 * Nur fuer Tests: den prozess-lokalen Dedup-Speicher leeren (Vorbild
 * `src/app/m/lagerbuch/_lib/zugang.ts:148-151`).
 *
 * ✅ SEIT PLANTEIL 4 / V3 HAT SIE IHREN AUFRUFER (bis dahin ⬜, REVIEW-Z4 Fund K1): das
 * `beforeEach` der Verhaltensfaelle in `src/app/m/radio/_lib/zugang.test.ts` ruft sie vor
 * JEDEM Fall. Der vorhergesagte Fehlschlag ist genau der Grund: `bereitsGemeldet` ist
 * prozess-lokal und ueberlebt jeden Fall der Datei — ohne die Zeile saehe der Fall, der die
 * Protokollzeile PRUEFT, null Aufrufe, sobald ein frueherer Fall denselben `sub` abgewiesen
 * hat. Der Weg ist im Vorbild vorgefuehrt —
 * `src/app/m/lagerbuch/_lib/zugang.test.ts:41` (Import), `:72` (Aufruf), Begruendung
 * `:60-71`; dort hat genau dieser Weg einen ECHTEN Fehlschlag gefunden.
 */
export function _resetGemeldeteGruppen(): void {
  bereitsGemeldet.clear();
}

/**
 * ABSOLUTES ZIEL FUER DIE `callbackUrl` DER SUITE-ANMELDUNG: `<proto>://<host>/admin`.
 *
 * Warum absolut und nicht `/admin`: die Anmeldung laeuft ueber den SUITE-Pfad `/login`
 * (Passthrough, Spec:354-358), und ein relatives Ziel loeste sich dort gegen den
 * Anmelde-Host auf, nicht gegen den Radio-Host.
 *
 * Reihenfolge der Herleitung, 1:1 aus `src/app/m/lagerbuch/_lib/zugang.ts:205-214`: der
 * konfigurierte Prod-Host gewinnt; fehlt er (vor dem Cutover der Normalfall), gilt der
 * ANGEFRAGTE Host — aber nur, wenn er der Radio-Host ist; sonst bleibt der interne Pfad.
 *
 * ⛔ `istRadioHost` IST HIER RICHTIG, `requireRadioHost` WAERE FALSCH. Die Funktion
 * beantwortet die Frage „darf ich den angefragten Host in eine absolute URL schreiben?",
 * wirft nicht, und ist deshalb kein Verstoss gegen die Gegenregel aus §1.4.4. Wer hier die
 * werfende Form einsetzt, macht aus der callbackUrl-Berechnung eine zweite Sperre — und
 * `requireRadioAdmin` hat seinen Host-Riegel schon eine Zeile vorher. Und wer stattdessen
 * `resolveHost` ein zweites Mal auswertet, baut die zweite Host-Aufloesung, vor der
 * `./host.ts` in seinem Kopf warnt.
 *
 * EXPORTIERT, obwohl ausser dem Test und `requireRadioAdmin` niemand sie ruft: nur so ist
 * der Zweig „Prod-Host vs. angefragter Host" pruefbar, ohne einen `redirect()`-Wurf zu
 * zerlegen.
 *
 * ⬜ L7 haengt an dieser Funktion UND am `redirect()` unten: der vollstaendige
 * `Location`-Kopf — Statuscode (307 oder 302) sowie Protokoll und Host — wird beim
 * Cutover abgelesen (docs/superpowers/plans/2026-08-18-plan4-radio-cutover.md:2091),
 * NICHT hier. `redirect()` waehlt den Code zur Laufzeit; ein hier festgeschriebenes „302"
 * waere eine Zusage ueber eine Bauform, die Spec 1 nicht festlegt.
 */
export function verwaltungsZiel(headersEingang: Headers): string {
  const angefragt = resolveHost(headersEingang);
  const host =
    prodHostsFor(getModule("radio"))[0] ??
    (istRadioHost(headersEingang) ? angefragt.split(":")[0] : undefined);
  if (!host) return "/m/radio/admin";
  const proto = headersEingang.get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  const port = angefragt.split(":")[1];
  return `${proto}://${host}${port ? `:${port}` : ""}/admin`;
}

/**
 * DER AUTH-BACKSTOP DES MODULS — eine Stelle, zwei Aufrufergruppen: die beiden
 * Verwaltungs-Layouts (Z6) und JEDE Verwaltungs-Action (Planteil 4).
 *
 * ⚠️ DIE HOST-ZEILE STEHT HIER ZUSAETZLICH, NICHT ERSATZWEISE (Spec:669-673, Schicht iii).
 * Die Layouts rufen `requireRadioHost` ohnehin, aber diese Funktion wird auch aus SERVER
 * ACTIONS gerufen, und die haben KEIN Layout ueber sich. Der doppelte Aufruf kostet einen
 * Header-Lookup. FUER DIE VERWALTUNG IST DAS KEIN AUTORISIERUNGSGEWINN (das Praedikat ist
 * host-blind und vollstaendig: eine Admin-Action auf fremdem Host verlangt dieselbe
 * Gruppe wie auf der eigenen Domain), sondern die Vermeidung einer ZWEITEN
 * FUNKTIONIERENDEN HERKUNFT des Moduls. ⛔ Wer sie fuer doppelt haelt und entfernt,
 * oeffnet genau diese Luecke (Kapitel-4-Pflicht 16,
 * docs/radio-portierung-analyse.md:973-977).
 *
 * ERST DER HOST, DANN DIE PERSON. So verraet ein anonymer Aufruf auf einem fremden Host
 * die Verwaltungsroute nicht ueber einen vorgeschalteten Login-Umweg.
 *
 * `notFound()` STATT 403 (Spec:691-694, §1.5): was nicht freigegeben ist, sieht in dieser
 * Suite genauso aus wie etwas, das es nicht gibt. `/admin/kein-zugriff` gibt es NICHT
 * (Spec:694/2838), und `/403` aus dem Alt-Bestand (radio-admin/server/src/auth/routes.ts:76)
 * wandert NICHT mit — es ist kein Muster dieser Suite.
 *
 * ⛔ DIE PROTOKOLLZEILE VOR DEM `notFound()` IST PFLICHT, NICHT KUER (Spec:206-210,
 * Bauform ausgeschrieben in Spec:4348). Sie ist die einzige Stelle, an der ein LEER
 * gesetztes SUITE_ADMIN_GROUP_RADIO ueberhaupt sichtbar wird — ohne sie antwortet die
 * Verwaltung stumm mit 404, und die naechste Person sucht den Fehler im Modul statt in
 * der `.env`.
 *
 * ⚠️ FRISCHE: BIS ZU EINE STUNDE VERZUG. Gruppen im JWT sind nur so frisch wie der letzte
 * erfolgreiche Token-Refresh; der Takt ist die Access-Token-Lebensdauer von Pocket ID,
 * nicht die Sitzungsdauer von 30 Tagen (`CLAUDE.md:151-156`, von Spec:698 dafuer zitiert).
 * Der Verzug wird HINGENOMMEN.
 *
 * ✅ `merkeNutzer` STEHT SEIT PLANTEIL 4 / V3 IM RIEGEL — und zwar NACH ihm (NS-Z7).
 * Kapitel 1 §1.5 (Spec:669-673) fuehrt den Riegel in FUENF Schritten ohne den Schreiber,
 * Kapitel 5 (Spec:4349) in SECHS mit ihm; Planteil 2 baute die Kapitel-1-Fassung, WEIL ES
 * DORT KEINEN LESER VON `users` GAB. Den gibt es ab V15 (`/admin/geraete/[id]/ereignisse`),
 * und ohne die Zeile rendert jede Ereigniszeile eine nackte UUID (Spec:4358-4360).
 *
 * ⛔ DER GEMEINSAME KOERPER LIEGT IN `riegelAufStufe`, NICHT ZWEIMAL ABGESCHRIEBEN
 * (Entscheidung E-V1). `riegel.test.ts` Klausel (d) Fall 2 ist in V3 mit ihm GEWANDERT und
 * haelt dort die fuenf tragenden Aufrufe samt ihrer Reihenfolge fest; die Auflage dazu steht
 * ausgeschrieben in `riegel.test.ts:734-748`. Wer den Helfer umbenennt, zieht die Klausel im
 * SELBEN Commit nach — sonst laeuft sie leer-gruen.
 */

/**
 * DER UPSERT AUF `users` — additiv, nie loeschend, und er laeuft NACH dem Riegel.
 *
 * ⛔ DER BENANNTE RUECKFALL FUER `name === null` IST DER ROHE `sub`, und er ist eine
 * ENTSCHEIDUNG dieses Planteils, kein stiller `??`: `users.name` ist `.notNull()`
 * (`_db/schema.ts:115`), `RadioViewer.name` ist `string | null` (`_lib/zugang.ts:52`) — der
 * Insert uebersetzt ohne ihn nicht. Die zwei Wege standen im Kopfkommentar dieser Datei
 * ausgeschrieben (benannter Rueckfall ODER Migration); gewaehlt ist der Rueckfall, weil eine
 * neue Migration in diesem Planteil verboten ist (append-only; eine ueberfluessige ist eine
 * Absturzschleife im Container) und weil der `sub` genau der Wert ist, den der Bestand auf
 * der LESEseite einsetzt — „so the field is never blank"
 * (radio-admin/server/src/routes/devices.ts:70-78). Damit macht die Schreibseite dieselbe
 * Zusage wie die Leseseite; ein `""` oder ein „Unbekannt" waere ein dritter, erfundener Wert.
 *
 * ⛔ `onConflictDoUpdate`, NIE `onConflictDoNothing`: sonst traegt die Tabelle den Namen vom
 * allerersten Aufruf, und eine spaetere Umbenennung im Verzeichnisdienst kaeme nie an —
 * still, denn die Zeile existiert ja.
 *
 * ⚠️ EIN LEERER ODER AUS LEERRAUM BESTEHENDER NAME IST KEIN NAME (`?.trim()`), dieselbe
 * Lesart wie `src/app/m/lagerbuch/_lib/konto.ts:80-100`. ⚠️ ANDERS ALS DORT frischt dieser
 * Upsert `name` BEDINGUNGSLOS auf: der Rueckfallwert ist der `sub` und damit nie leer, der
 * Defektzustand „bekannten Klarnamen mit NICHTS ueberschrieben" kann hier also nicht
 * entstehen — wohl aber „Klarname mit `sub` ueberschrieben", wenn eine spaetere Sitzung
 * keinen `name`-Claim mehr traegt.
 *
 * ⛔ `lastSeenAt` IST `integer(..., { mode: "timestamp" })` (`_db/schema.ts:116`) — Drizzle
 * nimmt dort ein `Date`, keine Zahl. Dieselbe Einheitengrenze wie bei `leihhistorie`.
 *
 * EIN FEHLSCHLAG WIRD PROTOKOLLIERT, NICHT GEWORFEN: der Zugang funktioniert auch ohne den
 * Satz — nur die Ereignisliste zeigt dann die rohe Kennung (Form 1:1 aus
 * `src/app/m/lagerbuch/_lib/konto.ts:118-123`).
 */
export function merkeNutzer(db: DB, viewer: RadioViewer): void {
  const jetzt = new Date();
  // ⛔ Der benannte Rueckfall. Begruendung im Kopf dieser Funktion und bei `RadioViewer`.
  const name = viewer.name?.trim() ? viewer.name : viewer.sub;
  try {
    db.insert(users)
      .values({ sub: viewer.sub, name, lastSeenAt: jetzt })
      .onConflictDoUpdate({ target: users.sub, set: { name, lastSeenAt: jetzt } })
      .run();
  } catch (e) {
    console.warn(
      "[radio] users-Upsert fehlgeschlagen — die Ereignisliste zeigt fuer diese Person die " +
        "rohe Kennung statt eines Namens:",
      e,
    );
  }
}

/**
 * ⛔ NICHT EXPORTIERT. Der gemeinsame Koerper beider werfenden Riegel (Entscheidung E-V1) —
 * und er traegt die fuenf Zusicherungen aus `riegel.test.ts` Klausel (d) Fall 2.
 *
 * ⛔ WARUM EIN HELFER UND NICHT ZWEI ABSCHRIFTEN: zwei fast gleiche Riegelkoerper sind der
 * Ort, an dem eine Korrektur nur an einem von beiden ankommt — und die schwaechere ist die,
 * auf die sich der naechste Leser beruft (derselbe Gedanke in
 * `admin/(druck)/layout.tsx:16-20`). `riegel.test.ts:734-748` schreibt den Weg selbst aus:
 * die Zusicherungen WANDERN in den Koerper des Helfers, sie werden NICHT geloescht und NICHT
 * zu einem dateiweiten Scan aufgeweicht.
 *
 * ⛔ DIE STUFE KOMMT ALS PARAMETER HEREIN, NICHT ALS `||` IN EINEM PRAEDIKAT. `istRadioAdmin`
 * bleibt die Admin-Stufe — sie wird an den drei Admin-Seiten, im Export-Handler und am
 * /admin-Link der Ausleihflaeche so gebraucht.
 */
async function riegelAufStufe(erlaubt: (v: RadioViewer) => boolean): Promise<RadioViewer> {
  const kopf = await headers();
  requireRadioHost(kopf);                       // erst der Host, dann die Person
  const viewer = viewerAusSession(await auth());
  if (!viewer) redirect(`/login?callbackUrl=${encodeURIComponent(verwaltungsZiel(kopf))}`);
  if (!erlaubt(viewer)) {
    meldeFehlendeGruppe(viewer.sub, viewer.groups);   // Spec:206-210 — die einzige Sicht
    notFound();                                       // NICHT 403
  }
  merkeNutzer(getDb(), viewer);                       // ⛔ NACH dem Riegel (NS-Z7)
  return viewer;
}

/** Die ADMIN-Stufe. Sie bleibt strikt strenger als die Verwaltungs-Stufe. */
export async function requireRadioAdmin(): Promise<RadioViewer> {
  return riegelAufStufe(istRadioAdmin);
}

/**
 * ⛔ EIN BENANNTER RUECKGABETYP, KEINE INLINE-OBJEKTFORM — und das ist keine Stilfrage:
 * `funktionsKoerper` in `riegel.test.ts:360-375` nimmt die erste `{` nach dem Funktionsnamen.
 * Bei `Promise<{ viewer: …; rolle: … }>` waere das die Klammer des TYPS, und der Scan laese
 * den Typ statt des Rumpfs — die Klausel waere rot-by-construction, und der billige
 * Gruen-Fix waere ihre Aufweichung.
 */
export type RadioVerwaltungsZugang = { viewer: RadioViewer; rolle: RadioRolle };

/**
 * DIE VERWALTUNGS-STUFE: Admin ODER Updater — und sie LIEFERT DIE STUFE MIT (Spec:4351-4353).
 *
 * ⛔ OHNE die mitgelieferte Stufe muesste jede der zehn Seiten sie ein zweites Mal ableiten,
 * und die zweite Ableitung ist die, die auseinanderlaeuft.
 *
 * ⛔ `admin` GEWINNT BEI UEBERSCHNEIDUNG, WEIL DIE PRUEFUNG ZUERST STEHT — 1:1 aus
 * `radio-admin/shared/src/role.ts:7-8` (`if (groups.includes(cfg.adminGroup)) return 'admin';`
 * vor der Updater-Zeile). Ein `istRadioUpdater(v) ? "updater" : "admin"` kehrte das still um
 * und zeigte einer Admin-Person die Verwaltung in der Updater-Fassung.
 *
 * ⛔ DAS `||` STEHT IM ARGUMENT, NICHT IN `istRadioAdmin`: dort waere es die Aufweichung, die
 * jede Updater-Person durch JEDEN Admin-Riegel liesse (`_lib/zugang.ts:142-144`).
 */
export async function requireRadioVerwaltung(): Promise<RadioVerwaltungsZugang> {
  const viewer = await riegelAufStufe((v) => istRadioAdmin(v) || istRadioUpdater(v));
  return { viewer, rolle: istRadioAdmin(viewer) ? "admin" : "updater" };
}
