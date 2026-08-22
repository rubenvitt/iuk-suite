import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/core/auth";
import { adminGroupsFor } from "@/core/groups";
import { getModule, prodHostsFor } from "@/core/registry";
import { resolveHost } from "@/core/routing";
import { istRadioHost, requireRadioHost } from "./host";

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
 * ⬜ UND EINE ZWEITE, HEUTE SCHON MESSBARE KOLLISION, die Planteil 4 aufloesen muss:
 * `name` ist hier `string | null`, `radio`s Spalte ist `.notNull()`
 * (`src/app/m/radio/_db/schema.ts:115`). `lagerbuch` traegt denselben Fall, weil seine
 * Spalte nullable ist (`src/app/m/lagerbuch/_db/schema.ts:438`: `name: text("name")`) —
 * `radio` traegt ihn NICHT. Wer in Planteil 4 `merkeNutzer(getDb(), viewer)` nachtraegt
 * (Spec:4349, Begruendung Spec:4358-4360), braucht deshalb einen BENANNTEN Rueckfall fuer
 * `name === null` ODER eine Migration, die die Spalte nullable macht. Die Wahl gehoert
 * Planteil 4, die Kollision nicht: sie steht heute schon da.
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
 * ⬜ DIE ZWEITE RECHTESTUFE (Updater) WIRD HIER NICHT GEBAUT — ABER SIE IST VORGESEHEN.
 * Entschieden ist sie (C.6 / B4, 2026-08-21: zwei Rollen wie im Bestand); gebaut wird sie
 * in PLANTEIL 4. Spec:191 sagt es ausdruecklich: wer `radio` eine zweite Rolle gibt,
 * „baut sie modulintern — das ist nicht Sache dieses Kapitels".
 * ⚠️ DAS ZITAT TRAEGT NUR SO WEIT WIE SEINE FUNDSTELLE (REVIEW-Z4, Fund K5): Spec:191 ist
 * die `requiredGroups`-Zeile der Registry-Tabelle, der Satz gilt dort EINEM Weg — dem
 * Zweckentfremden von `SUITE_ACCESS_GROUP_RADIO` —, nicht der Updater-Stufe allgemein. Die
 * tragende Fundstelle fuer „nicht hier, sondern Planteil 4" ist Spec:4420-4422 — sie steht
 * in diesem Kommentar wenige Zeilen tiefer, an der GRUPPENQUELLE.
 *
 * ⚠️ ZWEI DINGE, DIE MAN LEICHT VERWECHSELT, UND DIE SPEC TRENNT SIE:
 *   - die GRUPPENQUELLE `SUITE_UPDATER_GROUP_RADIO` samt Feld-Allowlist liegt in einer
 *     EIGENEN Datei mit eigenem Test — `_lib/rollen.ts` / `_lib/rollen.test.ts`
 *     (Spec:4420-4422). Das ist Planteil 4.
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
 * ⬜ HEUTE OHNE AUFRUFER, UND DAS STEHT HIER BENANNT STATT BEHAUPTET (REVIEW-Z4, Fund K1).
 * In Planteil 2 faehrt KEIN Fall `requireRadioAdmin` — die Auslassung ist angeordnet und in
 * `src/app/m/radio/_lib/zugang.test.ts:7-11` ausgeschrieben. Der Konsument kommt mit
 * PLANTEIL 4, wo die erste Verwaltungsseite steht und die Verhaltensfaelle nach
 * `lagerbuch`-Vorbild dazukommen: dort braucht der erste Fall ihn ZWISCHEN zwei
 * Abweisungen, sonst schluckt der Dedup-Speicher die zweite Protokollzeile und der Fall
 * saehe null statt einem Aufruf. Der Weg ist im Vorbild vorgefuehrt —
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
 * ⬜ `merkeNutzer` STEHT HIER BEWUSST NICHT (Nachtrag NT-Z5, Nahtstelle NS-Z7). Kapitel 1
 * §1.5 (Spec:669-673) fuehrt `requireRadioAdmin` in FUENF Schritten ohne den Schreiber,
 * Kapitel 5 (Spec:4349) in SECHS mit ihm; kein A-/B-Punkt loest das auf. Planteil 2 baut
 * die Kapitel-1-Fassung, WEIL ES IN DIESEM PLANTEIL KEINEN LESER VON `users` GIBT.
 * ⛔ Planteil 4 traegt `merkeNutzer(getDb(), viewer)` NACH dem Riegel nach, sonst rendert
 * jede Ereigniszeile eine nackte UUID (Spec:4358-4360) — und stolpert dabei ueber die
 * `notNull()`-Kollision, die oben bei `RadioViewer` benannt ist.
 */
export async function requireRadioAdmin(): Promise<RadioViewer> {
  const kopf = await headers();
  requireRadioHost(kopf);                       // erst der Host, dann die Person
  const viewer = viewerAusSession(await auth());
  if (!viewer) redirect(`/login?callbackUrl=${encodeURIComponent(verwaltungsZiel(kopf))}`);
  if (!istRadioAdmin(viewer)) {
    meldeFehlendeGruppe(viewer.sub, viewer.groups);   // Spec:206-210 — die einzige Sicht
    notFound();                                       // NICHT 403
  }
  return viewer;
}
