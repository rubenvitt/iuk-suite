import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/core/auth";
import { adminGroupsFor } from "@/core/groups";
import { getModule, requiredGroupsFor } from "@/core/registry";
import { hostFuerRolle, oeffentlicheUrl } from "./hostRolle";

/**
 * ZUGRIFF AUF DIE VERWALTUNG VON `files` — GENAU EINE STUFE (Entwurf §2.4).
 *
 * Der Betreiber hat festgelegt: wer in der Modulgruppe ist, darf alles — auch
 * fremde Freigaben und das Audit-Log. Es gibt KEINE Ownership-Pruefung zwischen
 * Mitgliedern; `shares.created_by` ist reine Anzeige (§4.2). Wer hier nach einem
 * `assertGroupAccess`-Zwilling wie in `feedback` sucht: es gibt ihn nicht, und
 * das ist Absicht, kein Vergessen.
 *
 * WARUM ES DIESEN RIEGEL UEBERHAUPT GIBT: `files` ist `requiresAuth: false`.
 * Das ist PFLICHT, weil sonst jeder anonyme `/s/<id>`- und `/u/<token>`-Aufruf
 * in den Login liefe (`routing.ts:71-73`) — hat aber die Folge, dass
 * `core/routing.ts` + `proxy.ts` (die Middleware) die Verwaltung nicht gaten.
 * `canAccess` liest `requiredGroups` fuer dieses Modul deshalb NIE (frueher
 * Ausstieg bei `!requiresAuth`, `registry.ts:155`). Ohne diese Datei waere jede
 * Verwaltungsseite allein auf sich gestellt.
 *
 * DER PREIS DER EIN-STUFEN-ENTSCHEIDUNG, benannt statt verschwiegen: Gruppen im
 * JWT sind nur so frisch wie der letzte Token-Refresh, Takt etwa eine Stunde
 * (`CLAUDE.md:54-59`). Ein Gruppenentzug wirkt also mit bis zu einer Stunde
 * Verzug. Eine serverseitige Aufloesung aus der Datenbank — der Weg, den
 * `CLAUDE.md` fuer eilige Faelle nennt — ist hier NICHT moeglich: es gibt keine
 * Objekt-Zugehoerigkeit, an der man sie aufloesen koennte. Das ist die Kehrseite
 * davon, dass es nur eine Stufe gibt.
 *
 * Diese Datei traegt bewusst KEIN `"use client"`: Server Components, Layouts und
 * Server Actions importieren aus ihr (Falle 6 in `docs/design/README.md`).
 */

/**
 * Kein `fachgruppen` — anders als in `feedback`. Der Claim traegt dort die
 * Gruppenleitung; `files` kennt keine Fachgruppen, und ein mitgeschlepptes Feld
 * ohne Auswerter waere eine Einladung, es eines Tages zu befragen.
 */
export type Viewer = { sub: string; groups: string[] };

/**
 * Die erlaubten Gruppen: `SUITE_ADMIN_GROUP_FILES` UND `SUITE_ACCESS_GROUP_FILES`
 * gewaehren DIESELBE eine Stufe.
 *
 * Beide Werte kommen ueber `adminGroupsFor`/`requiredGroupsFor`, NIE aus
 * `mod.adminGroups`/`mod.requiredGroups` direkt: gelesen am Registry-Feld waere
 * die Env-Ueberschreibung an genau dieser Stelle wirkungslos — und diese Stelle
 * ist der einzige Ort, an dem der Modulzugang durchgesetzt wird. Genau so
 * entstand der Befund vor dem feedback-Cutover
 * (`feedback/_lib/requireFeedbackAccess.ts:37-44` schreibt ihn aus), und
 * `registry.ts:28-34` beschreibt dieselbe Falle fuer die Hosts.
 */
function erlaubteGruppen(): string[] {
  const mod = getModule("files");
  return [...adminGroupsFor(mod), ...requiredGroupsFor(mod)];
}

/**
 * BEWUSST NICHT `isModuleAdmin` — dieselbe Entscheidung wie in `feedback`
 * (`_lib/access.ts:9-30`, seit 2026-07-28): der Suite-Admin (`ADMIN_GROUP`) ist
 * hier NICHT automatisch berechtigt. Wer `files` verwalten soll, gehoert in
 * `drk-files-admin` bzw. in das, was `SUITE_ADMIN_GROUP_FILES` benennt — auch
 * der Betreiber selbst. Der Grund ist fachlich: Zugang zu `files` heisst
 * Einblick in fremde Freigaben UND in ein Postfach mit Uploads Dritter. Betrieb
 * und Einsicht sind zwei Rollen. Das ist eine Aussage ueber DIESES Modul; `qr`
 * und `portal` behalten die Suite-Admin-Abkuerzung.
 *
 * ZUM NAMEN: er kommt aus dem Dateibaum der Spec (§2.1, §2.4), und weil es nur
 * EINE Stufe gibt, ist „ist Admin" hier gleichbedeutend mit „hat Zugang".
 * Deshalb liest die Funktion BEIDE Listen. Eine Fassung, die nur
 * `adminGroupsFor` lesen wuerde, waere das zweite Praedikat, das §2.4
 * ausschliesst: sobald `SUITE_ACCESS_GROUP_FILES` gesetzt ist, liefe sie vom
 * Riegel auseinander — und „Oberflaeche und Riegel wenden dasselbe Praedikat
 * auf denselben Viewer an" ist genau die Zusage aus
 * `docs/design/README.md:239-242`.
 *
 * EINE LEERE LISTE GEWAEHRT NICHTS. Das ist die Bauform aus
 * `requireFeedbackAccess.ts:45-47` und ausdruecklich NICHT die aus `canAccess`
 * (`registry.ts:157-159`), die bei leerer Liste mit `true` aussteigt — der
 * Kommentar an `envAccessGroupsFor` (`core/groups.ts:44-58`) nennt das woertlich
 * „eine OEFFNUNG". Wer die Verknuepfung von `canAccess` abschreibt, oeffnet
 * `files` mit `requiredGroups: []` fuer JEDEN Eingeloggten, und der Fehler ist
 * still: alles funktioniert, fuer zu viele.
 *
 * `viewer === null` heisst „nicht eingeloggt" und ist nie berechtigt.
 */
export function isFilesAdmin(viewer: Viewer | null): boolean {
  if (!viewer) return false;
  const erlaubt = erlaubteGruppen();
  return viewer.groups.some((g) => erlaubt.includes(g));
}

/**
 * Der interne Pfad des Moduls. Er ist der Ruecksprungpfad VOR dem Cutover und
 * bewusst der einzige Ort, an dem er als Zeichenkette steht.
 */
const INTERNER_PFAD = "/m/files";

/**
 * Sitzung → Viewer. Ohne `user.id` gibt es keinen Viewer; ein fehlender
 * `groups`-Claim ist die leere Menge und laeuft damit in den 404 des Riegels,
 * nicht in einen 500. Sonst haenge die Fehlerform an der Token-Version.
 */
export function viewerAusSession(
  session: { user?: { id?: string; groups?: string[] } } | null,
): Viewer | null {
  const id = session?.user?.id;
  if (!id) return null;
  return { sub: id, groups: session.user?.groups ?? [] };
}

/**
 * Wohin der Login zurueckkehrt. HOST AUS DER ROLLE, nicht aus dem Request —
 * derselbe Grundsatz wie bei jeder erzeugten Nutzlast (§3.2): der Ruecksprung
 * gehoert auf den VERWALTUNGS-Host, denn auf der Inbox-Domain bedient keine
 * Verwaltungsroute.
 *
 * VOR DEM CUTOVER hat die Rolle keinen Host (`prodHosts: []`, kein
 * `SUITE_HOST_FILES`) — dann ist das Ziel der RELATIVE Pfad. Ein geratener
 * absoluter Host waere hier still fatal: `suiteRedirect` erlaubt ein absolutes
 * Ziel nur, wenn `moduleForHost` den Host kennt und das Protokoll dem der
 * `baseUrl` entspricht (`core/auth/redirect.ts:30-56`); ein unbekannter oder
 * protokollfremder Host landet STUMM auf dem Portal — die in
 * `core/hosts.ts:55-63` ausgeschriebene Falle. Ein relativer Pfad geht dagegen
 * unveraendert durch (`redirect.ts:41`).
 *
 * Die Reihenfolge im Rumpf ist deshalb verbindlich: erst der `null`-Rueckfall,
 * dann `oeffentlicheUrl` — das wirft ohne Host (§3.2), und die anonyme Anfrage
 * bekaeme vor dem Cutover einen 500 statt einer Anmeldeaufforderung.
 */
async function rueckkehrZiel(): Promise<string> {
  if (hostFuerRolle("verwaltung") === null) return INTERNER_PFAD;
  // Pfad "/": der Host-Rewrite der Suite bildet die Domainwurzel auf
  // `/m/files` ab (`routing.ts:78-79`), dort steht der Rollen-Verteiler (§3.5).
  return oeffentlicheUrl("verwaltung", "/", await headers());
}

/**
 * DER AUTH-BACKSTOP DES MODULS — eine Stelle, drei Aufrufergruppen.
 *
 * Gerufen von `(verwaltung)/layout.tsx`, vom Rollen-Verteiler `page.tsx`
 * (Zweig `verwaltung`) und von JEDER Server Action. Die dritte Gruppe ist die,
 * die man vergisst: eine Seiten-Pruefung erstreckt sich NICHT auf die Actions
 * darunter (Next-Doku `data-security.md:282,329`), und in der Alt-App fehlte sie
 * in allen drei Actions (`dashboard/actions.ts` ohne einen einzigen
 * `auth()`-Aufruf). Der Verteiler ist kein Duplikat des Layouts: er liegt
 * ausserhalb aller Route-Groups, weil er beide Rollen bedienen muss, also greift
 * `(verwaltung)/layout.tsx` fuer ihn nicht — dasselbe strukturelle Muster wie
 * `requireFeedbackAccess` („EINE Stelle, zwei Layouts").
 *
 * Keine Sitzung → Anmeldung. Sitzung ohne Zugang → `notFound()`, NICHT 403: die
 * Existenz der Route wird nicht verraten (`requireFeedbackAccess.ts:48`,
 * `docs/design/README.md:239-242`).
 */
export async function requireFilesAccess(): Promise<Viewer> {
  const viewer = viewerAusSession(await auth());
  if (!viewer) {
    redirect(`/login?callbackUrl=${encodeURIComponent(await rueckkehrZiel())}`);
  }
  if (!isFilesAdmin(viewer)) notFound();
  return viewer;
}
